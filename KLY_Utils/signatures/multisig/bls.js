import bls from 'bls-eth-wasm'

await bls.init(bls.BLS12_381)




export default {

    generatePrivateKey:()=>{

        let privateKey = new bls.SecretKey()

        privateKey.setByCSPRNG()

        return privateKey.serializeToHexStr()

    },

    derivePubKeyFromHexPrivateKey:privateKeyAsHex=>{

        let privateKey = bls.deserializeHexStrToSecretKey(privateKeyAsHex)

        let publicKey = privateKey.getPublicKey()

        return `0x${publicKey.serializeToHexStr()}`

    },

    singleSig:(msg,privateKeyAsHexString)=>{

        let secretKey = bls.deserializeHexStrToSecretKey(privateKeyAsHexString)

        return secretKey.sign(msg).serializeToHexStr()

    },
    
    singleVerify:(msg,pubKeyAsHexWith0x,signaAsHex)=>{

        let publicKey = bls.deserializeHexStrToPublicKey(pubKeyAsHexWith0x.slice(2))

        let signature = bls.deserializeHexStrToSignature(signaAsHex)

        return publicKey.verify(signature,msg)

    },

    aggregatePublicKeys:publicKeysArrayAsHexWith0x=>{

        // Create empty template
        
        let rootPub = new bls.PublicKey()

        for(let hexPubKey of publicKeysArrayAsHexWith0x){
        
            let pubKey = bls.deserializeHexStrToPublicKey(hexPubKey.slice(2))
        
            rootPub.add(pubKey)            
                    
        }

        return `0x${rootPub.serializeToHexStr()}`

    },

    aggregateSignatures:signaturesArrayAsHex=>{

        // Create empty template
        
        let aggregatedSignature = new bls.Signature()

        for(let hexSigna of signaturesArrayAsHex){

            let signa = bls.deserializeHexStrToSignature(hexSigna)

            aggregatedSignature.add(signa)
    
        }

        return aggregatedSignature.serializeToHexStr()

    },


  /**
   * Adds an array of verification vectors together to produce the groups verification vector
   * @param {String} aggregatedPubkeyWhoSignAsHexWith0x - an aggregated BLS pubkey of users who signed message,so can aggregate their pubkeys into a single one
   * @param {Array} afkPubkeysArray - the rest of addresses which are in general pubkey,but don't take part in this round
   * @param {String} rootPubKey  - aggregated general(master) pubkey which includes all previously reminded addresses
   * @param {String} msg - message to be signed
   * @param {String} aggregatedSignatureAsHex - aggregated signature received from <pubKeysIn> signatures
   * @param {Number} reverseThreshold - number of signers allowed to be afk
   * 
   */
    verifyThresholdSignature:(aggregatedPubkeyWhoSignAsHexWith0x,afkPubkeysArray,rootPubKey,msg,aggregatedSignatureAsHex,reverseThreshold)=>{

        if(afkPubkeysArray.length <= reverseThreshold){

            let aggregatedPubKeyOfActiveSigners = bls.deserializeHexStrToPublicKey(aggregatedPubkeyWhoSignAsHexWith0x.slice(2))

            let aggregatedSignature = bls.deserializeHexStrToSignature(aggregatedSignatureAsHex)

            if(aggregatedPubKeyOfActiveSigners.verify(aggregatedSignature,msg)){

                // If all the previos steps are OK - do the most CPU intensive task - pubkeys aggregation

                let aggregatedPubKeyOfAfk = new bls.PublicKey()

                for(let hexPubKeyOfAfk of afkPubkeysArray){
        
                    let pubKey = bls.deserializeHexStrToPublicKey(hexPubKeyOfAfk.slice(2))
        
                    aggregatedPubKeyOfAfk.add(pubKey)            
                    
                }

                // Finally, to get the rootPub - join <aggregatedPubKeyOfActiveSigners> and <aggregatedPubKeyOfAfk> and compare with <rootPubKey>
                
                aggregatedPubKeyOfAfk.add(aggregatedPubKeyOfActiveSigners)

                return `0x${aggregatedPubKeyOfAfk.serializeToHexStr()}` === rootPubKey

            } else return false
            
        }else return false     

    }

}