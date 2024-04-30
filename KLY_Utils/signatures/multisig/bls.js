import bls from 'bls-eth-wasm'

await bls.init(bls.BLS12_381)

export default {
    generatePrivateKey: () => {
        let privateKey = new bls.SecretKey()

        privateKey.setByCSPRNG()

        return privateKey.serializeToHexStr()
    },

    derivePubKeyFromHexPrivateKey: privateKeyAsHex => {
        let privateKey = bls.deserializeHexStrToSecretKey(privateKeyAsHex)

        let publicKey = privateKey.getPublicKey()

        return `0x${publicKey.serializeToHexStr()}`
    },

    //async
    singleSig: async (msg, privateKeyAsHexString) =>
        new Promise(resolve => {
            let secretKey = bls.deserializeHexStrToSecretKey(privateKeyAsHexString)

            resolve(secretKey.sign(msg).serializeToHexStr())
        }),

    //async
    singleVerify: async (msg, pubKeyAsHexWith0x, signaAsHex) =>
        new Promise(resolve => {
            let publicKey = bls.deserializeHexStrToPublicKey(pubKeyAsHexWith0x.slice(2))

            let signature = bls.deserializeHexStrToSignature(signaAsHex)

            resolve(publicKey.verify(signature, msg))
        }),

    aggregatePublicKeys: publicKeysArrayAsHexWith0x =>
        new Promise(resolve => {
            // Create empty template

            let rootPub = new bls.PublicKey()

            for (let hexPubKey of publicKeysArrayAsHexWith0x) {
                let pubKey = bls.deserializeHexStrToPublicKey(hexPubKey.slice(2))

                rootPub.add(pubKey)
            }

            resolve(`0x${rootPub.serializeToHexStr()}`)
        }),

    aggregateSignatures: signaturesArrayAsHex =>
        new Promise(resolve => {
            // Create empty template

            let aggregatedSignature = new bls.Signature()

            for (let hexSigna of signaturesArrayAsHex) {
                let signa = bls.deserializeHexStrToSignature(hexSigna)

                aggregatedSignature.add(signa)
            }

            resolve(aggregatedSignature.serializeToHexStr())
        }),

    /**
     * Adds an array of verification vectors together to produce the groups verification vector
     * @param {String} aggregatedPubkeyWhoSignAsHexWith0x - an aggregated BLS pubkey of users who signed message,so can aggregate their pubkeys into a single one
     * @param {Array} afkPubkeysArray - the rest of addresses which are in general pubkey,but don't take part in this round
     * @param {String} rootPubKey  - aggregated general(master) pubkey which includes all previously reminded addresses
     * @param {String} msg - message to be signed. It might be transaction,random message, Unobtanium freeze, some service logic and so on
     * @param {String} aggregatedSignatureAsHex - aggregated signature received from <pubKeysIn> signatures
     * @param {Number} reverseThreshold - number of signers allowed to be afk
     *
     */
    verifyThresholdSignature: (
        aggregatedPubkeyWhoSignAsHexWith0x,
        afkPubkeysArray,
        rootPubKey,
        msg,
        aggregatedSignatureAsHex,
        reverseThreshold
    ) =>
        new Promise(resolve => {
            if (afkPubkeysArray.length <= reverseThreshold) {
                let aggregatedPubKeyOfActiveSigners = bls.deserializeHexStrToPublicKey(
                    aggregatedPubkeyWhoSignAsHexWith0x.slice(2)
                )

                let aggregatedSignature = bls.deserializeHexStrToSignature(aggregatedSignatureAsHex)

                if (aggregatedPubKeyOfActiveSigners.verify(aggregatedSignature, msg)) {
                    // If all the previos steps are OK - do the most CPU intensive task - pubkeys aggregation

                    let aggregatedPubKeyOfAfk = new bls.PublicKey()

                    for (let hexPubKeyOfAfk of afkPubkeysArray) {
                        let pubKey = bls.deserializeHexStrToPublicKey(hexPubKeyOfAfk.slice(2))

                        aggregatedPubKeyOfAfk.add(pubKey)
                    }

                    // Finally, to get the rootPub - join <aggregatedPubKeyOfActiveSigners> and <aggregatedPubKeyOfAfk> and compare with <rootPubKey>

                    aggregatedPubKeyOfAfk.add(aggregatedPubKeyOfActiveSigners)

                    resolve(`0x${aggregatedPubKeyOfAfk.serializeToHexStr()}` === rootPubKey)
                } else resolve(false)
            } else resolve(false)
        })
}
