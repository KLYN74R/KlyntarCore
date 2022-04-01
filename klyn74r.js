#!/usr/bin/env node

import {SYMBIOTE_ALIAS,LOG,DECRYPT_KEYS,BLAKE3,PATH_RESOLVE,CHECK_UPDATES} from './KLY_Utils/utils.js'

import{parentPort,isMainThread}from'worker_threads'

import {RENAISSANCE} from './KLY_Process/life.js'

import chalkAnimation from 'chalk-animation'

import {spawn} from 'child_process'

import UWS from 'uWebSockets.js'

import readline from 'readline'

import ora from 'ora'

import l from 'level'

import fs from 'fs'

import os from 'os'






/*

_______________OBLIGATORY PATH RESOLUTION_______________


✔️Sets the absolute path over relative one

🔗Used to allow us to link and start deamon from everywhere

😈Also,to prevent different attacks e.g. search order hijacking,modules substitution,NPM hijacking etc.
prevent privilleges escalation via path misconfiguration or lack of access control.

*/
global.__dirname = await import('path').then(async mod=>
  
    mod.dirname(
      
      (await import('url')).fileURLToPath(import.meta.url)
      
    )

)


/*


TODO:Над процессом принятия и обработки блока + при включении
TODO:Реализация функционала симбиотических цепочек(отправка+проверка)

+TODO:Работать над приемом и распространением блоков
*TODO:Provide async formatting ratings due to fair addresses and liars
!TODO:Что делать с цепочками которые только-только появились
!TODO:Ограничить время TCP сессии для fetch(через Promise.any и один из промисов таймер на заданое кол-во секунд)


                                            


                                .do-"""""'-o..                         
                             .o""            ""..                       
                           ,,''                 ``b.                   
                          d'                      ``b                   
                         d`d:                       `b.                 
                        ,,dP                         `Y.               
                       d`88                           `8.               
 ooooooooooooooooood888`88'                            `88888888888bo, 
d"""    `""""""""""""Y:d8P                              8,          `b 
8                    P,88b                             ,`8           8 
8                   ::d888,                           ,8:8.          8                              ██████╗ ███████╗██╗   ██╗███████╗██╗      ██████╗ ██████╗ ███████╗██████╗ 
:                   dY88888                           `' ::          8                              ██╔══██╗██╔════╝██║   ██║██╔════╝██║     ██╔═══██╗██╔══██╗██╔════╝██╔══██╗ 
:                   8:8888                               `b          8                              ██║  ██║█████╗  ██║   ██║█████╗  ██║     ██║   ██║██████╔╝█████╗  ██║  ██║    
:                   Pd88P',...                     ,d888o.8          8                              ██║  ██║██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║     ██║   ██║██╔═══╝ ██╔══╝  ██║  ██║  
:                   :88'dd888888o.                d8888`88:          8                              ██████╔╝███████╗ ╚████╔╝ ███████╗███████╗╚██████╔╝██║     ███████╗██████╔╝   
:                  ,:Y:d8888888888b             ,d88888:88:          8                              ╚═════╝ ╚══════╝  ╚═══╝  ╚══════╝╚══════╝ ╚═════╝ ╚═╝     ╚══════╝╚═════╝
:                  :::b88d888888888b.          ,d888888bY8b          8                              
                    b:P8;888888888888.        ,88888888888P          8                              
                    8:b88888888888888:        888888888888'          8                              
                    8:8.8888888888888:        Y8888888888P           8                              ███████╗ ██████╗ ██████╗     ██████╗ ███████╗ ██████╗ ██████╗ ██╗     ███████╗     
,                   YP88d8888888888P'          ""888888"Y            8                              ██╔════╝██╔═══██╗██╔══██╗    ██╔══██╗██╔════╝██╔═══██╗██╔══██╗██║     ██╔════╝  
:                   :bY8888P"""""''                     :            8                              █████╗  ██║   ██║██████╔╝    ██████╔╝█████╗  ██║   ██║██████╔╝██║     █████╗  
:                    8'8888'                            d            8                              ██╔══╝  ██║   ██║██╔══██╗    ██╔═══╝ ██╔══╝  ██║   ██║██╔═══╝ ██║     ██╔══╝    
:                    :bY888,                           ,P            8                              ██║     ╚██████╔╝██║  ██║    ██║     ███████╗╚██████╔╝██║     ███████╗███████╗   
:                     Y,8888           d.  ,-         ,8'            8                              ╚═╝      ╚═════╝ ╚═╝  ╚═╝    ╚═╝     ╚══════╝ ╚═════╝ ╚═╝     ╚══════╝╚══════╝
:                     `8)888:           '            ,P'             8                              
:                      `88888.          ,...        ,P               8                              
:                       `Y8888,       ,888888o     ,P                8                              ██████╗ ██╗   ██╗    ██╗  ██╗██╗  ██╗   ██╗███╗   ██╗████████╗ █████╗ ██████╗     ████████╗███████╗ █████╗ ███╗   ███╗
:                         Y888b      ,88888888    ,P'                8                              ██╔══██╗╚██╗ ██╔╝    ██║ ██╔╝██║  ╚██╗ ██╔╝████╗  ██║╚══██╔══╝██╔══██╗██╔══██╗    ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║
:                          `888b    ,888888888   ,,'                 8                              ██████╔╝ ╚████╔╝     █████╔╝ ██║   ╚████╔╝ ██╔██╗ ██║   ██║   ███████║██████╔╝       ██║   █████╗  ███████║██╔████╔██║
:                           `Y88b  dPY888888OP   :'                  8                              ██╔══██╗  ╚██╔╝      ██╔═██╗ ██║    ╚██╔╝  ██║╚██╗██║   ██║   ██╔══██║██╔══██╗       ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║
:                             :88.,'.   `' `8P-"b.                   8                              ██████╔╝   ██║       ██║  ██╗███████╗██║   ██║ ╚████║   ██║   ██║  ██║██║  ██║       ██║   ███████╗██║  ██║██║ ╚═╝ ██║
:.                             )8P,   ,b '  -   ``b                  8                              ╚═════╝    ╚═╝       ╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝       ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝
::                            :':   d,'d`b, .  - ,db                 8                              
::                            `b. dP' d8':      d88'                 8                              
::                             '8P" d8P' 8 -  d88P'                  8                              
::                            d,' ,d8'  ''  dd88'                    8                              
::                           d'   8P'  d' dd88'8                     8                              
 :                          ,:   `'   d:ddO8P' `b.                   8                              
 :                  ,dooood88: ,    ,d8888""    ```b.                8                              
 :               .o8"'""""""Y8.b    8 `"''    .o'  `"""ob.           8                              
 :              dP'         `8:     K       dP''        "`Yo.        8                              
 :             dP            88     8b.   ,d'              ``b       8                              
 :             8.            8P     8""'  `"                 :.      8                              ██╗   ██╗   ██████╗  
 :            :8:           :8'    ,:                        ::      8                              ██║   ██║  ██╔════╝ 
 :            :8:           d:    d'                         ::      8                              ██║   ██║  ██║   
 :            :8:          dP   ,,'                          ::      8                              ╚██╗ ██╔╝  ██║ 
 :            `8:     :b  dP   ,,                            ::      8                               ╚████╔╝██╗╚██████╗██╗     
 :            ,8b     :8 dP   ,,                             d       8                                ╚═══╝ ╚═╝ ╚═════╝╚═╝ 
 :            :8P     :8dP    d'                       d     8       8 
 :            :8:     d8P    d'                      d88    :P       8 
 :            d8'    ,88'   ,P                     ,d888    d'       8 
 :            88     dP'   ,P                      d8888b   8        8 
 '           ,8:   ,dP'    8.                     d8''88'  :8        8 
             :8   d8P'    d88b                   d"'  88   :8        8 
             d: ,d8P'    ,8P""".                      88   :P        8 
             8 ,88P'     d'                           88   ::        8 
            ,8 d8P       8                            88   ::        8 
            d: 8P       ,:  -hrr-                    :88   ::        8 
            8',8:,d     d'                           :8:   ::        8 
           ,8,8P'8'    ,8                            :8'   ::        8 
           :8`' d'     d'                            :8    ::        8 
           `8  ,P     :8                             :8:   ::        8 
            8, `      d8.                            :8:   8:        8 
            :8       d88:                            d8:   8         8 
 ,          `8,     d8888                            88b   8         8 
 :           88   ,d::888                            888   Y:        8 
 :           YK,oo8P :888                            888.  `b        8 
 :           `8888P  :888:                          ,888:   Y,       8 
 :            ``'"   `888b                          :888:   `b       8 
 :                    8888                           888:    ::      8 
 :                    8888:                          888b     Y.     8, 
 :                    8888b                          :888     `b     8: 
 :                    88888.                         `888,     Y     8: 
 ``ob...............--"""""'----------------------`""""""""'"""`'"""""

*/




