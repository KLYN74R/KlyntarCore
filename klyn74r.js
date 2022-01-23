#!/usr/bin/env node

import {BASE64,CHAIN_LABEL,LOG,DECRYPT_KEYS,BLAKE3,PATH_RESOLVE} from './KLY_Space/utils.js'

import AdvancedCache from './KLY_Essences/advancedcache.js'

import {RENAISSANCE} from './KLY_Process/life.js'

import chalkAnimation from 'chalk-animation'

import UWS from 'uWebSockets.js'

import readline from 'readline'

import c from 'crypto'

import ora from 'ora'

import l from 'level'

import fs from 'fs'





/* OBLIGATORY PATH RESOLUTION*/
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
TODO:Завтра попробовать с несколькими нодами-протестировать как они добавляются/удаляются/обмениваются данными





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


//*Динамическая работа с теми пунктами что в dynconfigs.txt и динамическое удаление/добавление категорий новостей IE
//?Так же будет полезно при контейнеризации и масштабировании

//*Чистка цепочки будет поэлементной.Хочешь-удаляй блоки,но состояние храни и тд




//_________________________________________________CONSTANTS_POOL_______________________________________________




//Check the Roadmap,documentation,official sources,etc. to get more | Смотрите Roadmap проекта,документацию,официальные источники и тд. чтобы узнать больше

