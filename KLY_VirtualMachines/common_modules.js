import {getQuorumMajority} from '../KLY_Workflows/dev_tachyon/common_functions/quorum_related.js'

import {WORKING_THREADS} from '../KLY_Workflows/dev_tachyon/blockchain_preparation.js'

import tbls from '../KLY_Utils/signatures/threshold/tbls.js'

import bls from '../KLY_Utils/signatures/multisig/bls.js'

import {verifyEd25519Sync} from '../KLY_Utils/utils.js'

import snarkjs from 'snarkjs'



/** 
 * 
 * TODO: We should understand the context that call the imported function
 * 
 *  In case it's EVM:
 * 
 *      Simply execute even async functions because anyway CALL opcode handler is async (see kly_evm/to_change/hooking/functions.js)
 * 
 *  In case it's WVM:
 * 
 *      1) If it's sync function - execute and return result immediately
 *      2) If it's async function - stop the WASM execution, run the func in JS env based on provided params and call the callback function that contract need
 * 
 * 
*/


// To set the gas prices for these cryptography primitives - see the txs_verifiers.js

export let cryptography = {

    bls:(functionName,params)=>{

        let gasSpent = 0 // TODO

        // Available functions => singleVerify, aggregatePublicKeys, aggregateSignatures, verifyThresholdSignature

        let result = bls[functionName](...params)

        return {result,gasSpent}

    },

    pqc:(algorithm,signedData,pubKey,signature)=>{

        let gasSpent = 0

        // Available functions BLISS / Dilithium

        let result = globalThis[algorithm === 'bliss'?'verifyBlissSignature':'verifyDilithiumSignature'](signedData,pubKey,signature)
       
        return {result,gasSpent}

    },

    tbls:(masterPubKey,masterSigna,signedData)=>{

        return {

            gasSpent: 6000,
            
            result: tbls.verifyTBLS(masterPubKey,masterSigna,signedData)

        }

    },

    ed25519:(signedData,pubKey,signature)=>{

        return {

            gasSpent:5000,

            result:verifyEd25519Sync(signedData,signature,pubKey)

        }

    },

    sss:()=>{},

    mpc:()=>{},

    fhe:()=>{},


    /**
    * 
    * @param {'groth16'|'plonk'|'fflonk'} protoName 
    * @param {*} verificationKey 
    * @param {*} publicInputs 
    * @param {*} plonkProof 
    * @returns 
    */
    zkSNARK:async(protoName,verificationKey, publicInputs, plonkProof) => snarkjs[protoName].verify(verificationKey, publicInputs, plonkProof)

}


export let verifyQuorumMajoritySolution = (dataThatShouldBeSigned,agreementsMapping) => {

    // Take the epoch handler on verification thread (VT)

    let epochHandler = WORKING_THREADS.VERIFICATION_THREAD.EPOCH
    
    let majority = getQuorumMajority(epochHandler)

    let okSignatures = 0


    for(let [quorumMemberPubKey,signa] of Object.entries(agreementsMapping)){

        if(verifyEd25519Sync(dataThatShouldBeSigned,signa,quorumMemberPubKey) && epochHandler.quorum.includes(quorumMemberPubKey)){

            okSignatures++

        }

    }

    return okSignatures >= majority
    
}



/**
 * 
 * @param {'EVM'|'WASM'} vmID 
 */
export let crossVMCall = (vmID) => {

    console.log(vmID)

}

// Params - logID,payload

export let vmLog = () => {}