import {LOG,PATH_RESOLVE,SIG,SYMBIOTE_ALIAS,COLORS} from "../../KLY_Utils/utils.js"

import cryptoModule from 'crypto'

import readline from 'readline'

import fetch from 'node-fetch'




export let

    symbiotes=new Map(),//Mapping(CONTROLLER_ADDRESS(ex.FASj1powx5qF1J6MRmx1PB7NQp5mENYEukhyfaWoqzL9)=>Mapping instace on workflow level)
    
    hostchains=new Map(),//To integrate with other explorers,daemons,API,gateways,NaaS etc.








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








WRAP_RESPONSE=(a,ttl)=>a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+ttl),








//Recepient must support HTTPS
//*UPD:Sign with our pubkey to avoid certifications 
SEND_REPORT=(symbiote,alertInfo)=>

    fetch(CONFIG.SYMBIOTES[symbiote].WORKFLOW_CHECK.HOSTCHAINS[alertInfo.hostchain].REPORT_TO,{

        method:'POST',
        body:JSON.stringify(alertInfo)
    
    }).then(()=>{}).catch(e=>
        
        LOG(`No response from report mananger\n CASE \n Symbiote:\x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m AlertInfo:\x1b[36;1m${alertInfo}\u001b[38;5;3m Error:\x1b[36;1m${e}\x1b[0m`,'W')
        
    ),







    
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

},







DECRYPT_KEYS=async(symbiote,spinner,role)=>{

    
    if(CONFIG.PRELUDE.DECRYPTED){

        spinner?.stop()

        let keys=JSON.parse(fs.readFileSync(PATH_RESOLVE('decrypted.json')))
        

        
        Object.keys(keys).forEach(symbiote=>{

            let symbioteConfig=CONFIG.SYMBIOTES[symbiote]

            //Main key
            global.PRIVATE_KEYS.set(symbiote,keys[symbiote].kly)

           
            //...and decrypt for hostchains(if you role on appropriate workflow require it)
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


    LOG(`Working on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[36;1m as \x1b[32;1m${role} \x1b[32;1m(\x1b[36;1m${symbioteRef.MANIFEST.WORKFLOW}(v.${symbioteRef.VERSION}) / ${symbioteRef.PUB}\x1b[32;1m)`,'I')
       

    
    let HEX_SEED=await new Promise(resolve=>
        
        rl.question(`\n ${COLORS.T}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})${COLORS.C}  Enter \x1b[32mpassword\x1b[0m to decrypt private key on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[0m in memory of process ———> \x1b[31m`,resolve)
        
    )
        

    //Get 32 bytes SHA256(Password)
    HEX_SEED=cryptoModule.createHash('sha256').update(HEX_SEED,'utf-8').digest('hex')

    let IV=Buffer.from(HEX_SEED.slice(32),'hex')//Get second 16 bytes for initialization vector


    console.log('\x1b[0m')

    HEX_SEED=HEX_SEED.slice(0,32)//Retrieve first 16 bytes from hash



    //__________________________________________DECRYPT MAIN PRIVATE KEY____________________________________________

    

    let decipher = cryptoModule.createDecipheriv('aes-256-cbc',HEX_SEED,IV)
    
    global.PRIVATE_KEYS.set(symbiote,decipher.update(symbioteRef.PRV,'hex','utf8')+decipher.final('utf8'))



    //____________________________________DECRYPT PRIVATE KEYS FOR HOSTCHAINS_______________________________________


    symbioteRef.CONTROLLER.ME
    &&
    Object.keys(symbioteRef.HC_CONFIGS).forEach(ticker=>{
        
        let decipher = cryptoModule.createDecipheriv('aes-256-cbc',HEX_SEED,IV), privateKey=decipher.update(symbioteRef.HC_CONFIGS[ticker].PRV,'hex','utf8')+decipher.final('utf8')



        if(CONFIG.EVM.includes(ticker)) hostchains.get(symbiote).get(ticker).PRV=Buffer.from(privateKey,'hex')
        
        else symbioteRef.HC_CONFIGS[ticker].PRV=privateKey
        


        LOG(`Hostchain [\x1b[36;1m${ticker}\x1b[32;1m] ~~~> private key was decrypted successfully`,'S')
    
    })
    
    rl.close()

}