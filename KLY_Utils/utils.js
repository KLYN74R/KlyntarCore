//import VALAR from '@klyntar/valardohaeris/algorand/vd.js'

import {symbiotes,hostchains} from '../klyn74r.js'

import {hash} from 'blake3-wasm'

import readline from 'readline'

import fetch from 'node-fetch'

import Base58 from 'base-58'

import c from 'crypto'

import fs from 'fs'




//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let




COLORS = {
    C:'\x1b[0m',
    T:'\u001b[38;5;23m', // for time view
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

SYMBIOTE_ALIAS=symbiote=>CONFIG.ALIASES[symbiote]||symbiote,




/**# Verification
 * 
 * @param {string} data UTF-8 data(mostly it's BLAKE3 hashes)
 * @param {string} sig Base64 signature
 * @param {string} pub Ed25519 pubkey RFC8410
 * @returns {boolean} True if signature is valid and false otherwise(invalid or error)
 * */
VERIFY=(data,sig,pub)=>new Promise((resolve,reject)=>

    //Add mandatory prefix and postfix to pubkey
    c.verify(null,data,'-----BEGIN PUBLIC KEY-----\n'+Buffer.from(Base58.decode('GfHq2tTVk9z4eXgy'+pub)).toString('base64')+'\n-----END PUBLIC KEY-----',Buffer.from(sig,'base64'),(err,res)=>

        err?reject(false):resolve(res)

    )

).catch(e=>false),//no log message coz in case of tons of wrong signatures we don't need to spam our logs streams




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
SIG=(data,prv)=>new Promise((resolve,reject)=>

    c.sign(null,Buffer.from(data),'-----BEGIN PRIVATE KEY-----\n'+prv+'\n-----END PRIVATE KEY-----',(e,sig)=>
    
        e?reject(''):resolve(sig.toString('base64'))

    )

).catch(e=>''),





/**# Event initiator account
 * 
 * Symbiote level data.Used when we check blocks
 * Here we read from cache or get data about event initiator from state,push to cache and return
*/
GET_SYMBIOTE_ACC=(addr,symbiote)=>

    //We get from db only first time-the other attempts will be gotten from ACCOUNTS
    symbiotes.get(symbiote).ACCOUNTS.get(addr)||symbiotes.get(symbiote).STATE.get(addr)
    
    .then(ACCOUNT=>
        
        //Get and push to cache
        ACCOUNT.T==='A' && symbiotes.get(symbiote).ACCOUNTS.set(addr,{ACCOUNT,NS:new Set(),ND:new Set(),OUT:ACCOUNT.B}).get(addr)
    
    ).catch(e=>false),




//Advanced function which also check limits(useful in routes where we accept relatively small data chunks not to paste payload size checker in each handler)
BODY=(bytes,limit)=>new Promise(r=>r(bytes.byteLength<=limit&&JSON.parse(Buffer.from(bytes)))).catch(e=>false),//...no error message to prevent spam to logs streams




//Simplified variant of "BODY" function,doesn't check limit,coz limits checks on higher level(in code where this func is used)
PARSE_JSON=buffer=>new Promise(r=>r(JSON.parse(buffer))).catch(e=>''),




CHECK_UPDATES=async()=>{

    //We need to check both of them
    //Check firstly for core update and symbiote-level update
    await fetch(`${CONFIG.UPDATES}/${CONFIG.INFO.CORE_VERSION}`).then(r=>r.json())
        
    .then(resp=>LOG(resp.msg,resp.msgColor))
                        
    .catch(e=>LOG(`Can't check for \u001b[38;5;202mCORE_VERSION\u001b[38;5;168m updates(\u001b[38;5;50mcurrent ${CONFIG.INFO.CORE_VERSION}\u001b[38;5;168m)\n\u001b[38;5;50m${e}`,'CON'))

    let symbiotesVersions=CONFIG.INFO.SYMBIOTES_VERSIONS

    for(let symbiote in symbiotesVersions){

        await fetch(`${CONFIG.UPDATES}/${symbiotesVersions[symbiote]}`).then(r=>r.json())
        
                .then(resp=>LOG(`Received for ${SYMBIOTE_ALIAS(symbiote)} ———> ${resp.msg}`,resp.msgColor))
                        
                .catch(e=>LOG(`Can't check \u001b[38;5;202mSYMBIOTE_VERSION\u001b[38;5;168m updates(\u001b[38;5;50mcurrent ${symbiotesVersions[symbiote]}\u001b[38;5;168m) for ${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;168m ———> \u001b[38;5;50m${e}`,'CON'))

    }
    
},




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
    
    .catch(e=>{
        
        a.end('Local buffer overflow')
        
        LOG(`Overflow while accept data from ${Buffer.from(a.getRemoteAddressAsText()).toString('utf-8')}`,'F')
    
    }),




SEND=(url,payload,callback)=>fetch(url,{method:'POST',body:JSON.stringify(payload)}).then(r=>r.text()).then(callback),




//Segregate console and "in-file" logs can be occured by directing stdin to some "nnlog" file to handle logs
//Notify file when ENABLE_CONSOLE_LOGS to handle windows of "freedom"(to know when you off logs and start again)
LOG=(msg,msgColor,symbiote)=>{

    CONFIG.DAEMON_LOGS && console.log(COLORS.T,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})`,COLORS[msgColor],msg,COLORS.C)

    if(symbiote) CONFIG.SYMBIOTES[symbiote].LOGS.TO_FILE && SYMBIOTES_LOGS_STREAMS.get(symbiote).write(`\n[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}] ${msg}`)

},




//Function just for pretty output about information on symbiote
BLOCKLOG=(msg,type,symbiote,hash,spaces,color)=>{

    if(CONFIG.SYMBIOTES[symbiote].LOGS.BLOCK){

        LOG(fs.readFileSync(PATH_RESOLVE(`images/events/${msg.includes('Controller')?'controller':'instant'}Block.txt`)).toString(),'CB')

        symbiote=SYMBIOTE_ALIAS(symbiote)

        console.log(' '.repeat(spaces),color,'_'.repeat(74))

        console.log(' '.repeat(spaces),'│\x1b[33m  SYMBIOTE:\x1b[36;1m',symbiote,COLORS.C,' '.repeat(16)+`${color}│`)
    
        console.log(COLORS.T,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]`,COLORS[type],msg,COLORS.C,' '.repeat(71),`${color}│`)
    
        console.log(' '.repeat(spaces),'│\x1b[33m  HASH:\x1b[36;1m',hash,COLORS.C,`${color}│`)

        console.log(' '.repeat(spaces),' ‾'+'‾'.repeat(73),COLORS.C)
    
    }

},