//_________________________________________________CONSTANTS_POOL_______________________________________________




//Check the Roadmap,documentation,official sources,etc. to get more | Смотрите Roadmap проекта,документацию,официальные источники и тд. чтобы узнать больше

export let

    symbiotes=new Map(),//Mapping(CONTROLLER_ADDRESS(ex.FASj1powx5qF1J6MRmx1PB7NQp5mENYEukhyfaWoqzL9)=>{BLOCKS:DB_INSTANCE,STATE:DB_INSTANCE,...})
    
    hostchains=new Map(),//To integrate with other explorers,daemons,API,gateways,NaaS etc.
    



    RELOAD_STATE=async(symbiote,symbioteRef)=>{

        //Reset verification breakpoint
        await symbioteRef.STATE.clear()

        let promises=[],

            itsNotInitStart=symbioteRef.VERIFICATION_THREAD.COLLAPSED_INDEX!==-1 && symbioteRef.GENERATION_THREAD.NEXT_INDEX!==0

            
        //Try to load from snapshot
        if( itsNotInitStart && fs.existsSync(PATH_RESOLVE(`SNAPSHOTS/${symbiote}`))){

            //Try to load snapshot metadata to use as last collapsed
            let canary=await symbioteRef.SNAPSHOT.METADATA.get('CANARY').catch(e=>false),

                snapshotVT=await symbioteRef.SNAPSHOT.METADATA.get('VT').catch(e=>false),

                snapshotIsOk=snapshotVT.CHECKSUM===BLAKE3(JSON.stringify(snapshotVT.DATA)+snapshotVT.COLLAPSED_INDEX+snapshotVT.COLLAPSED_HASH)



            //Means that you have local copy of full snapshot
            if(CONFIG.SYMBIOTES[symbiote].SNAPSHOTS.ALL&&snapshotIsOk&&canary===snapshotVT.CHECKSUM){

                symbioteRef.VERIFICATION_THREAD=snapshotVT

                let accs={},promises=[]

                await new Promise(
                    
                    resolve => symbioteRef.SNAPSHOT.STATE.createReadStream()
                    
                                        .on('data',data=>accs[data.key]=data.value)
                                        
                                        .on('close',resolve)
                    
                )

                Object.keys(accs).forEach(addr=>promises.push(symbioteRef.STATE.put(addr,accs[addr])))

                await Promise.all(promises).catch(e=>{

                    LOG(`Problems with loading state from snaphot to state db \n${e}`,'F')

                    process.exit(138)
                    
                })


            }else{

                LOG(`Impossible to load state from snapshot.Probably \x1b[36;1mSNAPSHOTS.ALL=false\x1b[31;1m or problems with canary or VT.Try to delete SNAPSHOTS/<symbioteID> and reload daemon`,'F')

                process.exit(138)

            }

        }else{

            //Otherwise start rescan form height=0
            
            symbioteRef.VERIFICATION_THREAD={COLLAPSED_HASH:'Poyekhali!@Y.A.Gagarin',COLLAPSED_INDEX:-1,DATA:{},CHECKSUM:''}

            //Load all the configs
            fs.readdirSync(PATH_RESOLVE(`GENESIS/${symbiote}`)).forEach(file=>{
    
                //Load genesis state or data from backups(not to load state from the beginning)
                let genesis=JSON.parse(fs.readFileSync(PATH_RESOLVE(`GENESIS/${symbiote}/${file}`)))
            
                Object.keys(genesis).forEach(
                
                    address => promises.push(symbioteRef.STATE.put(address,genesis[address]))
                    
                )
    
            })
    
            await Promise.all(promises)
            

        }


    },


    

    PREPARE_SYMBIOTE=async symbioteId=>{

        //Loading spinner
        let initSpinner

        if(!CONFIG.PRELUDE.NO_SPINNERS){

            initSpinner = ora({
                color:'red',
                prefixText:`\u001b[38;5;23m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]  \x1b[36;1mPreparing symbiote \x1b[32;1m${SYMBIOTE_ALIAS(symbioteId)}\x1b[0m`
            }).start()

            
        }
        



        //____________________________________________Prepare structures_________________________________________________


        let symbioteConfig=CONFIG.SYMBIOTES[symbioteId]


        //Contains default set of properties for major part of potential use-cases on symbiote
        symbiotes.set(symbioteId,{
            
            MEMPOOL:[],
            
            //Сreate mapping to optimize processes while we check blocks-not to read/write to db many times
            ACCOUNTS:new Map(),// ADDRESS => { ACCOUNT_STATE , NONCE_SET , NONCE_DUPLICATES , OUT , TYPE }

            EVENTS_STATE:new Map(),// EVENT_KEY(on symbiote) => EVENT_VALUE

            BLACKLIST:new Set(),//To sift addresses which spend more than has when we check another ControllerBlock

            //Peers to exchange data with
            NEAR:[]

        })




        let symbioteRef=symbiotes.get(symbioteId)


        //Open writestream in append mode
        SYMBIOTES_LOGS_STREAMS.set(symbioteId,fs.createWriteStream(PATH_RESOLVE(`LOGS/${symbioteId}.txt`),{flags:'a+'}));

        
        //OnlyLinuxFans.Due to incapsulation level we need to create sub-level directory for each symbiote
        ['C','SNAPSHOTS'].forEach(
            
            name => !fs.existsSync(PATH_RESOLVE(`${name}/${symbioteId}`)) && fs.mkdirSync(PATH_RESOLVE(`${name}/${symbioteId}`))
            
        )
        

        //___________________________Load functionality to verify/filter/transform events_______________________________


        //Importnat and must be the same for symbiote at appropriate chunks of time
        symbioteRef.VERIFIERS=(await import(`./KLY_Handlers/${symbioteConfig.MANIFEST.VERIFIERS}/verifiers.js`)).default

        symbioteRef.SPENDERS=(await import(`./KLY_Handlers/${symbioteConfig.MANIFEST.SPENDERS}/spenders.js`)).default


        //Might be individual for each node
        symbioteRef.FILTERS=(await import(`./KLY_Handlers/${symbioteConfig.FILTERS}/filters.js`)).default;


        //______________________________________Prepare databases and storages___________________________________________

        


        //Create subdirs due to rational solutions
        [
            'METADATA',//important dir-cointains canaries,pointer to VERIFICATION_THREAD and GENERATION_THREADS
        
            'CONTROLLER_BLOCKS',//For Controller's blocks(key is index)
            
            'INSTANT_BLOCKS',//For Instant(key is hash)
            
            'HOSTCHAINS_DATA',//To store external flow of commits for ControllerBlocks
            
            'CANDIDATES'//For candidates(key is a hash(coz it's also InstantBlocks,but yet not included to chain))
        
        ].forEach(
            
            dbName => symbioteRef[dbName]=l(PATH_RESOLVE(`C/${symbioteId}/${dbName}`),{valueEncoding:'json'})
            
        )


        /*
        
            ___________________________________________________State of symbiote___________________________________________________

                                    *********************************************************************
                                    *        THE MOST IMPORTANT STORAGE-basis for each symbiote         *
                                    *********************************************************************



                Holds accounts state,balances,aliases,services & conveyors metadata and so on

                *Examples:

                0)Aliases of accounts & groups & contracts & services & conveyors & domains & social media usernames. Some hint to Web23.Read more on our sources https://klyntar.org
        
            
                    Single emoji refers to address and domain:❤️ => 0xd1ffa2d57241b01174db76b3b7123c3f707a12b91ddda00ea971741c94ab3578(Polygon contract,https://charity.health.com)

                    Combo:🔥😈🔥 => PQTJJR4FZIDBLLKOUVAD7FUYYGL66TJUPDERHBTJUUTTIDPYPGGQ(Algorand address by Klyntar)
            
                    Emoji ref to special signature type🌌 => aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa(Root of hashes tree mapped to conveyor set of addresses protected by hash-based post quantum signatures)

                    Usernames(Twitter in this case) @jack => bc1qsmljf8cmfhul2tuzcljc2ylxrqhwf7qxpstj2a
                
                
                1)
        



        
        */


        symbioteRef.STATE=l(PATH_RESOLVE(`C/${symbioteId}/STATE`),{valueEncoding:'json'})
        



        //...and separate dirs for state and metadata snapshots

        symbioteRef.SNAPSHOT={

            METADATA:l(PATH_RESOLVE(`SNAPSHOTS/${symbioteId}/METADATA`),{valueEncoding:'json'}),

            STATE:l(PATH_RESOLVE(`SNAPSHOTS/${symbioteId}/STATE`),{valueEncoding:'json'})

        }



        
        //________________Load metadata about symbiote-current hight,collaped height,height for export,etc.___________________

        symbioteRef.VERIFICATION_THREAD = await symbioteRef.METADATA.get('VT').catch(e=>
            
            e.notFound
            ?
            {COLLAPSED_HASH:'Poyekhali!@Y.A.Gagarin',COLLAPSED_INDEX:-1,DATA:{},CHECKSUM:''}//initial
            :
            (LOG(`Some problem with loading metadata of verification thread\nSymbiote:${symbioteId}\nError:${e}`,'F'),process.exit(124))
                        
        )








        //_____Load security stuff-check if stop was graceful,canary is present,should we reload the state and so on_____




        //These options only for Controller
        //Due to phantom blocks,we'll generate blocks faster than state become verified,that's why we need two extra properties
        if(symbioteConfig.CONTROLLER.ME){

            symbioteRef.GENERATION_THREAD = await symbioteRef.METADATA.get('GT').catch(e=>
            
                e.notFound
                ?
                {
                    PREV_HASH:`Poyekhali!@Y.A.Gagarin`,//Genesis hash
                    NEXT_INDEX:0//So the first block will be with index 0
                }
                :
                (LOG(`Some problem with loading metadata of generation thread\nSymbiote:${symbioteId}\nError:${e}`,'F'),process.exit(125))
                            
            )


            let nextIsPresent = await symbioteRef.CONTROLLER_BLOCKS.get(symbioteRef.GENERATION_THREAD.NEXT_INDEX).catch(e=>false),//OK is in case of absence of next block

                previous=await symbioteRef.CONTROLLER_BLOCKS.get(symbioteRef.GENERATION_THREAD.NEXT_INDEX-1).catch(e=>false)//but current block should present at least locally

        
            if(nextIsPresent || !(symbioteRef.GENERATION_THREAD.NEXT_INDEX===0 || symbioteRef.GENERATION_THREAD.PREV_HASH === BLAKE3( JSON.stringify(previous.a) + symbioteId + previous.i + previous.p))){
            
                initSpinner?.stop()

                LOG(`Something wrong with a sequence of generation thread on \x1b[36;1m${SYMBIOTE_ALIAS(symbioteId)}`,'F')
                
                process.exit(125)

            }

            
        }
        
        


        //If we just start verification thread, there is no sense to do following logic
        if(symbioteRef.VERIFICATION_THREAD.COLLAPSED_INDEX!==-1){

            await symbioteRef.METADATA.get('CANARY').then(async canary=>{

                let verifThread=symbioteRef.VERIFICATION_THREAD
    
                //If staging zone is OK
                if(verifThread.CHECKSUM===BLAKE3(JSON.stringify(verifThread.DATA)+verifThread.COLLAPSED_INDEX+verifThread.COLLAPSED_HASH)){

                    //This is the signal that we should rewrite state changes from the staging zone
                    if(canary!==verifThread.CHECKSUM){

                        initSpinner?.stop()
    
                        LOG(`Load state data from staging zone on \x1b[32;1m${SYMBIOTE_ALIAS(symbioteId)}`,'I')
                        
                        let promises=[];

                        ['ACCOUNTS','EVENTS'].forEach(
                            
                            type => Object.keys(verifThread.DATA[type]).forEach(
                            
                                key => promise.push(symbioteRef.STATE.put(key,verifThread.DATA[type][key]))
                                
                            )    
                            
                        )
    
                        
                        await Promise.all(promises).catch(e=>{

                            LOG(`Problems with loading state from staging zone of verification thread on \x1b[36;1m${SYMBIOTE_ALIAS(symbioteId)}\x1b[31;1m\n${e}`,'F')

                            process.exit(133)

                        })
    
                    }
                    
                }else{

                    initSpinner?.stop()
    
                    LOG(`Problems with staging zone of verification thread on \x1b[36;1m${SYMBIOTE_ALIAS(symbioteId)}`,'W')

                    await RELOAD_STATE(symbioteId,symbioteRef)

                }
    
            }).catch(async err=>{
    
                initSpinner?.stop()

                LOG(fs.readFileSync(PATH_RESOLVE('images/events/canaryDied.txt')).toString(),'CD')
    
                LOG(`Problems with canary on \x1b[36;1m${SYMBIOTE_ALIAS(symbioteId)}\n${err}`,'W')
    
                //Reset verification breakpoint
                await RELOAD_STATE(symbioteId,symbioteRef)
    
            })    

        }else {

            //Clear previous state to avoid mistakes
            symbioteRef.STATE.clear()

            //Load data from genesis state(initial values)
            await RELOAD_STATE(symbioteId,symbioteRef)

        }
 


        symbioteRef.INSTANT_CANDIDATES=new Map()//mapping(hash=>creator)


        //Clear,to not store OUT-OF-CHAIN blocks
        //*UPD:Node operators should run cleaning time by time
        //chainRef.CANDIDATES.clear()

        


        //__________________________________Load modules to work with hostchains_________________________________________


        //...and push template to global HOSTCHAINS_DATA object to control the flow


        let tickers=Object.keys(symbioteConfig.MANIFEST.HOSTCHAINS),EvmHostChain,hostchainmap=new Map()


        symbioteRef.HOSTCHAINS_WORKFLOW={}


        //Add hostchains to mapping
        //Load way to communicate with hostchain via appropriate type
        for(let i=0,l=tickers.length;i<l;i++){

            
            let way=symbioteConfig.MANIFEST.HOSTCHAINS[tickers[i]].TYPE


            //Depending on TYPE load appropriate module
            if(CONFIG.EVM.includes(tickers[i])){
            
                EvmHostChain=(await import(`./KLY_Hostchains/connectors/${way}/evm.js`)).default
                
                hostchainmap.set(tickers[i],new EvmHostChain(symbioteId,tickers[i]))

            }else hostchainmap.set(tickers[i],(await import(`./KLY_Hostchains/connectors/${way}/${tickers[i]}.js`)).default)



            hostchains.set(symbioteId,hostchainmap)

            //hostchains.set(controllerAddr,tickers[i],(await import(`./KLY_Hostchains/${tickers[i]}.js`)).default)//load module
            
            //Load canary
            symbioteRef.HOSTCHAINS_WORKFLOW[tickers[i]]=await symbioteRef.HOSTCHAINS_DATA.get(tickers[i]).catch(e=>(  {KLYNTAR_HASH:'',INDEX:0,HOSTCHAIN_HASH:'',SIG:''}  ))

        }




        //___________________Decrypt all private keys(for Klyntar and hostchains) to memory of process___________________

        

        await DECRYPT_KEYS(symbioteId,initSpinner).then(()=>
        
            //Print just first few bytes of keys to view that they were decrypted well.Looks like checksum
            LOG(`Private key on \x1b[36;1m${SYMBIOTE_ALIAS(symbioteId)}\x1b[32;1m was decrypted successfully`,'S')        
        
        ).catch(e=>{
        
            LOG(`Keys decryption failed.Please,check your password carefully.In the worst case-use your decrypted keys from safezone and repeat procedure of encryption via REPL\n${e}`,'F')
     
            process.exit(100)
    
        })




        //___________________________________________Load data from hostchains___________________________________________

        //TODO:Add more advanced info    
        if(symbioteConfig.CONTROLLER.ME){

            
            for(let i=0,l=tickers.length;i<l;i++){

                let balance

                if(CONFIG.PRELUDE.BALANCE_VIEW){

                    let spinner = ora({
                        color:'red',
                        prefixText:`\u001b[38;5;23m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]  \x1b[36;1mGetting balance for \x1b[32;1m${tickers[i]}\x1b[36;1m - keep waiting\x1b[0m`
                    }).start()
    
                    balance = await hostchains.get(symbioteId).get(tickers[i]).getBalance(symbioteId)

                    spinner.stop()

                }


                LOG(`Balance of controller on hostchain \x1b[32;1m${
                    
                    tickers[i]
                
                }\x1b[36;1m is \x1b[32;1m${
                    
                    CONFIG.PRELUDE.BALANCE_VIEW?balance:'<disabled>'
                
                }   \x1b[36;1m[${symbioteConfig.STOP_PUSH_TO_HOSTCHAINS[tickers[i]]?'\x1b[31;1mSTOP':'\x1b[32;1mPUSH'}\x1b[36;1m]`,'I')

            }


            //____________________________________________GENERAL SYMBIOTE INFO____________________________________________


            LOG(fs.readFileSync(PATH_RESOLVE('images/events/syminfo.txt')).toString(),'S')
            

            LOG(`Canary is \x1b[32;1m<OK>`,'I')

            LOG(`Collapsed on \x1b[32;1m${symbioteRef.VERIFICATION_THREAD.COLLAPSED_INDEX} \u001b[38;5;168m}———{\x1b[32;1m ${symbioteRef.VERIFICATION_THREAD.COLLAPSED_HASH}`,'I')




            //Ask to approve current set of hostchains
            !CONFIG.PRELUDE.OPTIMISTIC
            &&        
            await new Promise(resolve=>
        
                readline.createInterface({input:process.stdin, output:process.stdout, terminal:false})
                
                .question(`\n ${'\u001b[38;5;23m'}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${'\x1b[36;1m'}  Do you agree with the current set of hostchains? Enter \x1b[32;1mYES\x1b[36;1m to continue ———> \x1b[0m`,resolve)
                    
            ).then(answer=>answer!=='YES'&& process.exit(126))

  
        }
        
        SIG_PROCESS[symbioteId]={VERIFY:false,GENERATE:false}//we should track events in both threads-as in verification,as in generation

    },




    WRAP_RESPONSE=(a,ttl)=>a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+ttl)











    
