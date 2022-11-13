import {GET_ACCOUNT_ON_SYMBIOTE, GET_FROM_STATE,GET_FROM_STATE_FOR_QUORUM_THREAD} from './utils.js'

import {SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE} from './verifiers.js'




let MAKE_OVERVIEW_OF_STAKING_CONTRACT_CALL=(poolStorage,stakeOrUnstakeTx,threadID,payload)=>{

    let {type,amount}=payload

    let workflowConfigs = SYMBIOTE_META[threadID].WORKFLOW_OPTIONS,
        
        isNotTooOld = stakeOrUnstakeTx.checkpointID >= SYMBIOTE_META[threadID].RUBICON,
    
        isMinimalRequiredAmountOrItsUnstake = type==='-' || stakeOrUnstakeTx.amount >= workflowConfigs.MINIMAL_STAKE_PER_ENTITY, //no limits for UNSTAKE

        ifStakeCheckIfPoolIsActiveOrCanBeRestored = false,

        inWaitingRoomTheSameAsInPayload = stakeOrUnstakeTx.amount === amount && stakeOrUnstakeTx.type === type


    if(type==='+'){

        let isStillPossibleBeActive = !poolStorage.isStopped || SYMBIOTE_META[threadID].CHECKPOINT.HEADER.ID - poolStorage.stopCheckpointID <= workflowConfigs.POOL_AFK_MAX_TIME

        let noOverStake = poolStorage.totalPower+poolStorage.overStake <= poolStorage.totalPower+stakeOrUnstakeTx.amount

        ifStakeCheckIfPoolIsActiveOrCanBeRestored = isStillPossibleBeActive && noOverStake

    }else ifStakeCheckIfPoolIsActiveOrCanBeRestored = true


    let overviewIsOk = 

        isNotTooOld
        &&
        isMinimalRequiredAmountOrItsUnstake
        &&
        inWaitingRoomTheSameAsInPayload
        &&
        ifStakeCheckIfPoolIsActiveOrCanBeRestored


    return overviewIsOk

}



