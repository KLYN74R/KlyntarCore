import {hash} from 'blake3-wasm'
import c from 'crypto'




export let




BLAKE3=v=>hash(v).toString('hex'),




/**
 * @param {string} data UTF-8 data(mostly it's BLAKE3 hashes)
 * @param {string} sig Base64 signature
 * @param {string} pub Ed25519 pubkey RFC8410
 * @returns {boolean} True if signature is valid and false otherwise(invalid or error)
 * */
 VERIFY=(data,sig,pub)=>new Promise((resolve,reject)=>

 c.verify(null,data,'-----BEGIN PUBLIC KEY-----\n'+'MCowBQYDK2VwAyEA'+pub+'\n-----END PUBLIC KEY-----',Buffer.from(sig,'base64'),(e,res)=>
 
     e?reject(false):resolve(res)
 
 )

).catch(e=>false),




/**
* @param {string} data UTF-8 data(mostly it's BLAKE3 hashes)
* @param {string} prv Ed25519 privatekey RFC8410
* @returns {string} Base64 Ed25519 signature or '' otherwise(invalid or error)
* */
SIG=(data,prv)=>new Promise((resolve,reject)=>

 c.sign(null,Buffer.from(data),'-----BEGIN PRIVATE KEY-----\n'+prv+'\n-----END PRIVATE KEY-----',(e,sig)=>
 
     e?reject(''):resolve(sig.toString('base64'))

 )

).catch(e=>''),




/**@param {string} msg UTF-8 default string @param {string} pub 4096 RSA pubKey @returns {string} Ciphertext in Base64*/

ENCRYPT=(msg,pub)=>c.publicEncrypt(pub,Buffer.from(msg,'utf8')).toString('base64'),




/**@param {string} encMsg Base64 ciphertext @param {string} prv 4096 RSA privateKey @returns {string} UTF-8 plaintext*/

DECRYPT=(encMsg,prv)=>c.privateDecrypt(prv,Buffer.from(encMsg,'base64')).toString('utf-8')