//_________________________________________________CONFIG_PROCESS_______________________________________________


//Define globally
global.CONFIG={}


//Load all the configs
fs.readdirSync(PATH_RESOLVE('configs')).forEach(file=>
    
    Object.assign(CONFIG,JSON.parse(fs.readFileSync(PATH_RESOLVE(`configs/${file}`))))
    
)


//*********************** SET HANDLERS ON USEFUL SIGNALS ************************


let graceful=()=>{
    
    SIG_SIGNAL=true


    console.log('\n')

    LOG('Klyntar stop has been initiated.Keep waiting...','I')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/termination.txt')).toString(),'W')
    
    //Probably stop logs on this step
    setInterval(async()=>{

        //Each subprocess in each symbiote must be stopped
        if(Object.keys(SIG_PROCESS).every(symbiote => Object.values(SIG_PROCESS[symbiote]).every(x=>x))){

            console.log('\n')

            let streamsPromises=[]

            SYMBIOTES_LOGS_STREAMS.forEach(
                
                (stream,symbiote) => streamsPromises.push(
                    
                    new Promise( resolve => stream.close( e => {

                        LOG(`Logging was stopped for ${SYMBIOTE_ALIAS(symbiote)} ${e?'\n'+e:''}`,'I')

                        resolve()
                    
                    }))
                    
                )
                
            )



            LOG('Server stopped','I')

            global.UWS_DESC&&UWS.us_listen_socket_close(UWS_DESC)



            await Promise.all(streamsPromises).then(_=>{

                LOG('Node was gracefully stopped','I')
                
                process.exit(0)

            })

        }

    },200)

}



