#!/usr/bin/env node

import {BASE64,SYMBIOTE_ALIAS,LOG,DECRYPT_KEYS,BLAKE3,PATH_RESOLVE,CHECK_UPDATES} from './KLY_Space/utils.js'

import AdvancedCache from './KLY_Essences/advancedcache.js'

import {RENAISSANCE} from './KLY_Process/life.js'

import chalkAnimation from 'chalk-animation'

import UWS from 'uWebSockets.js'

import readline from 'readline'

import c from 'crypto'

import ora from 'ora'

import l from 'level'

import fs from 'fs'




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


*/

//*В CLI максимально просто и очевидно,ошибок нет.Изменения проводить через Web.В зависимости,от типа изменяемого параметра-применять либо сразу либо через некоторую advanced функцию
//!Сказать что сначала планировал в целях безопасности локально проводить изменения(напрямую через touch-файлы(аля локальных файл-хук) или же локальные интерфейсы и тд)
//!Однако через веб лучше всего(+само собой уже включает интерфейсы машины) и к тому же если мы стремимся к терминальной безопасности... 
//*В зависимости от настроек-принимать от RAW либо только с подписью (UNKNOWN_RAW_SUPPLIER) если это недоверенный узел чтоб уменьшить риск ложных блоков в цепочке RAW -> Our node -> Controller & Rest of network
//*Или же TRUSTED_RAW_SUPPLIER для приема любых транзакций(например это может быть наш же узел либо другой контейнер или сервер в другом регионе)



//*Запись себе сразу блоков,работа над функциями верификации с учетом цепочки.Но как-то через параметры идти,бо нам если что проверять транзакции при слиянии других цепочек
//*Решено-проверять просто что создатель Instant блока лежит в той же цепочке что и Controller и адрес который участвует в транзакции
//Подумать что с теми модулями что на будущее
//Решить наконец-то с синхронизацией

//Следущее-в зависимости от того,что мы за узел-по разному вести себя в функции проверки Instant блоков

//!Взаимодействие по Web-сначала по SpaceID(отдельному),потом открытие сессии и уже по ключам и подписям мб
//!Подумать что делать с nonce при отмене транзакции
  //Например глобальний можно оставить(ничего не делать с ним),а приватный уменьшить на некоторый N(в качестве "наказания")
  
  
//!Мб сделать кэш в CANCEL и verification.js(функции 2)
//! Пройтись по всем global.* и проверить-типы,правильность использования и тд.Выписать форматы даных которые принимаються/отправляються по всех роутах и функциональной части для документации и более легкого использования
//!Пройтись по тем местам,где возможна динамическая замена(там где импорт/экспорт/прием/отправка и тд) и проверить безопасно ли их менять


//?Так же будет полезно при контейнеризации и масштабировании

//*Чистка цепочки будет поэлементной.Хочешь-удаляй блоки,но состояние храни и тд




//_________________________________________________CONSTANTS_POOL_______________________________________________




//Check the Roadmap,documentation,official sources,etc. to get more | Смотрите Roadmap проекта,документацию,официальные источники и тд. чтобы узнать больше

