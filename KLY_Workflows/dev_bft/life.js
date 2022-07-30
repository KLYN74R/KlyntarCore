import {LOG,SYMBIOTE_ALIAS,PATH_RESOLVE,BLAKE3} from '../../KLY_Utils/utils.js'

import {BROADCAST,DECRYPT_KEYS,BLOCKLOG,SIG, VERIFY} from './utils.js'

import {GET_BLOCKS_FOR_GENERATION_THREAD, START_VERIFY_POLLING} from './verification.js'

import Block from './essences/block.js'

import UWS from 'uWebSockets.js'

import fetch from 'node-fetch'

import ora from 'ora'

import l from 'level'

import fs from 'fs'




//______________________________________________________________VARIABLES POOL___________________________________________________________________


//++++++++++++++++++++++++ Define general global object  ++++++++++++++++++++++++

//Open writestream in append mode
global.SYMBIOTE_LOGS_STREAM=fs.createWriteStream(process.env.LOGS_PATH+`/symbiote.log`),{flags:'a+'}

global.THREADS_STILL_WORKS={VERIFICATION:false,GENERATION:false}

global.SYSTEM_SIGNAL_ACCEPTED=false

//To stop/start block generation
global.STOP_GEN_BLOCK={}

//Your decrypted private key
global.PRIVATE_KEY=null

global.SIG_PROCESS={}





//*********************** SET HANDLERS ON USEFUL SIGNALS ************************



let graceful=()=>{
    
    SYSTEM_SIGNAL_ACCEPTED=true

    console.log('\n')

    LOG('KLYNTAR stop has been initiated.Keep waiting...','I')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/termination.txt')).toString(),'W')
    
    //Probably stop logs on this step
    setInterval(async()=>{

        //Each subprocess in each symbiote must be stopped
        if(!THREADS_STILL_WORKS.GENERATION && !THREADS_STILL_WORKS.VERIFICATION || Object.values(SIG_PROCESS[symbiote]).every(x=>x)){

            console.log('\n')




            //Close logs streams
            await new Promise( resolve => SYMBIOTE_LOGS_STREAM.close( error => {

                LOG(`Logging was stopped for ${SYMBIOTE_ALIAS()} ${error?'\n'+error:''}`,'I')

                resolve()
            
            }))

            LOG('Server stopped','I')

            global.UWS_DESC&&UWS.us_listen_socket_close(UWS_DESC)


            LOG('Node was gracefully stopped','I')
                
            process.exit(0)

        }

    },200)

}



//Define listeners on typical signals to safely stop the node
process.on('SIGTERM',graceful)
process.on('SIGINT',graceful)
process.on('SIGHUP',graceful)


//************************ END SUB ************************









//________________________________________________________________INTERNAL_______________________________________________________________________



//TODO:Add more advanced logic(e.g number of txs,ratings,etc.)
let GET_EVENTS = () => SYMBIOTE_META.MEMPOOL.splice(0,CONFIG.SYMBIOTE.MANIFEST.EVENTS_LIMIT_PER_BLOCK),



GEN_BLOCK_START=async()=>{

    if(!SYSTEM_SIGNAL_ACCEPTED){

        //With this we say to system:"Wait,we still processing the block"
        THREADS_STILL_WORKS.GENERATION=true
    
        await GEN_BLOCK()

        STOP_GEN_BLOCKS_CLEAR_HANDLER=setTimeout(()=>GEN_BLOCK_START(),CONFIG.SYMBIOTE['BLOCK_GENERATION_TIME'])
    
        CONFIG.SYMBIOTE.STOP_GENERATE_BLOCKS
        &&
        clearTimeout(STOP_GEN_BLOCKS_CLEAR_HANDLER)
      
    }else{

        LOG(`Block generation for \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[36;1m was stopped`,'I',CONFIG.SYMBIOTE.SYMBIOTE_ID)

        SIG_PROCESS.GENERATE=true

    }

    //leave function
    THREADS_STILL_WORKS.GENERATION=false
    
},




