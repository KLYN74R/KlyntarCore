

import schnorr from 'bip-schnorr'

import BigInteger from 'bigi'



// const Buffer = require('safe-buffer').Buffer; 

import randomBytes from 'random-bytes'

const randomBuffer = (len) => Buffer.from(randomBytes.sync(len));

const convert = schnorr.convert;
const muSig = schnorr.muSig;


// data known to every participant
const publicData = {
  pubKeys: [
    Buffer.from('846f34fdb2345f4bf932cb4b7d278fb3af24f44224fb52ae551781c3a3cad68a', 'hex'),
    Buffer.from('cd836b1d42c51d80cef695a14502c21d2c3c644bc82f6a7052eb29247cf61f4f', 'hex'),
    Buffer.from('b8c1765111002f09ba35c468fab273798a9058d1f8a4e276f45a1f1481dd0bdb', 'hex'),
  ],
  message: convert.hash(Buffer.from('muSig is awesome!', 'utf8')),
  pubKeyHash: null,
  pubKeyCombined: null,
  pubKeyParity: null,
  commitments: [],
  nonces: [],
  nonceCombined: null,
  partialSignatures: [],
  signature: null,
};

// data only known by the individual party, these values are never shared
// between the signers!
const signerPrivateData = [
  // signer 1
  {
    privateKey: BigInteger.fromHex('add2b25e2d356bec3770305391cbc80cab3a40057ad836bcb49ef3eed74a3fee'),
    session: null,
  },
  // signer 2
  {
    privateKey: BigInteger.fromHex('0a1645eef5a10e1f5011269abba9fd85c4f0cc70820d6f102fb7137f2988ad78'),
    session: null,
  },
  // signer 3
  {
    privateKey: BigInteger.fromHex('2031e7fed15c770519707bb092a6337215530e921ccea42030c15d86e8eaf0b8'),
    session: null,
  }
];

// -----------------------------------------------------------------------
// Step 1: Combine the public keys
// The public keys P_i are combined into the combined public key P.
// This can be done by every signer individually or by the initializing
// party and then be distributed to every participant.
// -----------------------------------------------------------------------

publicData.pubKeyHash = muSig.computeEll(publicData.pubKeys);
const pkCombined = muSig.pubKeyCombine(publicData.pubKeys, publicData.pubKeyHash);

// console.log('Public key combined => ',pkCombined)

publicData.pubKeyCombined = convert.intToBuffer(pkCombined.affineX);
publicData.pubKeyParity = pkCombined%2==0

// -----------------------------------------------------------------------
// Step 2: Create the private signing session
// Each signing party does this in private. The session ID *must* be
// unique for every call to sessionInitialize, otherwise it's trivial for
// an attacker to extract the secret key!
// -----------------------------------------------------------------------
signerPrivateData.forEach((data, idx) => {
  const sessionId = randomBuffer(32); // must never be reused between sessions!
  data.session = muSig.sessionInitialize(
    sessionId,
    data.privateKey,
    publicData.message,
    publicData.pubKeyCombined,
    publicData.pubKeyParity,
    publicData.pubKeyHash,
    idx
  );
});
const signerSession = signerPrivateData[0].session;

// -----------------------------------------------------------------------
// Step 3: Exchange commitments (communication round 1)
// The signers now exchange the commitments H(R_i). This is simulated here
// by copying the values from the private data to public data array.
// -----------------------------------------------------------------------
for (let i = 0; i < publicData.pubKeys.length; i++) {
  publicData.commitments[i] = signerPrivateData[i].session.commitment;
}


// console.log('Original pubkeys => ',publicData.pubKeys.map(pubkey=>pubkey.toString('hex')))



// -----------------------------------------------------------------------
// Step 4: Get nonces (communication round 2)
// Now that everybody has commited to the session, the nonces (R_i) can be
// exchanged. Again, this is simulated by copying.
// -----------------------------------------------------------------------
for (let i = 0; i < publicData.pubKeys.length; i++) {
  publicData.nonces[i] = signerPrivateData[i].session.nonce;
}

// -----------------------------------------------------------------------
// Step 5: Combine nonces
// The nonces can now be combined into R. Each participant should do this
// and keep track of whether the nonce was negated or not. This is needed
// for the later steps.
// -----------------------------------------------------------------------
publicData.nonceCombined = muSig.sessionNonceCombine(signerSession, publicData.nonces);
signerPrivateData.forEach(data => (data.session.combinedNonceParity = signerSession.combinedNonceParity));

// -----------------------------------------------------------------------
// Step 6: Generate partial signatures
// Every participant can now create their partial signature s_i over the
// given message.
// -----------------------------------------------------------------------
signerPrivateData.forEach(data => {
  data.session.partialSignature = muSig.partialSign(data.session, publicData.message, publicData.nonceCombined, publicData.pubKeyCombined);
});

// -----------------------------------------------------------------------
// Step 7: Exchange partial signatures (communication round 3)
// The partial signature of each signer is exchanged with the other
// participants. Simulated here by copying.
// -----------------------------------------------------------------------
for (let i = 0; i < publicData.pubKeys.length; i++) {
  publicData.partialSignatures[i] = signerPrivateData[i].session.partialSignature;
}

// -----------------------------------------------------------------------
// Step 8: Verify individual partial signatures
// Every participant should verify the partial signatures received by the
// other participants.
// -----------------------------------------------------------------------
for (let i = 0; i < publicData.pubKeys.length; i++) {
  muSig.partialSigVerify(
    signerSession,
    publicData.partialSignatures[i],
    publicData.nonceCombined,
    i,
    publicData.pubKeys[i],
    publicData.nonces[i]
  );
}

// -----------------------------------------------------------------------
// Step 9: Combine partial signatures
// Finally, the partial signatures can be combined into the full signature
// (s, R) that can be verified against combined public key P.
// -----------------------------------------------------------------------
publicData.signature = muSig.partialSigCombine(publicData.nonceCombined, publicData.partialSignatures);

console.log('Signa => ',publicData.signature.toString('base64'))

// -----------------------------------------------------------------------
// Step 10: Verify signature
// The resulting signature can now be verified as a normal Schnorr
// signature (s, R) over the message m and public key P.
// -----------------------------------------------------------------------

console.log('Pubkey combined => ',publicData.pubKeyCombined)


console.log('Verify => ',schnorr.verify(publicData.pubKeyCombined,convert.hash(Buffer.from('muSig is awesome!', 'utf8')),publicData.signature))



//------------------------------- DEFAULT SIGNATURES -------------------------------



let PUB='846f34fdb2345f4bf932cb4b7d278fb3af24f44224fb52ae551781c3a3cad68a'

let PRV='add2b25e2d356bec3770305391cbc80cab3a40057ad836bcb49ef3eed74a3fee'


let PAIR = {

    publicKey:'199f601609f0be3edae6951edb811637fbdea960b054152df39a4f12f9bd2655',
    privateKey: 'aee0a1f7afebf9d2a5a80c0c98a31c709681cce195cbcd06342b517970c0be10'

}

  


// import secp256k1 from 'bcrypto/lib/secp256k1.js'


// const key = secp256k1.privateKeyGenerate();
// const pub = secp256k1.publicKeyCreate(key, true);


// console.log('Private ',key)
// console.log('Public ',pub)


let q=schnorr.sign(PAIR.privateKey,Buffer.from('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','hex'))

console.log(q)

console.log(schnorr.verify(Buffer.from(PAIR.publicKey,'hex'),Buffer.from('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','hex'),q))

