import {GET_ACCOUNT_ON_SYMBIOTE, GET_FROM_STATE, GET_FROM_QUORUM_THREAD_STATE} from '../utils.js'

import {SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE} from './verifiers.js'

import {BLOCKCHAIN_DATABASES, WORKING_THREADS} from '../blockchain_preparation.js'

import {CONFIGURATION} from '../../../klyn74r.js'






let MAKE_OVERVIEW_OF_STAKING_CONTRACT_CALL=(poolStorage,stakeOrUnstakeTx,threadID,payload)=>{

    let {type,amount}=payload

    let workflowConfigs = global.SYMBIOTE_META[threadID].WORKFLOW_OPTIONS,
        
        isNotTooOld = stakeOrUnstakeTx.epochID >= global.SYMBIOTE_META[threadID].RUBICON,
    
        isMinimalRequiredAmountOrItsUnstake = type==='-' || stakeOrUnstakeTx.amount >= workflowConfigs.MINIMAL_STAKE_PER_ENTITY, //no limits for UNSTAKE

        ifStakeCheckIfPoolIsActiveOrCanBeRestored = false,

        inWaitingRoomTheSameAsInPayload = stakeOrUnstakeTx.amount === amount && stakeOrUnstakeTx.type === type


    if(type==='+'){

        let isStillPossibleBeActive = !poolStorage.lackOfTotalPower || global.SYMBIOTE_META[threadID].EPOCH.id - poolStorage.stopEpochID <= workflowConfigs.POOL_AFK_MAX_TIME

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

    //______________________________ FUNCTIONS TO PROCESS EPOCH EDGE OPERATIONS ______________________________


    //Function to move stakes between pool <=> waiting room of pool
    STAKING_CONTRACT_CALL:async(payload,isFromRoute,usedOnQuorumThread,fullCopyOfQuorumThread)=>{

    /*

        Structure of payload

        {
            txid:<id in WAITING_ROOM in contract storage>,
            pool:<Ed25519 pubkey of pool>,
            type:<'-' for unstake and '+' for stake>
            amount:<integer> - staking power
            storageOrigin:<string> - origin where metadata/storage of pool
            
            ---- Only for reserve pools ----

            isReserve:<boolean>
            reserveFor:<string>

        }
    
        Also, we check if operation in WAITING_ROOM still valid(timestamp is not so old).

    
    */

        let {txid,pool,type,amount,storageOrigin,isReserve,reserveFor,poolURL,wssPoolURL}=payload

        if(txid==='AT') return


        if(isFromRoute){

            //To check payload received from route

            let poolStorage = await BLOCKCHAIN_DATABASES.STATE.get(storageOrigin+':'+pool+'(POOL)_STORAGE_POOL').catch(()=>false)

            let stakeOrUnstakeTx = poolStorage?.waitingRoom?.[txid]
        

            if(stakeOrUnstakeTx && MAKE_OVERVIEW_OF_STAKING_CONTRACT_CALL(poolStorage,stakeOrUnstakeTx,'QUORUM_THREAD',payload)){

                let stillUnspent = !(await BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.get(txid).catch(()=>false))

                if(stillUnspent){
                    
                    let specOpsTemplate = {
                    
                        type:'STAKING_CONTRACT_CALL',
                    
                        payload:{
                            
                            txid,pool,type,amount,storageOrigin,

                            isReserve:poolStorage.isReserve,
                            reserveFor:poolStorage.reserveFor,
                            poolURL:poolStorage.poolURL,
                            wssPoolURL:poolStorage.wssPoolURL
                        
                        }
                    
                    }
                
                    return specOpsTemplate
                
                }

            }

        }
        else if(usedOnQuorumThread){

            // Basic ops on QUORUM_THREAD

            let slashHelper = await GET_FROM_QUORUM_THREAD_STATE('SLASH_OBJECT')

            if(slashHelper[pool]) return



            let poolStorage = await GET_FROM_QUORUM_THREAD_STATE(pool+'(POOL)_STORAGE_POOL')

            /* 
            
            poolStorage is

                {
                    totalPower:<number>
                    lackOfTotalPower:<boolean>
                    stopEpochID:<number>
                    isReserve:<boolean>
                    poolURL:<string>
                    wssPoolURL:<string>
                }
            
            */

            if(!poolStorage){

                let poolTemplateForQt = {

                    totalPower:0,       
                    lackOfTotalPower:true,
                    stopEpochID:-1,
                    poolURL,
                    wssPoolURL
                
                }

                if(isReserve){

                    poolTemplateForQt.isReserve=isReserve

                    poolTemplateForQt.reserveFor=reserveFor

                }

                global.SYMBIOTE_META.APPROVEMENT_THREAD_CACHE.set(pool+'(POOL)_STORAGE_POOL',poolTemplateForQt)

                poolStorage = global.SYMBIOTE_META.APPROVEMENT_THREAD_CACHE.get(pool+'(POOL)_STORAGE_POOL')
            
            }
            

            //If everything is ok - add or slash totalPower of the pool

            if(type==='+') poolStorage.totalPower+=amount
                    
            else poolStorage.totalPower-=amount
            

            //Put to cache that this tx was spent
            global.SYMBIOTE_META.APPROVEMENT_THREAD_CACHE.set(txid,true)

            
            let workflowConfigs = fullCopyOfQuorumThread.WORKFLOW_OPTIONS


            if(poolStorage.totalPower >= workflowConfigs.VALIDATOR_STAKE){


                if(poolStorage.isReserve) fullCopyOfQuorumThread.EPOCH.poolsRegistry.reservePools.push(pool)

                else fullCopyOfQuorumThread.EPOCH.poolsRegistry.primePools.push(pool)
                

                // Make it "null" again

                poolStorage.lackOfTotalPower = false

                poolStorage.stopEpochID = -1

            }
        
        }
        else{

            /*
            
            Logic on VERIFICATION_THREAD
            
            Here we should move stakers from "waitingRoom" to "stakers"

            Also, recount the pool total power and check if record in WAITING_ROOM is still valid(check it via .epochID property and compare to timestamp of current epoch on VT)

            Also, check the minimal possible stake(in UNO), if pool still valid and so on

            Then, delete record from "waitingRoom" and add to "stakers"


            Struct in POOL.WAITING_ROOM

                {

                    epochID,

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
                    let unstakingOperationsArray = await GET_FROM_STATE('UNSTAKING_OPERATIONS')

                    let txTemplate={

                        fromPool:pool,

                        storageOrigin,

                        to:stakeOrUnstakeTx.staker,
                        
                        amount:stakeOrUnstakeTx.amount,
                        
                        units:stakeOrUnstakeTx.units

                    }

                    // This will be performed after <<< WORKFLOW_OPTIONS.UNSTAKING_PERIOD >>> epoch
                    
                    unstakingOperationsArray.push(txTemplate)

                }

                // Assign updated state
                poolStorage.stakers[stakeOrUnstakeTx.staker] = stakerAccount

                // Remove from WAITING_ROOM
                delete poolStorage.waitingRoom[txid]


                let workflowConfigs = WORKING_THREADS.VERIFICATION_THREAD.WORKFLOW_OPTIONS

                // If required number of power is ok and pool was stopped - then make it <active> again

                if(poolStorage.totalPower >= workflowConfigs.VALIDATOR_STAKE){

                    // Do it only if pool is not in current VERIFICATION_STATS_PER_POOL
                    if(!WORKING_THREADS.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[pool]){

                        WORKING_THREADS.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[pool]={   
                                
                            index:-1,
                        
                            hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

                            isReserve:poolStorage.isReserve
                        
                        }

                        // Add the pointer where pool is created to state

                        global.SYMBIOTE_META.STATE_CACHE.set(pool+'(POOL)_POINTER',storageOrigin)

                        // Add the SID tracker
                        WORKING_THREADS.VERIFICATION_THREAD.SID_TRACKER[pool]=0                                
        
                    }
                    
                    // Make it "null" again

                    poolStorage.lackOfTotalPower=false

                    poolStorage.stopEpochID=-1

                }
                
            }

        }

    },



    
    //To slash unstaking if validator gets rogue
    //Here we remove the pool storage and remove unstaking from delayed operations
    SLASH_UNSTAKE:async(payload,isFromRoute,usedOnQuorumThread)=>{

        /*
        
            Here we should take the unstake operation from delayed operations and delete from there(burn) or distribute KLY | UNO to another account(for example, as reward to someone)

            Payload structure is

            {
                pool:<Ed25519 pubkey - id of pool to clear>
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

        SIG(JSON.stringify(data)+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash)

        */

        let {sigType,pubKey,signa,data} = payload


        let overviewIfFromRoute = 

            isFromRoute //method used on POST /epoch_edge_operation
            &&
            typeof data.pool === 'string' && Array.isArray(data.delayedIds)
            &&
            CONFIGURATION.NODE_LEVEL.TRUSTED_POOLS.SLASH_UNSTAKE.includes(pubKey) //set it in configs
            &&
            await SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE(sigType,pubKey,signa,JSON.stringify(data)+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash) // and signature check
            &&
            await BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.get(data.pool+'(POOL)_STORAGE_POOL').catch(()=>false)


        if(isFromRoute){
        
            return overviewIfFromRoute ? {type:'SLASH_UNSTAKE',payload:payload.data} : false

        }
        else if(usedOnQuorumThread){

            // Here we need to add the pool to special zone as a signal that all the rest SPEC_OPS will be disabled for this rogue pool
            // That's why we need to push poolID to slash array because we need to do atomic ops
            
            let poolStorage = await BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.get(payload.pool+'(POOL)_STORAGE_POOL').catch(()=>false)

            if(poolStorage){

                let slashObject = await GET_FROM_QUORUM_THREAD_STATE('SLASH_OBJECT')

                slashObject[payload.pool] = {isReserve:poolStorage.isReserve}
    
            }

        }
        else{

            // On VERIFICATION_THREAD we should delete the pool from VERIFICATION_STATS_PER_POOL, VALIDATORS, from STATE and clear the "UNSTAKE" operations from delayed operations related to this rogue pool entity
            // We just get the special array from cache to push appropriate ids and poolID

            let originWherePoolStorage = await BLOCKCHAIN_DATABASES.STATE.get(payload.pool+'(POOL)_POINTER').catch(()=>false)

            let poolStorage = await BLOCKCHAIN_DATABASES.STATE.get(originWherePoolStorage+':'+payload.pool+'(POOL)_STORAGE_POOL').catch(()=>false)


            if(poolStorage){

                let slashObject = await GET_FROM_STATE('SLASH_OBJECT')

                payload.poolOrigin = originWherePoolStorage

                payload.isReserve = poolStorage.isReserve
            
                slashObject[payload.pool] = payload

            }

        }

    },

    


    //Only for "STAKE" operation
    REMOVE_FROM_WAITING_ROOM:async(payload,isFromRoute,usedOnQuorumThread)=>{
        
        //Here we should take the unstake operation from delayed operations and delete from there(burn) or distribute KLY | UNO to another account(for example, as reward to someone)

        let {txid,pool}=payload

        
        if(txid==='AT') return


        if(isFromRoute){

            //To check payload received from route

            let originWherePoolStorage = await BLOCKCHAIN_DATABASES.STATE.get(pool+'(POOL)_POINTER').catch(()=>false)

            if(originWherePoolStorage){

                let poolStorage = await BLOCKCHAIN_DATABASES.STATE.get(originWherePoolStorage+':'+pool+'(POOL)_STORAGE_POOL').catch(()=>false),

                    stakingTx = poolStorage?.waitingRoom?.[txid],
                    
                    isNotTooOld = stakingTx?.epochID >= WORKING_THREADS.APPROVEMENT_THREAD.RUBICON,

                    isStakeTx = stakingTx?.type === '+'
            

                if(stakingTx && isNotTooOld && isStakeTx){

                    let stillUnspent = !(await BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.get(txid).catch(()=>false))

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

            let slashHelper = await GET_FROM_QUORUM_THREAD_STATE('SLASH_OBJECT')

            //Put to cache that this tx was spent
            if(!slashHelper[pool]) global.SYMBIOTE_META.APPROVEMENT_THREAD_CACHE.set(txid,true)

        }
        else{

            let slashHelper = await GET_FROM_STATE('SLASH_OBJECT')

            if(slashHelper[pool]) return


            let originWherePoolStorage = await BLOCKCHAIN_DATABASES.STATE.get(pool+'(POOL)_POINTER').catch(()=>false)

            if(originWherePoolStorage){

                let poolStorage = await GET_FROM_STATE(originWherePoolStorage+':'+pool+'(POOL)_STORAGE_POOL'),

                    stakingTx = poolStorage?.waitingRoom?.[txid],

                    isNotTooOld = stakingTx?.epochID >= WORKING_THREADS.VERIFICATION_THREAD.RUBICON,

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


    //To set new rubicon and clear tracks from APPROVEMENT_THREAD_METADATA
    RUBICON_UPDATE:async(payload,isFromRoute,usedOnQuorumThread,fullCopyOfQuorumThread)=>{

        /*
        
        If used on QUORUM_THREAD | VERIFICATION_THREAD - then payload=<ID of new epoch which will be rubicon>
        
        If received from route - then payload has the following structure

            {
                sigType,
                pubKey,
                signa,
                data - new value of RUBICON
            }


        *data - new value of RUBICON for appropriate thread

        Also, you must sign the data with the latest payload's header hash

        SIG(data+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash)
        
        */

        let {sigType,pubKey,signa,data} = payload

        let overviewIfFromRoute = 

            isFromRoute //method used on POST /sign_epoch_edge_operation
            &&
            typeof data === 'number' //new value of rubicon. Some previous epochID
            &&
            CONFIGURATION.NODE_LEVEL.TRUSTED_POOLS.UPDATE_RUBICON.includes(pubKey) //set it in configs
            &&
            WORKING_THREADS.APPROVEMENT_THREAD.RUBICON < data //new value of rubicon should be more than current 
            &&
            await SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE(sigType,pubKey,signa,data+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash) // and signature check


        if(overviewIfFromRoute){

            //In this case, <proposer> property is the address should be included to your whitelist in configs
            return {type:'UPDATE_RUBICON',payload:data}

        }else if(usedOnQuorumThread){
    
            if(fullCopyOfQuorumThread.RUBICON < payload) fullCopyOfQuorumThread.RUBICON=payload

        }else{

            //Used on VERIFICATION_THREAD
            if(WORKING_THREADS.VERIFICATION_THREAD.RUBICON < payload) WORKING_THREADS.VERIFICATION_THREAD.RUBICON=payload

        }

    },




    //To make updates of workflow(e.g. version change, WORKFLOW_OPTIONS changes and so on)
    WORKFLOW_UPDATE:async(payload,isFromRoute,usedOnQuorumThread)=>{

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

        SIG(JSON.stringify(data)+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash)
        
        
        */

        let {sigType,pubKey,signa,data} = payload

        let overviewIfFromRoute = 

            isFromRoute //method used on POST /sign_epoch_edge_operation
            &&
            CONFIGURATION.NODE_LEVEL.TRUSTED_POOLS.WORKFLOW_UPDATE.includes(pubKey) //set it in configs
            &&
            await SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE(sigType,pubKey,signa,JSON.stringify(data)+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash) // and signature check


        if(overviewIfFromRoute){

            //In this case, <proposer> property is the address should be included to your whitelist in configs

            return {type:'WORKFLOW_UPDATE',payload:data}

        }
        else if(usedOnQuorumThread){

            let updatedOptions = await GET_FROM_QUORUM_THREAD_STATE('WORKFLOW_OPTIONS')

            updatedOptions[payload.fieldName]=payload.newValue

        }else{

            //Used on VT
            let updatedOptions = await GET_FROM_STATE('WORKFLOW_OPTIONS')

            updatedOptions[payload.fieldName]=payload.newValue

        }
        
    },




    VERSION_UPDATE:async(payload,isFromRoute,usedOnQuorumThread,fullCopyOfQuorumThread)=>{

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

        SIG(JSON.stringify(data)+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash)        
        
        */

        let {sigType,pubKey,signa,data} = payload

        let overviewIfFromRoute = 

            isFromRoute //method used on POST /sign_epoch_edge_operation
            &&
            CONFIGURATION.NODE_LEVEL.TRUSTED_POOLS.VERSION_UPDATE.includes(pubKey) //set it in configs
            &&
            await SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE(sigType,pubKey,signa,JSON.stringify(data)+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash) // and signature check



        if(overviewIfFromRoute){

            //In this case, <proposer> property is the address should be included to your whitelist in configs

            return {type:'VERSION_UPDATE',payload:data}

        }
        else if(usedOnQuorumThread && payload.major > fullCopyOfQuorumThread.VERSION){

            fullCopyOfQuorumThread.VERSION=payload.major

        }else if(payload.major > WORKING_THREADS.VERIFICATION_THREAD.VERSION){

            //Used on VT
            WORKING_THREADS.VERIFICATION_THREAD.VERSION=payload.major

        }
        
    }

}