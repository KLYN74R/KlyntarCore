import cryptoModule from 'crypto'

import {hash} from 'blake3-wasm'

import Base58 from 'base-58'




process.env.KLY_MODE||='mainnet'




//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let




COLORS = {
    
    CLEAR:'\x1b[0m',
    TIME_COLOR:`\u001b[38;5;${process.env.KLY_MODE==='mainnet'?'23':'202'}m`, // for time view
    
    RED:'\x1b[31;1m', // red(error,no collapse,problems with sequence,etc.)
    GREEN:'\x1b[32;1m', // green(new block, exported something, something important, etc.)
    YELLOW:'\u001b[38;5;3m', // yellow(non critical warnings)
    CYAN:'\x1b[36;1m', // cyan(default messages useful to grasp the events)
    
    CD:`\u001b[38;5;50m`,//Canary died
    CON:`\u001b[38;5;168m`//CONFIGS

},




PATH_RESOLVE=path=>__dirname+'/'+path,//path is relative to this root scope */KLYNTARCORE

BLAKE3=(input,length)=>hash(input,{length}).toString('hex'),

GET_UTC_TIMESTAMP=()=>new Date().getTime(),


/**# Verification
 * 
 * @param {string} data UTF-8 data(mostly it's BLAKE3 hashes)
 * @param {string} sig Base64 signature
 * @param {string} pub Ed25519 pubkey RFC8410
 * @returns {boolean} True if signature is valid and false otherwise(invalid or error)
 * */
ED25519_VERIFY=(data,signature,pubKey)=>new Promise((resolve,reject)=>
       
    //Add mandatory prefix and postfix to pubkey
    cryptoModule.verify(null,data,'-----BEGIN PUBLIC KEY-----\n'+Buffer.from('302a300506032b6570032100'+Buffer.from(Base58.decode(pubKey)).toString('hex'),'hex').toString('base64')+'\n-----END PUBLIC KEY-----',Buffer.from(signature,'base64'),(err,res)=>

        err?reject(false):resolve(res)

    )

).catch(()=>false),




/*

***********************************************FIRST BYTES OF EACH KEYPAIR ED25519***********************************************
*                                                                                                                               *
*    30 2a 30 05 06 03 2b 65 70 03 21 00              -> 44-12(these)=32 bytes pubkey                                           *
*    30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20  -> 48-16(these)=32 bytes private key entropy                              *
*                                                                                                                               *
*********************************************************************************************************************************

*/




/**
 * @param {string} data UTF-8 data(mostly it's BLAKE3 hashes)
 * @param {string} prv Ed25519 privatekey RFC8410
 * @returns {string} Base64 Ed25519 signature or '' otherwise(invalid or error)
 * 
 * 
 * 
 * */
ED25519_SIGN_DATA=(data,prv)=>new Promise((resolve,reject)=>

    cryptoModule.sign(null,Buffer.from(data),'-----BEGIN PRIVATE KEY-----\n'+prv+'\n-----END PRIVATE KEY-----',(e,sig)=>
    
        e?reject(''):resolve(sig.toString('base64'))

    )

).catch(()=>false),




LOG=(msg,msgColor)=>{

    console.log(COLORS.TIME_COLOR,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})`,msgColor,msg,COLORS.CLEAR)

}