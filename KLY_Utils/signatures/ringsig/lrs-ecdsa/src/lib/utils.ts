const randomBytes = require('randombytes')
import { ec as EC } from 'elliptic'
import { SHA3 as SHA3 } from 'sha3'
import { Buffer } from 'buffer'
import BN from 'bn.js'
import { KeyPair, KeyRing } from './ring'

/**
 * Returns true if the given arrays are equal
 * @param keyList1 pubkeylist before ring
 * @param keyList2 pubkeylist after ring
 */
export function checkDeepEqual(keyList1: string[], keyList2: string[]) {
    if (!Array.isArray(keyList1) || !Array.isArray(keyList2))
        throw new Error('Input parameters should be arrays')
    else if (keyList1.length != keyList2.length) return false

    const a = keyList2.concat([])
    const b = keyList1.concat([])
    b.sort()
    a.sort()

    for (let i = 0; i < b.length; i++) {
        if (a[i] != b[i]) {
            return false
        }
    }
    return true
}

/**
 * Takes public key array and places the public key corresponding to privkey in index position of the ring
 * @param publicKeyList Public keys to use
 * @param signerKeyPair Key pairs of the signer
 * @param position Signer position in the ring
 */
export function makeKeyring(
    publicKeyList: string[],
    signerKeyPair: KeyPair,
    ringPosition: number
): KeyRing {
    if (publicKeyList.length < 2) {
        throw new Error('The ring size is too small')
    }

    let ec = new EC('secp256k1')

    // make the ring
    const ring: KeyPair[] = publicKeyList.map(publicKey => {
        publicKey = publicKey.replace(/^0x/, '')
        return ec.keyFromPublic(publicKey, 'hex')
    })

    const signerPubKeyX = signerKeyPair.getPublic().getX().toString()
    const signerPubKeyY = signerKeyPair.getPublic().getY().toString()

    let signerIndex = -1
    for (let i = 0; i < ring.length; i++) {
        const pub = ring[i].getPublic()
        if (pub.getX().toString() !== signerPubKeyX) continue
        else if (pub.getY().toString() !== signerPubKeyY) continue
        signerIndex = i
        break
    }
    if (signerIndex == -1)
        throw new Error('The given key pair does not match with any public key in the array')

    // Swap the signer's keypair with the one at the expected position (really needed?)
    let tmp = ring[ringPosition]
    ring[ringPosition] = ring[signerIndex]
    ring[signerIndex] = tmp

    return ring
}

/**
 * Calculates key image I = x * H_p(P) where H_p is a hash function that returns a point
 * H_p(P) = sha3(P) * G
 * @param keyPair
 */
export function getKeyImage(keyPair: KeyPair) {
    let hash = hashPoint(keyPair)
    let privKey = keyPair.getPrivate() as BN
    let privKey_arr = privKey.toArray('be')
    let keyImage = hash.mul(privKey_arr)
    return keyImage
}

/**
 * sha3(P) * G
 * @param keyPair Can be a full keyPair object or just the curve part
 */
export function hashPoint(keyPair: KeyPair) {
    let pubKey = keyPair.getPublic()
    let x = pubKey.getX().toArray('big')
    let y = pubKey.getY().toArray('big')

    let hash = new SHA3(256)
    let append = Buffer.from(x.concat(y))
    hash.update(append)
    let sha3 = hash.digest('hex')
    let res = keyPair.ec.g.mul(sha3) // scalar base mul
    return res
}

/**
 * Generates a random BN
 * Idea taken from: https://github.com/iden3/snarkjs
 */
export function getRandomBigNumber(): BN {
    let res = new BN(0)
    let n = new BN('115792089237316195423570985008687907853269984665640564039457584007908834671663')
    while (!n.isZero()) {
        res = res.shln(8).add(new BN(randomBytes(1)[0]))
        n = n.shrn(8)
    }
    return res
}

/**
 * Converts a byteArray to a hex string
 * @param byteArray byteArray to cast
 */
export function toHexString(byteArray) {
    return Array.from(byteArray, (byte: any) => {
        return ('0' + (byte & 0xff).toString(16)).slice(-2)
    }).join('')
}
