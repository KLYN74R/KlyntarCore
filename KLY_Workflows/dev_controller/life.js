import {LOG,SIG,BLOCKLOG,SYMBIOTE_ALIAS,PATH_RESOLVE,BLAKE3} from '../../KLY_Utils/utils.js'

import {BROADCAST,DECRYPT_KEYS} from './utils.js'

import ControllerBlock from './blocks/controllerblock.js'

import {START_VERIFY_POLLING} from './verification.js'

import InstantBlock from './blocks/instantblock.js'

import UWS from 'uWebSockets.js'

import fetch from 'node-fetch'

import ora from 'ora'

import l from 'level'

import fs from 'fs'




//______________________________________________________________VARIABLES POOL___________________________________________________________________


//*********************** SET HANDLERS ON USEFUL SIGNALS ************************

//++++++++++++++++++++++++ Define general global object  ++++++++++++++++++++++++


//To stop/start block generation
global.STOP_GEN_BLOCK={}

global.IN_PROCESS={VERIFY:false,GENERATE:false}

global.SYSTEM_SIGNAL_ACCEPTED=false

global.SIG_PROCESS={}

//Open writestream in append mode
global.SYMBIOTE_LOGS_STREAM=fs.createWriteStream(process.env.LOGS_PATH+`/symbiote.log`),{flags:'a+'}

//Your decrypted private key
global.PRIVATE_KEY=null






