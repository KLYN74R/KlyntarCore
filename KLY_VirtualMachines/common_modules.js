import snarkjs from 'snarkjs'




export let cryptography = {

    bls:()=>{},

    pqc:()=>{},

    tbls:()=>{},

    ed25519:()=>{},

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