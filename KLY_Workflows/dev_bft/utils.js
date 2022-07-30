import {LOG,SYMBIOTE_ALIAS,COLORS} from "../../KLY_Utils/utils.js"

import BLS from '../../KLY_Utils/signatures/multisig/bls.js'

import cryptoModule from 'crypto'

import readline from 'readline'

import fetch from 'node-fetch'


//Mapping to work with hostchains
global.HOSTCHAINS = new Map()




/**# Event initiator account
* 
* Symbiote level data.Used when we check blocks
* Here we read from cache or get data about event initiator from state,push to cache and return
*/
export let GET_SYMBIOTE_ACC = addr =>

   //We get from db only first time-the other attempts will be gotten from ACCOUNTS
   SYMBIOTE_META.ACCOUNTS.get(addr)||SYMBIOTE_META.STATE.get(addr)
   
   .then(ACCOUNT=>
       
       //Get and push to cache
       ACCOUNT.T==='A' && SYMBIOTE_META.ACCOUNTS.set(addr,{ACCOUNT,NS:new Set(),ND:new Set(),OUT:ACCOUNT.B}).get(addr)
   
   ).catch(e=>false),








WRAP_RESPONSE=(a,ttl)=>a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+ttl),








//Recepient must support HTTPS
//*UPD:Sign with our pubkey to avoid certifications
SEND_REPORT = alertInfo =>

    fetch(CONFIG.SYMBIOTE.WORKFLOW_CHECK.HOSTCHAINS[alertInfo.hostchain].REPORT_TO,{

        method:'POST',
        body:JSON.stringify(alertInfo)
    
    }).then(()=>{}).catch(e=>
        
        LOG(`No response from report mananger\n CASE \n Symbiote:\x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m AlertInfo:\x1b[36;1m${alertInfo}\u001b[38;5;3m Error:\x1b[36;1m${e}\x1b[0m`,'W')
        
    ),




GET_STUFF = async stuffID => SYMBIOTE_META.STUFF_CACHE.get(stuffID) || SYMBIOTE_META.STUFF.get(stuffID).then(obj=>{

    SYMBIOTE_META.STUFF_CACHE.put(stuffID,obj)

    return obj

}).catch(e=>false)




