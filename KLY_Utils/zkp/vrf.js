import { Evaluate, ProofHoHash } from '@idena/vrf-js'


import('module').then(
                
    mod => mod.createRequire(import.meta.url)

).then(require=>{

    let {Wallet} = require('../signatures/ringsig/lrs-ecdsa/export.js')

    const w = Wallet.createRandom()
       
    // let PUB=new Uint8Array(Buffer.from(w.signingKey.publicKey.slice(2),'hex'))
    // let PRV=new Uint8Array(Buffer.from(w.privateKey.slice(2),'hex'))

    let PUB=[
        4, 122,  92, 149, 185, 212,  27,  32, 237,   9,  17,
      229,  95, 254, 167,  98,  39, 136, 244, 252,  50, 132,
       64, 228, 115,  67,   0, 254, 222,  45,  93,  13, 233,
       92,  96, 204,  86, 140, 161,  44,  88, 175, 154, 101,
      228, 220,  16, 145,  21,  41, 164,  39, 234,   8, 213,
      132, 131, 228,  19,  94,  72,  78,  56,  57, 102
    ]
    let PRV = [
      221, 183, 155, 169,  12,  42, 157, 125,
       84, 174, 228,  11,  75, 134, 107,  43,
      106,  54, 210,   5, 223,  70, 215, 124,
       29, 210,  64, 253, 142, 170, 233,  16
    ]
  
    console.log('PUB ',PUB)
    console.log('PRV ',PRV)

    

    // evaluate VRF proof from private key

    const data = new Uint8Array(Buffer.from('Hello','utf-8'))// data
    const [hash, proof] = Evaluate(PRV,data)

    console.log('Hash is ',Buffer.from(hash).toString('hex'))
    console.log('Proof is ',proof)

    // check VRF proof with public key
    // throws exception if proof is invalid
    const hashCheck = ProofHoHash(PUB, data, proof)


    console.log(hashCheck)



})