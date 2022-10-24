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


    //To add/remove validators from VALIDATORS_POOL
    VALIDATOR_STUFF:async operation=>{},

    //To freeze/unfreeze validators in pool(to skip their thread during VERIFICATION_THREAD)
    FREEZING:async operation=>{},
    
    //To bind/unbind account/contract to a single(to multiple in future releases) validator
    BINDING:async operation=>{},

    //To mint unobtanium for validators for their voting power
    UNOBTANIUM_MINT:async operation=>{},

    //To do staking process(so we need such pointers in GENERATION_THREAD for super total async work)
    STAKE:async operation=>{},

    //To update version of workflow
    VERSION_UPDATE:async operation=>{}
}