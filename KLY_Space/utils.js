import {chains,hostchains} from '../klyn74r.js'

import {hash} from 'blake3-wasm'

import readline from 'readline'

import fetch from 'node-fetch'

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
    CB:'\u001b[38;5;200m'// ControllerBlock
},



PATH_RESOLVE=path=>__dirname+'/'+path,//path is relative to this root scope */KLYNTARCORE



GEN_RSA_PAIR=()=>new Promise((resolve,reject)=>{
    
    c.generateKeyPair('rsa',
    
    {
        modulusLength: 4096,
        publicKeyEncoding:{type:'spki',format:'pem'},
        privateKeyEncoding: {type:'pkcs8',format:'pem'}
    },
    
    (err, publicKey, privateKey)=> err ? reject(err) : resolve({publicKey,privateKey}))

}).catch(e=>(LOG(`Some error with generation pair \x1b[36;1m${e}`,'F'))),//handle reject here not to repeat in each occur




/**# Encrypt RSA-4096
 * @param {string} msg UTF-8 default string
 * @param {string} pub 4096 RSA pubKey
 * 
 * @returns {string} Ciphertext in Base64
 * */
//!Probably add Promise wrap
ENCRYPT=(msg,pub)=>c.publicEncrypt(pub,Buffer.from(msg,'utf8')).toString('base64'),




/**# Decrypt RSA-4096
 * @param {string} encMsg Base64 ciphertext
 * @param {string} prv 4096 RSA privateKey
 * @returns {string} UTF-8 plaintext
 * */
DECRYPT=(encMsg,prv)=>c.privateDecrypt(prv,Buffer.from(encMsg,'base64')).toString('utf-8'),




BASE64=v=>Buffer.from(v).toString('base64'),

BLAKE3=v=>hash(v).toString('hex'),

CHAIN_LABEL=chain=>CONFIG.ALIASES[chain]||chain,



/**# Verification
 * 
 * @param {string} data UTF-8 data(mostly it's BLAKE3 hashes)
 * @param {string} sig Base64 signature
 * @param {string} pub Ed25519 pubkey RFC8410
 * @returns {boolean} True if signature is valid and false otherwise(invalid or error)
 * */
VERIFY=(data,sig,pub)=>new Promise((resolve,reject)=>

    //Add mandatory prefix and postfix to pubkey
    c.verify(null,data,'-----BEGIN PUBLIC KEY-----\n'+'MCowBQYDK2VwAyEA'+pub+'\n-----END PUBLIC KEY-----',Buffer.from(sig,'base64'),(e,res)=>
    
        e?reject(false):resolve(res)
    
    )

).catch(e=>false),




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




/**# Quick chek to interact with node
 * @param {string} data UTF-8 data(JSON mostly)
 * @param {string} sid 64 bytes SpaceId in Base64
 * @param {string} magic Uft-8 unique data
 * @param {string} fullhash Blake3 32 bytes hash
 * 
 * @returns {boolean}
 * */
HMAC=(data,sid,magic,fullHash)=>BLAKE3(data+sid+magic)===fullHash,




/**@return Chain level data.Used when we check blocks
 * Here we read from cache or get account from state,push to cache and return
*/
GET_CHAIN_ACC=(addr,chain)=>

    //We get from db only first time-the other attempts will be gotten from ACCOUNTS
    chains.get(chain).ACCOUNTS.get(addr)||chains.get(chain).STATE.get(addr)
    
    .then(ACCOUNT=>
        
        //Get and push to cache
        chains.get(chain).ACCOUNTS.set(addr,{ACCOUNT,NS:new Set(),ND:new Set(),OUT:ACCOUNT.B}).get(addr)
    
    ).catch(e=>false),




//Advanced function which also check limits(useful in routes where we accept relatively small data chunks not to paste payload size checker in each handler)
BODY=(bytes,limit)=>new Promise(r=>r(bytes.byteLength<=limit&&JSON.parse(Buffer.from(bytes)))).catch(e=>false),




//Simplified variant of "BODY" function,doesn't check limit,coz limits checks on higher level(in code where this func is used)
PARSE_JSON=buffer=>new Promise(r=>r(JSON.parse(buffer))).catch(e=>''),




