import {LOG,SIG,BLOCKLOG,BROADCAST,SYMBIOTE_ALIAS,DECRYPT_KEYS,PATH_RESOLVE,BLAKE3} from '../../KLY_Utils/utils.js'

import ControllerBlock from '../../KLY_Blocks/controllerblock.js'

import InstantBlock from '../../KLY_Blocks/instantblock.js'

import {START_VERIFY_POLLING} from './verification.js'

import {symbiotes,hostchains} from '../../klyn74r.js'

import fetch from 'node-fetch'

import ora from 'ora'

import l from 'level'

import fs from 'fs'




//________________________________________________________________INTERNAL_______________________________________________________________________




let BLOCK_PATTERN=process.platform==='linux'?'——':'———',



//TODO:Add more advanced logic(e.g number of txs,ratings,etc.)
GET_TXS = symbiote => symbiotes.get(symbiote).MEMPOOL.splice(0,CONFIG.SYMBIOTES[symbiote].MANIFEST.EVENTS_LIMIT_PER_BLOCK),




//TODO:Add more advanced logic(e.g number of txs,ratings,etc.)
GET_CANDIDATES=async symbiote=>{
    
    let limit=0,
    
        promises=[],
        
        state=symbiotes.get(symbiote).STATE



    for (let [hash,creator] of symbiotes.get(symbiote).INSTANT_CANDIDATES.entries()){
        
        symbiotes.get(symbiote).INSTANT_CANDIDATES.delete(hash)
        
        //Get account of InstantBlock creator and check if he still has STAKE
        promises.push(state.get(creator).then(acc=>
            
            //If enough on balance-then pass hash.Otherwise-delete block from candidates and return "undefined" 
            acc.B>=CONFIG.SYMBIOTES[symbiote].MANIFEST.INSTANT_FREEZE
            ?
            hash
            :
            symbiotes.get(symbiote).CANDIDATES.del(hash).catch(e=>
                
                LOG(`Can't delete candidate \x1b[36;1m${hash}\x1b[33;1m on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}`,'W')
                
            )

        
        ).catch(e=>false))
        
        //Limitation
        if(limit++==CONFIG.SYMBIOTES[symbiote].MANIFEST.INSTANT_PORTION) break
    
    }
    
    //No "return await"

    let readySet=await Promise.all(promises).then(arr=>arr.filter(Boolean)).catch(e=>
    
        LOG(`Oops,set of instant blocks is empty on chain \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\n${e}`,'W'),
        
        []

    )

    return readySet


},



//Tag:ExecMap
GEN_BLOCK_START=async(symbiote,type)=>{

    if(!SIG_SIGNAL){
    
        await GEN_BLOCK(symbiote,type)

        STOP_GEN_BLOCK[symbiote][type]=setTimeout(()=>GEN_BLOCK_START(symbiote,type),CONFIG.SYMBIOTES[symbiote][type+'_BLOCK_GENERATION_TIME'])
    
        CONFIG.SYMBIOTES[symbiote]['STOP_GENERATE_BLOCK_'+type]
        &&
        clearTimeout(STOP_GEN_BLOCK[symbiote][type])
      
    }else{

        LOG(`Block generation for \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[36;1m was stopped`,'I',symbiote)

        SIG_PROCESS[symbiote].GENERATE=true

    }
    
},




RUN_POLLING=async symbiote=>{

    LOG(`Local state collapsed on \x1b[36;1m${symbiotes.get(symbiote).VERIFICATION_THREAD.COLLAPSED_INDEX}\x1b[32;1m for \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}`,'S')

    START_VERIFY_POLLING(symbiote)

}




//________________________________________________________________EXTERNAL_______________________________________________________________________




