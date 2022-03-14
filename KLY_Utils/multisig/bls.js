import * as bls from '@noble/bls12-381'

import Base58 from 'base-58'



// =========================== Default data ===========================

const message = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const messages = ['d2', '0d98', '05caf3'];

const privateKeys = [
    '18f020b98eb798752a50ed0563b079c125b0db5dd0b1060d1c1b47d4a193e1e4',
    'ed69a8c50cf8c9836be3b67c7eeff416612d45ba39a5c099d48fa668bf558c9c',
    '16ae669f3be7a2121e17d0c68c05a8f3d6bef21ec0f2315f1d7aec12484e4cf5'
]
 
const publicKeys = privateKeys.map(bls.getPublicKey);



// =========================== Single sig ===========================

// const privateKey = '67d53f170b908cabb9eb326c3c337762d59289a8fec79f7bc9254b584b732600';
// const publicKey = bls.getPublicKey(privateKey);
// const signature = await bls.sign(message, privateKey);
// const isValid = await bls.verify(signature, message, publicKey);
// console.log({publicKey:Base58.encode(publicKey),signature,isValid});


// =========================== Sign 1 msg with 3 keys ===========================
// const signatures2 = await Promise.all(privateKeys.map(p=>bls.sign(message,p)));
// const aggPubKey2 = bls.aggregatePublicKeys(publicKeys);
// const aggSignature2 = bls.aggregateSignatures(signatures2);
// const isValid2 = await bls.verify(aggSignature2, message, aggPubKey2);

// console.log({ aggPubKey2:Base58.encode(aggPubKey2), aggSignature2, isValid2 });


// =========================== Sign 3 msgs with 3 keys and 1 signature ===========================
// const signatures3 = await Promise.all(privateKeys.map((p, i) => bls.sign(messages[i], p)));
// const aggSignature3 = bls.aggregateSignatures(signatures3);
// const isValid3 = await bls.verifyBatch(aggSignature3, messages, publicKeys);
// console.log({ publicKeys, signatures3, aggSignature3, isValid3 });




// =========================== Sign 1 msg with 3 keys in 1 agregated and another 3 keys in 1 agregated ===========================

// ================================================ N/N signatures ======================================================

// const anotherprivateKeys = [
//     '18f020b98eb798752a50ed0563b079c125b0db5dd0b1060d1c1b47d4a193e100',
//     'ed69a8c50cf8c9836be3b67c7eeff416612d45ba39a5c099d48fa668bf558c00',
//     '16ae669f3be7a2121e17d0c68c05a8f3d6bef21ec0f2315f1d7aec12484e4c00'
// ]

// //1st agregation
// const defaultpublicKeys = privateKeys.map(bls.getPublicKey);
// const defaultsignatures = await Promise.all(privateKeys.map(p=>bls.sign(message,p)));

// const aggPubKey2 = bls.aggregatePublicKeys(defaultpublicKeys);
// const aggSignature2 = bls.aggregateSignatures(defaultsignatures);


// //2st agregation
// const secpublicKeys = anotherprivateKeys.map(bls.getPublicKey);
// const secsignatures = await Promise.all(anotherprivateKeys.map(p=>bls.sign(message,p)));

// const secaggPubKey2 = bls.aggregatePublicKeys(secpublicKeys);
// const secaggSignature2 = bls.aggregateSignatures(secsignatures);

// //Main aggregation
// const mainPub = bls.aggregatePublicKeys([secaggPubKey2,aggPubKey2]);
// const mainSig = bls.aggregateSignatures([secaggSignature2,aggSignature2]);

// //Final validation
// const isValid2 = await bls.verify(mainSig, message, mainPub);
// console.log(isValid2)

//console.log({ aggPubKey2:Base58.encode(aggPubKey2), aggSignature2, isValid2 });





// ================================================ M/N signatures ======================================================

//Imagine that we have one pubkey created by 3 different actors(A,B,C)
// const aggPubMax = bls.aggregatePublicKeys(publicKeys);
// console.log('Max aggregation(3/3)',Base58.encode(aggPubMax))



// //But we want to make 2/3 payment
// const _2_3Pub = bls.aggregatePublicKeys(publicKeys.slice(1));
// console.log('M/N aggregation(2/3)',Base58.encode(_2_3Pub));


// //Generate common 2/3 signature
// const signatures_2_3 = bls.aggregateSignatures(await Promise.all(privateKeys.slice(1).map(p=>bls.sign(message,p))));

// console.log('M/N aggregation(2/3) signa',signatures_2_3);



// //Send array of pubkeys of initial N keys + array of current M signers + aggregated signature

// const isValid2 = await bls.verify(signatures_2_3,message,_2_3Pub);

// console.log('Is valid ',isValid2)



// ================================================ Aggregation order ======================================================

const ord0 = bls.aggregatePublicKeys(publicKeys);

console.log('Order 0',Base58.encode(ord0))



const privateKeysOrder1 = [
    '18f020b98eb798752a50ed0563b079c125b0db5dd0b1060d1c1b47d4a193e1e4',
    '16ae669f3be7a2121e17d0c68c05a8f3d6bef21ec0f2315f1d7aec12484e4cf5',
    'ed69a8c50cf8c9836be3b67c7eeff416612d45ba39a5c099d48fa668bf558c9c'
]
 
const publicKeysOrder1 = privateKeysOrder1.map(bls.getPublicKey);


const ord1 = bls.aggregatePublicKeys(publicKeysOrder1);

console.log('Order 1',Base58.encode(ord1))

