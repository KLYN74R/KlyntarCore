import { ec as EC } from 'elliptic';
import { SHA3 as SHA3 } from 'sha3';
import { Buffer } from 'buffer';
import BN from 'bn.js';
import { getKeyImage, getRandomBigNumber, hashPoint, toHexString, checkDeepEqual } from './utils';

export type KeyPair = EC.KeyPair;
export type KeyRing = EC.KeyPair[];

/**
 * The ring signature
 */
export class RingSign {
    Size: number;               // size of the ring
    M: Uint8Array;              // message
    C: BN;                      // ring signature value
    S: BN[];                    // ring signature values
    Ring: KeyRing;              // array of public keys
    I: KeyPair;                 // key image

    /**
     * Ring signature construstor
     * @param size size of the ring
     * @param m    message
     * @param ring ring public keys array
     */
    constructor(size: number, m: Uint8Array, ring: KeyRing) {
        this.Size = size;
        this.M = m;
        this.Ring = ring;
    }
}

/**
 * create ring signature from list of public keys given inputs 
 * @param msg message to sign
 * @param ring ring public keys array
 * @param keyPair ring signer keyPair
 * @param signerPosition ring size
 */
export function sign(msg: Uint8Array, ring: KeyRing, keyPair: KeyPair, signerPosition: number): RingSign {
    const ringSize = ring.length;

    if (ringSize < 2) {
        throw new Error("size less than two does not make sense");
    }
    else if (signerPosition >= ringSize || signerPosition < 0) {
        throw new Error("secret index out of range of ring size");
    }

    let pubKey = keyPair.getPublic();

    let sig = new RingSign(ringSize, msg, ring);

    // check that key at index signerPosition is indeed the signer's
    const ringSignerX = ring[signerPosition].getPublic().getX().toString(10)
    const ringSignerY = ring[signerPosition].getPublic().getY().toString(10)
    const givenPubKeyX = pubKey.getX().toString(10)
    const givenPubKeyY = pubKey.getY().toString(10)

    if (ringSignerX !== givenPubKeyX || ringSignerY !== givenPubKeyY) {
        throw new Error("secret index in ring is not signer");
    }

    // generate key image
    let image = getKeyImage(keyPair);
    sig.I = image;

    // start at c[1]
    // pick random scalar u (glue value), calculate c[1] = H(m, u*G) where H is a hash function and G is the base point of the curve
    let C: BN[] = [];
    let S: BN[] = [];

    // pick random scalar u
    let u = getRandomBigNumber();
    //let u = new BN("30303");  // FOR TESTING

    // start at secret index signerPosition
    // compute L_s = u*G
    let L_s = keyPair.ec.g.mul(u);

    // compute R_s = u*H_p(P[signerPosition])
    let H_p = hashPoint(keyPair)
    let R_s = H_p.mul(u);

    let l = Buffer.from(L_s.x.toArray('big').concat(L_s.y.toArray('big')))
    let r = Buffer.from(R_s.x.toArray('big').concat(R_s.y.toArray('big')))

    // concatenate m and u*G and calculate c[signerPosition+1] = H(m, L_s, R_s)
    let hash = new SHA3(256);
    hash.update(toHexString([...[...msg], ...[...[...l], ...[...r]]]), 'hex');
    let C_i = Uint8Array.from(Buffer.from(hash.digest('hex'), 'hex'));
    let idx = (signerPosition + 1) % ringSize;
    C[idx] = new BN(C_i)


    // start loop at signerPosition+1
    for (let i = 1; i < ringSize; i++) {
        idx = (signerPosition + i) % ringSize;
        //let s_i = new BN("30303")       // FOR TESTING
        let s_i = getRandomBigNumber();
        S[idx] = s_i;

        // calculate L_i = s_i*G + c_i*P_i
        let p = ring[idx].getPublic().mul(C[idx]); // c_i * P_i
        let s = keyPair.ec.curve.g.mul(s_i);       // sx, sy = s[n-1]*G
        let lxy = p.add(s);

        // calculate R_i = s_i*H_p(P_i) + c_i*I
        p = image.mul(C[idx])
        H_p = hashPoint(ring[idx])
        s = H_p.mul(s_i)
        let r = p.add(s);

        // calculate c[i+1] = H(m, L_i, R_i)
        hash = new SHA3(256);
        l = Buffer.from(lxy.x.toArray('big').concat(lxy.y.toArray('big')))
        r = Buffer.from(r.x.toArray('big').concat(r.y.toArray('big')))
        hash.update(toHexString([...[...msg], ...[...[...l], ...[...r]]]), 'hex');
        C_i = Uint8Array.from(Buffer.from(hash.digest('hex'), 'hex'));

        // if (i == ringSize - 1) { // WHY ???
        //     C[signerPosition] = new BN(C_i)
        // }
        // else {
        C[(idx + 1) % ringSize] = new BN(C_i)
        // }
    }

    // close ring by finding S[signerPosition] = ( u - c[signerPosition]*k[signerPosition] ) mod P where k[signerPosition] is the private key and P is the order of the curve
    let cs_mul_ks = C[signerPosition].mul(keyPair.getPrivate() as BN);
    let u_sub_csmulks = cs_mul_ks.neg().add(u);
    let mod = u_sub_csmulks.umod(new BN(keyPair.ec.curve.n.toString(10)));
    S[signerPosition] = mod;

    // check that u*G = S[signerPosition]*G + c[signerPosition]*P[signerPosition]
    let check_u = keyPair.ec.curve.g.mul(u);
    let check_p = ring[signerPosition].getPublic().mul(C[signerPosition]);
    let check_s = keyPair.ec.curve.g.mul(S[signerPosition]);
    let check_r = check_s.add(check_p);

    // check that u*H_p(P[signerPosition]) = S[signerPosition]*H_p(P[signerPosition]) + C[signerPosition]*I
    let check_p2 = image.mul(C[signerPosition]);         // px, py = C[signerPosition]*I
    let check_h2 = hashPoint(ring[signerPosition]);
    let check_t2 = check_h2.mul(u);
    let check_s2 = check_h2.mul(S[signerPosition]);      // sx, sy = S[signerPosition]*H_p(P[signerPosition])
    let check_r2 = check_s2.add(check_p2);

    // check that H(m, L[signerPosition], R[signerPosition]) == C[signerPosition+1]
    l = Buffer.from(check_r.x.toArray('big').concat(check_r.y.toArray('big')))
    r = Buffer.from(check_r2.x.toArray('big').concat(check_r2.y.toArray('big')))
    hash = new SHA3(256);
    hash.update(toHexString([...[...msg], ...[...[...l], ...[...r]]]), 'hex');
    C_i = Uint8Array.from(Buffer.from(hash.digest('hex'), 'hex'));

    if ((check_u.x.toString(10) != check_r.x.toString(10)) ||
        (check_u.y.toString(10) != check_r.y.toString(10)) ||
        (check_t2.x.toString(10) != check_r2.x.toString(10)) ||
        (check_t2.y.toString(10) != check_r2.y.toString(10))) {
        throw new Error("Error closing ring");
    }

    sig.S = S;
    sig.C = C[0]

    return sig
}

