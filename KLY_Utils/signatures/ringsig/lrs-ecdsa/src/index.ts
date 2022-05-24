import { ec as EC } from 'elliptic';
import { SHA3 as SHA3 } from 'sha3';
import { Buffer } from 'buffer';
import { sign as LRSSign, RingSign } from "./lib/ring";
import { makeKeyring } from './lib/utils';
export { verify, link, RingSign } from './lib/ring';

/**
 * Creates a ring signature
 * @param message content to sign
 * @param privateKey signer
 * @param publicKeys array of public keys
 */
export function sign(message: string, privateKey: string, publicKeys: string[]): RingSign {
    if (typeof message != "string") throw new Error("The message must be a string");
    else if (typeof privateKey != "string") throw new Error("The privateKey must be a string");
    else if (!Array.isArray(publicKeys)) throw new Error("publicKeys must be an array");
    else if (publicKeys.some(pk => typeof pk != "string")) throw new Error("publicKeys must be a string array");

    // 0x prefix sanitization
    privateKey = privateKey.replace(/^0x/, "");
    publicKeys = publicKeys.map(pk => pk.replace(/^0x/, ""))

    // Import the key
    const ec = new EC('secp256k1');
    const signerKeyPair = ec.keyFromPrivate(privateKey, 'hex');

    // Hash the message
    const hash = new SHA3(256);
    hash.update(message);
    const messageHash = hash.digest('hex');
    const hashBuffer = Buffer.from(messageHash, 'hex');
    const payload = Uint8Array.from(hashBuffer);

    // Compute and sign the rign
    const ringPosition = Math.floor(Math.random() * publicKeys.length);
    const ring = makeKeyring(publicKeys, signerKeyPair, ringPosition);
    return LRSSign(payload, ring, signerKeyPair, ringPosition);
}