//Define listeners on typical signals to safely stop the node
process.on('SIGTERM',graceful)
process.on('SIGINT',graceful)
process.on('SIGHUP',graceful)


//************************ END SUB ************************



//________________________________________________SHARED RESOURCES______________________________________________




global.SYMBIOTES_LOGS_STREAMS=new Map()

global.PRIVATE_KEYS=new Map()

global.SIG_SIGNAL=false

global.SIG_PROCESS={}




//Location for symbiotes
!fs.existsSync(PATH_RESOLVE('C')) && fs.mkdirSync(PATH_RESOLVE('C'));

//For logs streams
!fs.existsSync(PATH_RESOLVE(`LOGS`)) && fs.mkdirSync(PATH_RESOLVE(`LOGS`));

//And for snapshots
!fs.existsSync(PATH_RESOLVE(`SNAPSHOTS`)) && fs.mkdirSync(PATH_RESOLVE(`SNAPSHOTS`));




/*
****************************************************************************************************************
*                                                                                                              *
*                                                                                                              *
*                                    ░██████╗████████╗░█████╗░██████╗░████████╗                                *
*                                    ██╔════╝╚══██╔══╝██╔══██╗██╔══██╗╚══██╔══╝                                *
*                                    ╚█████╗░░░░██║░░░███████║██████╔╝░░░██║░░░                                *
*                                    ░╚═══██╗░░░██║░░░██╔══██║██╔══██╗░░░██║░░░                                *
*                                    ██████╔╝░░░██║░░░██║░░██║██║░░██║░░░██║░░░                                *
*                                    ╚═════╝░░░░╚═╝░░░╚═╝░░╚═╝╚═╝░░╚═╝░░░╚═╝░░░                                *
*                                                                                                              *
*                                                                                                              *
****************************************************************************************************************
*/