DECRYPT_KEYS=async(symbiote,spinner)=>{

    
    if(CONFIG.PRELUDE.DECRYPTED){

        spinner?.stop()

        let keys=JSON.parse(fs.readFileSync(PATH_RESOLVE('decrypted.json')))
        


        
        Object.keys(keys).forEach(symbiote=>{

            let symbioteConfig=CONFIG.SYMBIOTES[symbiote]

            //Main key
            global.PRIVATE_KEYS.set(symbiote,keys[symbiote].kly)

            
            Object.keys(symbioteConfig.MANIFEST.HOSTCHAINS).forEach(
                
                ticker => {

                    if(CONFIG.EVM.includes(ticker)) hostchains.get(symbiote).get(ticker).PRV=Buffer.from(keys[symbiote][ticker],'hex')
        
                    else symbioteConfig.HC_CONFIGS[ticker].PRV=keys[symbiote][ticker]
        
                }

            )            
            

        })


        return
      
    }

    //Stop loading
    spinner?.stop()

    let symbioteRef=CONFIG.SYMBIOTES[symbiote],
    
        rl = readline.createInterface({input: process.stdin,output: process.stdout,terminal:false})


    LOG(`Working on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[36;1m as \x1b[32;1m${symbioteRef.CONTROLLER.ME?'Controller':'Instant generator'} \x1b[32;1m(\x1b[36;1m${symbioteRef.PUB}\x1b[32;1m)`,'I')
       

    
    let HEX_SEED=await new Promise(resolve=>
        
        rl.question(`\n ${COLORS.T}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${COLORS.C}  Enter \x1b[32mpassword\x1b[0m to decrypt private key on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[0m in memory of process ———> \x1b[31m`,resolve)
        
    )
        

    //Get 32 bytes SHA256(Password)
    HEX_SEED=c.createHash('sha256').update(HEX_SEED,'utf-8').digest('hex')

    let IV=Buffer.from(HEX_SEED.slice(32),'hex')//Get second 16 bytes for initialization vector


    console.log('\x1b[0m')

    HEX_SEED=HEX_SEED.slice(0,32)//Retrieve first 16 bytes from hash



    //__________________________________________DECRYPT MAIN PRIVATE KEY____________________________________________

    

    let decipher = c.createDecipheriv('aes-256-cbc',HEX_SEED,IV)
    
    global.PRIVATE_KEYS.set(symbiote,decipher.update(symbioteRef.PRV,'hex','utf8')+decipher.final('utf8'))



    //____________________________________DECRYPT PRIVATE KEYS FOR HOSTCHAINS_______________________________________


    symbioteRef.CONTROLLER.ME
    &&
    Object.keys(symbioteRef.HC_CONFIGS).forEach(ticker=>{
        
        let decipher = c.createDecipheriv('aes-256-cbc',HEX_SEED,IV), privateKey=decipher.update(symbioteRef.HC_CONFIGS[ticker].PRV,'hex','utf8')+decipher.final('utf8')



        if(CONFIG.EVM.includes(ticker)) hostchains.get(symbiote).get(ticker).PRV=Buffer.from(privateKey,'hex')
        
        else symbioteRef.HC_CONFIGS[ticker].PRV=privateKey
        


        LOG(`Hostchain [\x1b[36;1m${ticker}\x1b[32;1m] ~~~> private key was decrypted successfully`,'S')
    
    })
    
    rl.close()

},




