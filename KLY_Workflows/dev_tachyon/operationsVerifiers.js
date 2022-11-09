import {GET_FROM_STATE,GET_FROM_STATE_FOR_QUORUM_THREAD} from './utils.js'




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


        if(isFromRoute && txid!=='QT'){

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

            let poolStorage = await GET_FROM_STATE(pool+'(POOL)_STORAGE_POOL'), rubiconID = SYMBIOTE_META.VERIFICATION_THREAD.RUBICON

            //Check if record exists
            if(poolStorage && poolStorage.WAITING_ROOM[txid] && poolStorage.WAITING_ROOM[txid].checkpointID >= rubiconID){

                let queryFromWaitingRoom = poolStorage.WAITING_ROOM[txid],
                
                    stakerAccount = poolStorage.STAKERS[queryFromWaitingRoom.staker] || {KLY:0,UNO:0,REWARD:0},

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
                let extraPower = queryFromWaitingRoom.units==='UNO' ? queryFromWaitingRoom.amount : queryFromWaitingRoom.amount * workflowConfigs.KLY_UNO_RATIO,

                    noOverStake = poolStorage.totalPower+poolStorage.overStake <= poolStorage.totalPower+extraPower,

                    ifStakeThenCheckIfPoolStillValid = type==='-' || (!poolStorage.isStopped || SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.HEADER.ID - poolStorage.stopCheckpointID <= workflowConfigs.POOL_AFK_MAX_TIME)
            


                let overviewIsOk =
                
                    noOverStake
                    &&
                    ifStakeThenCheckIfPoolStillValid
                    
                
                if(!overviewIsOk) return


                if(queryFromWaitingRoom.type==='+'){

                    stakerAccount[queryFromWaitingRoom.units]+=queryFromWaitingRoom.amount

                    poolStorage.totalPower+=extraPower

                }else {

                    stakerAccount[queryFromWaitingRoom.units]-=queryFromWaitingRoom.amount

                    poolStorage.totalPower-=extraPower

                }

                //Assign updated state
                poolStorage.STAKERS[queryFromWaitingRoom.staker]=stakerAccount

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

    },



    //To set new rubicon and clear tracks from QUORUM_THREAD_METADATA
    UPDATE_RUBICON:async (payload,isFromRoute,usedOnQuorumThread)=>{

        if(isFromRoute){

        }else if(usedOnQuorumThread){


        }else{

            //Used on VERIFICATION_THREAD


        }

    },



    //To make updates of workflow(e.g. version change, WORKFLOW_OPTIONS changes and so on)
    WORKFLOW_UPDATE:async (payload,isFromRoute,usedOnQuorumThread)=>{

        /*
        
            Payload is

            {
                fieldName
                newValue
            }

            Here we create the copy of CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS and add to cache (on QT or VT)

            Each operation makes changes to WORKFLOW_OPTIONS

            After all ops - we'll received final version of new WORKFLOW_OPTIONS
        
        */

        let updatedOptions

        if(usedOnQuorumThread){

            updatedOptions = await GET_FROM_STATE_FOR_QUORUM_THREAD('WORKFLOW_OPTIONS')

            updatedOptions[payload.fieldName]=payload.newValue

        }
        else if(isFromRoute){

            //TODO
            //Here we need to check if 2/3N+1 of validators have voted for changes(based on validators set of the latest checkpoint)

        }else{

            //Used on VT
            updatedOptions = await GET_FROM_STATE('WORKFLOW_OPTIONS')

            updatedOptions[payload.fieldName]=payload.newValue

        }
        
    }

}