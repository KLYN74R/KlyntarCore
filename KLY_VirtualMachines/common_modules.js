import tbls from '../KLY_Utils/signatures/threshold/tbls'

import bls from '../KLY_Utils/signatures/multisig/bls'

import {verifyEd25519} from '../KLY_Utils/utils'

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

        let result = bls[functionName](...params)

        return {result,gasSpent}

    },

    pqc:(algorithm,signedData,pubKey,signature)=>{

        // BLISS / Dilithium

        let gasSpent = 0

        let result = globalThis[algorithm === 'bliss'?'verifyBlissSignature':'verifyDilithiumSignature'](signedData,pubKey,signature)
       
        return {result,gasSpent}

    },

    tbls:(functionName,params)=>{

        let gasSpent = 0

        let result = tbls[functionName](...params)

        return {result,gasSpent}

    },

    ed25519:(vmID,signedData,pubKey,signature)=>{

        if (vmID==='EVM') return verifyEd25519(signedData,signature,pubKey)

        else {

            // TODO for WVM
    
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




/**
 * 
 * @param {'EVM'|'WASM'} vmID 
 */
export let crossVMCall = (vmID) => {

    console.log(vmID)

}

// Params - logID,payload

export let vmLog = () => {}