export let

    chains=new Map(),//Mapping(CONTROLLER_ADDRESS(ex.DJBTwMSwyw/Zv3ct3cO83qFc6xWfWmd6+Rpfmy1rJho=)=>{BLOCKS:DB_INSTANCE,STATE:DB_INSTANCE,...})
    
    hostchains=new Map(),//To integrate with other explorers,daemons,API,gateways,NaaS etc.
    
    metadata=l(PATH_RESOLVE('M/METADATA'),{valueEncoding:'json'}),//For chains metadata flows e.g. generation flow,verification flow,staging etc.
       
    space=l(PATH_RESOLVE('M/SPACE'),{valueEncoding:'json'}),//To store zero level data of accounts i.e SpaceID,Roles flags,private nonce etc and data on different chains
    


    RELOAD_STATE=async(chain,chainRef)=>{

        //Reset verification breakpoint
        await chainRef.STATE.clear()

        chainRef.VERIFICATION_THREAD={COLLAPSED_HASH:'Poyekhali!@Y.A.Gagarin',COLLAPSED_INDEX:-1,DATA:{},CHECKSUM:''}
        

        
        //Load genesis state or data from backups(not to load state from the beginning)
        let genesis=JSON.parse(fs.readFileSync(PATH_RESOLVE(`/C/${Buffer.from(chain,'base64').toString('hex')}/genesis.json`))),

            promises=[]
        
        Object.keys(genesis).forEach(
            
            address => promises.push(chainRef.STATE.put(address,genesis[address].B))
            
        )

        await Promise.all(promises)
        

    },


    PREPARE_CHAIN=async controllerAddr=>{


        //Loading spinner

        let initSpinner = ora({
            color:'red',
            prefixText:`\u001b[38;5;23m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]  \x1b[36;1mPreparing chain \x1b[32;1m${CHAIN_LABEL(controllerAddr)}\x1b[0m`
        }).start(),

        


        //____________________________________________Prepare structures_________________________________________________


        chainConfig=CONFIG.CHAINS[controllerAddr]


        chains.set(controllerAddr,{
            
            //Create txs mempools-to add transactions on this chain.Both types-"DTXS" for default and "STXS"-with signatures
            MEMPOOL_DTXS:[],
            MEMPOOL_STXS:[],
            
            //Finally-create mapping to optimize processes while we check blocks-not to read/write to db many times
            ACCOUNTS:new Map(),// ADDRESS => { ACCOUNT_STATE , NONCE_SET , NONCE_DUPLICATES , OUT }

            BLACKLIST:new Set(),//To sift addresses which spend more than has when we check another ControllerBlock

            //Peers to exchange data with
            NEAR:[]

        })
        



        let chainRef=chains.get(controllerAddr),hexPath=Buffer.from(controllerAddr,'base64').toString('hex')

        //OnlyLinuxFans.Due to incapsulation level we need to create sub-level directory for each chain
        !fs.existsSync(PATH_RESOLVE(`C/${hexPath}`)) && fs.mkdirSync(PATH_RESOLVE(`C/${hexPath}`))




        //______________________________________Prepare databases and storages___________________________________________




        //Create subdirs due to rational solutions
        chainRef.CONTROLLER_BLOCKS=l(PATH_RESOLVE(`C/${hexPath}/CONTROLLER_BLOCKS`),{valueEncoding:'json'})//For Controller's blocks(key is index)
        
        chainRef.INSTANT_BLOCKS=l(PATH_RESOLVE(`C/${hexPath}/INSTANT_BLOCKS`),{valueEncoding:'json'})//For Instant(key is hash)
        
        chainRef.HOSTCHAINS_DATA=l(PATH_RESOLVE(`C/${hexPath}/HOSTCHAINS_DATA`),{valueEncoding:'json'})//To store external flow of commits for ControllerBlocks
        
        chainRef.CANDIDATES=l(PATH_RESOLVE(`C/${hexPath}/CANDIDATES`),{valueEncoding:'json'})//For candidates(key is a hash(coz it's also InstantBlocks,but yet not included to chain))
        
        chainRef.STATE=l(PATH_RESOLVE(`C/${hexPath}/STATE`),{valueEncoding:'json'})//State of accounts
        



        //________________Load metadata about chain-current hight,collaped height,height for export,etc.___________________

        chainRef.VERIFICATION_THREAD = await metadata.get(controllerAddr+'/VT').catch(e=>
            
            e.notFound
            ?
            {COLLAPSED_HASH:'Poyekhali!@Y.A.Gagarin',COLLAPSED_INDEX:-1,DATA:{},CHECKSUM:''}//initial
            :
            (LOG(`Some problem with loading metadata of verification thread\nChain:${controllerAddr}\nError:${e}`,'F'),process.exit(124))
                        
        )








        //_____Load security stuff-check if stop was graceful,canary is present,should we reload the state and so on_____




        //These options only for Controller
        //Due to phantom blocks,we'll generate blocks faster than state become verified,that's why we need two extra properties
        if(chainConfig.CONTROLLER.ME){

            chainRef.GENERATION_THREAD = await metadata.get(controllerAddr+'/GT').catch(e=>
            
                e.notFound
                ?
                {
                    PREV_HASH:`Poyekhali!@Y.A.Gagarin`,//Genesis hash
                    NEXT_INDEX:0//So the first block will be with index 0
                }
                :
                (LOG(`Some problem with loading metadata of generation thread\nChain:${controllerAddr}\nError:${e}`,'F'),process.exit(125))
                            
            )


            let nextIsPresent = await chainRef.CONTROLLER_BLOCKS.get(chainRef.GENERATION_THREAD.NEXT_INDEX).catch(e=>false),//OK is in case of absence of next block

                previous=await chainRef.CONTROLLER_BLOCKS.get(chainRef.GENERATION_THREAD.NEXT_INDEX-1).catch(e=>false)//but current block should present at least locally

        

            if(nextIsPresent || !(chainRef.GENERATION_THREAD.NEXT_INDEX===0 || chainRef.GENERATION_THREAD.PREV_HASH === BLAKE3( JSON.stringify(previous.a) + controllerAddr + previous.i + previous.p))){
            
                initSpinner.stop()

                LOG(`Something wrong with a sequence of generation thread on \x1b[36;1m${CHAIN_LABEL(controllerAddr)}`,'F')
                
                process.exit(125)

            }

            
        }
        
        


        //If we just start verification thread, there is no sense to do following logic
        if(chainRef.VERIFICATION_THREAD.COLLAPSED_INDEX!==-1){

            await metadata.get(controllerAddr+'/CANARY').then(async canary=>{

                let verifThread=chainRef.VERIFICATION_THREAD
    
                //If chunk is OK
                if(verifThread.CHECKSUM===BLAKE3(JSON.stringify(verifThread.DATA)+verifThread.COLLAPSED_INDEX+verifThread.COLLAPSED_HASH)){

                    //This is the signal that we should rewrite state changes from 
                    if(canary!==chainRef.VERIFICATION_THREAD.CHECKSUM){

                        initSpinner.stop()
    
                        LOG(`Load state data from staging zone on \x1b[32;1m${CHAIN_LABEL(controllerAddr)}`,'I')
    
                        Object.keys(chainRef.VERIFICATION_THREAD.DATA).forEach(
                            
                            address => chainRef.STATE.put(address,chainRef.VERIFICATION_THREAD.DATA[address])
                            
                        )
    
                    }
                    
                }else{

                    initSpinner.stop()
    
                    LOG(`Problems with staging zone of verification thread on \x1b[36;1m${CHAIN_LABEL(controllerAddr)}`,'W')

                    await RELOAD_STATE(controllerAddr,chainRef)

                }
    
            }).catch(e=>{
    
                initSpinner.stop()
    
                LOG(`Problems with canary on \x1b[36;1m${CHAIN_LABEL(controllerAddr)}\n${e}`,'W')
    
                //Reset verification breakpoint
                await RELOAD_STATE(controllerAddr,chainRef)
    
            })    

        }else {

            //Clear previous state to avoid mistakes
            chainRef.STATE.clear()

            //Load data from genesis state(initial values)
            await RELOAD_STATE(controllerAddr,chainRef)

        }




        chainRef.INSTANT_CANDIDATES=new Map()//mapping(hash=>creator)


        //Clear,to not store OUT-OF-CHAIN blocks
        //*UPD:Node operators should run cleaning time by time
        //chainRef.CANDIDATES.clear()

        


        //__________________________________Load modules to work with hostchains_________________________________________


        //...and push template to global HOSTCHAINS_DATA object to control the flow


        let tickers=Object.keys(chainConfig.MANIFEST.HOSTCHAINS),EvmHostChain,hostchainmap=new Map()


        chainRef.HOSTCHAINS_WORKFLOW={}


        //Add hostchains to mapping
        //Load way to communicate with hostchain via appropriate type
        for(let i=0,l=tickers.length;i<l;i++){

            
            let way=CONFIG.TYPES_PREFIXES[chainConfig.MANIFEST.HOSTCHAINS[tickers[i]].TYPE]


            //Depending on TYPE load appropriate module
            if(CONFIG.EVM.includes(tickers[i])){
            
                EvmHostChain=(await import(`./KLY_Hostchains/${way}/evm.js`)).default
                
                hostchainmap.set(tickers[i],new EvmHostChain(controllerAddr,tickers[i]))

            }else hostchainmap.set(tickers[i],(await import(`./KLY_Hostchains/${way}/${tickers[i]}.js`)).default)



            hostchains.set(controllerAddr,hostchainmap)

            //hostchains.set(controllerAddr,tickers[i],(await import(`./KLY_Hostchains/${tickers[i]}.js`)).default)//load module
            
            //Load canary
            chainRef.HOSTCHAINS_WORKFLOW[tickers[i]]=await chainRef.HOSTCHAINS_DATA.get(tickers[i]).catch(e=>(  {KLYNTAR_HASH:'',INDEX:0,HOSTCHAIN_HASH:'',SIG:''}  ))

        }




        //___________________Decrypt all private keys(for Klyntar and hostchains) to memory of process___________________


        await DECRYPT_KEYS(controllerAddr,initSpinner).then(()=>
        
            //Print just first few bytes of keys to view that they were decrypted well.Looks like checksum
            LOG(`Private key on \x1b[36;1m${CHAIN_LABEL(controllerAddr)}\x1b[32;1m was decrypted ———> \x1b[36;1m${chainConfig.PRV.slice(0,10)}...`,'S')        
        
        ).catch(e=>{
        
            LOG(`Keys decryption failed.Please,check your password carefully.In the worst case-use your decrypted keys from safezone and repeat procedure of encryption via REPL\n${e}`,'F')
     
            process.exit(100)
    
        })




        //___________________________________________Load data from hostchains___________________________________________

        //TODO:Add more advanced info    
        if(chainConfig.CONTROLLER.ME){

            
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
                
                }   \x1b[36;1m[${chainConfig.STOP_PUSH_TO_HOSTCHAINS[tickers[i]]?'\x1b[31;1mSTOP':'\x1b[32;1mPUSH'}\x1b[36;1m]`,'I')

            }

            LOG(`Canary is \x1b[32;1m<OK> \x1b[36;1mon \x1b[32;1m${CHAIN_LABEL(controllerAddr)}`,'I')


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

        //Can be dynamically stopped
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
    setInterval(()=>{

        //Each subprocess in each symbiote must be stopped
        if(Object.keys(SIG_PROCESS).every(chain => Object.values(SIG_PROCESS[chain]).every(x=>x))){

            console.log('\n')

            LOG('Node was gracefully stopped','I')
        
            process.exit(0)
    
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

global.ACCOUNTS=new AdvancedCache(CONFIG.CACHES.ACCOUNTS.SIZE,space)//quick access to accounts in different chains and to fetch zero level data


global.SIG_SIGNAL=false

global.SIG_PROCESS={}


//Location for chains
!fs.existsSync(PATH_RESOLVE('C'))&&fs.mkdirSync(PATH_RESOLVE('C'));








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
    let controllers=Object.keys(CONFIG.CHAINS)



    
    //.forEach has inner scope,but we need await on top frame level
    for(let i=0;i<controllers.length;i++) !CONFIG.CHAINS[controllers[i]].STOP_CHAIN&&await PREPARE_CHAIN(controllers[i])




    
    global.GUID=BASE64(c.randomBytes(64))

    LOG(`Updated \x1b[36;1mGUID\x1b[32;1m is ———> \x1b[36;1m${GUID}`,'S')
    



    //Make this shit for memoization and not to repeate .stringify() within each request.Some kind of caching
    //BTW make it global to dynamically change it in the onther modules
    global.INFO=JSON.stringify({GUID,...CONFIG.INFO})


    //Get urgent state and go on!
    await RENAISSANCE()



    
//_______________________________________________GET SERVER ROUTES______________________________________________




let {W}=await import('./KLY_Routes/control.js'),
    {M}=await import('./KLY_Routes/main.js'),
    {A}=await import('./KLY_Routes/api.js')




//_____________________________________________START EXPORT PROCESSES___________________________________________


    
    global.BRANCHCOMS_CONTROL=[]
    global.STORE_CONTROL=[]




    //...and start this stuff.Note-if TTL is 0-there won't be any auto flush.Also,there is ability to start this process further,in runtime,so let it be
    CONFIG.CACHES.ACCOUNTS.TTL!==0
    &&
    setTimeout(()=>FLUSH_ADVANCED_CACHE(),CONFIG.CACHES.ACCOUNTS.DELAY)



    

    







//_____________________________________________________MAIN_____________________________________________________

//...And only after that we start routes

CONFIG.TLS_ENABLED ? LOG('TLS is enabled!','S') : LOG('TLS is disabled','W')

UWS[CONFIG.TLS_ENABLED?'SSLApp':'App'](CONFIG.TLS_CONFIGS)



.post('/cb',M.controllerBlock)

.post('/sd',M.startSpaceId)

.post('/ib',M.instantBlock)

.post('/addnode',M.addNode)

.post('/sc',M.spaceChange)

.post('/proof',M.proof)

.post('/tx',M.tx)




//_____________________________________________________CONTROL_____________________________________________________


//.post('/change',W.change)

.post('/con',W.config)

//.post('/view',W.view)


//_______________________________________________________API_______________________________________________________




.get('/multiplicity/:chain/:fromHeigth',A.multiplicity)

.get('/account/:chain/:address',A.acccount)

.get('/nodes/:symbiote/:region',A.nodes)

.get('/block/:chain/:type/:id',A.block)

//Send address in hex format.Use Buffer.from('<YOUR ADDRESS>','base64').toString('hex')
.get('/local/:address',A.local)

.post('/alert',A.alert)

.get('/i',A.info)








.listen(CONFIG.INTERFACE,CONFIG.PORT,ok=>
    
    ok ? LOG(`Node started on ———> \x1b[36;1m${CONFIG.INTERFACE}:${CONFIG.PORT}`,'S') : LOG('Oops,some problems with server module','F')
    
)




})()