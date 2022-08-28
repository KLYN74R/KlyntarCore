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

        let aggregatedValidatorsPublicKey = SYMBIOTE_META.STUFF_CACHE.get('VALIDATORS_AGGREGATED_PUB') || Base58.encode(await bls.aggregatePublicKeys(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.map(Base58.decode))),

            rootPub = Base58.encode(await bls.aggregatePublicKeys([...messagePayload.A.map(Base58.decode),Base58.decode(messagePayload.P)])),

            majority = Math.ceil(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length*(2/3)),

            isMajority = ((SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length-messagePayload.A.length)>=majority)



        if(aggregatedValidatorsPublicKey === rootPub && SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(messagePayload.V) && await VERIFY(messagePayload.H,messagePayload.S,messagePayload.P) && isMajority){

            if(notJustOverview){

                //Change the state

                SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[messagePayload.V].ACTIVE=true
                

            } else return true
                
        }

    }

}