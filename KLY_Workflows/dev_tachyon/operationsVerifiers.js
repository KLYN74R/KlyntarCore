import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import {GET_FROM_STATE, VERIFY} from './utils.js'




export default {

    /*
    
        {

            V:CONFIG.SYMBIOTE.PUB, //AwakeMessage issuer(validator who want to activate his thread again)
                   
            P:aggregatedPub, //Approver's aggregated BLS pubkey

            S:aggregatedSignatures,

            H:myMetadataHash,

            A:[] //AFK validators who hadn't vote. Need to agregate it to the ROOT_VALIDATORS_KEYS
            
        }
    
    */

    AWAKE:async(messagePayload,notJustOverview)=>{

        let aggregatedValidatorsPublicKey = SYMBIOTE_META.STUFF_CACHE.get('QUORUM_AGGREGATED_PUB') || bls.aggregatePublicKeys(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM),

            rootPub = bls.aggregatePublicKeys([...messagePayload.A,messagePayload]),

            quorumSize=SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length,

            majority = Math.floor(quorumSize*(2/3))+1


        //Check if majority is not bigger than number of validators. It possible when there is small number of validators

        majority = majority > quorumSize ? quorumSize : majority
            
        let isMajority = ((SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length-messagePayload.A.length)>=majority)


        if(aggregatedValidatorsPublicKey === rootPub && SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.includes(messagePayload.V) && await VERIFY(messagePayload.H,messagePayload.S,messagePayload.P) && isMajority){

            if(notJustOverview){

                //Change the state

                //Make active to turn back this validator's thread to VERIFICATION_THREAD
                SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[messagePayload.V].FREEZED=false
                
                //And increase index to avoid confusion
                SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[messagePayload.V].INDEX++

            } else return true
                
        }

    },


    //______________________________ FUNCTIONS TO PROCESS <OPERATIONS> IN CHECKPOINTS ______________________________

    /*
    
    We need to do this ops on/via checkpoints in order to make threads async
    
    */


    //Function to move stakes between pool <=> waiting room of pool
    STAKING_CONTRACT_CALL:async (payload,isFromRoute,usedOnQuorumThread)=>{

    /*
    
        Full

        {
            type:'STAKING_CONTRACT_CALL',
            payload
        }

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

            //Here we just need to check if operation wasn't spent till this current checkpoint and (soon) if record in WAITING_ROOM is not too old

            let poolStorage = await SYMBIOTE_META.STATE.get(pool+'(POOL)_STORAGE_POOL').catch(_=>false)

            if(poolStorage){

                /*
                
                TODO: Check if not too old

                For this, take the age from POOL.WAITING_ROOM[txid].timestamp and compare with current checkpoint timestamp on
                
                */
                //Check if in WAITING_ROOM
                if(!poolStorage.WAITING_ROOM[txid]) return false

                else {

                    let wasSpent = await SYMBIOTE_META.QUORUM_THREAD_METADATA.get(txid).catch(_=>false)
        
                    return !wasSpent
    
                }                    

            }

        }
        else if(usedOnQuorumThread){

            // Basic ops on QUORUM_THREAD


            /*
                
                TODO: Check if not too old

                For this, take the age from POOL.WAITING_ROOM[txid].timestamp and compare with current checkpoint timestamp on QT
                
            */

            let poolStorage = await GET_FROM_STATE(pool+'(POOL)_STORAGE_POOL')

            if(poolStorage && poolStorage.WAITING_ROOM[txid]){
    
                let queryFromWaitingRoom = poolStorage.WAITING_ROOM[txid],
                    
                    stakerAccount = poolStorage.STAKERS[queryFromWaitingRoom.staker] || {KLY:0,UNO:0,REWARD:0}
    
                /*
    
                    queryFromWaitingRoom has the following structure
    
                    {
    
                        timestamp:SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.TIMESTAMP,
    
                        staker:event.creator,
    
                        amount,
    
                        units,
    
                        type:'+' //means "STAKE" or "-" for "UNSTAKE"
                            
                    }
    
                    
                */
    
                //Count the power of this operation
                let extraPower = queryFromWaitingRoom.units==='UNO' ? queryFromWaitingRoom.amount : queryFromWaitingRoom.amount * CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.KLY_UNO_RATIO
    
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

                timestamp:SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.TIMESTAMP,

                staker:event.creator,

                amount,

                units,

                type:'+' //means "STAKE" or "-" for "UNSTAKE"
                        
            }

            Struct in POOL.STAKERS


            PUBKEY => {
                KLY,
                UNO,
                REWARD
            }

            
            */

            let poolStorage = await GET_FROM_STATE(pool+'(POOL)_STORAGE_POOL')

            //Check if record exists
            if(poolStorage && poolStorage.WAITING_ROOM[txid]){

                let queryFromWaitingRoom = poolStorage.WAITING_ROOM[txid],
                
                    stakerAccount = poolStorage.STAKERS[queryFromWaitingRoom.staker] || {KLY:0,UNO:0,REWARD:0}

                /*

                    queryFromWaitingRoom has the following structure

                    {

                        timestamp:SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.TIMESTAMP,

                        staker:event.creator,

                        amount,

                        units,

                        type:'+' //means "STAKE" or "-" for "UNSTAKE"
                        
                    }

                
                */

                //Count the power of this operation
                let extraPower = queryFromWaitingRoom.units==='UNO' ? queryFromWaitingRoom.amount : queryFromWaitingRoom.amount * CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.KLY_UNO_RATIO

                //Check if we still don't overstake
                if(poolStorage.totalPower+poolStorage.overStake < poolStorage.totalPower+extraPower) return

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
                
            }
        
        }

    },

    //To freeze/unfreeze validators in pool(to skip their thread during VERIFICATION_THREAD)
    FREEZING:async (payload,isJustVerify)=>{

        

    },

    //To make updates of workflow(e.g. version change, WORKFLOW_OPTIONS changes and so on)
    WORKFLOW_UPDATE:async (payload,isJustVerify)=>{}

}