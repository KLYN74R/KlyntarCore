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
   * Adds an array of verification vectors together to produce the groups verification vector
   * @param {String} aggregatedPubkeyWhoSign - an aggregated BLS pubkey of users who signed message,so can aggregate their pubkeys into a single one
   * @param {Array} afkPubkeysArray - the rest of addresses which are in general pubkey,but don't take part in this round
   * @param {String} masterPub  - aggregated general(master) pubkey which includes all previously reminded addresses
   * @param {String} data - message to be signed. It might be transaction,random message, Unobtanium freeze, some service logic and so on
   * @param {String} aggregatedSignature - aggregated signature received from <pubKeysIn> signatures
   * @param {Number} reverseThreshold - number of signers allowed to be afk
   * 
   */
    verifyThresholdSignature:async(aggregatedPubkeyWhoSign,afkPubkeysArray,masterPub,data,aggregatedSignature,reverseThreshold)=>{

        let signersOut=bls.aggregatePublicKeys(afkPubkeysArray),//aggregated pubkey of users who didn't sign the data(offline or deny this sign ceremony)

            generalPubKey=bls.aggregatePublicKeys([aggregatedPubkeyWhoSign,signersOut]),

            verifiedSignature=await bls.verify(aggregatedSignature,data,aggregatedPubkeyWhoSign)


        return verifiedSignature && generalPubKey === masterPub && afkPubkeysArray.length <= reverseThreshold 
    
    }

}