GET_NODES=(symbiote,region)=>{

    let nodes=CONFIG.SYMBIOTES[symbiote].NODES[region]//define "IN SCOPE"(due to region and symbiote)

    //Default Phisher_Yeits algorithm

    if(nodes){
        
        let shuffled = nodes.slice(0),
        
            arrSize = nodes.length,
        
            min = arrSize - CONFIG.SYMBIOTES[symbiote].NODES_PORTION, temp, index


        while (arrSize-- > min) {

            index = Math.floor((arrSize + 1) * Math.random())
        
            //Destructurisation doesn't work,so use temporary variable
            temp = shuffled[index]
        
            shuffled[index] = shuffled[arrSize]
        
            shuffled[arrSize] = temp

        }
    
        return shuffled.slice(min)
    
    }else return []
    
},




//Receient must support HTTPS
//*UPD:Sign with our pubkey to avoid certifications 
SEND_REPORT=(symbiote,alertInfo)=>

    fetch(CONFIG.SYMBIOTES[symbiote].WORKFLOW_CHECK.HOSTCHAINS[alertInfo.hostchain].REPORT_TO,{

        method:'POST',
        body:JSON.stringify(alertInfo)
    
    }).then(()=>{}).catch(e=>
        
        LOG(`No response from report mananger\n CASE \n Symbiote:\x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m AlertInfo:\x1b[36;1m${alertInfo}\u001b[38;5;3m Error:\x1b[36;1m${e}\x1b[0m`,'W')
        
    )

,

