import * as bls from '@noble/bls12-381'
import Base58 from 'base-58'




// ================================================ EXPORT section ======================================================

import crypto from 'crypto'



export default {

    generatePrivateKey:async()=>new Promise((resolve,reject)=>
        
        crypto.randomBytes(32,(e,buf)=>

            e ? reject(e) : resolve(buf.toString('hex'))

        )

    ),

    derivePubKey:privateKey=>Base58.encode(bls.getPublicKey(Buffer.from(privateKey,'hex'))),
    
    //async
    singleSig:(msg,privateKey)=>bls.sign(
        
        Buffer.from(msg,'utf-8').toString('hex'),Buffer.from(privateKey,'hex')
        
        
        
    ).then(b=>Buffer.from(b,'utf-8').toString('base64')),

    
    singleVerify:(msg,pubKey,signa)=>bls.verify(Buffer.from(signa,'base64'),Buffer.from(msg,'utf-8').toString('hex'),Base58.decode(pubKey)),


    aggregatePublicKeys:publicKeysArray=>bls.aggregatePublicKeys(publicKeysArray),

    aggregateSignatures:signaturesArray=>bls.aggregateSignatures(signaturesArray),


  /**
   * ## Adds an array of verification vectors together to produce the groups verification vector
   * @param {Array} pubKeysIn - an array of signers who take part in this signing
   * @param {Array} pubKeysOut - the rest of addresses which are in general pubkey,but don't take part in this round
   * @param {String} originalGroupPub  - aggregated general(master) pubkey which includes all previously reminded addresses
   * @param {String} data - message to be signed. It might be transaction,random message, Unobtanium freeze, some service logic and so on
   * @param {String} aggregatedSignaIn - aggregated signature received from <pubKeysIn> signatures
   * @param {Number} m - number of signers required
   * @param {Number} n - total number of signers
   * 
   */
    verify_M_N_signature:(pubKeysIn,pubKeysOut,originalGroupPub,data,aggregatedSignaIn,m,n)=>{

        //0.Get aggregated key of pubkeys who has signed this data
        let signersIn=bls.aggregatePublicKeys(pubKeysIn),

            signersOut=bls.aggregatePublicKeys(pubKeysOut),

            generalPubKey=bls.aggregatePublicKeys([signersIn,signersOut]),

            verifiedSignature=await bls.verify(aggregatedSignaIn,data,signersIn)


            return verifiedSignature && generalPubKey === originalGroupPub
            && 
            (!m || pubKeysIn.length+pubKeysOut.length === n && pubKeysIn.length === m)//if m and n are undefined-we don't interest in number of participants
    
    },


}