GET_NODES=region=>{

    let nodes=CONFIG.SYMBIOTE.NODES[region]//define "IN SCOPE"(due to region and symbiote)
    
    //Default Phisher_Yeits algorithm
    
    if(nodes){
            
        let shuffled = nodes.slice(0),
            
            arrSize = nodes.length,
            
            min = arrSize - CONFIG.SYMBIOTE.NODES_PORTION, temp, index
    
    
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





//Function just for pretty output about information on symbiote
BLOCKLOG=(msg,type,hash,spaces,color,block)=>{

    if(CONFIG.SYMBIOTE.LOGS.BLOCK){

        console.log(' '.repeat(spaces),color,'_'.repeat(79))

        console.log(' '.repeat(spaces),'│\x1b[33m  SYMBIOTE:\x1b[36;1m',SYMBIOTE_ALIAS(),COLORS.C,' '.repeat(1)+`${color}│`)

        let verbose='Height:'+block.i+' # Events:'+block.e.length+' # Validator:'+block.c
            
        console.log(COLORS.T,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]`,COLORS[type],msg,COLORS.C,' '.repeat(76),`${color}│ ${verbose}`)
    
        console.log(' '.repeat(spaces),'│\x1b[33m  HASH:\x1b[36;1m',hash,COLORS.C,' '.repeat(4),`${color}│`)

        console.log(' '.repeat(spaces),' ‾'+'‾'.repeat(78),COLORS.C)
    
    }

},


SIG=data=>BLS.singleSig(data,PRIVATE_KEY),



VERIFY=(data,signature,validatorPubKey)=>BLS.singleVerify(data,validatorPubKey,signature),



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
 * 
 * This is static list which you set to be sure that you'll receive data
 * It might be your another node,nodes of some organizations or sites,node of some pool or your friends' nodes etc.
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
 BROADCAST=(route,data)=>{

    let promises=[]


    //First of all-send to important destination points - it might be lightweight retranslators, CDNs and so on
    Object.keys(CONFIG.SYMBIOTE.MUST_SEND).forEach(addr=>
        
        promises.push(
            
            //First of all-sig data and pass signature through the next promise
            SIG(JSON.stringify(data)).then(sig=>

                fetch(CONFIG.SYMBIOTE.MUST_SEND[addr]+route,{
                
                    method:'POST',
                    
                    body:JSON.stringify({data,sig})
                
                }).catch(e=>
                    
                    CONFIG.SYMBIOTE.LOGS.OFFLINE
                    &&
                    LOG(`Offline \x1b[36;1m${addr}\u001b[38;5;3m [From:\x1b[36;1mMUST_SEND\u001b[38;5;3m]`,'W')
                    
                )

            )
            
        )

    )

    
    CONFIG.SYMBIOTE.BOOTSTRAP_NODES.forEach(addr=>
    
        fetch(addr+route,{method:'POST',body:JSON.stringify(data)})
        
        .catch(_=>
            
            CONFIG.SYMBIOTE.LOGS.OFFLINE
            &&
            LOG(`\x1b[36;1m${addr}\u001b[38;5;3m is offline [From:\x1b[36;1mBOOTSTRAP_NODES\u001b[38;5;3m]`,'W')
            
        )

    )

    /*
    
    Finally-send resource to NEAR nodes
    If response isn't equal 1-delete node from list,
    coz it's signal that node does no more support this
    symbiote(or at current time),has wrong payload size settings etc,so no sense to spend network resources on this node
    
    */


    SYMBIOTE_META.NEAR.forEach((addr,index)=>
        
        promises.push(
            
            fetch(addr+route,{method:'POST',body:JSON.stringify(data)}).then(v=>v.text()).then(value=>
                
                value!=='1'&&SYMBIOTE_META.NEAR.splice(index,1)
                    
            ).catch(_=>{
                
                CONFIG.SYMBIOTE.LOGS.OFFLINE
                &&
                LOG(`Node \x1b[36;1m${addr}\u001b[38;5;3m seems like offline,I'll \x1b[31;1mdelete\u001b[38;5;3m it [From:\x1b[36;1mNEAR ${SYMBIOTE_ALIAS()}\x1b[33;1m]`,'W')

                SYMBIOTE_META.NEAR.splice(index,1)

            })
            
        )

    )

    return promises

},








DECRYPT_KEYS=async spinner=>{

    
    if(CONFIG.PRELUDE.DECRYPTED){

        spinner?.stop()

        
        // Keys is object {kly:<DECRYPTED KLYNTAR PRIVKEY>,eth:<DECRYPTED ETH PRIVKEY>,...(other privkeys in form <<< ticker:privateKey >>>)}
        let keys=JSON.parse(fs.readFileSync(CONFIG.DECRYPTED_KEYS_PATH))//use full path
        
        //Main key
        global.PRIVATE_KEY=keys.kly

        //...and decrypt for hostchains(if you role on appropriate workflow require it)
        Object.keys(CONFIG.SYMBIOTE.MANIFEST.HOSTCHAINS).forEach(
            
            ticker => {
                
                if(CONFIG.EVM.includes(ticker)) HOSTCHAINS.get(ticker).PRV=Buffer.from(keys[ticker],'hex')
    
                else CONFIG.SYMBIOTE.HC_CONFIGS[ticker].PRV=keys[ticker]
    
            
            }
        
        )

        return
      
    }

    //Stop loading
    spinner?.stop()

    let symbioteRef=CONFIG.SYMBIOTE,
    
        rl = readline.createInterface({input: process.stdin,output: process.stdout,terminal:false})


    LOG(`Working on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m(\x1b[36;1m${symbioteRef.MANIFEST.WORKFLOW}(v.${symbioteRef.VERSION}) / ${symbioteRef.PUB}\x1b[32;1m)`,'I')
       

    
    let HEX_SEED=await new Promise(resolve=>
        
        rl.question(`\n ${COLORS.T}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})${COLORS.C}  Enter \x1b[32mpassword\x1b[0m to decrypt private key on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[0m in memory of process ———> \x1b[31m`,resolve)
        
    )
        

    //Get 32 bytes SHA256(Password)
    HEX_SEED=cryptoModule.createHash('sha256').update(HEX_SEED,'utf-8').digest('hex')

    let IV=Buffer.from(HEX_SEED.slice(32),'hex')//Get second 16 bytes for initialization vector


    console.log('\x1b[0m')

    HEX_SEED=HEX_SEED.slice(0,32)//Retrieve first 16 bytes from hash



    //__________________________________________DECRYPT MAIN PRIVATE KEY____________________________________________

    

    let decipher = cryptoModule.createDecipheriv('aes-256-cbc',HEX_SEED,IV)
    
    global.PRIVATE_KEY=decipher.update(symbioteRef.PRV,'hex','utf8')+decipher.final('utf8')



    //____________________________________DECRYPT PRIVATE KEYS FOR HOSTCHAINS_______________________________________


    Object.keys(symbioteRef.HC_CONFIGS).forEach(ticker=>{
        
        let decipher = cryptoModule.createDecipheriv('aes-256-cbc',HEX_SEED,IV), privateKey=decipher.update(symbioteRef.HC_CONFIGS[ticker].PRV,'hex','utf8')+decipher.final('utf8')



        if(CONFIG.EVM.includes(ticker)) HOSTCHAINS.get(ticker).PRV=Buffer.from(privateKey,'hex')
        
        else symbioteRef.HC_CONFIGS[ticker].PRV=privateKey
        


        LOG(`Hostchain [\x1b[36;1m${ticker}\x1b[32;1m] ~~~> private key was decrypted successfully`,'S')
    
    })
    
    rl.close()

}