/**
 * Verifies a signature
 * @param sig the signature
 */
export function verify(sig/*: RingSign*/, keyList: string[] = []): boolean {
    let ring = sig.Ring;
    let ringSize = sig.Size;
    let S = sig.S;
    let C: BN[] = [];
    C[0] = sig.C   // last step of the ring
    let image = sig.I;

    // CHECK THAT THE EXPECTED PUBLIC KEYS MATCH THE ONES IN THE SIGNATURE

    let ec = new EC('secp256k1')
    let digestedExpectedCensus = []
    let digestedRingCensus = []
    keyList.forEach((pk) => {
        pk = pk.replace(/^0x/, "") // 0x sanitization
        const keyPair: EC.KeyPair = ec.keyFromPublic(pk, 'hex');
        digestedExpectedCensus.push(keyPair.getPublic().getX().toString(10).concat(keyPair.getPublic().getY().toString(10)))
    })
    ring.forEach((kp) => {
        digestedRingCensus.push(kp.getPublic().getX().toString(10).concat(kp.getPublic().getY().toString(10)))
    })
    const equal = checkDeepEqual(digestedExpectedCensus, digestedRingCensus)

    if (!equal) return false


    // VERIFY THE SIGNATURE ITSELF

    // calculate c[i+1] = H(m, s[i]*G + c[i]*P[i])
    // and c[0] = H)(m, s[n-1]*G + c[n-1]*P[n-1]) where n is the ring size
    for (let i = 0; i < ringSize; i++) {
        // calculate L_i = s_i*G + c_i*P_i
        let p = ring[i].getPublic().mul(C[i]);
        let s = ring[i].ec.curve.g.mul(S[i]);
        let l = s.add(p);

        // calculate R_i = s_i*H_p(P_i) + c_i*I
        p = image.mul(C[i]); // TODO: type
        let h = hashPoint(ring[i]);
        s = h.mul(S[i]);
        let r = s.add(p);

        // calculate c[i+1] = H(m, L_i, R_i)
        let l_2 = Buffer.from(l.x.toArray('big').concat(l.y.toArray('big')));
        let r_2 = Buffer.from(r.x.toArray('big').concat(r.y.toArray('big')));

        let pre_c_i = [...sig.M, ...[...[...l_2], ...[...r_2]]];
        let hash = new SHA3(256);
        hash.update(toHexString(pre_c_i), 'hex');
        let c_i = Uint8Array.from(Buffer.from(hash.digest('hex'), 'hex'));

        if (i == ringSize - 1) {
            C[0] = new BN(c_i);
        }
        else {
            C[i + 1] = new BN(c_i);
        }
    }

    // The last element of the ring matches
    return sig.C.eq(C[0])
}

/**
 * Links two signatures
 * @param sig_a first signature
 * @param sig_b second signature
 */
export function link(sig_a: any, sig_b: any): boolean {
    return (sig_a.I.x.toString(10) == sig_b.I.x.toString(10)) && (sig_a.I.y.toString(10) == sig_b.I.y.toString(10))
}
