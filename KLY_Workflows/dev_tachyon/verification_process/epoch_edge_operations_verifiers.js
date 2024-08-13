import {BLOCKCHAIN_DATABASES, GLOBAL_CACHES, WORKING_THREADS} from '../blockchain_preparation.js'

import {getFromApprovementThreadState} from '../common_functions/approvement_thread_related.js'

import {getFromState} from '../common_functions/state_interactions.js'

import {simplifiedVerifyBasedOnSignaType} from './txs_verifiers.js'

import {CONFIGURATION} from '../../../klyn74r.js'












export default {

    //______________________________ FUNCTIONS TO PROCESS EPOCH EDGE OPERATIONS ______________________________


    //Function to move stakes between pool <=> waiting room of pool
    STAKING_CONTRACT_CALL:async(payload,isFromRoute,usedOnApprovementThread,fullCopyOfApprovementThread)=>{

    /*

        Structure of payload

        {
            txid:<id in WAITING_ROOM in contract storage>,
            pool:<Ed25519 pubkey of pool>,
            type:<'-' for unstake and '+' for stake>
            amount:<integer> - staking power
            poolOriginShard:<string> - origin where metadata/storage of pool

        }
    
        Also, we check if operation in WAITING_ROOM still valid(timestamp is not so old).

    
    */

        let {txid,pool,type,amount,poolOriginShard,poolURL,wssPoolURL} = payload

        if(txid==='AT') return


        if(usedOnApprovementThread){

            // Basic ops on APPROVEMENT_THREAD

            let slashHelper = await getFromApprovementThreadState('SLASH_OBJECT')

            if(slashHelper[pool]) return



            let poolStorage = await getFromApprovementThreadState(pool+'(POOL)_STORAGE_POOL')

            /* 
            
            poolStorage is

                {
                    totalPower:<number>
                    poolURL:<string>
                    wssPoolURL:<string>
                }
            
            */

            if(!poolStorage){

                let poolTemplateForQt = {

                    totalPower:0,
                    poolURL,
                    wssPoolURL
                
                }

                GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.set(pool+'(POOL)_STORAGE_POOL',poolTemplateForQt)

                poolStorage = GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.get(pool+'(POOL)_STORAGE_POOL')
            
            }
            

            //If everything is ok - add or slash totalPower of the pool

            if(type==='+') poolStorage.totalPower+=amount
                    
            else poolStorage.totalPower-=amount
            

            //Put to cache that this tx was spent
            GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.set(txid,true)

            
            let workflowConfigs = fullCopyOfApprovementThread.WORKFLOW_OPTIONS


            if(poolStorage.totalPower >= workflowConfigs.VALIDATOR_STAKE){

                fullCopyOfApprovementThread.EPOCH.poolsRegistry.push(pool)

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


            let slashHelper = await getFromState('SLASH_OBJECT')

            if(slashHelper[pool]) return



            let poolStorage = await getFromState(poolOriginShard+':'+pool+'(POOL)_STORAGE_POOL')

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
                    let unstakingOperationsArray = await getFromState('UNSTAKING_OPERATIONS')

                    let txTemplate={

                        fromPool:pool,

                        poolOriginShard,

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
                        
                            hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
                        
                        }

                        // Add the pointer where pool is created to state

                        GLOBAL_CACHES.STATE_CACHE.set(pool+'(POOL)_POINTER',poolOriginShard)

                        // Add the SID tracker

                        WORKING_THREADS.VERIFICATION_THREAD.SID_TRACKER[pool] = 0                                
        
                    }

                }
                
            }

        }

    },



    //___________________________________________________ Separate methods __________________________________________________


    //To make updates of workflow(e.g. version change, WORKFLOW_OPTIONS changes and so on)
    WORKFLOW_UPDATE:async(payload,isFromRoute,usedOnApprovementThread)=>{

        /*
        
        If used on APPROVEMENT_THREAD | VERIFICATION_THREAD - then payload has the following structure:

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
            await simplifiedVerifyBasedOnSignaType(sigType,pubKey,signa,JSON.stringify(data)+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash) // and signature check


        if(overviewIfFromRoute){

            //In this case, <proposer> property is the address should be included to your whitelist in configs

            return {type:'WORKFLOW_UPDATE',payload:data}

        }
        else if(usedOnApprovementThread){

            let updatedOptions = await getFromApprovementThreadState('WORKFLOW_OPTIONS')

            updatedOptions[payload.fieldName]=payload.newValue

        }else{

            //Used on VT
            let updatedOptions = await getFromState('WORKFLOW_OPTIONS')

            updatedOptions[payload.fieldName]=payload.newValue

        }
        
    },




    VERSION_UPDATE:async(payload,isFromRoute,usedOnApprovementThread,fullCopyOfApprovementThread)=>{

        /*
        
        If used on APPROVEMENT_THREAD | VERIFICATION_THREAD - then payload has the following structure:

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
            await simplifiedVerifyBasedOnSignaType(sigType,pubKey,signa,JSON.stringify(data)+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash) // and signature check



        if(overviewIfFromRoute){

            //In this case, <proposer> property is the address should be included to your whitelist in configs

            return {type:'VERSION_UPDATE',payload:data}

        }
        else if(usedOnApprovementThread && payload.major > fullCopyOfApprovementThread.VERSION){

            fullCopyOfApprovementThread.VERSION=payload.major

        }else if(payload.major > WORKING_THREADS.VERIFICATION_THREAD.VERSION){

            //Used on VT
            WORKING_THREADS.VERIFICATION_THREAD.VERSION=payload.major

        }
        
    }

}