let graceful=()=>{
    
    SYSTEM_SIGNAL_ACCEPTED=true


    console.log('\n')

    LOG('KLYNTAR stop has been initiated.Keep waiting...','I')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/termination.txt')).toString(),'W')
    
    //Probably stop logs on this step
    setInterval(async()=>{

        //Each subprocess in each symbiote must be stopped
        if(!IN_PROCESS.GENERATE && !IN_PROCESS.VERIFY || Object.values(SIG_PROCESS[symbiote]).every(x=>x)){

            console.log('\n')

            let streamsPromises=[]


            //Close logs streams
            await new Promise( resolve => SYMBIOTE_LOGS_STREAM.close( error => {

                LOG(`Logging was stopped for ${SYMBIOTE_ALIAS()} ${error?'\n'+error:''}`,'I')

                resolve()
            
            }))

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









//________________________________________________________________INTERNAL_______________________________________________________________________



//TODO:Add more advanced logic(e.g number of txs,ratings,etc.)
let GET_TXS = () => SYMBIOTE_META.MEMPOOL.splice(0,CONFIG.SYMBIOTE.MANIFEST.EVENTS_LIMIT_PER_BLOCK),




//TODO:Add more advanced logic(e.g number of txs,ratings,etc.)
GET_CANDIDATES=async()=>{
    
    let limit=0,
    
        promises=[],
        
        state=SYMBIOTE_META.STATE



    for (let [hash,creator] of SYMBIOTE_META.INSTANT_CANDIDATES.entries()){
        
        SYMBIOTE_META.INSTANT_CANDIDATES.delete(hash)
        
        //Get account of InstantBlock creator and check if he still has a stake and ability to generate block
        promises.push(state.get(creator).then(acc=>
            
            //If enough on balance-then pass hash.Otherwise-delete block from candidates and return "undefined" 
            acc.B>=CONFIG.SYMBIOTE.MANIFEST.INSTANT_FREEZE
            ?
            hash
            :
            SYMBIOTE_META.CANDIDATES.del(hash).catch(e=>
                
                LOG(`Can't delete candidate \x1b[36;1m${hash}\x1b[33;1m on \x1b[36;1m${SYMBIOTE_ALIAS()}`,'W')
                
            )

        
        ).catch(e=>false))
        
        //Limitation
        if(limit++==CONFIG.SYMBIOTE.MANIFEST.INSTANT_PORTION) break
    
    }
    
    //No "return await"

    let readySet=await Promise.all(promises).then(arr=>arr.filter(Boolean)).catch(e=>
    
        LOG(`Oops,set of instant blocks is empty on chain \x1b[36;1m${SYMBIOTE_ALIAS()}\n${e}`,'W'),
        
        []

    )

    return readySet


},



//Tag:ExecMap
GEN_BLOCK_START=async(symbiote,type)=>{

    if(!SYSTEM_SIGNAL_ACCEPTED){

        IN_PROCESS.GENERATE=true
    
        await GEN_BLOCK(symbiote,type)

        STOP_GEN_BLOCK[type]=setTimeout(()=>GEN_BLOCK_START(symbiote,type),CONFIG.SYMBIOTE[type+'_BLOCK_GENERATION_TIME'])
    
        CONFIG.SYMBIOTE['STOP_GENERATE_BLOCK_'+type]
        &&
        clearTimeout(STOP_GEN_BLOCK[type])
      
    }else{

        LOG(`Block generation for \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[36;1m was stopped`,'I',symbiote)

        SIG_PROCESS.GENERATE=true

    }

    //leave function
    IN_PROCESS.GENERATE=false
    
},




RUN_POLLING=async symbiote=>{

    LOG(`Local state collapsed on \x1b[36;1m${SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX}\x1b[32;1m for \x1b[36;1m${SYMBIOTE_ALIAS()}`,'S')

    START_VERIFY_POLLING()

}








//________________________________________________________________EXTERNAL_______________________________________________________________________




export let GEN_BLOCK=async(symbiote,blockType)=>{

    let hash,route,
    
        symbioteRef=SYMBIOTE_META

    
    
    //!Here check the difference between VT and GT(VT_GT_NORMAL_DIFFERENCE)
    if(blockType==='C' && symbioteRef.VERIFICATION_THREAD.COLLAPSED_INDEX+CONFIG.SYMBIOTE.VT_GT_NORMAL_DIFFERENCE < symbioteRef.GENERATION_THREAD.NEXT_INDEX){

        LOG(`Block generation for \u001b[38;5;m${SYMBIOTE_ALIAS()}\x1b[36;1m skipped because GT is faster than VT. Increase \u001b[38;5;157m<VT_GT_NORMAL_DIFFERENCE>\x1b[36;1m if you need`,'I',symbiote)

        return

    }



    if(blockType==='C'){




        //_________________________________________GENERATE PORTION OF BLOCKS___________________________________________
        
        
        //To fill ControllerBlocks for maximum
        
        let phantomControllers=Math.ceil(SYMBIOTE_META.INSTANT_CANDIDATES.size/CONFIG.SYMBIOTE.MANIFEST.INSTANT_PORTION),

            genThread=SYMBIOTE_META.GENERATION_THREAD,
    
            promises=[]//to push blocks to storage


        
        //If nothing to generate-then no sense to generate block,so return
        if(phantomControllers===0) return 



        for(let i=0;i<phantomControllers;i++){

            let arr=await GET_CANDIDATES(symbiote),
            
                conBlockCandidate=new ControllerBlock(arr)
            

            hash=ControllerBlock.genHash(conBlockCandidate.a,conBlockCandidate.i,genThread.PREV_HASH)
    
            conBlockCandidate.sig=await SIG(hash,PRIVATE_KEY)

            route='/cb'
            
            BLOCKLOG(`New \x1b[36m\x1b[41;1mControllerBlock\x1b[0m\x1b[32m generated ——│\x1b[36;1m`,'S',symbiote,hash,59,'\x1b[32m',conBlockCandidate)

            
            genThread.PREV_HASH=hash
 
            genThread.NEXT_INDEX++
 


            promises.push(SYMBIOTE_META.CONTROLLER_BLOCKS.put(conBlockCandidate.i,conBlockCandidate).then(()=>conBlockCandidate).catch(e=>{
                
                LOG(`Failed to store block ${conBlockCandidate.i} on ${SYMBIOTE_ALIAS()}`,'F')

                process.emit('SIGINT',122)
            
            }))
           
        }


        

        //_______________________________________________COMMIT CHANGES___________________________________________________


        //Commit group of blocks by setting hash and index of the last one

        await Promise.all(promises).then(arr=>
            
            
            SYMBIOTE_META.METADATA.put('GT',genThread).then(()=>

                new Promise(resolve=>{

                    //And here we should broadcast blocks
                    arr.forEach(block=>
                    
                        Promise.all(BROADCAST(route,block,symbiote))
                    
                    )


                    //_____________________________________________PUSH TO HOSTCHAINS_______________________________________________
    
                    //Push to hostchains due to appropriate symbiote
                    Object.keys(CONFIG.SYMBIOTE.MANIFEST.HOSTCHAINS).forEach(async ticker=>{
    
                        //TODO:Add more advanced logic
                        if(!CONFIG.SYMBIOTE.STOP_HOSTCHAINS[ticker]){
    
                            let control=SYMBIOTE_META.HOSTCHAINS_WORKFLOW[ticker],
                        
                                hostchain=HOSTCHAIN.get(ticker),
    
                                //If previous push is still not accepted-then no sense to push new symbiote update
                                isAlreadyAccepted=await hostchain.checkTx(control.HOSTCHAIN_HASH,control.INDEX,control.KLYNTAR_HASH,symbiote).catch(e=>false)
                        
                            


                            LOG(`Check if previous commit is accepted for \x1b[32;1m${SYMBIOTE_ALIAS()}\x1b[36;1m on \x1b[32;1m${ticker}\x1b[36;1m ~~~> \x1b[32;1m${
                                
                                control.KLYNTAR_HASH===''?'Just start':isAlreadyAccepted
                            
                            }`,'I')
    
                            


                            if(control.KLYNTAR_HASH===''||isAlreadyAccepted){
    
                                //If accpted-we can share to the rest
                                isAlreadyAccepted
                                &&
                                Promise.all(BROADCAST('/proof',{...control,symbiote,ticker},symbiote))
                            
    
                                let index=SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX-1,
    
                                    symbioticHash=await hostchain.sendTx(symbiote,index,genThread.PREV_HASH).catch(e=>{
                                        
                                        LOG(`Error on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m with push to \x1b[36;1m${ticker} \n${e}`,'W')
                                    
                                        return false

                                    })
                        
    
                                if(symbioticHash){
    
                                    LOG(`Commit on ${SYMBIOTE_ALIAS()}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m for block \x1b[36;1m${index}\x1b[32;1m is \x1b[36;1m${symbioticHash}`,'S')
    
                                    //Commit localy that we have send it
                                    control.KLYNTAR_HASH=genThread.PREV_HASH
                            
                                    control.INDEX=index
                            
                                    control.HOSTCHAIN_HASH=symbioticHash
    
                                    control.SIG=await SIG(control.KLYNTAR_HASH+control.INDEX+control.HOSTCHAIN_HASH+ticker,PRIVATE_KEY)



                                    
                                    await SYMBIOTE_META.HOSTCHAINS_DATA.put(index+ticker,{KLYNTAR_HASH:control.KLYNTAR_HASH,HOSTCHAIN_HASH:control.HOSTCHAIN_HASH,SIG:control.SIG})

                                                .then(()=>SYMBIOTE_META.HOSTCHAINS_DATA.put(ticker,control))//set such canary to avoid duplicates when quick reboot daemon
                            
                                                .then(()=>LOG(`Locally store pointer for \x1b[36;1m${index}\x1b[32;1m block of \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m on \x1b[36;1m${ticker}`,'S'))
                            
                                                .catch(e=>LOG(`Error-impossible to store pointer for \x1b[36;1m${index}\u001b[38;5;3m block of \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m on \x1b[36;1m${ticker}`,'W'))
    
    
                                }

                                LOG(`Balance of controller on hostchain \x1b[32;1m${ticker}\x1b[36;1m is \x1b[32;1m${await hostchain.getBalance(symbiote)}`,'I')
                        
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

    }
    else{

        
        //______________________________TEST__________________________________
        
        let insBlockCandidate=new InstantBlock(await GET_TXS())

        //_______________________________________________DELELTE________________________________

        
        hash=InstantBlock.genHash(insBlockCandidate.c,insBlockCandidate.e)

        insBlockCandidate.sig=await SIG(hash,PRIVATE_KEY)
            
        route='/ib'

        //____________________________________TEST_____________________________


        BLOCKLOG(`New \x1b[36;1m\x1b[44;1mInstantBlock\x1b[0m\x1b[32m generated ——│`,'S',symbiote,hash,56,'\x1b[32m',insBlockCandidate)

        await SYMBIOTE_META.CANDIDATES.put(hash,insBlockCandidate)

        Promise.all(BROADCAST(route,insBlockCandidate,symbiote))

        //These blocks also will be included
        SYMBIOTE_META.INSTANT_CANDIDATES.set(hash,CONFIG.SYMBIOTE.PUB)
        
    }

},




RELOAD_STATE = async symbioteRef => {

    //Reset verification breakpoint
    await symbioteRef.STATE.clear()

    let promises=[],
    


        //Try to load snapshot metadata to use as last collapsed
        canary=await symbioteRef.SNAPSHOT.METADATA.get('CANARY').catch(e=>false),

        snapshotVT=await symbioteRef.SNAPSHOT.METADATA.get('VT').catch(e=>false),
    
        //Snapshot will never be OK if it's empty
        snapshotIsOk = snapshotVT.CHECKSUM===BLAKE3(JSON.stringify(snapshotVT.DATA)+snapshotVT.COLLAPSED_INDEX+snapshotVT.COLLAPSED_HASH)//snapshot itself must be OK
                       &&
                       canary===snapshotVT.CHECKSUM//and we must be sure that no problems with staging zone,so snapshot is finally OK
                       &&
                       CONFIG.SYMBIOTE.SNAPSHOTS.ALL//we have no remote shards(first releases don't have these features)

        
       
    //Try to load from snapshot
    //If it was initial run-then we'll start from genesis state
    // If it's integrity problem - then we check if snapshot is OK-then we can load data from snapshot
    //In case when snapshot is NOT ok - go to else branch and start sync from the genesis
    
    if( snapshotIsOk ){


        symbioteRef.VERIFICATION_THREAD=snapshotVT

        let accs={},promises=[]

        await new Promise(
            
            resolve => symbioteRef.SNAPSHOT.STATE.createReadStream()
            
                                .on('data',data=>accs[data.key]=data.value)
                                
                                .on('close',resolve)
            
        )

        Object.keys(accs).forEach(addr=>promises.push(symbioteRef.STATE.put(addr,accs[addr])))

        await Promise.all(promises)
        
            .then(()=>symbioteRef.METADATA.put('CANARY',canary))

            .then(()=>symbioteRef.METADATA.put('VT',snapshotVT))

            .catch(e=>{

                LOG(`Problems with loading state from snapshot to state db \n${e}`,'F')

                process.exit(138)
            
            })


        LOG(`Successfully recreated state from snapshot`,'I')

    
    }else{

        //Otherwise start rescan form height=0
        symbioteRef.VERIFICATION_THREAD.COLLAPSED_INDEX==-1 && (!CONFIG.SYMBIOTE.CONTROLLER.ME || symbioteRef.GENERATION_THREAD.NEXT_INDEX==0) ? LOG(`Initial run with no snapshot`,'I') : LOG(`Start sync from genesis`,'W')

        symbioteRef.VERIFICATION_THREAD={COLLAPSED_HASH:'Poyekhali!@Y.A.Gagarin',COLLAPSED_INDEX:-1,DATA:{},CHECKSUM:''}

        //Load all the configs
        fs.readdirSync(process.env.GENESIS_PATH).forEach(file=>{

            //Load genesis state or data from backups(not to load state from the beginning)
            let genesis=JSON.parse(fs.readFileSync(process.env.GENESIS_PATH+`/${file}`))
        
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
            prefixText:`\u001b[38;5;${process.env.KLY_MODE==='main'?'23':'202'}m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})  \x1b[36;1mPreparing symbiote \x1b[32;1m${SYMBIOTE_ALIAS()}\x1b[0m`
        }).start()

        
    }
    



    //____________________________________________Prepare structures_________________________________________________


    let symbioteConfig=CONFIG.SYMBIOTE


    //Contains default set of properties for major part of potential use-cases on symbiote
    global.SYMBIOTE_META={
        
        MEMPOOL:[],
        
        //Сreate mapping to optimize processes while we check blocks-not to read/write to db many times
        ACCOUNTS:new Map(),// ADDRESS => { ACCOUNT_STATE , NONCE_SET , NONCE_DUPLICATES , OUT , TYPE }

        EVENTS_STATE:new Map(),// EVENT_KEY(on symbiote) => EVENT_VALUE

        BLACKLIST:new Set(),//To sift addresses which spend more than has when we check another ControllerBlock

        //Peers to exchange data with
        NEAR:[]

    }



    
    //OnlyLinuxFans.Due to incapsulation level we need to create sub-level directory for each symbiote
    [process.env.CHAINDATA_PATH,process.env.SNAPSHOTS_PATH].forEach(
        
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
        'METADATA',//important dir-cointains canaries,pointer to VERIFICATION_THREAD and GENERATION_THREADS
    
        'CONTROLLER_BLOCKS',//For Controller's blocks(key is index)
        
        'INSTANT_BLOCKS',//For Instant(key is hash)
        
        'HOSTCHAINS_DATA',//To store external flow of commits for ControllerBlocks
        
        'CANDIDATES'//For candidates(key is a hash(coz it's also InstantBlocks,but yet not included to chain))
    
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
        {COLLAPSED_HASH:'Poyekhali!@Y.A.Gagarin',COLLAPSED_INDEX:-1,DATA:{},CHECKSUM:''}//initial
        :
        (LOG(`Some problem with loading metadata of verification thread\nSymbiote:${symbioteId}\nError:${e}`,'F'),process.exit(124))
                    
    )








    //_____Load security stuff-check if stop was graceful,canary is present,should we reload the state and so on_____




    //These options only for Controller
    //Due to phantom blocks,we'll generate blocks faster than state become verified,that's why we need two extra properties
    if(symbioteConfig.CONTROLLER.ME){

        SYMBIOTE_META.GENERATION_THREAD = await SYMBIOTE_META.METADATA.get('GT').catch(e=>
        
            e.notFound
            ?
            {
                PREV_HASH:`Poyekhali!@Y.A.Gagarin`,//Genesis hash
                NEXT_INDEX:0//So the first block will be with index 0
            }
            :
            (LOG(`Some problem with loading metadata of generation thread\nSymbiote:${symbioteId}\nError:${e}`,'F'),process.exit(125))
                        
        )


        let nextIsPresent = await SYMBIOTE_META.CONTROLLER_BLOCKS.get(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX).catch(e=>false),//OK is in case of absence of next block

            previous=await SYMBIOTE_META.CONTROLLER_BLOCKS.get(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX-1).catch(e=>false)//but current block should present at least locally

    
        if(nextIsPresent || !(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX===0 || SYMBIOTE_META.GENERATION_THREAD.PREV_HASH === BLAKE3( JSON.stringify(previous.a) + symbioteId + previous.i + previous.p))){
        
            initSpinner?.stop()

            LOG(`Something wrong with a sequence of generation thread on \x1b[36;1m${SYMBIOTE_ALIAS()}`,'F')
            
            process.exit(125)

        }

        
    }
    
    


    //If we just start verification thread, there is no sense to do following logic
    if(SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX!==-1){

        await SYMBIOTE_META.METADATA.get('CANARY').then(async canary=>{

            let verifThread=SYMBIOTE_META.VERIFICATION_THREAD

            //If staging zone is OK
            if(verifThread.CHECKSUM===BLAKE3(JSON.stringify(verifThread.DATA)+verifThread.COLLAPSED_INDEX+verifThread.COLLAPSED_HASH)){

                //This is the signal that we should rewrite state changes from the staging zone
                if(canary!==verifThread.CHECKSUM){

                    initSpinner?.stop()

                    LOG(`Load state data from staging zone on \x1b[32;1m${SYMBIOTE_ALIAS(symbioteId)}`,'I')
                    
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

                await RELOAD_STATE(symbioteId,SYMBIOTE_META)

            }

        }).catch(async err=>{

            initSpinner?.stop()

            LOG(fs.readFileSync(PATH_RESOLVE('images/events/canaryDied.txt')).toString(),'CD')

            LOG(`Problems with canary on \x1b[36;1m${SYMBIOTE_ALIAS()}\n${err}`,'W')

            //Reset verification breakpoint
            await RELOAD_STATE(symbioteId,SYMBIOTE_META)

        })    

    }else {

        initSpinner?.stop()

        //Clear previous state to avoid mistakes
        SYMBIOTE_META.STATE.clear()

        //Load data from genesis state(initial values)
        await RELOAD_STATE(symbioteId,SYMBIOTE_META)

    }



    SYMBIOTE_META.INSTANT_CANDIDATES=new Map()//mapping(hash=>creator)


    //Clear,to not store OUT-OF-CHAIN blocks
    //*UPD:Node operators should run cleaning time by time
    //chainRef.CANDIDATES.clear()

    


    //__________________________________Load modules to work with hostchains_________________________________________


    //...and push template to global HOSTCHAINS_DATA object to control the flow


    let tickers=Object.keys(symbioteConfig.MANIFEST.HOSTCHAINS),EvmHostChain,hostchainmap=new Map()


    SYMBIOTE_META.HOSTCHAINS_WORKFLOW={}


    //Add hostchains to mapping
    //Load way to communicate with hostchain via appropriate type
    for(let i=0,l=tickers.length;i<l;i++){

        
        let way=symbioteConfig.MANIFEST.HOSTCHAINS[tickers[i]].TYPE


        //Depending on TYPE load appropriate module
        if(CONFIG.EVM.includes(tickers[i])){
        
            EvmHostChain=(await import(`../../KLY_Hostchains/connectors/${way}/evm.js`)).default
            
            hostchainmap.set(tickers[i],new EvmHostChain(symbioteId,tickers[i]))

        }else hostchainmap.set(tickers[i],(await import(`../../KLY_Hostchains/connectors/${way}/${tickers[i]}.js`)).default)


        //hostchains.set(controllerAddr,tickers[i],(await import(`./KLY_Hostchains/${tickers[i]}.js`)).default)//load module
        
        //Load canary
        SYMBIOTE_META.HOSTCHAINS_WORKFLOW[tickers[i]]=await SYMBIOTE_META.HOSTCHAINS_DATA.get(tickers[i]).catch(e=>(  {KLYNTAR_HASH:'',INDEX:0,HOSTCHAIN_HASH:'',SIG:''}  ))

    }




    //___________________Decrypt all private keys(for KLYNTAR and hostchains) to memory of process___________________

    

    await DECRYPT_KEYS(symbioteId,initSpinner,symbioteConfig.CONTROLLER.ME?'Controller':'Instant generator').then(()=>
    
        //Print just first few bytes of keys to view that they were decrypted well.Looks like checksum
        LOG(`Private key on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m was decrypted successfully`,'S')        
    
    ).catch(e=>{
    
        LOG(`Keys decryption failed.Please,check your password carefully.In the worst case-use your decrypted keys from safezone and repeat procedure of encryption via CLI\n${e}`,'F')
 
        process.exit(100)

    })




    //___________________________________________Load data from hostchains___________________________________________

    //TODO:Add more advanced info    
    if(symbioteConfig.CONTROLLER.ME){

        for(let i=0,l=tickers.length;i<l;i++){

            let balance

            if(CONFIG.SYMBIOTE.BALANCE_VIEW){

                let spinner = ora({
                    color:'red',
                    prefixText:`\u001b[38;5;23m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]  \x1b[36;1mGetting balance for \x1b[32;1m${tickers[i]}\x1b[36;1m - keep waiting\x1b[0m`
                }).start()

                balance = await HOSTCHAINS.get(tickers[i]).getBalance(symbioteId)

                spinner.stop()

                LOG(`Balance of controller on hostchain \x1b[32;1m${
                
                    tickers[i]
                
                }\x1b[36;1m is \x1b[32;1m${
                    
                    CONFIG.SYMBIOTE.BALANCE_VIEW?balance:'<disabled>'
                
                }   \x1b[36;1m[${symbioteConfig.STOP_HOSTCHAINS[tickers[i]]?'\x1b[31;1mSTOP':'\x1b[32;1mPUSH'}\x1b[36;1m]`,'I')

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


    }
    
    SIG_PROCESS={VERIFY:false,GENERATE:false}//we should track events in both threads-as in verification,as in generation

},




RUN_SYMBIOTE=async symbioteID=>{


    await PREPARE_SYMBIOTE()
    
//_____________________________________________________Connect with CONTROLLER & NODES___________________________________________________________




    let promises=[]


    !CONFIG.SYMBIOTE.STOP_WORK
        &&
        promises.push(

            //Controller doesn't need to load state coz without him there are no progress in chain.At least-in the first versions
            RUN_POLLING(symbioteID).then(()=>
            
            /*
            
            Get current nodeset due to region.NOTE-each controller may has different depth of nodeset
            
            Someone can give u list of nodes from region(e.g EU(Europe),NA(Nothern America),etc.)
            Some controllers will have better localization(e.g EU_FR(Europe,France),NA_US_CA(United States,California))
            
            Every controller may use own labels,follow ISO-3166 formats or even digits(e.g 0-Europe,1-USA,01-Europe,Germany,etc.)

            Format defined by Controller and become public for Instant generators and other members to let them to find the best&fastest options

            */
            !CONFIG.SYMBIOTE.CONTROLLER.ME
            &&
            fetch(CONFIG.SYMBIOTE.CONTROLLER.ADDR+'/nodes/'+symbioteID+'/'+CONFIG.SYMBIOTE.REGION).then(r=>r.json()).then(
                
                async nodesArr=>{
                    
                    LOG(`Received ${nodesArr.length} addresses from ${SYMBIOTE_ALIAS()}...`,'I')

                    let answers=[]
                
                    //Ask if these nodes are available and ready to share data with us
                    nodesArr.forEach(
                        
                        addr => answers.push(
                            
                            fetch(addr+'/addnode',{method:'POST',body:JSON.stringify([symbioteID,CONFIG.SYMBIOTE.MY_ADDR])})
                        
                                    .then(res=>res.text())
                        
                                    .then(val=>val==='OK'&&SYMBIOTE_META.NEAR.push(addr))
                        
                                    .catch(e=>'')
                                    
                        )
                        
                    )

                    await Promise.all(answers)
                
                    LOG(`Total nodeset ${SYMBIOTE_ALIAS()}...\x1b[36;1m  has ${SYMBIOTE_META.NEAR.length} addresses`,'I')
                
                }
            
            ).catch(e=>LOG(`Controller of \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[31;1m is offline or some error has been occured\n${e}\n`,'F'))
        
        ))


    await Promise.all(promises.splice(0))




//______________________________________________________RUN BLOCKS GENERATION PROCESS____________________________________________________________




    let symbioteRef=CONFIG.SYMBIOTE

        if(!symbioteRef.STOP_WORK){
        
            //Start generate ControllerBlocks if you're controller(obviously)
            !symbioteRef.STOP_GENERATE_BLOCK_C && symbioteRef.CONTROLLER.ME && setTimeout(()=>{
                
                STOP_GEN_BLOCK={C:''}
                
                GEN_BLOCK_START(symbioteID,'C')
            
            },symbioteRef.BLOCK_С_INIT_DELAY)



            
            !symbioteRef.STOP_GENERATE_BLOCK_I && setTimeout(()=>{

                STOP_GEN_BLOCK ? STOP_GEN_BLOCK['I']='' : STOP_GEN_BLOCK={C:'',I:''}

                //Tag:ExecMap - run generation workflow for InstantBlocks
                GEN_BLOCK_START(symbioteID,'I')

            },symbioteRef.BLOCK_I_INIT_DELAY)

        }

    
}