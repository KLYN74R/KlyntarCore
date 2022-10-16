import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import {VERIFY} from './utils.js'

import Base58 from 'base-58'




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

        let aggregatedValidatorsPublicKey = SYMBIOTE_META.STUFF_CACHE.get('QUORUM_AGGREGATED_PUB') || Base58.encode(await bls.aggregatePublicKeys(SYMBIOTE_META.VERIFICATION_THREAD.QUORUM.map(Base58.decode))),

            rootPub = Base58.encode(await bls.aggregatePublicKeys([...messagePayload.A.map(Base58.decode),Base58.decode(messagePayload.P)])),

            quorumSize=SYMBIOTE_META.VERIFICATION_THREAD.QUORUM.length,

            majority = Math.floor(quorumSize*(2/3))+1


        //Check if majority is not bigger than number of validators. It possible when there is small number of validators

        majority = majority > quorumSize ? quorumSize : majority
            
        let isMajority = ((SYMBIOTE_META.VERIFICATION_THREAD.QUORUM.length-messagePayload.A.length)>=majority)


        if(aggregatedValidatorsPublicKey === rootPub && SYMBIOTE_META.VERIFICATION_THREAD.QUORUM.includes(messagePayload.V) && await VERIFY(messagePayload.H,messagePayload.S,messagePayload.P) && isMajority){

            if(notJustOverview){

                //Change the state

                //Make active to turn back this validator's thread to VERIFICATION_THREAD
                SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[messagePayload.V].BLOCKS_GENERATOR=true
                
                //And increase index to avoid confusion
                SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[messagePayload.V].INDEX++

            } else return true
                
        }

    }

}