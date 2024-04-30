let { createRequire } = await import('module'),
    require = createRequire(import.meta.url),
    { sign, verify, link, Wallet } = require('../KLY_Utils/signatures/ringsig/lrs-ecdsa/export.js')

// LEGIT
let privateKeyInCensus
const censusPublicKeys = [] // pub keys
for (let i = 0; i < 10; i++) {
    const wallet = Wallet.createRandom()
    if (i == 5) privateKeyInCensus = wallet.privateKey

    wallet.getAddress()
    censusPublicKeys.push(wallet.signingKey.publicKey)
}

// FAKE
const w = Wallet.createRandom()
const extraneousId = {
    privateKey: w.privateKey,
    publicKey: w.signingKey.publicKey
}

// VALID SIGNATURES

const signature1 = sign('hello world', privateKeyInCensus, censusPublicKeys)
const isValid1 = verify(signature1, censusPublicKeys)

const signature2 = sign('hi there', privateKeyInCensus, censusPublicKeys)
const isValid2 = verify(signature2, censusPublicKeys)

const signaturesLinked = link(signature1, signature2)

console.log(isValid1 ? ' тЬЕ Signature 1 is valid' : 'тЭМ Signature 1 is invalid')
console.log(isValid2 ? ' тЬЕ Signature 2 is valid' : 'тЭМ Signature 2 is invalid')
console.log(
    signaturesLinked
        ? ' тЬЕ Signatures 1 and 2 are linked'
        : 'тЭМ Signatures 1 and 2 are not linked'
)

// INVALID  SIGNATURES

try {
    // A random private key not in the ring
    const extraneousPrivateKey = extraneousId.privateKey

    const fakeSignature = sign('hello world', extraneousPrivateKey, censusPublicKeys)
    throw new Error('тЭМ Should have thrown an error')
} catch (err) {
    if (err.message != 'The given key pair does not match with any public key in the array') {
        console.error(err)
    } else {
        console.log(' тЬЕ The fakePrivate key is not within the set of public keys')
    }
}

// ALTERED SIGNATURES

try {
    // A random private key not in the ring
    const extraneousPrivateKey = extraneousId.privateKey
    const publicKeyFromExtraneous = extraneousId.publicKey

    // replace one of the keys with an extraneous one, so we can try to sign with another account
    const pubKeysAltered = censusPublicKeys.map((pubKey, i) => {
        if (i == 0) return publicKeyFromExtraneous
        return pubKey
    })
    const extraneousSignature1 = sign('hello world', extraneousPrivateKey, pubKeysAltered)

    const isValid3 = verify(extraneousSignature1, censusPublicKeys)

    const extraneousSignature2 = sign('hi there', extraneousPrivateKey, pubKeysAltered)
    const extraneousSignaturesLinked2 = link(extraneousSignature1, extraneousSignature2)

    const differentSignaturesLinked = link(signature1, extraneousSignature2)

    console.log(
        isValid3 ? 'тЭМ The altered signature is valid' : ' тЬЕ The altered signature is invalid'
    )
    console.log(
        extraneousSignaturesLinked2
            ? ' тЬЕ Altered signatrues 1 and 2 are linked'
            : 'тЭМ Altered signatrues 1 and 2 are not linked'
    )
    console.log(
        differentSignaturesLinked
            ? 'тЭМ Signature 1 and altered signature 2 are linked'
            : ' тЬЕ Signature 1 and altered signature 2 are not linked'
    )
} catch (err) {
    console.log(err)
}
