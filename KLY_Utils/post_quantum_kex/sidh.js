//https://github.com/cyph/sidh.js

import sidh from 'sidh'

let keys=await sidh.keyPair()

console.log(sidh)

// console.log(keys)

let text=Buffer.from('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','utf-8')

let encrypted=await sidh.encrypt(text,keys.publicKey)

console.log(encrypted)

console.log('Decrypted => ',Buffer.from(await sidh.decrypt(encrypted,keys.privateKey)).toString('utf-8'))