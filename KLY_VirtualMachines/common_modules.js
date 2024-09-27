import {getQuorumMajority} from '../KLY_Workflows/dev_tachyon/common_functions/quorum_related.js'

import {WORKING_THREADS} from '../KLY_Workflows/dev_tachyon/blockchain_preparation.js'

import tbls from '../KLY_Utils/signatures/threshold/tbls.js'

import bls from '../KLY_Utils/signatures/multisig/bls.js'

import {verifyEd25519Sync} from '../KLY_Utils/utils.js'

import {ProofHoHash} from '@idena/vrf-js'




let {createRequire} = await import('module');

let snarkjs = createRequire(import.meta.url)('snarkjs');




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




export let verifyQuorumMajoritySolution = (dataThatShouldBeSigned,agreementsMapping) => {

    this.contractGasHandler.gasBurned += 60000;

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



// BLS functions

export const blsFunc = (functionName, params) => {
    
    // Increase the amount of burned gas depends on function & params

    this.contractGasHandler.gasBurned += 50000;
    
    // Available functions => singleVerify, aggregatePublicKeys, aggregateSignatures, verifyThresholdSignature
        
    return bls[functionName](...params);

};

// PQC (Post-Quantum Cryptography) functions

export const pqc = (algorithm, signedData, pubKey, signature) => {

    this.contractGasHandler.gasBurned += 60000;

    // Available functions BLISS / Dilithium

    let result = globalThis[algorithm === 'bliss' ? 'verifyBlissSignature' : 'verifyDilithiumSignature'](signedData, pubKey, signature);

    return result;

};

// TBLS (Threshold BLS) functions

export const tblsVerify = (masterPubKey, masterSigna, signedData) => {

    this.contractGasHandler.gasBurned += 60000;

    return tbls.verifyTBLS(masterPubKey, masterSigna, signedData);

};

// Ed25519 functions
export const ed25519 = (signedData, pubKey, signature) => {

    this.contractGasHandler.gasBurned += 10000;

    return verifyEd25519Sync(signedData, signature, pubKey);

};

// SSS (Shamir's Secret Sharing) placeholder function
export const sss = () => {

    this.contractGasHandler.gasBurned += 60000;

};

// MPC (Multi-Party Computation) placeholder function
export const mpc = () => {

    this.contractGasHandler.gasBurned += 60000;

};

// FHE (Fully Homomorphic Encryption) placeholder function
export const fhe = () => {

    this.contractGasHandler.gasBurned += 60000;

};

// zkSNARK (Zero-Knowledge Succinct Non-Interactive Argument of Knowledge) functions

/**
    * 
    * @param {'groth16'|'plonk'|'fflonk'} protoName 
    * @param {*} verificationKey 
    * @param {*} publicInputs 
    * @param {*} plonkProof 
    * @returns 
*/
export const zkSNARK = async (protoName, verificationKey, publicInputs, plonkProof) => {

    this.contractGasHandler.gasBurned += 60000;

    return snarkjs[protoName].verify(verificationKey, publicInputs, plonkProof);

};




export let getRandomValue = () => {

    this.contractGasHandler.gasBurned += 6000;

    /*
    
        Returns source of randomness to EVM & WASM. Format - 256 bit string. This is current epoch hash

        It's random enough because:
            
            1) EpochHash = blake3Hash(firstBlocksHashes)
            2) Each first block in epoch must contains AEFPs(aggregated epoch finalization proofs) and each proof contains signature by quorum member
            3) Since only quorum member can generate proof using own private key and these proofs will be in block(and in hash) - then we have a reliable and deterministic source of randomness 
    
    */

    return WORKING_THREADS.VERIFICATION_THREAD.EPOCH.hash

}




export let verifyVrfRandomValue = (randomHashAsHexString,dataAsHexString,pubkeyAsHexString,proofAsHexString) => {

    this.contractGasHandler.gasBurned += 60000;

    // Deserialize (string => []uint8) and verify equality

    try{

        let data = new Uint8Array(Buffer.from(dataAsHexString,'utf-8'))

        let pubkey = new Uint8Array(Buffer.from(pubkeyAsHexString,'utf-8'))

        let proof = new Uint8Array(Buffer.from(proofAsHexString,'utf-8'))

        
        let hashCheck = ProofHoHash(pubkey, data, proof)

        return Buffer.from(hashCheck).toString('hex') === randomHashAsHexString


    } catch { return false }

}



export let getFromState = key => {

    this.contractGasHandler.gasBurned += 1000;
        
    let keyValue = this.contractInstance.__getString(key);
    
    return this.contractInstance.__newString(JSON.stringify(this.contractStorage[keyValue] || ''));

}



export let setToState = (key,value) => {

    this.contractGasHandler.gasBurned += 5000;

    let keyValue = this.contractInstance.__getString(key);

    let valueValue = this.contractInstance.__getString(value);
        
    this.contractStorage[keyValue] = valueValue;

}



// Function transfer native coins to another account(used for WVM)
export let transferNativeCoins = amount => {

    this.contractGasHandler.gasBurned += 1000;

    this.contractAccount.balance -= amount

    this.recipientAccount.balance += amount

}