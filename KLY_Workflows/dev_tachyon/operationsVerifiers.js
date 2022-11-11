import {GET_FROM_STATE,GET_FROM_STATE_FOR_QUORUM_THREAD} from './utils.js'

import {SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE} from './verifiers.js'




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
            amount:<integer> - staking power in UNO
        }
    
        Also, we check if operation in WAITING_ROOM still valid(timestamp is not so old).

    
    */

        let {txid,pool,type,amount}=payload

        if(txid==='QT') return

        if(isFromRoute){

            //To check payload received from route

            let poolStorage = await SYMBIOTE_META.STATE.get(pool+'(POOL)_STORAGE_POOL').catch(_=>false), rubiconID = SYMBIOTE_META.QUORUM_THREAD.RUBICON


            if(poolStorage && poolStorage.WAITING_ROOM[txid] && poolStorage.WAITING_ROOM[txid].checkpointID >= rubiconID){

                let ifStakeThenCheckIfPoolStillValid = type==='-' || (!poolStorage.isStopped || SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID - poolStorage.stopCheckpointID <= workflowConfigs.POOL_AFK_MAX_TIME)

                let stillUnspent = !(await SYMBIOTE_META.QUORUM_THREAD_METADATA.get(txid).catch(_=>false))


                let overviewIsOk = 
                
                    ifStakeThenCheckIfPoolStillValid
                    &&
                    stillUnspent


                return overviewIsOk               

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

            Also, recount the pool total power and check if record in WAITING_ROOM is still valid(check it via .timestamp property and compare to timestamp of current checkpoint on VT)

            Then, delete record from WAITING_ROOM and add to "stakers"


            Struct in POOL.WAITING_ROOM

                {

                    checkpointID,

                    staker,

                    amount,

                    units,

                    type:'+' //means "STAKE" or "-" for "UNSTAKE"
                        
                }

            Struct in POOL.STAKERS

            PUBKEY => {KLY,UNO,REWARD}
            
            */

            let poolStorage = await GET_FROM_STATE(pool+'(POOL)_STORAGE_POOL'),
            
                rubiconID = SYMBIOTE_META.VERIFICATION_THREAD.RUBICON,

                stakingContractCallTx = poolStorage?.WAITING_ROOM[txid]

            //Check if record exists
            if(stakingContractCallTx && stakingContractCallTx.checkpointID >= rubiconID){

                let stakerAccount = poolStorage.STAKERS[stakingContractCallTx.staker] || {KLY:0,UNO:0,REWARD:0},

                    workflowConfigs = SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS

                /*

                    queryFromWaitingRoom has the following structure

                    {

                        checkpointID,

                        staker:event.creator,

                        amount,

                        units,

                        type:'+' //means "STAKE" or "-" for "UNSTAKE"
                        
                    }

                
                */


                //Count the power of this operation
                let extraPower = stakingContractCallTx.units==='UNO' ? stakingContractCallTx.amount : stakingContractCallTx.amount * workflowConfigs.KLY_UNO_RATIO,
                
                    overviewIsOk=false

                
                if(type==='+'){

                    let noOverStake = poolStorage.totalPower+poolStorage.overStake <= poolStorage.totalPower+extraPower

                    let isPoolStillValid = !poolStorage.isStopped || (SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.HEADER.ID - poolStorage.stopCheckpointID <= workflowConfigs.POOL_AFK_MAX_TIME)


                    overviewIsOk = noOverStake && isPoolStillValid

                    
                } else overviewIsOk=true
                

                if(!overviewIsOk) return


                if(stakingContractCallTx.type==='+'){

                    stakerAccount[stakingContractCallTx.units]+=stakingContractCallTx.amount

                    poolStorage.totalPower+=extraPower

                }else {

                    stakerAccount[stakingContractCallTx.units]-=stakingContractCallTx.amount

                    poolStorage.totalPower-=extraPower

                }

                //Assign updated state
                poolStorage.STAKERS[stakingContractCallTx.staker]=stakerAccount

                //Remove from WAITING_ROOM

                delete poolStorage.WAITING_ROOM[txid]


                if(poolStorage.totalPower>=workflowConfigs.VALIDATOR_STAKE_IN_UNO){

                    //Add to SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS and VALIDATORS_METADATA with the default empty template

                    SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.push(pool)

                    SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[pool]={
                        
                        INDEX:-1,
                    
                        HASH:'Poyekhali!@Y.A.Gagarin'
                    
                    }

                }
                
            }
        
        }

    },




    //To freeze/unfreeze validators in pool(to skip their thread during VERIFICATION_THREAD)
    STOP_VALIDATOR:async (payload,isFromRoute,usedOnQuorumThread)=>{

        

    },



    //To slash unstaking if validator gets rogue
    SLASH_UNSTAKE:async (payload,isFromRoute,usedOnQuorumThread)=>{

        //Here we should take the unstake operation from delayed operations and delete from there(burn) or distribute KLY | UNO to another account(for example, as reward to someone)

    },




    REMOVE_FROM_WAITING_ROOM:async (payload,isFromRoute,usedOnQuorumThread,proposer)=>{

        

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
            SYMBIOTE_META.SPECIAL_OPERATIONS_MEMPOOL.push({type:'UPDATE_RUBICON',payload:data})

        }else if(usedOnQuorumThread){
    
            SYMBIOTE_META.QUORUM_THREAD.RUBICON=payload

        }else{

            //Used on VERIFICATION_THREAD
            SYMBIOTE_META.VERIFICATION_THREAD.RUBICON=payload

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

            SYMBIOTE_META.SPECIAL_OPERATIONS_MEMPOOL.push({type:'WORKFLOW_UPDATE',payload:data})

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