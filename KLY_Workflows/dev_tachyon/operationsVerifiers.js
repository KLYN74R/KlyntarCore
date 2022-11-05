import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import {VERIFY} from './utils.js'




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
    STAKING_CONTRACT_CALL:async (payload,isJustVerify,usedOnQuorumThread)=>{

    /*
    
        Full

        {
            type:'STAKING_CONTRACT_CALL',
            payload
        }

        Structure of payload

        {
            id:<id in WAITING_ROOM in contract storage>,
            pool:<BLS pubkey of pool>,
            type:<'-' for unstake and '+' for stake>
            units:<integer>

        }
    
        Also, we check if operation in WAITING_ROOM still valid(timestamp is not so old).

    
    */

        let {id,pool,type,units}=payload


        if(isJustVerify){

            //To check payload received from route

        }
        else if(usedOnQuorumThread){

            // Basic ops on QUORUM_THREAD

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
        }


    },

    //To freeze/unfreeze validators in pool(to skip their thread during VERIFICATION_THREAD)
    FREEZING:async (payload,isJustVerify)=>{

        

    },

    //To make updates of workflow(e.g. version change, WORKFLOW_OPTIONS changes and so on)
    WORKFLOW_UPDATE:async (payload,isJustVerify)=>{}

}