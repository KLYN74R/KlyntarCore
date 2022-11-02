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

        let aggregatedValidatorsPublicKey = SYMBIOTE_META.STUFF_CACHE.get('QUORUM_AGGREGATED_PUB') || bls.aggregatePublicKeys(SYMBIOTE_META.GENERATION_THREAD.CHECKPOINT.QUORUM),

            rootPub = bls.aggregatePublicKeys([...messagePayload.A,messagePayload]),

            quorumSize=SYMBIOTE_META.GENERATION_THREAD.CHECKPOINT.QUORUM.length,

            majority = Math.floor(quorumSize*(2/3))+1


        //Check if majority is not bigger than number of validators. It possible when there is small number of validators

        majority = majority > quorumSize ? quorumSize : majority
            
        let isMajority = ((SYMBIOTE_META.GENERATION_THREAD.CHECKPOINT.QUORUM.length-messagePayload.A.length)>=majority)


        if(aggregatedValidatorsPublicKey === rootPub && SYMBIOTE_META.GENERATION_THREAD.CHECKPOINT.QUORUM.includes(messagePayload.V) && await VERIFY(messagePayload.H,messagePayload.S,messagePayload.P) && isMajority){

            if(notJustOverview){

                //Change the state

                //Make active to turn back this validator's thread to VERIFICATION_THREAD
                SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[messagePayload.V].BLOCKS_GENERATOR=true
                
                //And increase index to avoid confusion
                SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[messagePayload.V].INDEX++

            } else return true
                
        }

    },


    //______________________________ FUNCTIONS TO PROCESS <OPERATIONS> IN CHECKPOINTS ______________________________

    /*
    
    We need to do this ops on/via checkpoints in order to make threads async
    
    */


    //For staking process(so we need such pointers in GENERATION_THREAD for super total async work)
    POOL_CONTRACT_CALL:async (operation,isJustVerify)=>{

        /*
        
        Assign someone's stake to validatorX staking pool

        Structure
        {
            T:"POOL_CONTRACT_CALL",
            P:{
                T:"UNSTAKE" | "STAKE"
                A:<amount in KLY or UNOBTANIUM>
                R:<"KLY" | "UNOBTANIUM"> - resource type
                V:<Validator> - validator to know the poolID to remove stake from pool
                TX_REF:<'SIGNATURE'> - reference in state to know if this so-called "output" still valid
            }
        }

        We just check 2/3N+1 from quorum signed it and add to own checkpoint version

        If "stake":
            0)Check if previously created tx with TXID still don't used on GENERATION_THREAD
            1)
        
        If "unstake" => check if stake wasn't withdrawed earlier from GENERATION_THREAD to VERIFICATION_THREAD
        
        */

    },

    //To freeze/unfreeze validators in pool(to skip their thread during VERIFICATION_THREAD)
    FREEZING:async (operation,isJustVerify)=>{

        

    },

    //To update version of workflow
    VERSION_UPDATE:async (operation,isJustVerify)=>{}


}