export let

    symbiotes=new Map(),//Mapping(CONTROLLER_ADDRESS(ex.r3Y6Fri92GNLp4K9o8dkF9fAHrrd8VEoyktf5XTcW1o)=>{BLOCKS:DB_INSTANCE,STATE:DB_INSTANCE,...})
    
    hostchains=new Map(),//To integrate with other explorers,daemons,API,gateways,NaaS etc.
    
    metadata=l(PATH_RESOLVE('M/METADATA'),{valueEncoding:'json'}),//For symbiotes metadata flows e.g. generation flow,verification flow,staging etc.
       
    space=l(PATH_RESOLVE('M/SPACE'),{valueEncoding:'json'}),//To store zero level data of accounts i.e SpaceID,Roles flags,private nonce etc and data on different symbiotes

    


    RELOAD_STATE=async(symbiote,symbioteRef)=>{

        //Reset verification breakpoint
        await symbioteRef.STATE.clear()

        let promises=[]


        //Try to load from snapshot
        if(fs.existsSync(PATH_RESOLVE(`SNAPSHOTS/${symbiote}`))){

            //Try to load snapshot metadata to use as last collapsed
            let canary=await symbioteRef.SNAPSHOT.get('CANARY').catch(e=>false),

                snapshotVT=await symbioteRef.SNAPSHOT.get('VT').catch(e=>false),

                snapshotIsOk=snapshotVT.CHECKSUM===BLAKE3(JSON.stringify(snapshotVT.DATA)+snapshotVT.COLLAPSED_INDEX+snapshotVT.COLLAPSED_HASH)



            //Means that you have local copy of full snapshot
            if(CONFIG.SYMBIOTES[symbiote].SNAPSHOTS.ALL&&snapshotIsOk&&canary===snapshotVT.CHECKSUM){

                symbioteRef.VERIFICATION_THREAD=snapshotVT

                let accs={},promises=[]

                await new Promise(
                    
                    resolve => symbioteRef.SNAPSHOT.createReadStream()
                    
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
                let genesis=JSON.parse(fs.readFileSync(PATH_RESOLVE(`GENESIS/${symbiote}/${file}.json`)))
            
                Object.keys(genesis).forEach(
                
                    address => promises.push(symbioteRef.STATE.put(address,genesis[address].B))
                    
                )
    
            })
    
            await Promise.all(promises)
            

        }


    },


    

    PREPARE_SYMBIOTE=async controllerAddr=>{


        //Loading spinner

        let initSpinner = ora({
            color:'red',
            prefixText:`\u001b[38;5;23m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]  \x1b[36;1mPreparing symbiote \x1b[32;1m${SYMBIOTE_ALIAS(controllerAddr)}\x1b[0m`
        }).start(),

        


        //____________________________________________Prepare structures_________________________________________________


        symbioteConfig=CONFIG.SYMBIOTES[controllerAddr]


        symbiotes.set(controllerAddr,{
            
            //Create txs mempools-to add transactions on this symbiote.Both types-"DTXS" for default and "STXS"-with signatures
            MEMPOOL_DTXS:[],
            MEMPOOL_STXS:[],
            
            //Finally-create mapping to optimize processes while we check blocks-not to read/write to db many times
            ACCOUNTS:new Map(),// ADDRESS => { ACCOUNT_STATE , NONCE_SET , NONCE_DUPLICATES , OUT }

            BLACKLIST:new Set(),//To sift addresses which spend more than has when we check another ControllerBlock

            //Peers to exchange data with
            NEAR:[]

        })




        let symbioteRef=symbiotes.get(controllerAddr)


        //Open writestream in append mode
        SYMBIOTES_LOGS_STREAMS.set(controllerAddr,fs.createWriteStream(PATH_RESOLVE(`LOGS/${controllerAddr}.txt`),{flags:'a+'}))

        //OnlyLinuxFans.Due to incapsulation level we need to create sub-level directory for each symbiote
        !fs.existsSync(PATH_RESOLVE(`C/${controllerAddr}`)) && fs.mkdirSync(PATH_RESOLVE(`C/${controllerAddr}`))




        //__________________________Load functionality to verify/normalize/transform events_____________________________


        symbioteRef.VERIFIERS=(await import(`./KLY_Handlers/${CONFIG.VERIFIERS_PREFIXES[symbioteConfig.MANIFEST.VERIFIERS]}/verify.js`)).default

        symbioteRef.NORMALIZERS=(await import(`./KLY_Handlers/${CONFIG.NORMALIZERS_PREFIXES[symbioteConfig.NORMALIZERS]}/normalize.js`)).default

        symbioteRef.SPENDERS=(await import(`./KLY_Handlers/${CONFIG.SPENDERS_PREFIXES[symbioteConfig.MANIFEST.SPENDERS]}/spend.js`)).default


        //______________________________________Prepare databases and storages___________________________________________




        //Create subdirs due to rational solutions
        symbioteRef.CONTROLLER_BLOCKS=l(PATH_RESOLVE(`C/${controllerAddr}/CONTROLLER_BLOCKS`),{valueEncoding:'json'})//For Controller's blocks(key is index)
        
        symbioteRef.INSTANT_BLOCKS=l(PATH_RESOLVE(`C/${controllerAddr}/INSTANT_BLOCKS`),{valueEncoding:'json'})//For Instant(key is hash)
        
        symbioteRef.HOSTCHAINS_DATA=l(PATH_RESOLVE(`C/${controllerAddr}/HOSTCHAINS_DATA`),{valueEncoding:'json'})//To store external flow of commits for ControllerBlocks
        
        symbioteRef.CANDIDATES=l(PATH_RESOLVE(`C/${controllerAddr}/CANDIDATES`),{valueEncoding:'json'})//For candidates(key is a hash(coz it's also InstantBlocks,but yet not included to chain))
        
        symbioteRef.STATE=l(PATH_RESOLVE(`C/${controllerAddr}/STATE`),{valueEncoding:'json'})//State of accounts
        
        /*
            Aliases of accounts & groups & contracts & services & conveyors & domains & social media usernames. Some hint to Web23.Read more on our sources
        
            Examples:
            
            Single emoji refers to address and domain:❤️ => 0xd1ffa2d57241b01174db76b3b7123c3f707a12b91ddda00ea971741c94ab3578(Polygon contract,https://charity.health.com)

            Combo:🔥😈🔥 => PQTJJR4FZIDBLLKOUVAD7FUYYGL66TJUPDERHBTJUUTTIDPYPGGQ(Algorand address by Klyntar)
            
            Emoji ref to special signature type🌌 => aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa(Root of hashes tree mapped to conveyor set of addresses protected by hash-based post quantum signatures)

            Usernames(Twitter in this case) @jack => bc1qsmljf8cmfhul2tuzcljc2ylxrqhwf7qxpstj2a

        */
        symbioteRef.ALIASES=l(PATH_RESOLVE(`C/${controllerAddr}/ALIASES`),{valueEncoding:'json'})


        //Metadata
        symbioteRef.SERVICES=l(PATH_RESOLVE(`C/${controllerAddr}/SERVICES`),{valueEncoding:'json'})

        symbioteRef.CONVEYORS=l(PATH_RESOLVE(`C/${controllerAddr}/CONVEYORS`),{valueEncoding:'json'})





        //...and separate dir for snapshots
        symbioteRef.SNAPSHOT=l(PATH_RESOLVE(`SNAPSHOTS/${controllerAddr}`),{valueEncoding:'json'})



        
        //________________Load metadata about symbiote-current hight,collaped height,height for export,etc.___________________

        symbioteRef.VERIFICATION_THREAD = await metadata.get(controllerAddr+'/VT').catch(e=>
            
            e.notFound
            ?
            {COLLAPSED_HASH:'Poyekhali!@Y.A.Gagarin',COLLAPSED_INDEX:-1,DATA:{},CHECKSUM:''}//initial
            :
            (LOG(`Some problem with loading metadata of verification thread\nSymbiote:${controllerAddr}\nError:${e}`,'F'),process.exit(124))
                        
        )








        //_____Load security stuff-check if stop was graceful,canary is present,should we reload the state and so on_____




        //These options only for Controller
        //Due to phantom blocks,we'll generate blocks faster than state become verified,that's why we need two extra properties
        if(symbioteConfig.CONTROLLER.ME){

            symbioteRef.GENERATION_THREAD = await metadata.get(controllerAddr+'/GT').catch(e=>
            
                e.notFound
                ?
                {
                    PREV_HASH:`Poyekhali!@Y.A.Gagarin`,//Genesis hash
                    NEXT_INDEX:0//So the first block will be with index 0
                }
                :
                (LOG(`Some problem with loading metadata of generation thread\nSymbiote:${controllerAddr}\nError:${e}`,'F'),process.exit(125))
                            
            )


            let nextIsPresent = await symbioteRef.CONTROLLER_BLOCKS.get(symbioteRef.GENERATION_THREAD.NEXT_INDEX).catch(e=>false),//OK is in case of absence of next block

                previous=await symbioteRef.CONTROLLER_BLOCKS.get(symbioteRef.GENERATION_THREAD.NEXT_INDEX-1).catch(e=>false)//but current block should present at least locally

        

            if(nextIsPresent || !(symbioteRef.GENERATION_THREAD.NEXT_INDEX===0 || symbioteRef.GENERATION_THREAD.PREV_HASH === BLAKE3( JSON.stringify(previous.a) + controllerAddr + previous.i + previous.p))){
            
                initSpinner.stop()

                LOG(`Something wrong with a sequence of generation thread on \x1b[36;1m${SYMBIOTE_ALIAS(controllerAddr)}`,'F')
                
                process.exit(125)

            }

            
        }
        
        


        //If we just start verification thread, there is no sense to do following logic
        if(symbioteRef.VERIFICATION_THREAD.COLLAPSED_INDEX!==-1){

            await metadata.get(controllerAddr+'/CANARY').then(async canary=>{

                let verifThread=symbioteRef.VERIFICATION_THREAD
    
                //If staging zone is OK
                if(verifThread.CHECKSUM===BLAKE3(JSON.stringify(verifThread.DATA)+verifThread.COLLAPSED_INDEX+verifThread.COLLAPSED_HASH)){

                    //This is the signal that we should rewrite state changes from the staging zone
                    if(canary!==symbioteRef.VERIFICATION_THREAD.CHECKSUM){

                        initSpinner.stop()
    
                        LOG(`Load state data from staging zone on \x1b[32;1m${SYMBIOTE_ALIAS(controllerAddr)}`,'I')
                        
                        let promises=[]
    
                        Object.keys(symbioteRef.VERIFICATION_THREAD.DATA).forEach(
                            
                            address => promise.push(symbioteRef.STATE.put(address,symbioteRef.VERIFICATION_THREAD.DATA[address]))
                            
                        )

                        await Promise.all(promises).catch(e=>{

                            LOG(`Problems with loading state from staging zone of verification thread on \x1b[36;1m${SYMBIOTE_ALIAS(controllerAddr)}\x1b[31;1m\n${e}`,'F')

                            process.exit(133)

                        })
    
                    }
                    
                }else{

                    initSpinner.stop()
    
                    LOG(`Problems with staging zone of verification thread on \x1b[36;1m${SYMBIOTE_ALIAS(controllerAddr)}`,'W')

                    await RELOAD_STATE(controllerAddr,symbioteRef)

                }
    
            }).catch(async e=>{
    
                initSpinner.stop()

                LOG(fs.readFileSync(PATH_RESOLVE('images/events/canaryDied.txt')).toString(),'CD')
    
                LOG(`Problems with canary on \x1b[36;1m${SYMBIOTE_ALIAS(controllerAddr)}\n${e}`,'W')
    
                //Reset verification breakpoint
                await RELOAD_STATE(controllerAddr,symbioteRef)
    
            })    

        }else {

            //Clear previous state to avoid mistakes
            symbioteRef.STATE.clear()

            //Load data from genesis state(initial values)
            await RELOAD_STATE(controllerAddr,symbioteRef)

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

            
            let way=CONFIG.TYPES_PREFIXES[symbioteConfig.MANIFEST.HOSTCHAINS[tickers[i]].TYPE]


            //Depending on TYPE load appropriate module
            if(CONFIG.EVM.includes(tickers[i])){
            
                EvmHostChain=(await import(`./KLY_Hostchains/${way}/evm.js`)).default
                
                hostchainmap.set(tickers[i],new EvmHostChain(controllerAddr,tickers[i]))

            }else hostchainmap.set(tickers[i],(await import(`./KLY_Hostchains/${way}/${tickers[i]}.js`)).default)



            hostchains.set(controllerAddr,hostchainmap)

            //hostchains.set(controllerAddr,tickers[i],(await import(`./KLY_Hostchains/${tickers[i]}.js`)).default)//load module
            
            //Load canary
            symbioteRef.HOSTCHAINS_WORKFLOW[tickers[i]]=await symbioteRef.HOSTCHAINS_DATA.get(tickers[i]).catch(e=>(  {KLYNTAR_HASH:'',INDEX:0,HOSTCHAIN_HASH:'',SIG:''}  ))

        }




        //___________________Decrypt all private keys(for Klyntar and hostchains) to memory of process___________________


        await DECRYPT_KEYS(controllerAddr,initSpinner).then(()=>
        
            //Print just first few bytes of keys to view that they were decrypted well.Looks like checksum
            LOG(`Private key on \x1b[36;1m${SYMBIOTE_ALIAS(controllerAddr)}\x1b[32;1m was decrypted successfully`,'S')        
        
        ).catch(e=>{
        
            LOG(`Keys decryption failed.Please,check your password carefully.In the worst case-use your decrypted keys from safezone and repeat procedure of encryption via REPL\n${e}`,'F')
     
            process.exit(100)
    
        })




        //___________________________________________Load data from hostchains___________________________________________

        //TODO:Add more advanced info    
        if(symbioteConfig.CONTROLLER.ME){

            
            for(let i=0,l=tickers.length;i<l;i++){

                let spinner = ora({
                    color:'red',
                    prefixText:`\u001b[38;5;23m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]  \x1b[36;1mGetting balance for \x1b[32;1m${tickers[i]}\x1b[36;1m - keep waiting\x1b[0m`
                }).start()


                let balance=await hostchains.get(controllerAddr).get(tickers[i]).getBalance(controllerAddr)

                spinner.stop()

                LOG(`Balance of controller on hostchain \x1b[32;1m${
                    
                    tickers[i]
                
                }\x1b[36;1m is \x1b[32;1m${
                    
                    balance
                
                }   \x1b[36;1m[${symbioteConfig.STOP_PUSH_TO_HOSTCHAINS[tickers[i]]?'\x1b[31;1mSTOP':'\x1b[32;1mPUSH'}\x1b[36;1m]`,'I')

            }

            LOG(`Canary is \x1b[32;1m<OK> \x1b[36;1mon \x1b[32;1m${SYMBIOTE_ALIAS(controllerAddr)}`,'I')


            //Ask to approve current set of hostchains
            
            await new Promise(resolve=>
        
                readline.createInterface({input:process.stdin, output:process.stdout, terminal:false})
                
                .question(`\n ${'\u001b[38;5;23m'}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${'\x1b[36;1m'}  Do you agree with the current set of hostchains? Print \x1b[32;1mYES\x1b[36;1m to continue ———> \x1b[0m`,resolve)
                    
            ).then(answer=>answer!=='YES'&& process.exit(126))

  
        }
        
        SIG_PROCESS[controllerAddr]={VERIFY:false,GENERATE:false}//we should track events in both threads-as in verification,as in generation

    },




    FLUSH_ADVANCED_CACHE=()=>{

        //Do not pass params via arguments due to make labels shorter+not to make mistakes with values and references
        let cache=ACCOUNTS,
            
            shouldStop='CLEAR_TIMEOUT_ACCOUNTS_CACHE',
            
            stopLabel='STOP_FLUSH_ACCOUNTS_CACHE',
            
            {FLUSH_LIMIT,TTL}=CONFIG.CACHES.ACCOUNTS



        LOG('Going to flush accounts cache...','I')
  
        //Go through slice(from the beginning(least used) to <FLUSH_LIMIT>) of accounts in cache
        for(let i=0,l=Math.min(cache.cache.size,FLUSH_LIMIT);i<l;i++){
    
            let oldKey=cache.cache.keys().next().value,
                
                data=cache.cache.get(oldKey)
    
            //Immediately add key(address) to stoplist to prevent access and race condition while account's state are going to be written and commited(with current nonce etc.)
            cache.stoplist.add(oldKey)
                
            cache.cache.delete(oldKey)
            
            cache.db.put(oldKey,data).then(()=>cache.stoplist.delete(oldKey))
        
        }
    
        //We can dynamically change the time,limits,etc.
        global[stopLabel]=setTimeout(()=>FLUSH_ADVANCED_CACHE(),TTL)

        //Can be dynamically stopped via API or script from custom collection
        global[shouldStop]&&clearTimeout(global[stopLabel])
    
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

                        LOG(`Klyntar logging was stopped for ${SYMBIOTE_ALIAS(symbiote)} ${e?'\n'+e:''}`,'I')

                        resolve()
                    
                    }))
                    
                )
                
            )

            await Promise.all(streamsPromises).then(_=>{

                LOG('Node was gracefully stopped','I')
                
                process.exit(0)

            })

        }

    },500)

}



