import { Evaluate, ProofHoHash } from '@idena/vrf-js'


import('module').then(
                
    mod => mod.createRequire(import.meta.url)

).then(require=>{

    let {Wallet} = require('../signatures/ringsig/lrs-ecdsa/export.js')

    const w = Wallet.createRandom()
       
    let PUB=new Uint8Array(Buffer.from(w.signingKey.publicKey.slice(2),'hex'))
    let PRV=new Uint8Array(Buffer.from(w.privateKey.slice(2),'hex'))

// evaluate VRF proof from private key

const data = [1, 2, 3, 4, 5] // data
const [hash, proof] = Evaluate(PRV,data)

console.log('Hash is ',hash)
console.log('Proof is ',proof)

// check VRF proof with public key

// throws exception if proof is invalid
const hashCheck = ProofHoHash(PUB, data, proof)


console.log(hashCheck)

})