/**
 * 
 * 
 * 
 * __________________________________________________________'NEAR'_________________________________________________________
 *
 * 
 *
 * Near contains addresses which tracked the same symbiotes or at least one symbiote from your list of symbiotes
 * We need NEAR just to exchange with blocks(at least in current pre-alpha release)
 * Non static list which changes permanently and received each time we ask Controller
 * In future(with providing voting with CONTROLLER and other stuff) it will be one more kind of interaction
 * 
 * Also,some auths methods will be added
 * 
 *
 * _____________________________________________________'PERMANENT_NEAR'____________________________________________________
 * 
 * 
 * 
 * This is static list which you set to be sure that you'll receive data
 * It might be your another node,nodes of some organisations or sites,node of some pool or your friends' nodes etc.
 * 
 * 
 * 
 *  _______________________________________________________'MUST_SEND'_______________________________________________________
 * 
 * There is no "online" property coz it's implies that big_providers like crypto exchanges,famous explorers,etc.
 * have high percentage of uptime or highload tolerant infrastructure thus available 365/24/7(best case)
 * 
 * BTW we don't need them-otherwise,it's rather optimization for PANOPTICON protocol(in future) or for quick work of explorers,API,etc. and these providers will be "grateful"
 * to receive new blocks as fast as possible.That's why they receive blocks from network and accept incoming requests on their API
 * from different devices from PANOPTICON "army" of nodes
 * 
 * It doesn't imply "centralization".Ordianry nodes also can have own API(to analyze block content and give instant response) 
 * for own demands or to provide public available data
 * 
 * It's just for better efficiency
 * 
 */
BROADCAST=(route,data,symbiote)=>{

    let promises=[],symbioteConfig=CONFIG.SYMBIOTES[symbiote]


    //First of all-send to important destination points
    Object.keys(symbioteConfig.MUST_SEND).forEach(addr=>
        
        promises.push(
            
            //First of all-sig data and pass signature through the next promise
            SIG(data,PRIVATE_KEYS.get(symbiote)).then(sig=>

                fetch(symbioteConfig.MUST_SEND[addr]+route,{
                
                    method:'POST',
                    
                    body:JSON.stringify({data,sig})
                
                }).catch(e=>
                    
                    symbioteConfig.LOGS.OFFLINE
                    &&
                    LOG(`Offline \x1b[36;1m${addr}\u001b[38;5;3m [From:\x1b[36;1mMUST_SEND\u001b[38;5;3m]`,'W')
                    
                )

            )
            
        )

    )



    symbioteConfig.PERMANENT_NEAR.forEach(addr=>
    
        fetch(addr+route,{method:'POST',body:JSON.stringify(data)})
        
        .catch(e=>
            
            symbioteConfig.LOGS.OFFLINE
            &&
            LOG(`\x1b[36;1m${addr}\u001b[38;5;3m is offline [From:\x1b[36;1mPERMANENT_NEAR\u001b[38;5;3m]`,'W')
            
        )

    )

    /*
    
    Finally-send resource to NEAR nodes
    If response isn't equal 1-delete node from list,
    coz it's signal that node does no more support this
    symbiote(or at current time),has wrong payload size settings etc,so no sense to spend network resources on this node
    
    */


    symbiotes.get(symbiote).NEAR.forEach((addr,index)=>
        
        promises.push(
            
            fetch(addr+route,{method:'POST',body:JSON.stringify(data)}).then(v=>v.text()).then(value=>
                
                value!=='1'&&symbiotes.get(symbiote).NEAR.splice(index,1)
                    
            ).catch(e=>{
                
                symbioteConfig.LOGS.OFFLINE
                &&
                LOG(`Node \x1b[36;1m${addr}\u001b[38;5;3m seems like offline,I'll \x1b[31;1mdelete\u001b[38;5;3m it [From:\x1b[36;1mNEAR ${SYMBIOTE_ALIAS(symbiote)}\x1b[33;1m]`,'W')

                symbiotes.get(symbiote).NEAR.splice(index,1)

            })
            
        )

    )

    return promises

}