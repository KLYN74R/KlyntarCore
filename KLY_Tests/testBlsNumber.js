import bls from '../KLY_Utils/signatures/multisig/bls.js'
import Base58 from 'base-58'

let privateKeys = [],
    publicKeys = [],
    signatures = []

console.time('GEN 500')

for (let i = 0; i < 500; i++) {
    let privateKey = await bls.generatePrivateKey()

    let pubKey = await bls.derivePubKey(privateKey)

    privateKeys.push(privateKey)

    publicKeys.push(Base58.decode(pubKey))

    signatures.push(Buffer.from(await bls.singleSig('Hello', privateKey), 'base64'))
}

console.timeEnd('GEN 500')

let ten_private = [],
    ten_public = [],
    ten_signatures = []

console.time('GEN 10')

for (let i = 0; i < 10; i++) {
    let privateKey = await bls.generatePrivateKey()

    let pubKey = await bls.derivePubKey(privateKey)

    ten_private.push(privateKey)

    ten_public.push(Base58.decode(pubKey))

    ten_signatures.push(Buffer.from(await bls.singleSig('Hello', privateKey), 'base64'))
}

console.timeEnd('GEN 10')

console.time('Agg 500')
let aggregatedPub1000 = Base58.encode(await bls.aggregatePublicKeys(publicKeys))

console.log('Agg 500 ', aggregatedPub1000)

console.timeEnd('Agg 500')

console.time('Agg 10')
let agg10 = Base58.encode(await bls.aggregatePublicKeys(ten_public))

console.log('Agg 10', agg10)

console.timeEnd('Agg 10')

console.time('Agg 500 sig')

let sig1000 = Buffer.from(await bls.aggregateSignatures(signatures)).toString('base64')

console.log('Sig 1000 ', sig1000)

console.timeEnd('Agg 500 sig')

console.time('Agg 10 sig')

let sig10 = Buffer.from(await bls.aggregateSignatures(ten_signatures)).toString('base64')

console.log('Sig 10 ', sig10)

console.timeEnd('Agg 10 sig')

console.time('Verify 500')

console.log(await bls.singleVerify('Hello', aggregatedPub1000, sig1000))

console.timeEnd('Verify 500')

console.time('Verify 10')

console.log(await bls.singleVerify('Hello', agg10, sig10))

console.timeEnd('Verify 10')