//Define listeners on typical signals to safely stop the node
process.on('SIGTERM',graceful)
process.on('SIGINT',graceful)
process.on('SIGHUP',graceful)


//************************ END SUB ************************



//________________________________________________SHARED RESOURCES______________________________________________




global.PRIVATE_KEYS=new Map()

global.ACCOUNTS=new AdvancedCache(CONFIG.CACHES.ACCOUNTS.SIZE,space)//quick access to accounts in different symbiotes and to fetch zero level data


global.SIG_SIGNAL=false

global.SIG_PROCESS={}


global.SYMBIOTES_LOGS_STREAMS=new Map()




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
    
        setTimeout(()=>{ animation.stop() ; r() },CONFIG.ANIMATION_DURATION)
    
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
    
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/start.txt')).toString(),'S')
    



//_____________________________________________ADVANCED PREPARATIONS____________________________________________




    //If some chain marked as "STOP",we don't prepare something for it,otherwise-force preparation work
    let controllers=Object.keys(CONFIG.SYMBIOTES)



    
    //.forEach has inner scope,but we need await on top frame level
    for(let i=0;i<controllers.length;i++) !CONFIG.SYMBIOTES[controllers[i]].STOP_CHAIN&&await PREPARE_SYMBIOTE(controllers[i])




    
    global.GUID=BASE64(c.randomBytes(64))

    LOG(`Updated \x1b[36;1mGUID\x1b[32;1m is ———> \x1b[36;1m${GUID}`,'S')
    



    //Make this shit for memoization and not to repeate .stringify() within each request.Some kind of caching
    //BTW make it global to dynamically change it in the onther modules
    global.INFO=JSON.stringify({GUID,...CONFIG.INFO})
    