/**
 *   Add chunk to buffer and prevent buffer overflow cases 
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




//Roles
PRIVIL=/[MEIUT]/,
MINION=/M/,
EMPIRE=/E/,
INV2=/I/,




/**
 * ___________________________________________________________ADVANCED,ALU-like,operations of verification___________________________________________________________
 * 
 * 
 * @param {string} creator Address(Ed25519 public key)
 * @param {string} strData UTF-8 data
 * @param {string} fullHash BLAKE3 fullhash of MSG
 * @param {number} add Number of points to change nonce
 * @param {string} role to check role of account via RegExp
 * @param {(string|number|boolean|null|undefined)} getAcc Flag to return account if we need
 * 
 *  */
ACC_CONTROL=(creator,strData,fullHash,add,role,getAcc)=>

    ACCOUNTS.get(creator).then(acc=>{
        
        //if(acc?.S?.length===1) return //Due to time
        
        if(acc&&HMAC(strData,acc.S,GUID+acc.N,fullHash))
        {    

            acc.N+=add//increase nonce

            ACCOUNTS.set(creator,acc)

            return (!role||role.test(acc.R)) && (!getAcc||acc)
        }
    
    }),




SEND=(url,ob,callback)=>fetch(url,{method:'POST',body:JSON.stringify(ob)}).then(r=>r.text()).then(callback),




//Segregate console and "in-file" logs can be occured by directing stdin to some "nnlog" file to handle logs
//Notify file when ENABLE_CONSOLE_LOGS to handle windows of "freedom"(to know when you off logs and start again)
LOG=(msg,type)=>CONFIG.ENABLE_LOGS&&console.log(COLORS.T,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]`,COLORS[type],msg,COLORS.C),




//Function just for pretty output about information on chains
BLOCKLOG=(msg,type,chain,hash,spaces,color)=>{

    if(CONFIG.CHAINS[chain].LOGS.BLOCK){

        LOG(fs.readFileSync(PATH_RESOLVE(`images/events/${msg.includes('Controller')?'controller':'instant'}Block.txt`)).toString(),'CB')         

        chain=CHAIN_LABEL(chain)

        console.log(' '.repeat(spaces),color,'_'.repeat(74))

        console.log(' '.repeat(spaces),'│\x1b[33m  CHAIN:\x1b[36;1m',chain,COLORS.C,' '.repeat(19)+`${color}│`)
    
        console.log(COLORS.T,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]`,COLORS[type],msg,COLORS.C,' '.repeat(71),`${color}│`)
    
        console.log(' '.repeat(spaces),'│\x1b[33m  HASH:\x1b[36;1m',hash,COLORS.C,`${color}│`)

        console.log(' '.repeat(spaces),' ‾'+'‾'.repeat(73),COLORS.C)
    
    }

},




DECRYPT_KEYS=async(chain,spinner)=>{

    let chainRef=CONFIG.CHAINS[chain],
    
        rl = readline.createInterface({input: process.stdin,output: process.stdout,terminal:false})

    
    //Stop loading
    spinner.stop()

    LOG(`Working on \x1b[36;1m${CHAIN_LABEL(chain)}\x1b[36;1m as \x1b[32;1m${chainRef.CONTROLLER.ME?'Controller':'Instant generator'}`,'I')
       

    
    let HEX_SEED=await new Promise(resolve=>
        
        rl.question(`\n ${COLORS.T}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${COLORS.C}  Enter \x1b[32mpassword\x1b[0m to decrypt private key on \x1b[36;1m${CHAIN_LABEL(chain)}\x1b[0m in memory of process ———> \x1b[31m`,resolve))
        

    //Get 32 bytes SHA256(Password)
    HEX_SEED=c.createHash('sha256').update(HEX_SEED,'utf-8').digest('hex')

    let IV=Buffer.from(HEX_SEED.slice(32),'hex')//Get second 16 bytes for initialization vector


    console.log('\x1b[0m')

    HEX_SEED=HEX_SEED.slice(0,32)//Retrieve first 16 bytes from hash



    //__________________________________________DECRYPT MAIN PRIVATE KEY____________________________________________

    

    let decipher = c.createDecipheriv('aes-256-cbc',HEX_SEED,IV)
    
    global.PRIVATE_KEYS.set(chain,decipher.update(chainRef.PRV,'hex','utf8')+decipher.final('utf8'))



    //____________________________________DECRYPT PRIVATE KEYS FOR HOSTCHAINS_______________________________________


    chainRef.CONTROLLER.ME
    &&
    Object.keys(chainRef.HC_CONFIGS).forEach(ticker=>{
        
        let decipher = c.createDecipheriv('aes-256-cbc',HEX_SEED,IV), privateKey=decipher.update(chainRef.HC_CONFIGS[ticker].PRV,'hex','utf8')+decipher.final('utf8')



        if(CONFIG.EVM.includes(ticker)) hostchains.get(chain).get(ticker).PRV=Buffer.from(privateKey,'hex')
        
        else chainRef.HC_CONFIGS[ticker].PRV=privateKey
        


        LOG(`Hostchain [\x1b[36;1m${ticker}\x1b[32;1m] ~~~> private key was decrypted successfully`,'S')
    
    })
    
    rl.close()

},




