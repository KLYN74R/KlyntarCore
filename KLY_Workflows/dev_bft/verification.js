import {VERIFY,LOG,BLOCKLOG,SYMBIOTE_ALIAS,BLAKE3} from '../../KLY_Utils/utils.js'

import {GET_SYMBIOTE_ACC} from './utils.js'

import Block from './essences/block.js'

import fetch from 'node-fetch'




//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let




GET_FORWARD_BLOCKS = fromHeight => {

    fetch(CONFIG.SYMBIOTE.GET_MULTI+`/multiplicity/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/${fromHeight}`)

    .then(r=>r.json()).then(blocksSet=>{

        Object.keys(blocksSet).forEach(
            
            async blockIndex => {

                let block=blocksSet[blockIndex],

                    blockHash=Block.genHash(block.e,block.i,block.p)
    
                if(await VERIFY(blockHash,block.sig,block.c)){

                    SYMBIOTE_META.BLOCKS.put(block.i,block)

                }

            }

        )

    }).catch(
        
        e => LOG(`Some problem when load multiplicity of blocks on \x1b[32;1m${SYMBIOTE_ALIAS()}`,'I')
    
    )

},




//Make all advanced stuff here-check block locally or ask from "GET_CONTROLLER" for set of block and ask them asynchronously
GET_BLOCK = blockId => SYMBIOTE_META.BLOCKS.get(blockId).catch(e=>

    //FOR FUTURE:
    //Request and get current height of symbiote from CONTROLLER(maxId will be returned)
    //Then we ask for block with <blockId> and asynchronously request the other blocks
    
    fetch(CONFIG.SYMBIOTE.GET_BLOCKS_URI+`/block/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/`+blockId)

    .then(r=>r.json()).then(block=>{

        //FOR FUTURE:ASK another blocks for future process optimization here

        let hash=Block.genHash(block.e,block.i,block.p)
            
        if(typeof block.e==='object'&&typeof block.i==='number'&&typeof block.p==='string'&&typeof block.sig==='string'){

            BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m  fetched  \x1b[31m——│`,'S',hash,59,'\x1b[31m',block.i)

            //Try to instantly and asynchronously load more blocks if it's possible
            GET_FORWARD_BLOCKS(blockId+1)

            return block

        }

    }).catch(e=>LOG(`No block \x1b[36;1m${blockId}\u001b[38;5;3m for symbiote \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m ———> ${e}`,'W'))


),




START_VERIFY_POLLING=async()=>{


    //This option will stop workflow of verification for each symbiote
    if(!SYSTEM_SIGNAL_ACCEPTED){

        THREADS_STILL_WORKS.GENERATION=true

        //Try to get block
        let verifThread=SYMBIOTE_META.VERIFICATION_THREAD,
            
            blockId=verifThread.COLLAPSED_INDEX+1,
        
            block=await GET_BLOCK(blockId), nextBlock
    

            
        if(block){

            await verifyBlock(block)

            //Signal that verification was successful
            if(blockId===verifThread.COLLAPSED_INDEX) nextBlock=await GET_BLOCK(verifThread.COLLAPSED_INDEX+1)

        }

        LOG(nextBlock?'Next is available':`Wait for nextblock \x1b[36;1m${verifThread.COLLAPSED_INDEX+1}`,'W')


        if(CONFIG.SYMBIOTE.STOP_VERIFY) return//step over initiation of another timeout and this way-stop the Verification thread


        //If next block is available-instantly start perform.Otherwise-wait few seconds and repeat request
        setTimeout(()=>START_VERIFY_POLLING(),nextBlock?0:CONFIG.SYMBIOTE.CONTROLLER_POLLING)

        //Probably no sense to stop polling via .clearTimeout()
        //UPD:Do it to provide dynamic functionality for start/stop Verification Thread
        
        THREADS_STILL_WORKS.GENERATION=false

    
    }else{

        LOG(`Polling for \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[36;1m was stopped`,'I',CONFIG.SYMBIOTE.SYMBIOTE_ID)

        SIG_PROCESS.VERIFY=true

    }

},




MAKE_SNAPSHOT=async()=>{

    let {SNAPSHOT,STATE,VERIFICATION_THREAD,METADATA}=SYMBIOTE_META,//get appropriate dbs & descriptors of symbiote


        //Get current height canary
        canary=await METADATA.get('CANARY').catch(e=>{
            
            LOG(`Can't load canary for snapshot of \x1b[36;1m${SYMBIOTE_ALIAS()}\n${e}`,'W')

            return false
        
        })



    
    //Delete old canary and VT.Now we can't use snapshot till the next canary will be added(in the end of snapshot creating)
    await SNAPSHOT.METADATA.del('CANARY').then(()=>SNAPSHOT.METADATA.del('VT')).catch(e=>{

        LOG(`Can't delete canary or VT from snapshot on \x1b[36;1m${SYMBIOTE_ALIAS()}\n\x1b[31;1m${e}`,'F')

        process.emit('SIGINT',137)

    })




    //_____________________________________________________Now we can make snapshot_____________________________________________________

    LOG(`Start making snapshot for ${SYMBIOTE_ALIAS()}`,'I')

    
    //Init in-memory caches
    let records={}


    //Check if we should do full or partial snapshot.See https://github.com/KLYN74R/CIIPs
    if(CONFIG.SYMBIOTE.SNAPSHOTS.ALL){
        
        await new Promise(
        
            resolve => STATE.createReadStream()
            
                            .on('data',data=>records[data.key]=data.value)//add state of each account to snapshot dbs
            
                            .on('close',resolve)
            
    
        ).catch(
    
            e => {
    
                LOG(`Snapshot creation failed on state copying stage for ${SYMBIOTE_ALIAS()}\n${e}`,'W')
                
                process.emit('SIGINT',130)
    
            }
    
        )

    }else{

        //Read only part of state to make snapshot for backups
        //Set your own policy of backups with your other nodes,infrastructure etc.
        let choosen=JSON.parse(process.env.SNAPSHOTS_PATH+`/separation/${CONFIG.SYMBIOTE.SYMBIOTE_ID}.json`),
        
            getPromises=[]


        choosen.forEach(
            
            recordId => getPromises.push(STATE.get(recordId).then(acc=>records[recordId]=acc))
            
        )


        await Promise.all(getPromises.splice(0)).catch( e => {
    
            LOG(`Snapshot creation failed on getting choosen records for ${SYMBIOTE_ALIAS()}\n${e}`,'W')
            
            process.emit('SIGINT',130)

        })
        

    }
    

    let write=[]

    Object.keys(records).forEach(id=>write.push(SNAPSHOT.STATE.put(id,records[id])))




    //After that-put another updated canary,to tell the core that this snapshot is valid and state inside is OK
    await Promise.all(write)
    
                    .then(_=>SNAPSHOT.METADATA.put('CANARY',canary))//put canary to snapshot
                    
                    .then(()=>SNAPSHOT.METADATA.put('VT',VERIFICATION_THREAD))//...and VERIFICATION_THREAD(to get info about collapsed height,hash etc.)
                    
                    .catch(e => {

                        LOG(`Snapshot creation failed for ${SYMBIOTE_ALIAS()}\n${e}`,'W')
        
                        process.emit('SIGINT',130)

                    })

    LOG(`Snapshot was successfully created for \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m on height \x1b[36;1m${VERIFICATION_THREAD.COLLAPSED_INDEX}`,'S')




},




verifyBlock=async block=>{




    let symbiote=block.c,
    
        blockHash=Block.genHash(block.e,block.i,block.p)



    /*  Maximum 100 InstantBlocks per 1 ControllerBlock(set in configs)
        
        We have maximum N*K events where N-number of InstantBlocks and K-number of events

        It's better to take 100 blocks from different creators with 100 events instead of 10 blocks with 1000 events-this we'll accept from bigger range of creators
    */

    let overviewOk=
    
        block.e?.length<=CONFIG.SYMBIOTE.MANIFEST.EVENTS_LIMIT_PER_BLOCK
        &&
        SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_HASH === block.p
        &&
        await VERIFY(blockHash,block.sig,block.c)
   



    //block.a.length<=100.At least this limit is only for first times
    if(overviewOk){




        //____________________________________GET TXS FROM INSTANT BLOCK TO SIFT THEM___________________________________
        
        
        let rewardBox=new Map(),//To split fees
        
            eventsToSift=new Map(),
            
            getBlocksPromises=[]
        



        /*
            █▀█
            █▄█.Zirst of all,get all InstantBlocks,move to INSTANT_BLOCKS db and delete from candidates
        */
        for(let i=0,l=block.a.length;i<l;i++){
            
            /*
            
              ▄█
              ░█.Try to get it from local storage-we assume that block was delivered to our node earlier
            
            */
            getBlocksPromises.push(SYMBIOTE_META.CANDIDATES.get(block.a[i]).then(instantBlock=>

                eventsToSift.set(block.a[i],instantBlock.e)
                &&
                SET_INSTANT_BLOCK(SYMBIOTE_META,block.a[i],instantBlock,rewardBox)
            
            ).catch(e=>
                
                /*  
                  ▀█
                  █▄.If no block locally-get from some reliable source,we defined in config file(cloud,CDN,some cluster-something which are fast,reliable and has ~100% uptime)
                */
               
                fetch(CONFIG.SYMBIOTE.GET_INSTANT+`/block/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/i/`+block.a[i]).then(r=>r.json()).then(async instant=>

                    //Check hash and if OK-sift events from inside,otherwise-occur exception to ask block from another sources
                    InstantBlock.genHash(instant.c,instant.e)===block.a[i]&&await VERIFY(block.a[i],instant.sig,instant.c)
                    ?
                    eventsToSift.set(block.a[i],instant.e)&&SET_INSTANT_BLOCK(SYMBIOTE_META,block.a[i],instant,rewardBox)
                    :
                    new Error()

                ).catch(async e=>{
                    
                    LOG(`No InstantBlock for \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m even from GET_INSTANT service`,'W')
                    
                    //3.Last chance-ask from nodes directly | Последний рубеж-запрос из NEAR или BOOTSTRAP_NODES напрямую
                    let permNear=CONFIG.SYMBIOTE.BOOTSTRAP_NODES,breakPoint=false

                    
                    
                    for(let j=0;j<permNear.length;j++){
                    
                        if(breakPoint) break//no more ense to ask the rest nodes if we get block

                        await fetch(permNear[j]+`/block/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/i/`+block.a[i]).then(r=>r.json()).then(async instant=>

                            InstantBlock.genHash(instant.c,instant.e)===block.a[i]
                            &&
                            await VERIFY(block.a[i],instant.sig,instant.c)
                            &&
                            eventsToSift.set(block.a[i],instant.e)
                            &&
                            (await SET_INSTANT_BLOCK(SYMBIOTE_META,block.a[i],instant,rewardBox),breakPoint=true)
                            
                        ).catch(e=>'')
                    
                    }
                   
                    

                    !eventsToSift.has(block.a[i])
                    &&                        
                    LOG(`Unfortunately,can't get InstantBlock \x1b[36;1m${block.a[i]}\x1b[31;1m on \x1b[36;1m${SYMBIOTE_ALIAS()}`,'F')
                    
                
                })

            ))
        
        }


        await Promise.all(getBlocksPromises.splice(0)) 


        if(eventsToSift.size!==block.a.length){

            LOG(`Going to ask for InstantBlocks later for \x1b[36;1m${SYMBIOTE_ALIAS()}`,'W')

            return
        
        }
        



        //_________________________________________GET ACCOUNTS FROM STORAGE____________________________________________
        

        let sendersAccounts=[]
        
        //Go through each event,get accounts of initiators from state by creating promise and push to array for faster resolve
        eventsToSift.forEach(eventsSet=>
             
            eventsSet.forEach(event=>sendersAccounts.push(GET_SYMBIOTE_ACC(event.c)))
                
        )

        //Push accounts of creators of InstantBlock
        rewardBox.forEach(reference=>sendersAccounts.push(GET_SYMBIOTE_ACC(reference.creator)))

        //Now cache has all accounts and ready for the next cycles
        await Promise.all(sendersAccounts.splice(0))
        


        //______________________________________CALCULATE TOTAL FEES AND AMOUNTS________________________________________


        eventsToSift.forEach(eventsSet=>
            
            eventsSet.forEach(event=>{

                //O(1),coz it's set
                if(!SYMBIOTE_META.BLACKLIST.has(event.c)){

                    
                    let acc=GET_SYMBIOTE_ACC(event.c),
                        
                        spend=SYMBIOTE_META.SPENDERS[event.t]?.(event) || 1



                            
                    //If no such address-it's a signal that transaction can't be accepted
                    if(!acc) return;
                 
                    (event.n<=acc.ACCOUNT.N||acc.NS.has(event.n)) ? acc.ND.add(event.n) : acc.NS.add(event.n);
        
                    if((acc.OUT-=spend)<0 || !SYMBIOTE_META.SPENDERS[event.t]) SYMBIOTE_META.BLACKLIST.add(event.c)

                }

            })
                
        )




        //___________________________________________START TO PERFORM EVENTS____________________________________________

        
        let eventsPromises=[]


        eventsToSift.forEach((eventsSet,hash)=>{
    
            eventsSet.forEach(event=>
                
                //If verifier to such event exsist-then verify it!
                SYMBIOTE_META.VERIFIERS[event.t]
                &&
                eventsPromises.push(SYMBIOTE_META.VERIFIERS[event.t](event,rewardBox.get(hash)))

                //Stress test.DELETE
                //txsPromises.push(VERIFY('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','4ViaOoL3HF5lamTh0ZjGbLVg+59dfk5cebJGKRDtRf29l0hIbS5PHfUNt2GCUdHS+AFqs1ZU+l6cpMYkSbw3Aw==','J+tMlJexrc5bwof9oIpKiRxQy84VmZhMfdIJa53GSY4='))
            )
                        
        })
        
        await Promise.all(eventsPromises.splice(0))

        LOG(`BLACKLIST size(\u001b[38;5;177m${block.i}\x1b[32;1m ### \u001b[38;5;177m${blockHash}\u001b[38;5;3m) ———> \x1b[36;1m${SYMBIOTE_META.BLACKLIST.size}`,'W')

        


        //_________________________________________________SHARE FEES___________________________________________________
        

        //Instant generator receive 80% of fees from his created block,controller receive 20% of his block
        
        let controllerAcc=await GET_SYMBIOTE_ACC(symbiote)

        rewardBox.forEach(reference=>{
        
            let acc=GET_SYMBIOTE_ACC(reference.creator),
                
                toInstant=reference.fees*CONFIG.SYMBIOTE.MANIFEST.GENERATOR_FEE//% of block to generator
                
            acc.ACCOUNT.B+=toInstant

            controllerAcc.ACCOUNT.B+=reference.fees-toInstant

        })
        

        //Probably you would like to store only state or you just run another node via cloud module and want to store some range of blocks remotely
        if(CONFIG.SYMBIOTE.STORE_BLOCKS){
            
            //No matter if we already have this block-resave it

            SYMBIOTE_META.BLOCKS.put(block.i,block).catch(e=>LOG(`Failed to store ControllerBlock ${block.i} on ${SYMBIOTE_ALIAS()}\nError:${e}`,'W'))

        }else{

            //...but if we shouldn't store and have it locally(received probably by range loading)-then delete
            SYMBIOTE_META.BLOCKS.del(block.i).catch(
                
                e => LOG(`Failed to delete ControllerBlock ${block.i} on ${SYMBIOTE_ALIAS()}\nError:${e}`,'W')
                
            )

        }


        //________________________________________________COMMIT STATE__________________________________________________    

        SYMBIOTE_META.VERIFICATION_THREAD.DATA={}//prepare empty staging data


        let promises=[],snapshot={ACCOUNTS:{},EVENTS:{}}
        


        
        //Commit state
        //Use caching(such primitive for the first time)
        if(SYMBIOTE_META.ACCOUNTS.size>=CONFIG.SYMBIOTE.BLOCK_TO_BLOCK_CACHE_SIZE){

            SYMBIOTE_META.ACCOUNTS.forEach((acc,addr)=>{

                promises.push(SYMBIOTE_META.STATE.put(addr,acc.ACCOUNT))

                snapshot.ACCOUNTS[addr]=acc.ACCOUNT

            })
            
            SYMBIOTE_META.ACCOUNTS.clear()//flush cache.NOTE-some kind of advanced upgrade soon
        
        }else{
            
            SYMBIOTE_META.ACCOUNTS.forEach((acc,addr)=>{

                promises.push(SYMBIOTE_META.STATE.put(addr,acc.ACCOUNT))
            
                snapshot.ACCOUNTS[addr]=acc.ACCOUNT



                //Update urgent balance for the next blocks
                acc.OUT=acc.ACCOUNT.B

                //Clear sets of nonces(NOTE: Optional chaining here because some accounts are newly created)
                acc.NS?.clear()
                acc.ND?.clear()

            })
        
        }


        
        //Create for each type of events which occured changes
        SYMBIOTE_META.EVENTS_STATE.forEach(
            
            (eventChanges,eventId)=>{

                //Add to snapshot for durability
                snapshot.EVENTS[eventId]=eventChanges

                //...and definitely to state
                promises.push(SYMBIOTE_META.STATE.put(eventId,eventChanges))

            }
        
        )




        SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX=block.i
                
        SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_HASH=blockHash

        SYMBIOTE_META.VERIFICATION_THREAD.DATA=snapshot


        SYMBIOTE_META.VERIFICATION_THREAD.CHECKSUM=BLAKE3(JSON.stringify(snapshot)+block.i+blockHash)//like in network packages


        //Make commit to staging area
        await SYMBIOTE_META.METADATA.put('VT',SYMBIOTE_META.VERIFICATION_THREAD)



        
        SYMBIOTE_META.EVENTS_STATE.clear()

        //Also just clear and add some advanced logic later-it will be crucial important upgrade for process of phantom blocks
        SYMBIOTE_META.BLACKLIST.clear()

        


        //____________________________________NOW WE CAN SAFELY WRITE STATE OF ACCOUNTS_________________________________
        

        await Promise.all(promises.splice(0)).then(()=>
            
            SYMBIOTE_META.METADATA.put('CANARY',SYMBIOTE_META.VERIFICATION_THREAD.CHECKSUM)//canary is the signal that current height is verified and you can continue from this point

        ).catch(e=>{
            
            LOG(`Problem when write to state or canary on \x1b[36;1m${SYMBIOTE_ALIAS()}\n${e}`,'F')
            
            process.emit('SIGINT',108)
        
        })

        //__________________________________________CREATE SNAPSHOT IF YOU NEED_________________________________________

        block.i!==0//no sense to snaphost if no blocks yet
        &&
        CONFIG.SYMBIOTE.SNAPSHOTS.ENABLE//probably you don't won't to make snapshot on this machine
        &&
        block.i%CONFIG.SYMBIOTE.SNAPSHOTS.RANGE===0//if it's time to make snapshot(e.g. next 200th block generated)
        &&
        await MAKE_SNAPSHOT()


        //____________________________________________FINALLY-CHECK WORKFLOW____________________________________________




        //Controller shouldn't check
        if(!CONFIG.SYMBIOTE.CONTROLLER.ME){

            let workflow=CONFIG.SYMBIOTE.WORKFLOW_CHECK.HOSTCHAINS
            //Here we check if has proofs for this block in any hostchain for this symbiote.So here we check workflow
            
            Object.keys(workflow).forEach(ticker=>
    
                workflow[ticker].STORE
                &&
                SYMBIOTE_META.HOSTCHAINS_DATA.get(block.i+ticker).then(async proof=>{

                    let response = await HOSTCHAINS.get(ticker).checkTx(proof.HOSTCHAIN_HASH,block.i,proof.KLYNTAR_HASH,symbiote).catch(e=>-1)
                        
                    if(proof.KLYNTAR_HASH===blockHash && response!=-1 && response){
    
                        LOG(`Proof for block \x1b[36;1m${block.i}\x1b[32;1m on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m verified and stored`,'S')
    
                    }else{
    
                        LOG(`Can't write proof for block \x1b[36;1m${block.i}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W')
    
                        //...send report
    
                    }
                    
                }).catch(e=>LOG(`No proofs for block \x1b[36;1m${block.i}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W'))
                
            )

        }

    }

}