//____________________________________________ASK FOR FINAL AGREEMENT____________________________________________




    console.log('\n\n\n')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/serverConfigs.txt')).toString().replaceAll('@','\x1b[31m@\x1b[32m').replaceAll('Check the configs carefully','\u001b[38;5;50mCheck the configs carefully\x1b[32m'),'S')

    LOG(`\u001b[38;5;202mTLS\u001b[38;5;168m is \u001b[38;5;50m${CONFIG.TLS_ENABLED?'enabled':'disabled'}`,'CON')
    
    await CHECK_UPDATES()

    LOG(`Server configuration is ———> \u001b[38;5;50m${CONFIG.INTERFACE}:${CONFIG.PORT}`,'CON')

    LOG(`Custom runned modules(${CONFIG.RUN_CUSTOM.length}) are ———> \u001b[38;5;50m${CONFIG.RUN_CUSTOM.join(' \u001b[38;5;202m<>\u001b[38;5;50m ')}`,'CON')




    await new Promise(resolve=>
        
        readline.createInterface({input:process.stdin, output:process.stdout, terminal:false})
    
        .question(`\n ${'\u001b[38;5;23m'}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${'\x1b[36;1m'}  Do you agree with the current configuration? Print \x1b[32;1mYES\x1b[36;1m to continue ———> \x1b[0m`,resolve)
        
    ).then(answer=>answer!=='YES'&& process.exit(126))



    //Run custom modules
    //To load them one by one,use top level await,so we need "for...of"
    for(let scriptPath of CONFIG.RUN_CUSTOM){

        await import(`./KLY_Custom/${scriptPath}`).catch(
            
            e => LOG(`Some error has been occured in process of module \u001b[38;5;50m${scriptPath}\x1b[31;1m load\n${e}\n`,'F')
            
        )

    }
    


    //Get urgent state and go on!
    await RENAISSANCE()


    //...and start this stuff.Note-if TTL is 0-there won't be any auto flush.Also,there is ability to start this process further,in runtime,so let it be
    CONFIG.CACHES.ACCOUNTS.TTL!==0
    &&
    setTimeout(()=>FLUSH_ADVANCED_CACHE(),CONFIG.CACHES.ACCOUNTS.DELAY)




//_______________________________________________GET SERVER ROUTES______________________________________________




//Load route modules
let {W}=await import('./KLY_Routes/control.js'),
    {M}=await import('./KLY_Routes/main.js'),
    {A}=await import('./KLY_Routes/api.js')




//_____________________________________________________MAIN_____________________________________________________

//...And only after that we start routes


UWS[CONFIG.TLS_ENABLED?'SSLApp':'App'](CONFIG.TLS_CONFIGS)



.post('/changesid',M.changeSid)

.post('/cb',M.controllerBlock)

.post('/ib',M.instantBlock)

.post('/addnode',M.addNode)

.post('/getsid',M.getSid)

.post('/proof',M.proof)

.post('/event',M.event)




//_____________________________________________________CONTROL_____________________________________________________


//.post('/change',W.change)

.post('/con',W.config)

//.post('/view',W.view)


//_______________________________________________________API_______________________________________________________




.get('/multiplicity/:symbiote/:fromHeigth',A.multiplicity)

.get('/account/:symbiote/:address',A.acccount)

.get('/nodes/:symbiote/:region',A.nodes)

.get('/block/:symbiote/:type/:id',A.block)

.get('/local/:address',A.local)

.post('/alert',A.alert)

.get('/i',A.info)








.listen(CONFIG.INTERFACE,CONFIG.PORT,ok=>
    
    ok ? LOG(`Node started on ———> \x1b[36;1m${CONFIG.INTERFACE}:${CONFIG.PORT}`,'S') : LOG('Oops,some problems with server module','F')
    
)




})()