GET_NODES=(chain,region)=>{

    let nodes=CONFIG.CHAINS[chain].NODES[region]//define "IN SCOPE"(due to region and chain)

    //Default Phisher_Yeits algorithm

    if(nodes){
        
        let shuffled = nodes.slice(0),
        
            arrSize = nodes.length,
        
            min = arrSize - CONFIG.CHAINS[chain].NODES_PORTION, temp, index


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
SEND_REPORT=(chain,alertInfo)=>

    fetch(CONFIG.CHAINS[chain].WORKFLOW_CHECK.HOSTCHAINS[alertInfo.hostchain].REPORT_TO,{

        method:'POST',
        body:JSON.stringify(alertInfo)
    
    }).then(()=>{}).catch(e=>
        
        LOG(`No response from report mananger\n CASE \n Chain:\x1b[36;1m${CHAIN_LABEL(chain)}\u001b[38;5;3m AlertInfo:\x1b[36;1m${alertInfo}\u001b[38;5;3m Error:\x1b[36;1m${e}\x1b[0m`,'W')
        
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
 * Near contains addresses which tracked the same chains or at least one chain from your list of chains
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
BROADCAST=(route,data,chain)=>{

    let promises=[],chainConfig=CONFIG.CHAINS[chain]


    //First of all-send to important destination points
    Object.keys(chainConfig.MUST_SEND).forEach(addr=>
        
        promises.push(
            
            //First of all-sig data and pass signature through the next promise
            SIG(data,PRIVATE_KEYS.get(chain)).then(sig=>

                fetch(chainConfig.MUST_SEND[addr]+route,{
                
                    method:'POST',
                    
                    body:JSON.stringify({data,sig})
                
                }).catch(e=>
                    
                    chainConfig.LOGS.OFFLINE
                    &&
                    LOG(`Offline \x1b[36;1m${addr}\u001b[38;5;3m [From:\x1b[36;1mMUST_SEND\u001b[38;5;3m]`,'W')
                    
                )

            )
            
        )

    )



    chainConfig.PERMANENT_NEAR.forEach(addr=>
    
        fetch(addr+route,{method:'POST',body:JSON.stringify(data)})
        
        .catch(e=>
            
            chainConfig.LOGS.OFFLINE
            &&
            LOG(`\x1b[36;1m${addr}\u001b[38;5;3m is offline [From:\x1b[36;1mPERMANENT_NEAR\u001b[38;5;3m]`,'W')
            
        )

    )

    /*
    
    Finally-send resource to NEAR nodes
    If response isn't equal 1-delete node from list,
    coz it's signal that node does no more support this
    chain(or at current time),has wrong payload size settings etc,so no sense to spend network resources on this node
    
    */


    chains.get(chain).NEAR.forEach((addr,index)=>
        
        promises.push(
            
            fetch(addr+route,{method:'POST',body:JSON.stringify(data)}).then(v=>v.text()).then(value=>
                
                value!=='1'&&chains.get(chain).NEAR.splice(index,1)
                    
            ).catch(e=>{
                
                chainConfig.LOGS.OFFLINE
                &&
                LOG(`Node \x1b[36;1m${addr}\u001b[38;5;3m seems like offline,I'll \x1b[31;1mdelete\u001b[38;5;3m it [From:\x1b[36;1mNEAR ${CHAIN_LABEL(chain)}\x1b[33;1m]`,'W')

                chains.get(chain).NEAR.splice(index,1)

            })
            
        )

    )

    return promises

}