(async()=>{




//_________________________________________________BANNERS INTRO________________________________________________




    process.stdout.write('\x1Bc')
    
    //Cool short animation
    await new Promise(r=>{
        
        let animation=chalkAnimation.glitch('\x1b[31;1m'+fs.readFileSync(PATH_RESOLVE('images/intro.txt')).toString()+'\x1b[0m')
    
        setTimeout(()=>{ animation.stop() ; r() },CONFIG.PRELUDE.ANIMATION_DURATION)
    
    })
    
    
    process.stdout.write('\x1Bc')
    
    //Read banner
    console.log('\x1b[36;1m'+fs.readFileSync(PATH_RESOLVE('images/banner.txt')).toString()
    
    //...and add extra colors & changes)
    .replace('Made on Earth for Universe','\x1b[31mMade on Earth for Universe\x1b[36m')
    .replace('REMEMBER:To infinity and beyond!','\x1b[31mREMEMBER:To infinity and beyond!\x1b[36m')
    .replace('@ Powered by Klyntar @','@ Powered by \u001b[7m\u001b[31;5;219mKlyntar\x1b[0m \x1b[36;1m@')
    .replaceAll('≈','\x1b[31m≈\x1b[36m')
    .replaceAll('#','\x1b[31m#\x1b[36m')+'\x1b[0m\n')
    
    

    
    LOG(`System info \x1b[31m${['node:'+process.version,`info:${process.platform+os.arch()} # ${os.version()} # threads_num:${os.cpus().length}`,`core:${CONFIG.INFO.CORE_VERSION}`,`role:${CONFIG.ROLE}(runned as ${os.userInfo().username})`,`galaxy:${CONFIG.GALAXY}`].join('\x1b[36m / \x1b[31m')}`,'I')

    LOG(fs.readFileSync(PATH_RESOLVE('images/events/start.txt')).toString(),'S')
    
    


//_____________________________________________ADVANCED PREPARATIONS____________________________________________




    //If some chain marked as "STOP",we don't prepare something for it,otherwise-force preparation work
    let controllers=Object.keys(CONFIG.SYMBIOTES)



    
    //.forEach has inner scope,but we need await on top frame level
    for(let i=0;i<controllers.length;i++) !CONFIG.SYMBIOTES[controllers[i]].STOP_WORK  &&  await PREPARE_SYMBIOTE(controllers[i])
    


    //Make this shit for memoization and not to repeate .stringify() within each request.Some kind of caching
    //BTW make it global to dynamically change it in the onther modules
    global.INFO=JSON.stringify(CONFIG.INFO)
    



//____________________________________________ASK FOR FINAL AGREEMENT____________________________________________




    console.log('\n\n\n')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/serverConfigs.txt')).toString().replaceAll('@','\x1b[31m@\x1b[32m').replaceAll('Check the configs carefully','\u001b[38;5;50mCheck the configs carefully\x1b[32m'),'S')

    LOG(`\u001b[38;5;202mTLS\u001b[38;5;168m is \u001b[38;5;50m${CONFIG.TLS.ENABLED?'enabled':'disabled'}`,'CON')
    
    await CHECK_UPDATES()

    LOG(`Server configuration is ———> \u001b[38;5;50m[${CONFIG.INTERFACE}]:${CONFIG.PORT}`,'CON')

    LOG(`Custom runned modules(${CONFIG.RUN_CUSTOM.length}) are ———> \u001b[38;5;50m${CONFIG.RUN_CUSTOM.join(' \u001b[38;5;202m<>\u001b[38;5;50m ')}`,'CON')


    
    //Info about runned services
    console.log('\n\n')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/services.txt')).toString(),'CD')

    Object.keys(CONFIG.SERVICES).forEach(
        
        servicePath => LOG(`Service \x1b[36;1m${servicePath}\u001b[38;5;168m will be runned \u001b[38;5;168m(\x1b[36;1m${CONFIG.SERVICES[servicePath]}\u001b[38;5;168m)`,'CON')
        
    )
    
    console.log('\n\n')

    LOG(fs.readFileSync(PATH_RESOLVE('images/events/conveyors.txt')).toString(),'CD')

    Object.keys(CONFIG.CONVEYORS).forEach(
        
        convPath => LOG(`Conveyor \x1b[36;1m${convPath}\u001b[38;5;168m will be runned \u001b[38;5;168m(\x1b[36;1m${CONFIG.CONVEYORS[convPath]}\u001b[38;5;168m)`,'CON')
        
    )



    !CONFIG.PRELUDE.OPTIMISTIC
    &&
    await new Promise(resolve=>
        
        readline.createInterface({input:process.stdin, output:process.stdout, terminal:false})
    
        .question(`\n ${'\u001b[38;5;23m'}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${'\x1b[36;1m'}  Do you agree with the current configuration? Enter \x1b[32;1mYES\x1b[36;1m to continue ———> \x1b[0m`,resolve)
        
    ).then(answer=>answer!=='YES'&& process.exit(126))


    //Run custom modules
    //To load them one by one,use top level await,so we need "for...of"
    for(let scriptPath of CONFIG.RUN_CUSTOM){

        //Tag:ExecMap
        await import(`./KLY_Custom/${scriptPath}`).catch(
            
            e => LOG(`Some error has been occured in process of module \u001b[38;5;50m${scriptPath}\x1b[31;1m load\n${e}\n`,'F')
            
        )

    }
    

    for(let servicePath in CONFIG.SERVICES){

        //Tag:ExecMap
        await import(`./KLY_Services/${servicePath}/entry.js`).catch(
            
            e => LOG(`Some error has been occured in process of service \u001b[38;5;50m${servicePath}\x1b[31;1m load\n${e}\n`,'F')
            
        )

    }


    
    for(let convPath in CONFIG.CONVEYORS){

        //Tag:ExecMap
        await import(`./KLY_Conveyors/${convPath}/entry.js`).catch(
            
            e => LOG(`Some error has been occured in process of conveyor \u001b[38;5;50m${convPath}\x1b[31;1m load\n${e}\n`,'F')
            
        )

    }
    


    //Get urgent state and go on!
    await RENAISSANCE()




//_______________________________________________GET SERVER ROUTES______________________________________________




//Load route modules
let CONTROL=(await import('./KLY_Routes/control.js')).default,
    
    MAIN=(await import('./KLY_Routes/main.js')).default,
    
    API=(await import('./KLY_Routes/api.js')).default




//_____________________________________________________MAIN_____________________________________________________

//...And only after that we start routes

//Tag:ExecMap
UWS[CONFIG.TLS.ENABLED?'SSLApp':'App'](CONFIG.TLS.CONFIGS)




.post('/cb',MAIN.controllerBlock)

.post('/ib',MAIN.instantBlock)

.post('/addnode',MAIN.addNode)

.post('/proof',MAIN.proof)

.post('/event',MAIN.event)




//_____________________________________________________CONTROL_____________________________________________________


//.post('/change',W.change)

.post('/con',CONTROL.config)

//.post('/view',W.view)


//_______________________________________________________API_______________________________________________________




.get('/multiplicity/:symbiote/:fromHeigth',API.multiplicity)

.get('/account/:symbiote/:address',API.acccount)

.get('/block/:symbiote/:type/:id',API.block)

.get('/nodes/:symbiote/:region',API.nodes)

.post('/alert',API.alert)

.get('/i',API.info)








.listen(CONFIG.INTERFACE,CONFIG.PORT,descriptor=>{


    if(descriptor){

        LOG(`Node started on ———> \x1b[36;1m[${CONFIG.INTERFACE}]:${CONFIG.PORT}`,'S')

        global.UWS_DESC=descriptor
        
    }
    else LOG('Oops,some problems with server module','F')



})




})()