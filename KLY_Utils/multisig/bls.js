import * as bls from '@noble/bls12-381'

import Base58 from 'base-58'



//Test
const message = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const messages = ['d2', '0d98', '05caf3'];

const privateKeys = [
    '18f020b98eb798752a50ed0563b079c125b0db5dd0b1060d1c1b47d4a193e1e4',
    'ed69a8c50cf8c9836be3b67c7eeff416612d45ba39a5c099d48fa668bf558c9c',
    '16ae669f3be7a2121e17d0c68c05a8f3d6bef21ec0f2315f1d7aec12484e4cf5'
]
 
const publicKeys = privateKeys.map(bls.getPublicKey);



//Single sig
// const privateKey = '67d53f170b908cabb9eb326c3c337762d59289a8fec79f7bc9254b584b732600';
// const publicKey = bls.getPublicKey(privateKey);
// const signature = await bls.sign(message, privateKey);
// const isValid = await bls.verify(signature, message, publicKey);
// console.log({publicKey:Base58.encode(publicKey),signature,isValid});


// Sign 1 msg with 3 keys
// const signatures2 = await Promise.all(privateKeys.map(p => bls.sign(message, p)));
// const aggPubKey2 = bls.aggregatePublicKeys(publicKeys);
// const aggSignature2 = bls.aggregateSignatures(signatures2);
// const isValid2 = await bls.verify(aggSignature2, message, aggPubKey2);

// console.log({ aggPubKey2:Base58.encode(aggPubKey2), aggSignature2, isValid2 });


// Sign 3 msgs with 3 keys
// const signatures3 = await Promise.all(privateKeys.map((p, i) => bls.sign(messages[i], p)));
// const aggSignature3 = bls.aggregateSignatures(signatures3);
// const isValid3 = await bls.verifyBatch(aggSignature3, messages, publicKeys);
// console.log({ publicKeys, signatures3, aggSignature3, isValid3 });