export let GEN_BLOCK=async(symbiote,blockType)=>{

    let hash,route,
    
        symbioteRef=symbiotes.get(symbiote)

    
    
    //!Here check the difference between VT and GT(VT_GT_NORMAL_DIFFERENCE)
    if(blockType==='C' && symbioteRef.VERIFICATION_THREAD.COLLAPSED_INDEX+CONFIG.SYMBIOTES[symbiote].VT_GT_NORMAL_DIFFERENCE < symbioteRef.GENERATION_THREAD.NEXT_INDEX){

        LOG(`Block generation for \u001b[38;5;m${SYMBIOTE_ALIAS(symbiote)}\x1b[36;1m skipped because GT is faster than VT. Increase \u001b[38;5;157m<VT_GT_NORMAL_DIFFERENCE>\x1b[36;1m if you need`,'I',symbiote)

        return

    }



    if(blockType==='C'){




        //_________________________________________GENERATE PORTION OF BLOCKS___________________________________________
        
        
        //To fill ControllerBlocks for maximum
        
        let phantomControllers=Math.ceil(symbiotes.get(symbiote).INSTANT_CANDIDATES.size/CONFIG.SYMBIOTES[symbiote].MANIFEST.INSTANT_PORTION),

            genThread=symbiotes.get(symbiote).GENERATION_THREAD,
    
            promises=[]//to push blocks to storage


        
        //If nothing to generate-then no sense to generate block,so return
        if(phantomControllers===0) return 



        for(let i=0;i<phantomControllers;i++){

            let arr=await GET_CANDIDATES(symbiote),
            
                conBlockCandidate=new ControllerBlock(symbiote,arr)
            

            hash=ControllerBlock.genHash(symbiote,conBlockCandidate.a,conBlockCandidate.i,genThread.PREV_HASH)
    
            conBlockCandidate.sig=await SIG(hash,PRIVATE_KEYS.get(symbiote))

            route='/cb'
            
            BLOCKLOG(`New \x1b[36m\x1b[41;1mControllerBlock\x1b[0m\x1b[32m generated ${BLOCK_PATTERN}│\x1b[36;1m`,'S',symbiote,hash,59,'\x1b[32m',conBlockCandidate.i)

            
            genThread.PREV_HASH=hash
 
            genThread.NEXT_INDEX++
 


            promises.push(symbiotes.get(symbiote).CONTROLLER_BLOCKS.put(conBlockCandidate.i,conBlockCandidate).then(()=>conBlockCandidate).catch(e=>{
                
                LOG(`Failed to store block ${conBlockCandidate.i} on ${SYMBIOTE_ALIAS(symbiote)}`,'F')

                process.emit('SIGINT',122)
            
            }))
           
        }


        

        //_______________________________________________COMMIT CHANGES___________________________________________________


        //Commit group of blocks by setting hash and index of the last one

        await Promise.all(promises).then(arr=>
            
            
            symbiotes.get(symbiote).METADATA.put('GT',genThread).then(()=>

                new Promise(resolve=>{

                    //And here we should broadcast blocks
                    arr.forEach(block=>
                    
                        Promise.all(BROADCAST(route,block,symbiote))
                    
                    )


                    //_____________________________________________PUSH TO HOSTCHAINS_______________________________________________
    
                    //Push to hostchains due to appropriate symbiote
                    Object.keys(CONFIG.SYMBIOTES[symbiote].MANIFEST.HOSTCHAINS).forEach(async ticker=>{
    
                        //TODO:Add more advanced logic
                        if(!CONFIG.SYMBIOTES[symbiote].STOP_PUSH_TO_HOSTCHAINS[ticker]){
    
                            let control=symbiotes.get(symbiote).HOSTCHAINS_WORKFLOW[ticker],
                        
                                hostchain=hostchains.get(symbiote).get(ticker),
    
                                //If previous push is still not accepted-then no sense to push new symbiote update
                                isAlreadyAccepted=await hostchain.checkTx(control.HOSTCHAIN_HASH,control.INDEX,control.KLYNTAR_HASH,symbiote).catch(e=>false)
                        
                            


                            LOG(`Check if previous commit is accepted for \x1b[32;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[36;1m on \x1b[32;1m${ticker}\x1b[36;1m ~~~> \x1b[32;1m${
                                
                                control.KLYNTAR_HASH===''?'Just start':isAlreadyAccepted
                            
                            }`,'I')
    
                            


                            if(control.KLYNTAR_HASH===''||isAlreadyAccepted){
    
                                //If accpted-we can share to the rest
                                isAlreadyAccepted
                                &&
                                Promise.all(BROADCAST('/proof',{...control,symbiote,ticker},symbiote))
                            
    
                                let index=symbiotes.get(symbiote).GENERATION_THREAD.NEXT_INDEX-1,
    
                                    symbioticHash=await hostchain.sendTx(symbiote,index,genThread.PREV_HASH).catch(e=>{
                                        
                                        LOG(`Error on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m with push to \x1b[36;1m${ticker} \n${e}`,'W')
                                    
                                        return false

                                    })
                        
    
                                if(symbioticHash){
    
                                    LOG(`Commit on ${SYMBIOTE_ALIAS(symbiote)}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m for block \x1b[36;1m${index}\x1b[32;1m is \x1b[36;1m${symbioticHash}`,'S')
    
                                    //Commit localy that we have send it
                                    control.KLYNTAR_HASH=genThread.PREV_HASH
                            
                                    control.INDEX=index
                            
                                    control.HOSTCHAIN_HASH=symbioticHash
    
                                    control.SIG=await SIG(control.KLYNTAR_HASH+control.INDEX+control.HOSTCHAIN_HASH+ticker,PRIVATE_KEYS.get(symbiote))



                                    
                                    await symbiotes.get(symbiote).HOSTCHAINS_DATA.put(index+ticker,{KLYNTAR_HASH:control.KLYNTAR_HASH,HOSTCHAIN_HASH:control.HOSTCHAIN_HASH,SIG:control.SIG})

                                                .then(()=>symbiotes.get(symbiote).HOSTCHAINS_DATA.put(ticker,control))//set such canary to avoid duplicates when quick reboot daemon
                            
                                                .then(()=>LOG(`Locally store pointer for \x1b[36;1m${index}\x1b[32;1m block of \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[32;1m on \x1b[36;1m${ticker}`,'S'))
                            
                                                .catch(e=>LOG(`Error-impossible to store pointer for \x1b[36;1m${index}\u001b[38;5;3m block of \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m on \x1b[36;1m${ticker}`,'W'))
    
    
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
        
        let insBlockCandidate=new InstantBlock(symbiote,await GET_TXS(symbiote))

        //!DELETE
        //if (block.e.length===0) return//no sense to produce empty blocks

        //_____________________________DELELTE________________________________

        //TEST DATA TO FILL THE BLOCK

        // try{
        // if(chain=='RqtrnrLAdxpUkjqKS42RKbgN1ryXad3NeJrPTBZpdyVL'){

        //     let KEYPAIR={

        //         pub: 'EHYLgeLygJM21grIVDPhPgXZiTBF1xvl5p7lOapZ534=',
        //         prv: 'MC4CAQAwBQYDK2VwBCIEIKN4J4SGoeRJuZG3bisJbSQFmqSG7XC0HFqnbbqGLX3Q'
        
        //     },
        
        //     myAddress=KEYPAIR.pub,//Ed25519 public key in BASE64
        
        //     payload='FROM_HELL',//some transaction data.In this case-it's setting up delegate
        
        //     chainNonce=await fetch('http://localhost:7777/account/ab4065daca48388061039a6f8afe81ebd45d05c665b3b8b2fb2e16737b60495b/10760b81e2f2809336d60ac85433e13e05d9893045d71be5e69ee539aa59e77e')
        
        //     .then(r=>r.json()).then(data=>data.N+1).catch(e=>{
            
        //         console.log(`Can't get chain level data`)
        
        //     }),//nonce on appropriate chain

    
        //     TXS=[]

        //     for(let i=0;i<10000;i++){
            
        //         TXS.push(
            
        //             {c:myAddress,d:payload,n:chainNonce,s:await SIG(payload+chain+chainNonce,KEYPAIR.prv)}
            
        //         )

        //         chainNonce++

        //     }

        //     block.s.push(...TXS)


        //     //test with many addresses
        //     let different=[]
            
        //     for(let i=0;i<20000;i++){
                
        //         let add=Buffer.from('TEST'+i,'utf-8').toString('base64')

        //         different.push(chains.get(chain).STATE.get(add).then(acc=>
        //             ({c:add,h:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',n:acc.N+1})
        //         ))
                
        //     }

        //     await Promise.all(different).then(txs=>block.d.push(...txs))

        // }
        // }catch{

        // }

        //_______________________________________________DELELTE________________________________

        
        hash=InstantBlock.genHash(insBlockCandidate.c,insBlockCandidate.e,symbiote)

        insBlockCandidate.sig=await SIG(hash,PRIVATE_KEYS.get(symbiote))
            
        route='/ib'

        //____________________________________TEST_____________________________


        BLOCKLOG(`New \x1b[36;1m\x1b[44;1mInstantBlock\x1b[0m\x1b[32m generated ${BLOCK_PATTERN}│`,'S',symbiote,hash,56,'\x1b[32m')

        await symbiotes.get(symbiote).CANDIDATES.put(hash,insBlockCandidate)

        Promise.all(BROADCAST(route,insBlockCandidate,symbiote))

        //These blocks also will be included
        symbiotes.get(symbiote).INSTANT_CANDIDATES.set(hash,CONFIG.SYMBIOTES[symbiote].PUB)
        
    }

},




RELOAD_STATE=async(symbiote,symbioteRef)=>{

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
                       CONFIG.SYMBIOTES[symbiote].SNAPSHOTS.ALL//we have no remote shards(first releases don't have these features)

        
       
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
        symbioteRef.VERIFICATION_THREAD.COLLAPSED_INDEX==-1 && (!CONFIG.SYMBIOTES[symbiote].CONTROLLER.ME || symbioteRef.GENERATION_THREAD.NEXT_INDEX==0) ? LOG(`Initial run with no snapshot`,'I') : LOG(`Start sync from genesis`,'W')

        symbioteRef.VERIFICATION_THREAD={COLLAPSED_HASH:'Poyekhali!@Y.A.Gagarin',COLLAPSED_INDEX:-1,DATA:{},CHECKSUM:''}

        //Load all the configs
        fs.readdirSync(process.env.GENESIS_PATH+`/${symbiote}`).forEach(file=>{

            //Load genesis state or data from backups(not to load state from the beginning)
            let genesis=JSON.parse(fs.readFileSync(process.env.GENESIS_PATH+`/${symbiote}/${file}`))
        
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
            prefixText:`\u001b[38;5;23m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})  \x1b[36;1mPreparing symbiote \x1b[32;1m${SYMBIOTE_ALIAS(symbioteId)}\x1b[0m`
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
    SYMBIOTES_LOGS_STREAMS.set(symbioteId,fs.createWriteStream(process.env.LOGS_PATH+`/${symbioteId}.txt`),{flags:'a+'});

    
    //OnlyLinuxFans.Due to incapsulation level we need to create sub-level directory for each symbiote
    [process.env.CHAINDATA_PATH,process.env.SNAPSHOTS_PATH].forEach(
        
        name => !fs.existsSync(`${name}/${symbioteId}`) && fs.mkdirSync(`${name}/${symbioteId}`)
        
    )
    

    //___________________________Load functionality to verify/filter/transform events_______________________________


    //Importnat and must be the same for symbiote at appropriate chunks of time
    await import(`./verifiers.js`).then(mod=>{
    
        symbioteRef.VERIFIERS=mod.VERIFIERS
        
        symbioteRef.SPENDERS=mod.SPENDERS    
        
    })

    //Might be individual for each node
    symbioteRef.FILTERS=(await import(`./filters.js`)).default;


    //______________________________________Prepare databases and storages___________________________________________

    


    //Create subdirs due to rational solutions
    [
        'METADATA',//important dir-cointains canaries,pointer to VERIFICATION_THREAD and GENERATION_THREADS
    
        'CONTROLLER_BLOCKS',//For Controller's blocks(key is index)
        
        'INSTANT_BLOCKS',//For Instant(key is hash)
        
        'HOSTCHAINS_DATA',//To store external flow of commits for ControllerBlocks
        
        'CANDIDATES'//For candidates(key is a hash(coz it's also InstantBlocks,but yet not included to chain))
    
    ].forEach(
        
        dbName => symbioteRef[dbName]=l(process.env.CHAINDATA_PATH+`/${symbioteId}/${dbName}`,{valueEncoding:'json'})
        
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


    symbioteRef.STATE=l(process.env.CHAINDATA_PATH+`/${symbioteId}/STATE`,{valueEncoding:'json'})
    
   

    //...and separate dirs for state and metadata snapshots

    symbioteRef.SNAPSHOT={

        METADATA:l(process.env.SNAPSHOTS_PATH+`/${symbioteId}/METADATA`,{valueEncoding:'json'}),

        STATE:l(process.env.SNAPSHOTS_PATH+`/${symbioteId}/STATE`,{valueEncoding:'json'})

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

        initSpinner?.stop()

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
        
            EvmHostChain=(await import(`../../KLY_Hostchains/connectors/${way}/evm.js`)).default
            
            hostchainmap.set(tickers[i],new EvmHostChain(symbioteId,tickers[i]))

        }else hostchainmap.set(tickers[i],(await import(`../../KLY_Hostchains/connectors/${way}/${tickers[i]}.js`)).default)



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

                LOG(`Balance of controller on hostchain \x1b[32;1m${
                
                    tickers[i]
                
                }\x1b[36;1m is \x1b[32;1m${
                    
                    CONFIG.PRELUDE.BALANCE_VIEW?balance:'<disabled>'
                
                }   \x1b[36;1m[${symbioteConfig.STOP_PUSH_TO_HOSTCHAINS[tickers[i]]?'\x1b[31;1mSTOP':'\x1b[32;1mPUSH'}\x1b[36;1m]`,'I')

            }

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




RENAISSANCE=async()=>{


    
//_____________________________________________________Connect with CONTROLLER & NODES___________________________________________________________




    let promises=[]

    
    Object.keys(CONFIG.SYMBIOTES).forEach(symbioteID=>

        !CONFIG.SYMBIOTES[symbioteID].STOP_WORK
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
            !CONFIG.SYMBIOTES[symbioteID].CONTROLLER.ME
            &&
            fetch(CONFIG.SYMBIOTES[symbioteID].CONTROLLER.ADDR+'/nodes/'+symbioteID+'/'+CONFIG.SYMBIOTES[symbioteID].REGION).then(r=>r.json()).then(
                
                async nodesArr=>{
                    
                    LOG(`Received ${nodesArr.length} addresses from ${SYMBIOTE_ALIAS(symbioteID)}...`,'I')

                    let answers=[]
                
                    //Ask if these nodes are available and ready to share data with us
                    nodesArr.forEach(
                        
                        addr => answers.push(
                            
                            fetch(addr+'/addnode',{method:'POST',body:JSON.stringify([symbioteID,CONFIG.SYMBIOTES[symbioteID].MY_ADDR])})
                        
                                    .then(res=>res.text())
                        
                                    .then(val=>val==='OK'&&symbiotes.get(symbioteID).NEAR.push(addr))
                        
                                    .catch(e=>'')
                                    
                        )
                        
                    )

                    await Promise.all(answers)
                
                    LOG(`Total nodeset ${SYMBIOTE_ALIAS(symbioteID)}...\x1b[36;1m  has ${symbiotes.get(symbioteID).NEAR.length} addresses`,'I')
                
                }
            
            ).catch(e=>LOG(`Controller of \x1b[36;1m${SYMBIOTE_ALIAS(symbioteID)}\x1b[31;1m is offline or some error has been occured\n${e}\n`,'F'))
        
        ))
        
    )


    await Promise.all(promises.splice(0))




//______________________________________________________RUN BLOCKS GENERATION PROCESS____________________________________________________________


    //Create each time when we run some block generation thread and there were no processes before
    //Don't paste it inside GEN_BLOCK_START not to repeat checks every call
    global.STOP_GEN_BLOCK={}


    //Creates two timers to generate both blocks separately and to control this flows with independent params
    Object.keys(CONFIG.SYMBIOTES).forEach(controllerAddr=>{
        
        let symbioteRef=CONFIG.SYMBIOTES[controllerAddr]

        if(!symbioteRef.STOP_WORK){
        
            //Start generate ControllerBlocks if you're controller(obviously)
            !symbioteRef.STOP_GENERATE_BLOCK_C && symbioteRef.CONTROLLER.ME && setTimeout(()=>{
                
                STOP_GEN_BLOCK[controllerAddr]={C:''}
                
                //Tag:ExecMap - run generation workflow for ControllerBlocks
                GEN_BLOCK_START(controllerAddr,'C')
            
            },symbioteRef.BLOCK_С_INIT_DELAY)



            
            !symbioteRef.STOP_GENERATE_BLOCK_I && setTimeout(()=>{

                STOP_GEN_BLOCK[controllerAddr] ? STOP_GEN_BLOCK[controllerAddr]['I']='' : STOP_GEN_BLOCK[controllerAddr]={C:'',I:''}

                //Tag:ExecMap - run generation workflow for InstantBlocks
                GEN_BLOCK_START(controllerAddr,'I')

            },symbioteRef.BLOCK_I_INIT_DELAY)

        }

    })
    
}