//Спизжено(взято так как это open source) с https://github.com/cyph/ntru.js#readme

/*

Overview
The NTRU post-quantum asymmetric cipher compiled to WebAssembly using Emscripten. A simple JavaScript wrapper is provided to make NTRU easy to use in web applications.

The default parameter set is EES743EP1 (roughly 256-bit strength, as per NTRU's documentation). To change this, modify line 13 of Makefile and rebuild with make.



*/

import ntru from 'ntru'

let keys=await ntru.keyPair()

console.log(keys)

console.log(ntru)

let text=Buffer.from('datbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','utf8')
let encrypted=await ntru.encrypt(text,keys.publicKey)

console.log(encrypted)

console.log('Decrypted => ',Buffer.from(await ntru.decrypt(encrypted,keys.privateKey)).toString('utf-8'))