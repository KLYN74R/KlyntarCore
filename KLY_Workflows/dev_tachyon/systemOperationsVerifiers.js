import {GET_ACCOUNT_ON_SYMBIOTE,GET_FROM_STATE,GET_FROM_STATE_FOR_QUORUM_THREAD} from './utils.js'

import {SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE} from './verifiers.js'




let MAKE_OVERVIEW_OF_STAKING_CONTRACT_CALL=(poolStorage,stakeOrUnstakeTx,threadID,payload)=>{

    let {type,amount}=payload

    let workflowConfigs = global.SYMBIOTE_META[threadID].WORKFLOW_OPTIONS,
        
        isNotTooOld = stakeOrUnstakeTx.checkpointID >= global.SYMBIOTE_META[threadID].RUBICON,
    
        isMinimalRequiredAmountOrItsUnstake = type==='-' || stakeOrUnstakeTx.amount >= workflowConfigs.MINIMAL_STAKE_PER_ENTITY, //no limits for UNSTAKE

        ifStakeCheckIfPoolIsActiveOrCanBeRestored = false,

        inWaitingRoomTheSameAsInPayload = stakeOrUnstakeTx.amount === amount && stakeOrUnstakeTx.type === type


    if(type==='+'){

        let isStillPossibleBeActive = !poolStorage.lackOfTotalPower || global.SYMBIOTE_META[threadID].CHECKPOINT.id - poolStorage.stopCheckpointID <= workflowConfigs.POOL_AFK_MAX_TIME

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
    STAKING_CONTRACT_CALL:async(payload,isFromRoute,usedOnQuorumThread,fullCopyOfQuorumThreadWithNewCheckpoint)=>{

    /*

        Structure of payload

        {
            txid:<id in WAITING_ROOM in contract storage>,
            pool:<BLS pubkey of pool>,
            type:<'-' for unstake and '+' for stake>
            amount:<integer> - staking power
            storageOrigin:<string> - origin where metadata/storage of pool
            
            ---- Only for reserve pools ----

            isReserve:<boolean>
            reserveFor:<string>

        }
    
        Also, we check if operation in WAITING_ROOM still valid(timestamp is not so old).

    
    */

        let {txid,pool,type,amount,storageOrigin,isReserve,reserveFor}=payload

        if(txid==='QT') return


        if(isFromRoute){

            //To check payload received from route

            let poolStorage = await global.SYMBIOTE_META.STATE.get(storageOrigin+':'+pool+'(POOL)_STORAGE_POOL').catch(_=>false)

            let stakeOrUnstakeTx = poolStorage?.waitingRoom?.[txid]
        

            if(stakeOrUnstakeTx && MAKE_OVERVIEW_OF_STAKING_CONTRACT_CALL(poolStorage,stakeOrUnstakeTx,'QUORUM_THREAD',payload)){

                let stillUnspent = !(await global.SYMBIOTE_META.QUORUM_THREAD_METADATA.get(txid).catch(_=>false))

                if(stillUnspent){
                    
                    let specOpsTemplate = {
                    
                        type:'STAKING_CONTRACT_CALL',
                    
                        payload:{
                            
                            txid,pool,type,amount,storageOrigin,

                            isReserve:poolStorage.isReserve,
                            reserveFor:poolStorage.reserveFor
                        
                        }
                    
                    }
                
                    return specOpsTemplate
                
                }

            }

        }
        else if(usedOnQuorumThread){

            // Basic ops on QUORUM_THREAD

            let slashHelper = await GET_FROM_STATE_FOR_QUORUM_THREAD('SLASH_OBJECT')

            if(slashHelper[pool]) return



            let poolStorage = await GET_FROM_STATE_FOR_QUORUM_THREAD(pool+'(POOL)_STORAGE_POOL')

            /* 
            
            poolStorage is

                {
                    totalPower:<number>
                    lackOfTotalPower:<boolean>
                    stopCheckpointID:<number>
                    isReserve:<boolean>
                }
            
            */

            if(!poolStorage){

                let poolTemplateForQt = {

                    totalPower:0,       
                    lackOfTotalPower:true,
                    stopCheckpointID:-1
                
                }

                if(isReserve){

                    poolTemplateForQt.isReserve=isReserve

                    poolTemplateForQt.reserveFor=reserveFor

                }

                global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set(pool+'(POOL)_STORAGE_POOL',poolTemplateForQt)

                poolStorage = global.SYMBIOTE_META.QUORUM_THREAD_CACHE.get(pool+'(POOL)_STORAGE_POOL')
            
            }
            

            //If everything is ok - add or slash totalPower of the pool

            if(type==='+') poolStorage.totalPower+=amount
                    
            else poolStorage.totalPower-=amount
            

            //Put to cache that this tx was spent
            global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set(txid,true)

            
            let workflowConfigs = fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS


            if(poolStorage.totalPower >= workflowConfigs.VALIDATOR_STAKE){


                if(poolStorage.isReserve) fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.poolsRegistry.reservePools.push(pool)

                else fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.poolsRegistry.primePools.push(pool)
                

                // Make it "null" again

                poolStorage.lackOfTotalPower = false

                poolStorage.stopCheckpointID = -1

            }
        
        }
        else{

            /*
            
            Logic on VERIFICATION_THREAD
            
            Here we should move stakers from "waitingRoom" to "stakers"

            Also, recount the pool total power and check if record in WAITING_ROOM is still valid(check it via .checkpointID property and compare to timestamp of current checkpoint on VT)

            Also, check the minimal possible stake(in UNO), if pool still valid and so on

            Then, delete record from "waitingRoom" and add to "stakers"


            Struct in POOL.WAITING_ROOM

                {

                    checkpointID,

                    staker,

                    amount,

                    units,

                    type:'+' // "+" means "STAKE" or "-" for "UNSTAKE"
                        
                }

            Struct in POOL.STAKERS

            PUBKEY => {kly,uno}
            
            */

            // To check payload received from route


            let slashHelper = await GET_FROM_STATE('SLASH_OBJECT')

            if(slashHelper[pool]) return



            let poolStorage = await GET_FROM_STATE(storageOrigin+':'+pool+'(POOL)_STORAGE_POOL')

            let stakeOrUnstakeTx = poolStorage?.waitingRoom?.[txid]
            

            if(stakeOrUnstakeTx && MAKE_OVERVIEW_OF_STAKING_CONTRACT_CALL(poolStorage,stakeOrUnstakeTx,'VERIFICATION_THREAD',payload)){

                let stakerAccount = poolStorage.stakers[stakeOrUnstakeTx.staker] || {kly:0,uno:0}

                if(stakeOrUnstakeTx.type==='+'){

                    // Staking logic

                    stakerAccount[stakeOrUnstakeTx.units]+=stakeOrUnstakeTx.amount

                    poolStorage.totalPower+=stakeOrUnstakeTx.amount

                }else {

                    // Unstaking logic

                    stakerAccount[stakeOrUnstakeTx.units]-=stakeOrUnstakeTx.amount

                    poolStorage.totalPower-=stakeOrUnstakeTx.amount

                    // Add KLY / UNO to the user's account
                    let delayedOperationsArray = await GET_FROM_STATE('DELAYED_OPERATIONS')

                    let txTemplate={

                        fromPool:pool,

                        storageOrigin,

                        to:stakeOrUnstakeTx.staker,
                        
                        amount:stakeOrUnstakeTx.amount,
                        
                        units:stakeOrUnstakeTx.units

                    }

                    // This will be performed after <<< WORKFLOW_OPTIONS.UNSTAKING_PERIOD >>> checkpoints
                    delayedOperationsArray.push(txTemplate)

                }

                // Assign updated state
                poolStorage.stakers[stakeOrUnstakeTx.staker] = stakerAccount

                // Remove from WAITING_ROOM
                delete poolStorage.waitingRoom[txid]


                let workflowConfigs = global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS

                // If required number of power is ok and pool was stopped - then make it <active> again

                if(poolStorage.totalPower >= workflowConfigs.VALIDATOR_STAKE){

                    // Do it only if pool is not in current POOLS_METADATA
                    if(!global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[pool]){

                        global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[pool]={   
                                
                            index:-1,
                        
                            hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

                            isReserve:poolStorage.isReserve
                        
                        }

                        // Add the pointer where pool is created to state

                        global.SYMBIOTE_META.STATE_CACHE.set(pool+'(POOL)_POINTER',storageOrigin)

                        // Add the SID tracker
                        global.SYMBIOTE_META.VERIFICATION_THREAD.SID_TRACKER[pool]=0                                
        
                    }
                    
                    // Make it "null" again

                    poolStorage.lackOfTotalPower=false

                    poolStorage.stopCheckpointID=-1

                }
                
            }

        }

    },



    
    //To slash unstaking if validator gets rogue
    //Here we remove the pool storage and remove unstaking from delayed operations
    SLASH_UNSTAKE:async(payload,isFromRoute,usedOnQuorumThread,_fullCopyOfQuorumThreadWithNewCheckpoint)=>{

        /*
        
            Here we should take the unstake operation from delayed operations and delete from there(burn) or distribute KLY | UNO to another account(for example, as reward to someone)

            Payload structure is

            {
                pool:<BLS pubkey - id of pool to clear>
                delayedIds - array of IDs of delayed operations to get it and remove "UNSTAKE" txs from state
            }


            If received from route - then payload has the following structure

            {
                sigType,
                pubKey,
                signa,
                data:{pool,delayedIds}
            }


        Also, you must sign the data with the latest payload's header hash

        SIG(JSON.stringify(data)+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash)

        */

        let {sigType,pubKey,signa,data} = payload


        let overviewIfFromRoute = 

            isFromRoute //method used on POST /system_sync_operations
            &&
            typeof data.pool === 'string' && Array.isArray(data.delayedIds)
            &&
            global.CONFIG.SYMBIOTE.TRUSTED_POOLS.SLASH_UNSTAKE.includes(pubKey) //set it in configs
            &&
            await SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE(sigType,pubKey,signa,JSON.stringify(data)+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash) // and signature check
            &&
            await global.SYMBIOTE_META.QUORUM_THREAD_METADATA.get(data.pool+'(POOL)_STORAGE_POOL').catch(_=>false)


        if(isFromRoute){
        
            return overviewIfFromRoute ? {type:'SLASH_UNSTAKE',payload:payload.data} : false

        }
        else if(usedOnQuorumThread){

            // Here we need to add the pool to special zone as a signal that all the rest SPEC_OPS will be disabled for this rogue pool
            // That's why we need to push poolID to slash array because we need to do atomic ops
            
            let poolExists = await global.SYMBIOTE_META.QUORUM_THREAD_METADATA.get(payload.pool+'(POOL)_STORAGE_POOL').catch(_=>false)

            if(poolExists){

                let slashObject = await GET_FROM_STATE_FOR_QUORUM_THREAD('SLASH_OBJECT')

                slashObject[payload.pool]=true
    
            }

        }
        else{

            // On VERIFICATION_THREAD we should delete the pool from POOLS_METADATA, VALIDATORS, from STATE and clear the "UNSTAKE" operations from delayed operations related to this rogue pool entity
            // We just get the special array from cache to push appropriate ids and poolID

            let originWherePoolStorage = await global.SYMBIOTE_META.STATE.get(payload.pool+'(POOL)_POINTER').catch(_=>false)

            let poolExists = await global.SYMBIOTE_META.STATE.get(originWherePoolStorage+':'+payload.pool+'(POOL)_STORAGE_POOL').catch(_=>false)


            if(poolExists){

                let slashObject = await GET_FROM_STATE('SLASH_OBJECT')

                payload.poolOrigin = originWherePoolStorage
            
                slashObject[payload.pool]=payload

            }

        }

    },

    


    //Only for "STAKE" operation
    REMOVE_FROM_WAITING_ROOM:async(payload,isFromRoute,usedOnQuorumThread,_fullCopyOfQuorumThreadWithNewCheckpoint)=>{
        
        //Here we should take the unstake operation from delayed operations and delete from there(burn) or distribute KLY | UNO to another account(for example, as reward to someone)

        let {txid,pool}=payload

        
        if(txid==='QT') return


        if(isFromRoute){

            //To check payload received from route

            let originWherePoolStorage = await global.SYMBIOTE_META.STATE.get(pool+'(POOL)_POINTER').catch(_=>false)

            if(originWherePoolStorage){

                let poolStorage = await global.SYMBIOTE_META.STATE.get(originWherePoolStorage+':'+pool+'(POOL)_STORAGE_POOL').catch(_=>false),

                    stakingTx = poolStorage?.waitingRoom?.[txid],
                    
                    isNotTooOld = stakingTx?.checkpointID >= global.SYMBIOTE_META.QUORUM_THREAD.RUBICON,

                    isStakeTx = stakingTx?.type === '+'
            

                if(stakingTx && isNotTooOld && isStakeTx){

                    let stillUnspent = !(await global.SYMBIOTE_META.QUORUM_THREAD_METADATA.get(txid).catch(_=>false))

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

        }
        else if(usedOnQuorumThread){

            let slashHelper = await GET_FROM_STATE_FOR_QUORUM_THREAD('SLASH_OBJECT')

            //Put to cache that this tx was spent
            if(!slashHelper[pool]) global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set(txid,true)

        }
        else{

            let slashHelper = await GET_FROM_STATE('SLASH_OBJECT')

            if(slashHelper[pool]) return


            let originWherePoolStorage = await global.SYMBIOTE_META.STATE.get(pool+'(POOL)_POINTER').catch(_=>false)

            if(originWherePoolStorage){

                let poolStorage = await GET_FROM_STATE(originWherePoolStorage+':'+pool+'(POOL)_STORAGE_POOL'),

                    stakingTx = poolStorage?.waitingRoom?.[txid],

                    isNotTooOld = stakingTx?.checkpointID >= global.SYMBIOTE_META.VERIFICATION_THREAD.RUBICON,

                    isStakeTx = stakingTx?.type === '+'

            

                if(stakingTx && isNotTooOld && isStakeTx){

                    //Remove from WAITING_ROOM
                    delete poolStorage.waitingRoom[txid]

                    let stakerAccount = await GET_ACCOUNT_ON_SYMBIOTE(originWherePoolStorage+':'+stakingTx.staker)

                    if(stakerAccount){
                    
                        // Return the stake
                        if(stakingTx.units === 'kly'){

                            stakerAccount.balance += stakingTx.amount

                        }else stakerAccount.uno += stakingTx.amount

                    }
                
                }            

            }

        }        

    },


    //___________________________________________________ Separate methods ___________________________________________________


    //To set new rubicon and clear tracks from QUORUM_THREAD_METADATA
    RUBICON_UPDATE:async(payload,isFromRoute,usedOnQuorumThread,fullCopyOfQuorumThreadWithNewCheckpoint)=>{

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

        SIG(data+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash)
        
        */

        let {sigType,pubKey,signa,data} = payload

        let overviewIfFromRoute = 

            isFromRoute //method used on POST /system_sync_operations
            &&
            typeof data === 'number' //new value of rubicon. Some previous checkpointID
            &&
            global.CONFIG.SYMBIOTE.TRUSTED_POOLS.UPDATE_RUBICON.includes(pubKey) //set it in configs
            &&
            global.SYMBIOTE_META.QUORUM_THREAD.RUBICON < data //new value of rubicon should be more than current 
            &&
            await SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE(sigType,pubKey,signa,data+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash) // and signature check


        if(overviewIfFromRoute){

            //In this case, <proposer> property is the address should be included to your whitelist in configs
            return {type:'UPDATE_RUBICON',payload:data}

        }else if(usedOnQuorumThread){
    
            if(fullCopyOfQuorumThreadWithNewCheckpoint.RUBICON < payload) fullCopyOfQuorumThreadWithNewCheckpoint.RUBICON=payload

        }else{

            //Used on VERIFICATION_THREAD
            if(global.SYMBIOTE_META.VERIFICATION_THREAD.RUBICON < payload) global.SYMBIOTE_META.VERIFICATION_THREAD.RUBICON=payload

        }

    },




    //To make updates of workflow(e.g. version change, WORKFLOW_OPTIONS changes and so on)
    WORKFLOW_UPDATE:async(payload,isFromRoute,usedOnQuorumThread,_fullCopyOfQuorumThreadWithNewCheckpoint)=>{

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

        SIG(JSON.stringify(data)+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash)
        
        
        */

        let {sigType,pubKey,signa,data} = payload

        let overviewIfFromRoute = 

            isFromRoute //method used on POST /system_sync_operations
            &&
            global.CONFIG.SYMBIOTE.TRUSTED_POOLS.WORKFLOW_UPDATE.includes(pubKey) //set it in configs
            &&
            await SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE(sigType,pubKey,signa,JSON.stringify(data)+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash) // and signature check


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
        
    },




    VERSION_UPDATE:async(payload,isFromRoute,usedOnQuorumThread,fullCopyOfQuorumThreadWithNewCheckpoint)=>{

        /*
        
        If used on QUORUM_THREAD | VERIFICATION_THREAD - then payload has the following structure:

        {
            major:<typeof Number>
        }
        
        If received from route - then payload has the following structure

        {
            sigType,
            pubKey,
            signa,
            data:{
                major:<typeof Number>
            }
        }

        Also, you must sign the data with the latest payload's header hash

        SIG(JSON.stringify(data)+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash)        
        
        */

        let {sigType,pubKey,signa,data} = payload

        let overviewIfFromRoute = 

            isFromRoute //method used on POST /system_sync_operations
            &&
            global.CONFIG.SYMBIOTE.TRUSTED_POOLS.VERSION_UPDATE.includes(pubKey) //set it in configs
            &&
            await SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE(sigType,pubKey,signa,JSON.stringify(data)+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash) // and signature check



        if(overviewIfFromRoute){

            //In this case, <proposer> property is the address should be included to your whitelist in configs

            return {type:'VERSION_UPDATE',payload:data}

        }
        else if(usedOnQuorumThread && payload.major > fullCopyOfQuorumThreadWithNewCheckpoint.VERSION){

            fullCopyOfQuorumThreadWithNewCheckpoint.VERSION=payload.major

        }else if(payload.major > global.SYMBIOTE_META.VERIFICATION_THREAD.VERSION){

            //Used on VT
            global.SYMBIOTE_META.VERIFICATION_THREAD.VERSION=payload.major

        }
        
    }

}