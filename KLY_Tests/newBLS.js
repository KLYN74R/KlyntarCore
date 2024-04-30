import bls from '@chainsafe/bls'

// class-based interface
// const secretKey = bls.SecretKey.fromKeygen();
// const publicKey = secretKey.toPublicKey();
// const message = new Uint8Array(32);

// console.log('Secret key ',secretKey.toHex());
// console.log('Public key ',Base58.encode(publicKey.toBytes()));

// const signature = secretKey.sign(message);

// console.log('Signa is ',signature.toHex());
// console.log("Is valid: ", signature.verify(publicKey, message));

//____________________________________ GENERAL TEST ____________________________________

// let

// prv1 = bls.SecretKey.fromKeygen(),
// pub1 = prv1.toPublicKey().toBytes(),

// prv2 = bls.SecretKey.fromKeygen(),
// pub2 = prv2.toPublicKey().toBytes(),

// prv3 = bls.SecretKey.fromKeygen(),
// pub3 = prv3.toPublicKey().toBytes(),

// message = Buffer.from('Hello KLYNTAR','utf8'),

// //Sign it

// signa1=prv1.sign(message).toBytes(),
// signa2=prv2.sign(message).toBytes(),
// signa3=prv3.sign(message).toBytes()

// console.log('Prv1 ',prv1.toHex())
// console.log('Pub1 ',Base58.encode(pub1))
// console.log('\n')

// console.log('Prv2 ',prv2.toHex())
// console.log('Pub2 ',Base58.encode(pub2))
// console.log('\n')

// console.log('Prv3 ',prv3.toHex())
// console.log('Pub3 ',Base58.encode(pub3))
// console.log('\n')

// console.log('Sig1 ',Buffer.from(signa1).toString('hex'))
// console.log('Sig2 ',Buffer.from(signa2).toString('hex'))
// console.log('Sig3 ',Buffer.from(signa3).toString('hex'))

// console.log('\n')
// let aggregatedPub = bls.aggregatePublicKeys([pub1,pub2,pub3])
// console.log('Aggregated pub ',Base58.encode(aggregatedPub))
// let aggregatedSigna = bls.aggregateSignatures([signa1,signa2,signa3])
// console.log('Aggregated signa ',Buffer.from(aggregatedSigna).toString('hex'))

// console.log('\n')
// console.log('Is signa1 verified ',bls.verify(pub1,message,signa1))
// console.log('Is aggregated verified ',bls.verify(aggregatedPub,message,aggregatedSigna))

//_____________________________________ PERFORMANCE TEST _____________________________________

//*Primitive,just to compare implementations

let privateKeys = [],
    pubkeys = [],
    signatures = [],
    message = Buffer.from('Hello KLYNTAR', 'utf8')

//Let test with 500
for (let i = 0; i < 500; i++) {
    let prv1 = bls.SecretKey.fromKeygen(),
        pub1 = prv1.toPublicKey().toBytes()

    privateKeys.push(prv1.toBytes())
    pubkeys.push(pub1)

    signatures.push(prv1.sign(message).toBytes())
}

console.time('Aggregate 500')
let aggregatedPub = bls.aggregatePublicKeys(pubkeys)
let aggregatedSigna = bls.aggregateSignatures(signatures)
console.timeEnd('Aggregate 500')

console.log(bls.verify(aggregatedPub, message, aggregatedSigna))
