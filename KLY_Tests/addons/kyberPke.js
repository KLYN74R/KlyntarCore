//Fix to load addons. For node v17.9.0 it's still impossible to load addons to ESM environment
//See https://stackoverflow.com/a/66527729/18521368
let { createRequire } = await import('module'),

    require = createRequire(import.meta.url),

    //the main module-contains all builded addons
    ADDONS = require('./build/Release/BUNDLE'),

    //and blake3 to get hash of public keys
    {hash}=await import('blake3-wasm'),

    BLAKE3=v=>hash(v).toString('hex')




let [pubkey,privatekey]=ADDONS.gen_KYBER_PKE().split(':')

console.log('\n\n',BLAKE3("HELLO KLYNTAR"),'\n\n')

let toCipher=ADDONS.gen_KYBER_PKE_ENCRYPT(pubkey,BLAKE3("HELLO KLYNTAR"))

console.log(toCipher)

console.log('\n\n++++++++++++ DECRYPTED +++++++++++++++\n\n')

console.log(ADDONS.gen_KYBER_PKE_DECRYPT(privatekey,toCipher))