export default {

    //______________________________ FUNCTIONS TO PROCESS <OPERATIONS> IN CHECKPOINTS ______________________________

    /*
    
    We need to do this ops on/via checkpoints in order to make threads async
    
    */


    //Function to move stakes between pool <=> waiting room of pool
    STAKING_CONTRACT_CALL:async (payload,isFromRoute,usedOnQuorumThread)=>{

    /*

        Structure of payload

        {
            txid:<id in WAITING_ROOM in contract storage>,
            pool:<BLS pubkey of pool>,
            type:<'-' for unstake and '+' for stake>
            amount:<integer> - staking power
        }
    
        Also, we check if operation in WAITING_ROOM still valid(timestamp is not so old).

    
    */

        let {txid,pool,type,amount}=payload

        if(txid==='QT') return


        if(isFromRoute){

            //To check payload received from route

            let poolStorage = await SYMBIOTE_META.STATE.get(pool+'(POOL)_STORAGE_POOL').catch(_=>false),

                stakeOrUnstakeTx = poolStorage?.WAITING_ROOM?.[txid]
            

            if(stakeOrUnstakeTx && MAKE_OVERVIEW_OF_STAKING_CONTRACT_CALL(poolStorage,stakeOrUnstakeTx,'QUORUM_THREAD',payload)){

                let stillUnspent = !(await SYMBIOTE_META.QUORUM_THREAD_METADATA.get(txid).catch(_=>false))

                if(stillUnspent){

                    let specOpsTemplate = {

                        type:'STAKING_CONTRACT_CALL',

                        payload:{

                            txid,pool,type,amount

                        }

                    }

                    return specOpsTemplate

                }

            }

        }
        else if(usedOnQuorumThread){

            // Basic ops on QUORUM_THREAD

            let poolStorage = await GET_FROM_STATE_FOR_QUORUM_THREAD(pool)

            /* 
            
            poolStorage is

                {
                    totalPower:<number>
                    isStopped:<boolean>
                    stopCheckpointID:<number>
                    storedMetadata:{INDEX,HASH}
                }
            
            */

            if(poolStorage){

                //If everything is ok - add or slash totalPower of the pool

                if(type==='+') poolStorage.totalPower+=amount
                    
                else poolStorage.totalPower-=amount
                    
                //Put to cache that this tx was spent
                SYMBIOTE_META.QUORUM_THREAD_CACHE.set(txid,true)

            }
        
        }
        else{

            /*
            
            Logic on VERIFICATION_THREAD
            
            Here we should move stakers from WAITING_ROOMs to stakers

            Also, recount the pool total power and check if record in WAITING_ROOM is still valid(check it via .checkpointID property and compare to timestamp of current checkpoint on VT)

            Also, check the minimal possible stake(in UNO), if pool still valid and so on

            Then, delete record from WAITING_ROOM and add to "stakers"


            Struct in POOL.WAITING_ROOM

                {

                    checkpointID,

                    staker,

                    amount,

                    units,

                    type:'+' // "+" means "STAKE" or "-" for "UNSTAKE"
                        
                }

            Struct in POOL.STAKERS

            PUBKEY => {KLY,UNO,REWARD}
            
            */

     //To check payload received from route

            let poolStorage = await GET_FROM_STATE(pool+'(POOL)_STORAGE_POOL'),

                stakeOrUnstakeTx = poolStorage?.WAITING_ROOM?.[txid]

            

            if(stakeOrUnstakeTx && MAKE_OVERVIEW_OF_STAKING_CONTRACT_CALL(poolStorage,stakeOrUnstakeTx,'VERIFICATION_THREAD',payload)){


                let stakerAccount = poolStorage.STAKERS[stakeOrUnstakeTx.staker] || {KLY:0,UNO:0,REWARD:0}

                if(stakeOrUnstakeTx.type==='+'){

                    stakerAccount[stakeOrUnstakeTx.units]+=stakeOrUnstakeTx.amount

                    poolStorage.totalPower+=stakeOrUnstakeTx.amount

                }else {

                    stakerAccount[stakeOrUnstakeTx.units]-=stakeOrUnstakeTx.amount

                    poolStorage.totalPower-=stakeOrUnstakeTx.amount

                    //Add KLY / UNO to the user's account
                    let delayedOperationsArray = await GET_FROM_STATE('DELAYED_OPERATIONS')

                    let txTemplate={

                        fromPool:pool,

                        to:stakeOrUnstakeTx.staker,
                        
                        amount:stakeOrUnstakeTx.amount,
                        
                        units:stakeOrUnstakeTx.units

                    }

                    //This will be performed after <<< WORKFLOW_OPTIONS.UNSTAKING_PERIOD >>> checkpoints
                    delayedOperationsArray.push(txTemplate)

                }

                //Assign updated state
                poolStorage.STAKERS[stakeOrUnstakeTx.staker]=stakerAccount

                //Remove from WAITING_ROOM
                delete poolStorage.WAITING_ROOM[txid]


                // If required number of power is ok and pool was stopped - then make it <active> again

                if(poolStorage.totalPower>=workflowConfigs.VALIDATOR_STAKE && poolStorage.isStopped){

                    //Add to SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS and VALIDATORS_METADATA with the default empty template

                    SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.push(pool)

                    SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[pool]={
                        
                        INDEX:-1,
                    
                        HASH:'Poyekhali!@Y.A.Gagarin'
                    
                    }

                    poolStorage.isStopped=false

                    poolStorage.stopCheckpointID=-1

                    poolStorage.storedMetadata={}

                }
                
            }

        }

    },




    //To freeze/unfreeze validators in pool(to skip their thread during VERIFICATION_THREAD)
    STOP_VALIDATOR:async (payload,isFromRoute,usedOnQuorumThread)=>{

        

    },



    //To slash unstaking if validator gets rogue
    //Here we remove the pool storage and remove unstaking from delayed operations
    SLASH_UNSTAKE:async (payload,isFromRoute,_)=>{

        //Here we should take the unstake operation from delayed operations and delete from there(burn) or distribute KLY | UNO to another account(for example, as reward to someone)

        let {delayedId,poolID}=payload


        if(isFromRoute){

            // Here we check if tx exists and its already in "delayed" pool



        }else{

            // On VERIFICATION_THREAD we should delete appropriate tx from "delayed" pool

        }


    },

    


    //Only for "STAKE" operation
    REMOVE_FROM_WAITING_ROOM:async (payload,isFromRoute,usedOnQuorumThread)=>{
        
        //Here we should take the unstake operation from delayed operations and delete from there(burn) or distribute KLY | UNO to another account(for example, as reward to someone)

        let {txid,pool}=payload

        
        if(txid==='QT') return


        if(isFromRoute){

            //To check payload received from route

            let poolStorage = await SYMBIOTE_META.STATE.get(pool+'(POOL)_STORAGE_POOL').catch(_=>false),

                stakingTx = poolStorage?.WAITING_ROOM?.[txid],
                    
                isNotTooOld = stakingTx?.checkpointID >= SYMBIOTE_META.QUORUM_THREAD.RUBICON,

                isStakeTx = stakingTx?.type === '+'
            


            if(stakingTx && isNotTooOld && isStakeTx){

                let stillUnspent = !(await SYMBIOTE_META.QUORUM_THREAD_METADATA.get(txid).catch(_=>false))

                if(stillUnspent){

                    let specOpsTemplate = {

                        type:'REMOVE_FROM_WAITING_ROOM',

                        payload:{

                            txid,pool

                        }

                    }

                    return specOpsTemplate

                }

            }

        }
        else if(usedOnQuorumThread){

            //Put to cache that this tx was spent
            SYMBIOTE_META.QUORUM_THREAD_CACHE.set(txid,true)

        }
        else{


            let poolStorage = await GET_FROM_STATE(pool+'(POOL)_STORAGE_POOL'),

                stakingTx = poolStorage?.WAITING_ROOM?.[txid],

                isNotTooOld = stakingTx?.checkpointID >= SYMBIOTE_META.VERIFICATION_THREAD.RUBICON,

                isStakeTx = stakingTx?.type === '+'

            

            if(stakingTx && isNotTooOld && isStakeTx){

                //Remove from WAITING_ROOM
                delete poolStorage.WAITING_ROOM[txid]

                let stakerAccount = await GET_ACCOUNT_ON_SYMBIOTE(stakingTx.staker)

                if(stakingTx.units === 'KLY'){

                    stakerAccount.balance += stakingTx.amount

                }else stakerAccount.uno += stakingTx.amount

                
            }            

        }
        

    },


    //___________________________________________________ Separate methods ___________________________________________________


    //To set new rubicon and clear tracks from QUORUM_THREAD_METADATA
    UPDATE_RUBICON:async (payload,isFromRoute,usedOnQuorumThread)=>{

        /*
        
        If used on QUORUM_THREAD | VERIFICATION_THREAD - then payload=<ID of new checkpoint which will be rubicon>
        
        If received from route - then payload has the following structure

            {
                sigType,
                pubKey,
                signa,
                data - new value of RUBICON
            }


        *data - new value of RUBICON for appropriate thread

        Also, you must sign the data with the latest payload's header hash

        SIG(data+SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.HEADER.HASH)
        
        */

        let {sigType,pubKey,signa,data} = payload

        let overviewIfFromRoute = 

            isFromRoute //method used on POST /operations
            &&
            typeof data === 'number' //new value of rubicon. Some previous checkpointID
            &&
            CONFIG.SYMBIOTE.TRUSTED_POOLS.UPDATE_RUBICON.includes(pubKey) //set it in configs
            &&
            SYMBIOTE_META.QUORUM_THREAD.RUBICON < data //new value of rubicon should be more than current 
            &&
            await SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE(sigType,pubKey,signa,data+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.HASH) // and signature check


        if(overviewIfFromRoute){

            //In this case, <proposer> property is the address should be included to your whitelist in configs
            return {type:'UPDATE_RUBICON',payload:data}

        }else if(usedOnQuorumThread){
    
            if(SYMBIOTE_META.QUORUM_THREAD.RUBICON < payload) SYMBIOTE_META.QUORUM_THREAD.RUBICON=payload

        }else{

            //Used on VERIFICATION_THREAD
            if(SYMBIOTE_META.VERIFICATION_THREAD.RUBICON < payload) SYMBIOTE_META.VERIFICATION_THREAD.RUBICON=payload

        }

    },




    //To make updates of workflow(e.g. version change, WORKFLOW_OPTIONS changes and so on)
    WORKFLOW_UPDATE:async (payload,isFromRoute,usedOnQuorumThread)=>{

        /*
        
        If used on QUORUM_THREAD | VERIFICATION_THREAD - then payload has the following structure:

        {
            fieldName
            newValue
        }
        
        If received from route - then payload has the following structure

        {
            sigType,
            pubKey,
            signa,
            data:{
                fieldName
                newValue
            }
        }

        *data - object with the new option(proposition) for WORKFLOW_OPTIONS

        Also, you must sign the data with the latest payload's header hash

        SIG(JSON.stringify(data)+SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.HEADER.HASH)
        
        
        */

        let {sigType,pubKey,signa,data} = payload

        let overviewIfFromRoute = 

            isFromRoute //method used on POST /operations
            &&
            CONFIG.SYMBIOTE.TRUSTED_POOLS.WORKFLOW_UPDATE.includes(pubKey) //set it in configs
            &&
            await SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE(sigType,pubKey,signa,JSON.stringify(data)+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.HASH) // and signature check


        if(overviewIfFromRoute){

            //In this case, <proposer> property is the address should be included to your whitelist in configs

            return {type:'WORKFLOW_UPDATE',payload:data}

        }
        else if(usedOnQuorumThread){

            let updatedOptions = await GET_FROM_STATE_FOR_QUORUM_THREAD('WORKFLOW_OPTIONS')

            updatedOptions[payload.fieldName]=payload.newValue

        }else{

            //Used on VT
            let updatedOptions = await GET_FROM_STATE('WORKFLOW_OPTIONS')

            updatedOptions[payload.fieldName]=payload.newValue

        }
        
    }

}