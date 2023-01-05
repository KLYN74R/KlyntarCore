import { createRequire } from 'module'

import cryptoModule from 'crypto'

import {hash} from 'blake3-wasm'

import fetch from 'node-fetch'

import Base58 from 'base-58'

import fs from 'fs'


//Fix to load addons. For node v17.9.0 it's still impossible to load addons to ESM environment
//See https://stackoverflow.com/a/66527729/18521368

export let ADDONS

if(process.platform==='linux'){

    var require = createRequire(import.meta.url)

    ADDONS = require('../KLY_Addons/build/Release/BUNDLE');
  
}




process.env.KLY_MODE||='main'




//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let




COLORS = {
    C:'\x1b[0m',
    T:`\u001b[38;5;${process.env.KLY_MODE==='main'?'23':'202'}m`, // for time view
    F:'\x1b[31;1m', // red(error,no collapse,problems with sequence,etc.)
    S:'\x1b[32;1m', // green(new block, exported something, something important, etc.)
    W:'\u001b[38;5;3m', // yellow(non critical warnings)
    I:'\x1b[36;1m', // cyan(default messages useful to grasp the events)
    CB:'\u001b[38;5;200m',// ControllerBlock
    CD:`\u001b[38;5;50m`,//Canary died
    GTS:`\u001b[38;5;m`,//Generation Thread Stop
    CON:`\u001b[38;5;168m`//CONFIGS
},




PATH_RESOLVE=path=>__dirname+'/'+path,//path is relative to this root scope */KLYNTARCORE

BLAKE3=v=>hash(v).toString('hex'),

SYMBIOTE_ALIAS=()=>CONFIG.ALIASES[CONFIG.SYMBIOTE.SYMBIOTE_ID]||CONFIG.SYMBIOTE.SYMBIOTE_ID,

GET_GMT_TIMESTAMP=()=>{

    var currentTime = new Date();
    
    //The offset is in minutes -- convert it to ms
    //See https://stackoverflow.com/questions/9756120/how-do-i-get-a-utc-timestamp-in-javascript
    return currentTime.getTime() + currentTime.getTimezoneOffset() * 60000;
},


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

).catch(_=>false),




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

).catch(_=>false),



//Advanced function which also check limits(useful in routes where we accept relatively small data chunks not to paste payload size checker in each handler)
BODY=(bytes,limit)=>new Promise(r=>r(bytes.byteLength<=limit&&JSON.parse(Buffer.from(bytes)))).catch(e=>false),




//Simplified variant of "BODY" function,doesn't check limit,coz limits checks on higher level(in code where this func is used)
PARSE_JSON=buffer=>new Promise(r=>r(JSON.parse(buffer))).catch(e=>''),




//On-flight updates soon




/**
 *   ## Add chunk to buffer and prevent buffer overflow cases 
 *
 *   Without "a" node will continue accept chunks,the only point is that all chanks will throw error which will be handled by .catch
 *   With "a" we'll immediately close connection
 *   @param {Buffer} buffer Raw array of bytes
 *   @param {Buffer} chunk  Incoming chunk
 *   @param {UWS.HttpResponse} a UWS Response object
 * 
 */
SAFE_ADD=(buffer,chunk,a)=>new Promise(r=>r( Buffer.concat([ buffer, Buffer.from(chunk) ]) ))
    
    .catch(_=>{
        
        a.end('Local buffer overflow')
        
        LOG(`Overflow while accept data from ${Buffer.from(a.getRemoteAddressAsText()).toString('utf-8')}`,'F')
    
    }),




SEND=(url,payload,callback)=>fetch(url,{method:'POST',body:JSON.stringify(payload)}).then(r=>r.text()).then(callback),




LOG=(msg,msgColor)=>{

    CONFIG.DAEMON_LOGS && console.log(COLORS.T,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})`,COLORS[msgColor],msg,COLORS.C)

},




//Function just for pretty output about information on symbiote
BLOCKLOG=(msg,type,hash,spaces,color,block)=>{

    if(CONFIG.DAEMON_LOGS){

        LOG(fs.readFileSync(PATH_RESOLVE(`images/events/${msg.includes('Controller')?'controller':'instant'}Block.txt`)).toString(),'CB')

        console.log(' '.repeat(spaces),color,'_'.repeat(74))

        console.log(' '.repeat(spaces),'│\x1b[33m  SYMBIOTE:\x1b[36;1m',SYMBIOTE_ALIAS(),COLORS.C,' '.repeat(16)+`${color}│`)

        let verbose=''

        if(block){
            
            //If it's controller
            if(block.a) verbose+='Height:'+block.i+' # Instant Blocks:'+block.a.length

            else verbose+='Events:'+block.e.length+' # Creator:'+block.c
        
        }
    
        console.log(COLORS.T,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]`,COLORS[type],msg,COLORS.C,' '.repeat(71),`${color}│ ${verbose}`)
    
        console.log(' '.repeat(spaces),'│\x1b[33m  HASH:\x1b[36;1m',hash,COLORS.C,`${color}│`)

        console.log(' '.repeat(spaces),' ‾'+'‾'.repeat(73),COLORS.C)
    
    }

}