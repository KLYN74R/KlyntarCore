import {LOG,SYMBIOTE_ALIAS,PATH_RESOLVE,BLAKE3} from '../../KLY_Utils/utils.js'

import {BROADCAST,DECRYPT_KEYS,BLOCKLOG,SIG,GET_STUFF} from './utils.js'

import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import {GET_BLOCKS_FOR_FUTURE_WRAPPER,START_VERIFY_POLLING} from './verification.js'

import Block from './essences/block.js'

import UWS from 'uWebSockets.js'

import fetch from 'node-fetch'

import Base58 from 'base-58'

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
        if(!THREADS_STILL_WORKS.GENERATION && !THREADS_STILL_WORKS.VERIFICATION || Object.values(SIG_PROCESS).every(x=>x)){

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


//TODO:Add more advanced logic(e.g. number of txs,ratings,etc.)
let GET_EVENTS = () => SYMBIOTE_META.MEMPOOL.splice(0,CONFIG.SYMBIOTE.MANIFEST.EVENTS_LIMIT_PER_BLOCK),




GEN_BLOCKS_START_POLLING=async()=>{

    if(!SYSTEM_SIGNAL_ACCEPTED){

        //With this we say to system:"Wait,we still processing the block"
        THREADS_STILL_WORKS.GENERATION=true

        await GENERATE_PHANTOM_BLOCKS_PORTION()    

        STOP_GEN_BLOCKS_CLEAR_HANDLER=setTimeout(()=>GEN_BLOCKS_START_POLLING(),CONFIG.SYMBIOTE.BLOCK_TIME)
        
        CONFIG.SYMBIOTE.STOP_GENERATE_BLOCKS
        &&
        clearTimeout(STOP_GEN_BLOCKS_CLEAR_HANDLER)

    }else{

        LOG(`Block generation for \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[36;1m was stopped`,'I',CONFIG.SYMBIOTE.SYMBIOTE_ID)

        SIG_PROCESS.GENERATE=true

    }

    //leave function
    THREADS_STILL_WORKS.GENERATION=false
    
}








//________________________________________________________________EXTERNAL_______________________________________________________________________




export let GENERATE_PHANTOM_BLOCKS_PORTION = async () => {


    //Safe "if" branch to prevent unnecessary blocks generation
    if(!SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(CONFIG.SYMBIOTE.PUB)) return


    let myVerificationThreadStats = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[CONFIG.SYMBIOTE.PUB]

    //!Here check the difference between VT and GT(VT_GT_NORMAL_DIFFERENCE)
    if(myVerificationThreadStats.INDEX+CONFIG.SYMBIOTE.VT_GT_NORMAL_DIFFERENCE < SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX){

        LOG(`Block generation skipped because GT is faster than VT. Increase \u001b[38;5;157m<VT_GT_NORMAL_DIFFERENCE>\x1b[36;1m if you need`,'I',CONFIG.SYMBIOTE.SYMBIOTE_ID)

        return

    }
    
    
    /*

    _________________________________________GENERATE PORTION OF BLOCKS___________________________________________
    
    Here we check how many transactions(events) we have locally and generate as many blocks as it's possible
    
    */

                
    let phantomBlocksNumber=Math.ceil(SYMBIOTE_META.MEMPOOL.length/CONFIG.SYMBIOTE.MANIFEST.EVENTS_LIMIT_PER_BLOCK),
    
        promises=[],//to push blocks to storage

        phantomsMetadata=[]//to share among other validators and get proofs from them


    phantomBlocksNumber++//DELETE after tests

    //If nothing to generate-then no sense to generate block,so return
    if(phantomBlocksNumber===0) return 


    LOG(`Number of phantoms to generate \x1b[32;1m${phantomBlocksNumber}`,'I')


    for(let i=0;i<phantomBlocksNumber;i++){


        let eventsArray=await GET_EVENTS(),
            
            blockCandidate=new Block(eventsArray),
                        
            hash=Block.genHash(blockCandidate.c,blockCandidate.e,blockCandidate.i,blockCandidate.p)
    

        blockCandidate.sig=await SIG(hash)
            
        BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m generated ——│\x1b[36;1m`,'S',hash,48,'\x1b[32m',blockCandidate)

        //To send to other validators and get signatures as proof of acception this part of blocks

        let blockID=CONFIG.SYMBIOTE.PUB+':'+blockCandidate.i,

            meta={
        
                B:blockID,
            
                S:await SIG(blockID+":"+hash)//self-sign our proofs as one of the validator
        
            }
        
        phantomsMetadata.push(meta)



        SYMBIOTE_META.GENERATION_THREAD.PREV_HASH=hash
 
        SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX++
    

        promises.push(SYMBIOTE_META.BLOCKS.put(blockID,blockCandidate).then(()=>

            // Validators proofs will be stored in V property as object with PublicKey=>Signature(BLOCK_ID+":"+BLOCK_HASH)
            SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.set(blockID,{V:{[CONFIG.SYMBIOTE.PUB]:meta.S}})
             

        ).then(()=>blockCandidate).catch(error=>{
                
            LOG(`Failed to store block ${blockCandidate.i} on ${SYMBIOTE_ALIAS()} \n${error}`,'F')

            process.emit('SIGINT',122)
            
        }))
           
    }


    //______________________________________ WORKING WITH PROOFS & GENERATION THREAD METADATA ______________________________________

    
    phantomsMetadata={v:CONFIG.SYMBIOTE.PUB,p:phantomsMetadata}

    //Here we need to send metadata templates to other validators and get the signed proofs that they've successfully received blocks
    //?NOTE - we use setTimeout here to delay sending our proofs. We need to give some time for network to share blocks
    setTimeout(async()=>{

        let promises = []

        //0. Initially,try to get pubkey => node_ip binding 
        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.forEach(
            
            pubkey => promises.push(GET_STUFF(pubkey))
            
        )


        let pureUrls = await Promise.all(promises.splice(0)).then(array=>array.filter(Boolean).map(x=>x.payload.url)),
        
            payload = JSON.stringify(phantomsMetadata)//this will be send to validators and to other nodes & endpoints


        for(let validatorNode of pureUrls) {

            if(validatorNode===CONFIG.SYMBIOTE.MY_HOSTNAME) continue

            fetch(validatorNode+'/acceptvalidatorsproofs',{
                
                method:'POST',
                
                body:payload
            
            }).catch(_=>{})//doesn't matter if error

        }

        //You can also share proofs over the network, not only to validators
        CONFIG.SYMBIOTE.ALSO_SHARE_BFT_PROOFS_TO_DEFAULT_NODES
        &&
        BROADCAST('/acceptvalidatorsproofs',payload)


    },CONFIG.SYMBIOTE.TIMEOUT_TO_PRE_SHARE_PROOFS)




    //_______________________________________________COMMIT CHANGES___________________________________________________


    //Commit group of blocks by setting hash and index of the last one

    await Promise.all(promises.splice(0)).then(arr=>
        
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
                            Promise.all(BROADCAST('/hc_proofs',{...control,symbiote:CONFIG.SYMBIOTE.SYMBIOTE_ID,ticker}))
                        

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
            
        )

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
        snapshotIsOk = snapshotVT.CHECKSUM===BLAKE3(
            
                            JSON.stringify(snapshotVT.DATA)
                            +
                            JSON.stringify(snapshotVT.FINALIZED_POINTER)
                            +
                            JSON.stringify(snapshotVT.VALIDATORS)
                            +
                            JSON.stringify(snapshotVT.VALIDATORS_METADATA)
                        
                        )//snapshot itself must be OK
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

        await Promise.all(promises.splice(0))
        
            .then(()=>SYMBIOTE_META.METADATA.put('CANARY',canary))

            .then(()=>SYMBIOTE_META.METADATA.put('VT',snapshotVT))

            .catch(e=>{

                LOG(`Problems with loading state from snapshot to state db \n${e}`,'F')

                process.exit(104)
            
            })


        LOG(`Successfully recreated state from snapshot`,'I')

    }else{

        LOG(`Snapshot is not ok - probably it's initial run or syncing from genesis`,'I')

        //Initial state of verification thread
        SYMBIOTE_META.VERIFICATION_THREAD={
            
            DATA:{},//dynamic data between blocks to prevent crushes(electricity off,system errors,etc.)
            
            FINALIZED_POINTER:{VALIDATOR:'',INDEX:'',HASH:''},//pointer to know where we should start to process further blocks

            VALIDATORS:[],//BLS pubkey0,pubkey1,pubkey2,...pubkeyN

            VALIDATORS_METADATA:{},// PUBKEY => {INDEX:<Index of finalized block>,HASH:<Hash of finalized block>,ACTIVE:<Should we check block or skip>}
            
            CHECKSUM:'',// BLAKE3(JSON.stringify(DATA)+JSON.stringify(FINALIZED_POINTER)+JSON.stringify(VALIDATORS)+JSON.stringify(VALIDATORS_METADATA))
            
        }

        
        
        //Load all the genesis files
        fs.readdirSync(process.env.GENESIS_PATH).forEach(file=>{

            //Load genesis state or data from backups(not to load state from the beginning)
            let genesis=JSON.parse(fs.readFileSync(process.env.GENESIS_PATH+`/${file}`))
        
            Object.keys(genesis.ACCOUNTS).forEach(
            
                address => promises.push(SYMBIOTE_META.STATE.put(address,genesis.ACCOUNTS[address]))
                
            )

            //Push the initial validators to verification thread
            SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.push(...genesis.VALIDATORS)
            

        })

        await Promise.all(promises.splice(0))

        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.forEach(
            
            pubkey => SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[pubkey]={INDEX:-1,HASH:'Poyekhali!@Y.A.Gagarin',ACTIVE:true} // set the initial values
            
        )

        //Node starts to verify blocks from the first validator in genesis, so sequency matter
        
        SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER={
            
            VALIDATOR:SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS[0],
            
            INDEX:-1,
            
            HASH:'Poyekhali!@Y.A.Gagarin'
        
        }
        
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
        
        MEMPOOL:[],//to hold onchain events here(contract calls,txs,delegations and so on)
        
        //Сreate mapping for accout and it's state to optimize processes while we check blocks-not to read/write to db many times
        ACCOUNTS:new Map(),// ADDRESS => { ACCOUNT_STATE , NONCE_SET , NONCE_DUPLICATES , OUT , TYPE }

        EVENTS_STATE:new Map(),// EVENT_KEY(on symbiote) => EVENT_VALUE

        BLACKLIST:new Set(),//To sift addresses which spend more than has when we check another block

        NEAR:[],//Peers to exchange data with

        STUFF_CACHE:new Map(),// BLS pubkey => destination(domain:port,node ip addr,etc.) | 

        VALIDATORS_PROOFS_CACHE:new Map(),

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
    
        'VALIDATORS_PROOFS',// BLS signatures of epoches/ranges

        'STUFF'//Some data like combinations of validators for aggregated BLS pubkey, endpoint <-> pubkey bindings and so on. Available stuff URL_PUBKEY_BIND | VALIDATORS_PUBKEY_COMBINATIONS | BLOCK_HASHES | .etc

    ].forEach(
        
        dbName => SYMBIOTE_META[dbName]=l(process.env.CHAINDATA_PATH+`/${dbName}`,{valueEncoding:'json'})
        
    )
    
    
    
    
    //____________________________________________Load stuff to db___________________________________________________


    Object.keys(CONFIG.SYMBIOTE.LOAD_STUFF).forEach(
        
        id => SYMBIOTE_META.STUFF.put(id,CONFIG.SYMBIOTE.LOAD_STUFF[id])
        
    )

    
    /*
    
    _____________________________________________State of symbiote___________________________________________________

    
    */

    SYMBIOTE_META.STATE=l(process.env.CHAINDATA_PATH+`/STATE`,{valueEncoding:'json'})
    
   

    //...and separate dirs for state and metadata snapshots

    SYMBIOTE_META.SNAPSHOT={

        METADATA:l(process.env.SNAPSHOTS_PATH+`/METADATA`,{valueEncoding:'json'}),

        STATE:l(process.env.SNAPSHOTS_PATH+`/STATE`,{valueEncoding:'json'})

    }





    SYMBIOTE_META.GENERATION_THREAD = await SYMBIOTE_META.METADATA.get('GT').catch(e=>
        
        e.notFound
        ?
        {
            PREV_HASH:`Poyekhali!@Y.A.Gagarin`,//Genesis hash
            NEXT_INDEX:0//So the first block will be with index 0
        }
        :
        (LOG(`Some problem with loading metadata of generation thread\nSymbiote:${SYMBIOTE_ALIAS()}\nError:${e}`,'F'),process.exit(106))
                        
    )


    let nextIsPresent = await SYMBIOTE_META.BLOCKS.get(CONFIG.SYMBIOTE.PUB+":"+SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX).catch(e=>false),//OK is in case of absence of next block

        previous=await SYMBIOTE_META.BLOCKS.get(CONFIG.SYMBIOTE.PUB+":"+(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX-1)).catch(e=>false)//but current block should present at least locally


    if(nextIsPresent || !(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX===0 || SYMBIOTE_META.GENERATION_THREAD.PREV_HASH === BLAKE3( CONFIG.SYMBIOTE.PUB + JSON.stringify(previous.e) + CONFIG.SYMBIOTE.SYMBIOTE_ID + previous.i + previous.p))){
        
        initSpinner?.stop()

        LOG(`Something wrong with a sequence of generation thread on \x1b[36;1m${SYMBIOTE_ALIAS()}`,'F')
            
        process.exit(107)

    }

    


    //________________Load metadata about symbiote-current hight,collaped height,height for export,etc.___________________




    SYMBIOTE_META.VERIFICATION_THREAD = await SYMBIOTE_META.METADATA.get('VT').catch(e=>{

        if(e.notFound){

            //Default initial value
            return {
            
                DATA:{},//dynamic data between blocks to prevent crushes(electricity off,system errors,etc.)
                
                FINALIZED_POINTER:{VALIDATOR:'',INDEX:-1,HASH:''},//pointer to know where we should start to process further blocks
    
                VALIDATORS:[],//BLS pubkey0,pubkey1,pubkey2,...pubkeyN
    
                VALIDATORS_METADATA:{},// PUBKEY => {INDEX:'',HASH:'',ACTIVE}
                
                CHECKSUM:'',// BLAKE3( JSON.stringify(DATA) + JSON.stringify(FINALIZED_POINTER) + JSON.stringify(VALIDATORS) + JSON.stringify(VALIDATORS_METADATA) )
                
            }

        }else{

            LOG(`Some problem with loading metadata of verification thread\nSymbiote:${SYMBIOTE_ALIAS()}\nError:${e}`,'F')
            
            process.exit(105)

        }
        
    })




    //________________________________________________________________MAKE SURE VERIFICATION THREAD IS OK________________________________________________________________


    //If we just start verification thread, there is no sense to do following logic
    if(SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.INDEX!==-1){

        await SYMBIOTE_META.METADATA.get('CANARY').then(async canary=>{

            let verifThread=SYMBIOTE_META.VERIFICATION_THREAD

            //If staging zone is OK
            if(verifThread.CHECKSUM===BLAKE3(JSON.stringify(verifThread.DATA)+JSON.stringify(verifThread.FINALIZED_POINTER)+JSON.stringify(verifThread.VALIDATORS)+JSON.stringify(verifThread.VALIDATORS_METADATA))){

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

                    
                    await Promise.all(promises.splice(0)).catch(e=>{

                        LOG(`Problems with loading state from staging zone of verification thread on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[31;1m\n${e}`,'F')

                        process.exit(106)

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


    //_____________________________________Set some values to stuff cache___________________________________________


    SYMBIOTE_META.STUFF_CACHE.set('VALIDATORS_AGGREGATED_PUB',Base58.encode(await bls.aggregatePublicKeys(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.map(Base58.decode))))


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
 
        process.exit(107)

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
            
            LOG(`Balance on hostchain \x1b[32;1m${
            
                tickers[i]
            
            }\x1b[36;1m is \x1b[32;1m${
                
                CONFIG.SYMBIOTE.BALANCE_VIEW?balance:'<disabled>'
            
            }   \x1b[36;1m[${CONFIG.SYMBIOTE.STOP_HOSTCHAINS[tickers[i]]?'\x1b[31;1mSTOP':'\x1b[32;1mPUSH'}\x1b[36;1m]`,'I')
        
        }
    
    }


    //____________________________________________GENERAL SYMBIOTE INFO____________________________________________


    LOG(fs.readFileSync(PATH_RESOLVE('images/events/syminfo.txt')).toString(),'S')

    LOG(`Canary is \x1b[32;1m<OK>`,'I')

    LOG(`Local verification thread state is \x1b[32;1m${SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.VALIDATOR} \u001b[38;5;168m}———{\x1b[32;1m ${SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.INDEX} \u001b[38;5;168m}———{\x1b[32;1m ${SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.HASH}`,'I')




    //Ask to approve current set of hostchains
    !CONFIG.PRELUDE.OPTIMISTIC
    &&        
    await new Promise(resolve=>
    
        readline.createInterface({input:process.stdin, output:process.stdout, terminal:false})
            
        .question(`\n ${'\u001b[38;5;23m'}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${'\x1b[36;1m'}  Do you agree with the current set of hostchains? Enter \x1b[32;1mYES\x1b[36;1m to continue ———> \x1b[0m`,resolve)
                
    ).then(answer=>answer!=='YES'&& process.exit(108))

    
    SIG_PROCESS={VERIFY:false,GENERATE:false}//we should track events in both threads-as in verification,as in generation

},



/*



*/
GRAB_ACTIVITY_FLAGS=()=>{
    
    fetch(CONFIG.SYMBIOTE.GET_CURRENT_VALIDATORS_SET+'/getvalidators').then(r=>r.json()).then(async currentValidators=>{

        LOG(`Received list of current validators.Preparing to <ALIVE_VALIDATOR> procedure`,'S')

        let promises=[]

        //0. Initially,try to get pubkey => node_ip binding 
        currentValidators.forEach(
        
            pubkey => promises.push(GET_STUFF(pubkey))
            
        )
    
        let pureUrls = await Promise.all(promises.splice(0)).then(array=>array.filter(Boolean).map(x=>x.payload.url))
        
        //We'll use it to aggreage it to single tx and store locally to allow you to share over the network to include it to one of the block 
        let pingBackMsgs = []

        //Send message to each validator to return our generation thread "back to the game"

        /*
    
            helloMessage looks like this
     
            {
                "V":<Pubkey of validator>
                "S":<Signature of hash of his metadata from VALIDATORS_METADATA> e.g. SIG(BLAKE3(SYMBIOTE_META.VALIDATORS_METADATA[<PubKey>]))
            }

        */

        let helloMessage = {
            
            V:CONFIG.SYMBIOTE.PUB,

            S:await SIG(BLAKE3(CONFIF.SYMBIOTE.VALIDATORS_METADATA[CONFIG.SYMBIOTE.PUB]))
        
        },

        answer={}

        for(let url of pureUrls) {

            pingBackMsgs.push(fetch(url+'/votetoalive',{method:'POST',body:JSON.stringify(helloMessage)})
            
                .then(r=>r.json())
                
                .then(resp=>{

                    /*
                    
                        Response is

                            {P:CONFIG.SYMBIOTE.PUB,S:<Validator signa>}


                    */

                })

                .catch(e=>LOG(`Validator ${url} send no data to <ALIVE>`,'W'))

            )

        }


        await Promise.all(pingBackMsgs.splice(0))


    }).catch(e=>LOG(`Can't get current validators set`,'W'))

},




RUN_SYMBIOTE=async()=>{


    await PREPARE_SYMBIOTE()


    if(!CONFIG.SYMBIOTE.STOP_WORK){

        //Start verification process
        await START_VERIFY_POLLING()

        let promises=[]

        //Check if bootstrap nodes is alive
        CONFIG.SYMBIOTE.BOOTSTRAP_NODES.forEach(endpoint=>

            promises.push(
                        
                fetch(endpoint+'/addnode',{method:'POST',body:JSON.stringify([CONFIG.SYMBIOTE.SYMBIOTE_ID,CONFIG.SYMBIOTE.MY_HOSTNAME])})
            
                    .then(res=>res.text())
            
                    .then(val=>LOG(val==='OK'?`Received pingback from \x1b[32;1m${endpoint}\x1b[36;1m. Node is \x1b[32;1malive`:`No positive answer from bootstrap ${endpoint}`,'I'))
            
                    .catch(error=>LOG(`Bootstrap node \x1b[32;1m${endpoint}\x1b[31;1m send no response or some error occured \n${error}`,'F'))
                        
            )

        )

        await Promise.all(promises.splice(0))


        //______________________________________________________RUN BLOCKS GENERATION PROCESS____________________________________________________________


        //Start generate blocks
        !CONFIG.SYMBIOTE.STOP_GENERATE_BLOCKS && setTimeout(()=>{
                
            global.STOP_GEN_BLOCKS_CLEAR_HANDLER=false
                
            GEN_BLOCKS_START_POLLING()

            GRAB_ACTIVITY_FLAGS()
            
        },CONFIG.SYMBIOTE.BLOCK_GENERATION_INIT_DELAY)


        //Run another thread to ask for blocks
        // GET_BLOCKS_FOR_FUTURE_WRAPPER()

    }

}