RUN_POLLING=async()=>{

    LOG(`Local state collapsed on \x1b[36;1m${SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX}\x1b[32;1m for \x1b[36;1m${SYMBIOTE_ALIAS()}`,'S')

    START_VERIFY_POLLING()

}








//________________________________________________________________EXTERNAL_______________________________________________________________________




export let GEN_BLOCK = async () => {


    /*
    _________________________________________GENERATE PORTION OF BLOCKS___________________________________________
    
    Initially, we check if it's your turn to generate block - if your pubkey was choosen as a master validator - then you can produce set of phantom blocks
    
    */

    if(SYMBIOTE_META.GENERATION_THREAD.MASTER_VALIDATOR!==CONFIG.SYMBIOTE.PUB) return

    
    /*
    _________________________________________GENERATE PORTION OF BLOCKS___________________________________________
    
    Here we check how many transactions(events) we have locally and generate as many blocks as it's possible
    
    */

                
    let phantomBlocksNumber=Math.ceil(SYMBIOTE_META.MEMPOOL.length/CONFIG.SYMBIOTE.MANIFEST.EVENTS_LIMIT_PER_BLOCK),
    
        promises=[]//to push blocks to storage


    //If nothing to generate-then no sense to generate block,so return
    //if(phantomControllers===0) return 

    //Validator can't generate more blocks than epoch
    phantomBlocksNumber = phantomBlocksNumber > CONFIG.SYMBIOTE.MANIFEST.VALIDATOR_EPOCH_IN_BLOCKS ? CONFIG.SYMBIOTE.MANIFEST.VALIDATOR_EPOCH_IN_BLOCKS : phantomBlocksNumber + 1

    LOG(`Number of phantoms ${phantomBlocksNumber}`,'I')

    for(let i=0;i<phantomBlocksNumber;i++){


        let eventsArray=await GET_EVENTS(),
            
            blockCandidate=new Block(eventsArray),
                        
            hash=Block.genHash(blockCandidate.e,blockCandidate.i,SYMBIOTE_META.GENERATION_THREAD.PREV_HASH)
    
        blockCandidate.sig=await SIG(hash)
            
        BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m generated ——│\x1b[36;1m`,'S',hash,48,'\x1b[32m',blockCandidate)


        SYMBIOTE_META.GENERATION_THREAD.PREV_HASH=hash
 
        SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX++
 

        promises.push(SYMBIOTE_META.BLOCKS.put(blockCandidate.i,blockCandidate).then(()=>blockCandidate).catch(error=>{
                
            LOG(`Failed to store block ${blockCandidate.i} on ${SYMBIOTE_ALIAS()} \n${error}`,'F')

            process.emit('SIGINT',122)
            
        }))
           
    }


        

    //_______________________________________________COMMIT CHANGES___________________________________________________


    //Commit group of blocks by setting hash and index of the last one

    await Promise.all(promises).then(arr=>
            
            
        SYMBIOTE_META.METADATA.put('GT',SYMBIOTE_META.GENERATION_THREAD).then(()=>

            new Promise(resolve=>{

                //And here we should broadcast blocks
                arr.forEach(block=>
                    
                    Promise.all(BROADCAST('/block',block))
                    
                )


                //_____________________________________________PUSH TO HOSTCHAINS_______________________________________________
    
                //Push to hostchains due to appropriate symbiote
                Object.keys(CONFIG.SYMBIOTE.MANIFEST.HOSTCHAINS).forEach(async ticker=>{
    
                    //TODO:Add more advanced logic
                    if(!CONFIG.SYMBIOTE.STOP_HOSTCHAINS[ticker]){
    
                        let control=SYMBIOTE_META.HOSTCHAINS_WORKFLOW[ticker],
                        
                            hostchain=HOSTCHAIN.get(ticker),
    
                            //If previous push is still not accepted-then no sense to push new symbiote update
                            isAlreadyAccepted=await hostchain.checkTx(control.HOSTCHAIN_HASH,control.INDEX,control.KLYNTAR_HASH).catch(e=>false)
                        
                            


                        LOG(`Check if previous commit is accepted for \x1b[32;1m${SYMBIOTE_ALIAS()}\x1b[36;1m on \x1b[32;1m${ticker}\x1b[36;1m ~~~> \x1b[32;1m${
                                
                            control.KLYNTAR_HASH===''?'Just start':isAlreadyAccepted
                            
                        }`,'I')
    
                            


                        if(control.KLYNTAR_HASH===''||isAlreadyAccepted){

                            //If accpted-we can share to the rest
                            isAlreadyAccepted
                            &&
                            Promise.all(BROADCAST('/proof',{...control,symbiote:CONFIG.SYMBIOTE.SYMBIOTE_ID,ticker}))
                        

                            let index=SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX-1,

                                symbioticHash=await hostchain.sendTx(index,SYMBIOTE_META.GENERATION_THREAD.PREV_HASH).catch(e=>{
                                    
                                    LOG(`Error on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m with push to \x1b[36;1m${ticker} \n${e}`,'W')
                                
                                    return false
                                })
                    

                            if(symbioticHash){

                                LOG(`Commit on ${SYMBIOTE_ALIAS()}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m for block \x1b[36;1m${index}\x1b[32;1m is \x1b[36;1m${symbioticHash}`,'S')
                                //Commit localy that we have send it
                                control.KLYNTAR_HASH=SYMBIOTE_META.GENERATION_THREAD.PREV_HASH
                    
                                control.INDEX=index
                        
                                control.HOSTCHAIN_HASH=symbioticHash

                                control.SIG=await SIG(control.KLYNTAR_HASH+control.INDEX+control.HOSTCHAIN_HASH+ticker)
                                
                                await SYMBIOTE_META.HOSTCHAINS_DATA.put(index+ticker,{KLYNTAR_HASH:control.KLYNTAR_HASH,HOSTCHAIN_HASH:control.HOSTCHAIN_HASH,SIG:control.SIG})
                                            
                                        .then(()=>SYMBIOTE_META.HOSTCHAINS_DATA.put(ticker,control))//set such canary to avoid duplicates when quick reboot daemon
                        
                                        .then(()=>LOG(`Locally store pointer for \x1b[36;1m${index}\x1b[32;1m block of \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m on \x1b[36;1m${ticker}`,'S'))
                        
                                        .catch(e=>LOG(`Error-impossible to store pointer for \x1b[36;1m${index}\u001b[38;5;3m block of \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m on \x1b[36;1m${ticker}`,'W'))
    
    
                                }

                            LOG(`Balance on hostchain \x1b[32;1m${ticker}\x1b[36;1m is \x1b[32;1m${await hostchain.getBalance()}`,'I')
                        
                        }
    
                    }
                        
                })


                resolve()


            })


        ).catch(e=>{

            LOG(e,'F')
                    
            process.emit('SIGINT',114)

        })
        
    )

},




RELOAD_STATE = async() => {

    //Reset verification breakpoint
    await SYMBIOTE_META.STATE.clear()

    let promises=[],
    


        //Try to load snapshot metadata to use as last collapsed
        canary=await SYMBIOTE_META.SNAPSHOT.METADATA.get('CANARY').catch(e=>false),

        snapshotVT=await SYMBIOTE_META.SNAPSHOT.METADATA.get('VT').catch(e=>false),
    
        //Snapshot will never be OK if it's empty
        snapshotIsOk = snapshotVT.CHECKSUM===BLAKE3(JSON.stringify(snapshotVT.DATA)+snapshotVT.COLLAPSED_INDEX+snapshotVT.COLLAPSED_HASH+JSON.stringify(snapshotVT.VALIDATORS)+snapshotVT.MASTER_VALIDATOR+snapshotVT.EPOCH_START)//snapshot itself must be OK
                       &&
                       canary===snapshotVT.CHECKSUM//and we must be sure that no problems with staging zone,so snapshot is finally OK
                       &&
                       CONFIG.SYMBIOTE.SNAPSHOTS.ALL//we have no remote shards(first releases don't have these features)

        
       
    //Try to load from snapshot
    //If it was initial run-then we'll start from genesis state
    // If it's integrity problem - then we check if snapshot is OK-then we can load data from snapshot
    //In case when snapshot is NOT ok - go to else branch and start sync from the genesis
    
    if( snapshotIsOk ){


        SYMBIOTE_META.VERIFICATION_THREAD=snapshotVT

        let accs={},promises=[]

        await new Promise(
            
            resolve => SYMBIOTE_META.SNAPSHOT.STATE.createReadStream()
            
                                .on('data',data=>accs[data.key]=data.value)
                                
                                .on('close',resolve)
            
        )

        Object.keys(accs).forEach(addr=>promises.push(SYMBIOTE_META.STATE.put(addr,accs[addr])))

        await Promise.all(promises)
        
            .then(()=>SYMBIOTE_META.METADATA.put('CANARY',canary))

            .then(()=>SYMBIOTE_META.METADATA.put('VT',snapshotVT))

            .catch(e=>{

                LOG(`Problems with loading state from snapshot to state db \n${e}`,'F')

                process.exit(138)
            
            })


        LOG(`Successfully recreated state from snapshot`,'I')

    
    }else{

        //Otherwise start rescan form height=0
        SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX==-1 && SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX==0 ? LOG(`Initial run with no snapshot`,'I') : LOG(`Start sync from genesis`,'W')
        
        SYMBIOTE_META.VERIFICATION_THREAD={COLLAPSED_HASH:'Poyekhali!@Y.A.Gagarin',COLLAPSED_INDEX:-1,DATA:{},VALIDATORS:[],MASTER_VALIDATOR:'',EPOCH_START:0,CHECKSUM:''}

        
        
        //Load all the genesis files
        fs.readdirSync(process.env.GENESIS_PATH).forEach(file=>{

            //Load genesis state or data from backups(not to load state from the beginning)
            let genesis=JSON.parse(fs.readFileSync(process.env.GENESIS_PATH+`/${file}`))
        
            Object.keys(genesis.ACCOUNTS).forEach(
            
                address => promises.push(SYMBIOTE_META.STATE.put(address,genesis.ACCOUNTS[address]))
                
            )

            //Push the initial validators to verification thread
            SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.push(...genesis.VALIDATORS)

            //And set the initial master validator whose epoch starts with block height 0 
            SYMBIOTE_META.VERIFICATION_THREAD.MASTER_VALIDATOR=genesis.MASTER_VALIDATOR
            

        })

        await Promise.all(promises)
        
    }


},




PREPARE_SYMBIOTE=async()=>{

    //Loading spinner
    let initSpinner

    if(!CONFIG.PRELUDE.NO_SPINNERS){

        initSpinner = ora({
            color:'red',
            prefixText:`\u001b[38;5;${process.env.KLY_MODE==='main'?'23':'202'}m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})  \x1b[36;1mPreparing symbiote \x1b[32;1m${SYMBIOTE_ALIAS()}\x1b[0m`
        }).start()

        
    }
    


    //____________________________________________Prepare structures_________________________________________________



    //Contains default set of properties for major part of potential use-cases on symbiote
    global.SYMBIOTE_META={
        
        MEMPOOL:[],
        
        //Сreate mapping to optimize processes while we check blocks-not to read/write to db many times
        ACCOUNTS:new Map(),// ADDRESS => { ACCOUNT_STATE , NONCE_SET , NONCE_DUPLICATES , OUT , TYPE }

        EVENTS_STATE:new Map(),// EVENT_KEY(on symbiote) => EVENT_VALUE

        BLACKLIST:new Set(),//To sift addresses which spend more than has when we check another block

        //Peers to exchange data with
        NEAR:[]

    }



    
    //OnlyLinuxFans.Due to incapsulation level we need to create sub-level directory for each symbiote
    let pathes=[process.env.CHAINDATA_PATH,process.env.SNAPSHOTS_PATH]
    
    pathes.forEach(
        
        name => !fs.existsSync(`${name}`) && fs.mkdirSync(`${name}`)
        
    )
    

    //___________________________Load functionality to verify/filter/transform events_______________________________


    //Importnat and must be the same for symbiote at appropriate chunks of time
    await import(`./verifiers.js`).then(mod=>{
    
        SYMBIOTE_META.VERIFIERS=mod.VERIFIERS
        
        SYMBIOTE_META.SPENDERS=mod.SPENDERS    
        
    })

    //Might be individual for each node
    SYMBIOTE_META.FILTERS=(await import(`./filters.js`)).default;


    //______________________________________Prepare databases and storages___________________________________________

    


    //Create subdirs due to rational solutions
    [
        'METADATA',//important dir-contains canaries,pointer to VERIFICATION_THREAD and GENERATION_THREAD
    
        'BLOCKS',//For blocks(key is index)
        
        'HOSTCHAINS_DATA',//To store metadata from hostchains(proofs,refs,contract results and so on)
    
    ].forEach(
        
        dbName => SYMBIOTE_META[dbName]=l(process.env.CHAINDATA_PATH+`/${dbName}`,{valueEncoding:'json'})
        
    )

    
    /*
    
        ___________________________________________________State of symbiote___________________________________________________

                                *********************************************************************
                                *        THE MOST IMPORTANT STORAGE-basis for each symbiote         *
                                *********************************************************************



            Holds accounts state,balances,aliases,services & conveyors metadata and so on

            *Examples:

            0)Aliases of accounts & groups & contracts & services & conveyors & domains & social media usernames. Some hint to Web1337.Read more on our sources https://klyntar.org
    
        
                Single emoji refers to address and domain:❤️ => 0xd1ffa2d57241b01174db76b3b7123c3f707a12b91ddda00ea971741c94ab3578(Polygon contract,https://charity.health.com)

                Combo:🔥😈🔥 => PQTJJR4FZIDBLLKOUVAD7FUYYGL66TJUPDERHBTJUUTTIDPYPGGQ(Algorand address by Klyntar)
        
                Emoji ref to special signature type🌌 => aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa(Root of hashes tree mapped to conveyor set of addresses protected by hash-based post quantum signatures)

                Usernames(Twitter in this case) @jack => bc1qsmljf8cmfhul2tuzcljc2ylxrqhwf7qxpstj2a
            
            
            1)
    



    
    */


    SYMBIOTE_META.STATE=l(process.env.CHAINDATA_PATH+`/STATE`,{valueEncoding:'json'})
    
   

    //...and separate dirs for state and metadata snapshots

    SYMBIOTE_META.SNAPSHOT={

        METADATA:l(process.env.SNAPSHOTS_PATH+`/METADATA`,{valueEncoding:'json'}),

        STATE:l(process.env.SNAPSHOTS_PATH+`/STATE`,{valueEncoding:'json'})

    }



    
    //________________Load metadata about symbiote-current hight,collaped height,height for export,etc.___________________

    SYMBIOTE_META.VERIFICATION_THREAD = await SYMBIOTE_META.METADATA.get('VT').catch(e=>
        
        e.notFound
        ?
        {COLLAPSED_HASH:'Poyekhali!@Y.A.Gagarin',COLLAPSED_INDEX:-1,DATA:{},CHECKSUM:'',VALIDATORS:[],MASTER_VALIDATOR:'',EPOCH_START:0}//initial
        :
        (LOG(`Some problem with loading metadata of verification thread\nSymbiote:${SYMBIOTE_ALIAS()}\nError:${e}`,'F'),process.exit(124))
                    
    )








    //_____Load security stuff-check if stop was graceful,canary is present,should we reload the state and so on_____


    SYMBIOTE_META.GENERATION_THREAD = await SYMBIOTE_META.METADATA.get('GT').catch(e=>
    
        e.notFound
        ?
        {
            PREV_HASH:`Poyekhali!@Y.A.Gagarin`,//Genesis hash
            NEXT_INDEX:0//So the first block will be with index 0
        }
        :
        (LOG(`Some problem with loading metadata of generation thread\nSymbiote:${SYMBIOTE_ALIAS()}\nError:${e}`,'F'),process.exit(125))
                    
    )
    

    // let nextIsPresent = await SYMBIOTE_META.BLOCKS.get(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX).catch(e=>false),//OK is in case of absence of next block
        
    //     previous=await SYMBIOTE_META.BLOCKS.get(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX-1).catch(e=>false)//but current block should present at least locally


    // if(nextIsPresent || !(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX===0 || SYMBIOTE_META.GENERATION_THREAD.PREV_HASH === BLAKE3( JSON.stringify(previous.a) + CONFIG.SYMBIOTE.SYMBIOTE_ID + previous.i + previous.p))){
    
    //     initSpinner?.stop()
        
    //     LOG(`Something wrong with a sequence of generation thread on \x1b[36;1m${SYMBIOTE_ALIAS()}`,'F')
        
    //     process.exit(125)
    // }
    
    
    //________________________________________________________________MAKE SURE VERIFICATION THREAD IS OK________________________________________________________________


    //If we just start verification thread, there is no sense to do following logic
    if(SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX!==-1){

        await SYMBIOTE_META.METADATA.get('CANARY').then(async canary=>{

            let verifThread=SYMBIOTE_META.VERIFICATION_THREAD

            //If staging zone is OK
            if(verifThread.CHECKSUM===BLAKE3(JSON.stringify(verifThread.DATA)+verifThread.COLLAPSED_INDEX+verifThread.COLLAPSED_HASH+JSON.stringify(verifThread.VALIDATORS)+verifThread.MASTER_VALIDATOR+verifThread.EPOCH_START)){

                //This is the signal that we should rewrite state changes from the staging zone
                if(canary!==verifThread.CHECKSUM){

                    initSpinner?.stop()

                    LOG(`Load state data from staging zone on \x1b[32;1m${SYMBIOTE_ALIAS()}`,'I')
                    
                    let promises=[];

                    ['ACCOUNTS','EVENTS'].forEach(
                        
                        type => Object.keys(verifThread.DATA[type]).forEach(
                        
                            key => promise.push(SYMBIOTE_META.STATE.put(key,verifThread.DATA[type][key]))
                            
                        )    
                        
                    )

                    
                    await Promise.all(promises).catch(e=>{

                        LOG(`Problems with loading state from staging zone of verification thread on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[31;1m\n${e}`,'F')

                        process.exit(133)

                    })

                }
                
            }else{

                initSpinner?.stop()

                LOG(`Problems with staging zone of verification thread on \x1b[36;1m${SYMBIOTE_ALIAS()}`,'W')

                await RELOAD_STATE()

            }

        }).catch(async err=>{

            initSpinner?.stop()

            LOG(fs.readFileSync(PATH_RESOLVE('images/events/canaryDied.txt')).toString(),'CD')

            LOG(`Problems with canary on \x1b[36;1m${SYMBIOTE_ALIAS()}\n${err}`,'W')

            //Reset verification breakpoint
            await RELOAD_STATE()

        })    

    }else {

        initSpinner?.stop()

        //Clear previous state to avoid mistakes
        SYMBIOTE_META.STATE.clear()

        //Load data from genesis state(initial values)
        await RELOAD_STATE()

    }



    //__________________________________Load modules to work with hostchains_________________________________________


    let tickers=Object.keys(CONFIG.SYMBIOTE.MANIFEST.HOSTCHAINS),EvmHostChain


    SYMBIOTE_META.HOSTCHAINS_WORKFLOW={}


    //Add hostchains to mapping
    //Load way to communicate with hostchain via appropriate type
    for(let i=0,l=tickers.length;i<l;i++){

        
        let way=CONFIG.SYMBIOTE.MANIFEST.HOSTCHAINS[tickers[i]].TYPE


        //Depending on TYPE load appropriate module
        if(CONFIG.EVM.includes(tickers[i])){
        
            EvmHostChain=(await import(`../../KLY_Hostchains/connectors/${way}/evm.js`)).default
            
            HOSTCHAINS.set(tickers[i],new EvmHostChain(tickers[i]))

        }else HOSTCHAINS.set(tickers[i],(await import(`../../KLY_Hostchains/connectors/${way}/${tickers[i]}.js`)).default)


        //hostchains.set(controllerAddr,tickers[i],(await import(`./KLY_Hostchains/${tickers[i]}.js`)).default)//load module
        
        //Load canary
        SYMBIOTE_META.HOSTCHAINS_WORKFLOW[tickers[i]]=await SYMBIOTE_META.HOSTCHAINS_DATA.get(
            
            tickers[i]
            
        ).catch(e=>(  
            
            {KLYNTAR_HASH:'',INDEX:0,HOSTCHAIN_HASH:'',SIG:''}
            
        ))

    }




    //___________________Decrypt all private keys(for KLYNTAR and hostchains) to memory of process___________________

    

    await DECRYPT_KEYS(initSpinner).then(()=>
    
        //Print just first few bytes of keys to view that they were decrypted well.Looks like checksum
        LOG(`Private key on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m was decrypted successfully`,'S')        
    
    ).catch(e=>{
    
        LOG(`Keys decryption failed.Please,check your password carefully.In the worst case-use your decrypted keys from safezone and repeat procedure of encryption via CLI\n${e}`,'F')
 
        process.exit(100)

    })




    //___________________________________________Load data from hostchains___________________________________________


    for(let i=0,l=tickers.length;i<l;i++){
        
        let balance
        
        if(CONFIG.SYMBIOTE.BALANCE_VIEW){
            
            let spinner = ora({
           
                color:'red',
           
                prefixText:`\u001b[38;5;23m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]  \x1b[36;1mGetting balance for \x1b[32;1m${tickers[i]}\x1b[36;1m - keep waiting\x1b[0m`
           
            }).start()

            balance = await HOSTCHAINS.get(tickers[i]).getBalance()
            
            spinner.stop()
            
            LOG(`Balance of controller on hostchain \x1b[32;1m${
            
                tickers[i]
            
            }\x1b[36;1m is \x1b[32;1m${
                
                CONFIG.SYMBIOTE.BALANCE_VIEW?balance:'<disabled>'
            
            }   \x1b[36;1m[${CONFIG.SYMBIOTE.STOP_HOSTCHAINS[tickers[i]]?'\x1b[31;1mSTOP':'\x1b[32;1mPUSH'}\x1b[36;1m]`,'I')
        
        }
    
    }


    //____________________________________________GENERAL SYMBIOTE INFO____________________________________________


    LOG(fs.readFileSync(PATH_RESOLVE('images/events/syminfo.txt')).toString(),'S')

    LOG(`Canary is \x1b[32;1m<OK>`,'I')

    LOG(`Collapsed on \x1b[32;1m${SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX} \u001b[38;5;168m}———{\x1b[32;1m ${SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_HASH}`,'I')




    //Ask to approve current set of hostchains
    !CONFIG.PRELUDE.OPTIMISTIC
    &&        
    await new Promise(resolve=>
    
        readline.createInterface({input:process.stdin, output:process.stdout, terminal:false})
            
        .question(`\n ${'\u001b[38;5;23m'}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${'\x1b[36;1m'}  Do you agree with the current set of hostchains? Enter \x1b[32;1mYES\x1b[36;1m to continue ———> \x1b[0m`,resolve)
                
    ).then(answer=>answer!=='YES'&& process.exit(126))

    
    SIG_PROCESS={VERIFY:false,GENERATE:false}//we should track events in both threads-as in verification,as in generation

},




RUN_SYMBIOTE=async()=>{


    await PREPARE_SYMBIOTE()


    if(!CONFIG.SYMBIOTE.STOP_WORK){

        //Start verification process
        await RUN_POLLING()

        let promises=[]

        //Check if bootstrap nodes is alive
        CONFIG.SYMBIOTE.BOOTSTRAP_NODES.forEach(endpoint=>

            promises.push(
                        
                fetch(endpoint+'/addnode',{method:'POST',body:JSON.stringify([CONFIG.SYMBIOTE.SYMBIOTE_ID,CONFIG.SYMBIOTE.MY_ADDR])})
            
                    .then(res=>res.text())
            
                    .then(val=>val==='OK'&&LOG(`Received pingback from \x1b[32;1m${endpoint}\x1b[36;1m. Node is \x1b[32;1malive`,'I'))
            
                    .catch(e=>LOG(`Bootstrap node \x1b[32;1m${endpoint}\x1b[31;1m send no response`,'F'))
                        
            )

        )

        await Promise.all(promises)

        //______________________________________________________RUN BLOCKS GENERATION PROCESS____________________________________________________________

        //Get the urgent network information about the generation thread
        let getUrgentGTpromises=[],

            // used to choose right fork. Key is hash of generation thread stats and value - number of votes for this state among other endpoints in your configs
            // So it looks like | (hash of response) => {votes:INT,pure:<DATA FOR GENERATION THREAD>}
            gtHandlers = new Map() 

        //Check if bootstrap nodes is alive
        CONFIG.SYMBIOTE.GET_URGENT_GENERATION_THREAD.forEach(node=>

            getUrgentGTpromises.push(
                        
                fetch(node.URL+'/genthread/'+CONFIG.SYMBIOTE.SYMBIOTE_ID)
            
                    .then(res=>res.json())
            
                    .then(async response=>{

                        /*
                        
                            Response consists of:

                            +masterValidator(validator choosen for epoch - his BLS pubkey)
                            +epochStart - height of block when epoch has started
                            +validators - BLS pubkeys of current validators set
                            
                            +signature(data is signed, so you will have proofs that you've received fake data from some sources)
                            
                        */
                       
                        let payloadHash=BLAKE3(response.payload.masterValidator+response.payload.epochStart+JSON.stringify(response.payload.validators))


                        if(await VERIFY(payloadHash,response.signature,node.PUB)){

                            if(gtHandlers.has(payloadHash)) gtHandlers.get(payloadHash).votes++
                            
                            else gtHandlers.set(payloadHash,{votes:1,pure:response})

                        }

                    })
            
                    .catch(e=>LOG(`Can't get urgent generation thread metadata from \x1b[32;1m${node.URL}`,'F'))

            )

        )


        //If no answer at all - probably, we need to stop and try later
        if(getUrgentGTpromises===0 && CONFIG.SYMBIOTE.STOP_IF_NO_GT_PROPOSERS){

            LOG(`No versions of GT, so going to stop ...`,'W')

            process.exit(130)

        }


        await Promise.all(getUrgentGTpromises)


        //Among all the answers choose only one with maximum number of votes
        let winnerHandler='',
        
            maxVotes=0




        gtHandlers.forEach((handler,_)=>{

            if(handler.votes>maxVotes){

                maxVotes=handler.votes

                winnerHandler=handler.pure.payload
            
            }else if(handler.votes===maxVotes){

                LOG(`Found two or more versions of generation thread\n${gtHandlers}`,'F')

                process.exit(127)

            }

        })



        LOG(`Choosen generation thread is (Votes:${maxVotes} | Master:${winnerHandler.masterValidator} | Epoch start:${winnerHandler.epochStart})`,'I')



        //Here we have a version of generation thread(GT) with a current set of validators, master validator(block creator) and epoch start
        SYMBIOTE_META.GENERATION_THREAD.VALIDATORS=winnerHandler.validators

        SYMBIOTE_META.GENERATION_THREAD.MASTER_VALIDATOR=winnerHandler.masterValidator

        SYMBIOTE_META.GENERATION_THREAD.EPOCH_START=winnerHandler.epochStart


        !CONFIG.SYMBIOTE.STOP_GENERATE_BLOCKS && setTimeout(()=>{
            
            global.STOP_GEN_BLOCKS_CLEAR_HANDLER=false
            
            GEN_BLOCK_START()

            //Also,run polling for blocks & headers from generation thread
            //We start to get blocks from current epoch
            GET_BLOCKS_FOR_GENERATION_THREAD()
        
        },CONFIG.SYMBIOTE.BLOCK_GENERATION_INIT_DELAY)

    }

}