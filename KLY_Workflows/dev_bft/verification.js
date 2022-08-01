import {LOG,SYMBIOTE_ALIAS,BLAKE3} from '../../KLY_Utils/utils.js'

import {GET_SYMBIOTE_ACC,BLOCKLOG,VERIFY} from './utils.js'

import Block from './essences/block.js'

import fetch from 'node-fetch'




//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let




PERFORM_BLOCK_MULTISET=blocksSet=>Object.keys(blocksSet).forEach(
            
    async blockIndex => {

        let block=blocksSet[blockIndex],

            blockHash=Block.genHash(block.e,block.i,block.p)

        if(await VERIFY(blockHash,block.sig,block.c)){

            SYMBIOTE_META.BLOCKS.put(block.i,block)

        }

    }

),




//Initially we ask blocks from CONFIG.SYMBIOTE.GET_MULTI node. It might be some CDN service, special API, private fast node and so on
GET_FORWARD_BLOCKS = fromHeight => {

    fetch(CONFIG.SYMBIOTE.GET_MULTI+`/multiplicity/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/${fromHeight}`)

    .then(r=>r.json()).then(PERFORM_BLOCK_MULTISET).catch(async error=>{
        
        LOG(`Some problem when load multiplicity of blocks on \x1b[32;1m${SYMBIOTE_ALIAS()}\n${error}`,'I')
    
        LOG(`Going to ask for blocks from the other nodes(\x1b[32;1mGET_MULTI\x1b[36;1m node is \x1b[31;1moffline\x1b[36;1m or another error occured)`,'I')

        //Combine all nodes we know about and try to find block there
        let allVisibleNodes=[CONFIG.SYMBIOTE.GET_MULTI,...CONFIG.SYMBIOTE.BOOTSTRAP_NODES,...SYMBIOTE_META.NEAR]



        for(let url in allVisibleNodes){

            let itsProbablySetOfBlocks=await fetch(url+`/multiplicity/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/${fromHeight}`).then(r=>r.json()).catch(e=>false)

            if(itsProbablySetOfBlocks){

                PERFORM_BLOCK_MULTISET(itsProbablySetOfBlocks)

                return //and leave function

            }

        }

    })

},




//Make all advanced stuff here-check block locally or ask from "GET_BLOCKS_URI" node for new blocks
//If no answer - try to find blocks somewhere else

GET_BLOCK = blockId => SYMBIOTE_META.BLOCKS.get(blockId).catch(e=>

    fetch(CONFIG.SYMBIOTE.GET_BLOCKS_URI+`/block/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/`+blockId)

    .then(r=>r.json()).then(block=>{

        let hash=Block.genHash(block.e,block.i,block.p)
            
        if(typeof block.e==='object'&&typeof block.i==='number'&&typeof block.p==='string'&&typeof block.sig==='string' && block.c === SYMBIOTE_META.VERIFICATION_THREAD.MASTER_VALIDATOR){

            BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m  fetched  \x1b[31m——│`,'S',hash,48,'\x1b[31m',block)

            //Try to instantly and asynchronously load more blocks if it's possible
            GET_FORWARD_BLOCKS(blockId+1)

            return block

        }

    }).catch(async error=>{

        LOG(`No block \x1b[36;1m${blockId}\u001b[38;5;3m for symbiote \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m ———> ${error}`,'W')

        LOG(`Going to ask for blocks from the other nodes(\x1b[32;1mGET_BLOCKS_URI\x1b[36;1m node is \x1b[31;1moffline\x1b[36;1m or another error occured)`,'I')

        //Combine all nodes we know about and try to find block there
        let allVisibleNodes=[CONFIG.SYMBIOTE.GET_MULTI,...CONFIG.SYMBIOTE.BOOTSTRAP_NODES,...SYMBIOTE_META.NEAR]


        for(let url in allVisibleNodes){

            let itsProbablyBlock=await fetch(url+`/block/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/`+blockId).then(r=>r.json()).catch(e=>false)

            if(itsProbablyBlock){

                let hash=Block.genHash(itsProbablyBlock.e,itsProbablyBlock.i,itsProbablyBlock.p)
            

                if(typeof itsProbablyBlock.e==='object'&&typeof itsProbablyBlock.i==='number'&&typeof itsProbablyBlock.p==='string'&&typeof itsProbablyBlock.sig==='string'){

                    BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m  fetched  \x1b[31m——│`,'S',hash,48,'\x1b[31m',block)

                    //Try to instantly and asynchronously load more blocks if it's possible
                    GET_FORWARD_BLOCKS(blockId+1)

                    return itsProbablyBlock

                }

            }

        }
        
    })

),




START_VERIFY_POLLING=async()=>{


    //This option will stop workflow of verification for each symbiote
    if(!SYSTEM_SIGNAL_ACCEPTED){

        THREADS_STILL_WORKS.GENERATION=true

        //Try to get block
        let blockId=SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX+1,
        
            block=await GET_BLOCK(blockId), nextBlock
    

    
            
        if(block){

            await verifyBlock(block)

            //Signal that verification was successful
            if(blockId===SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX) nextBlock=await GET_BLOCK(SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX+1)

            //If verification failed - delete block. It will force to find another(valid) block from network
            else SYMBIOTE_META.BLOCKS.del(blockId).catch(e=>'')

        }

        LOG(nextBlock?'Next is available':`Wait for nextblock \x1b[36;1m${SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX+1}`,'W')

        console.log('VT ',SYMBIOTE_META.VERIFICATION_THREAD)
        console.log('GT ',SYMBIOTE_META.GENERATION_THREAD)

        if(CONFIG.SYMBIOTE.STOP_VERIFY) return//step over initiation of another timeout and this way-stop the Verification thread


        //If next block is available-instantly start perform.Otherwise-wait few seconds and repeat request
        setTimeout(()=>START_VERIFY_POLLING(),nextBlock?0:CONFIG.SYMBIOTE.VERIFICATION_THREAD_POLLING)

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




checkBFTProofForBlock=async blockId=>{

    return true

},




verifyBlock=async block=>{


    let blockHash=Block.genHash(block.e,block.i,block.p),


    overviewOk=
    
        block.e?.length<=CONFIG.SYMBIOTE.MANIFEST.EVENTS_LIMIT_PER_BLOCK
        &&
        block.c === SYMBIOTE_META.VERIFICATION_THREAD.MASTER_VALIDATOR
        &&
        SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_HASH === block.p//it should be a chain
        &&
        await checkBFTProofForBlock(block.i)
        &&
        await VERIFY(blockHash,block.sig,block.c)

    
    if(block.i === CONFIG.SYMBIOTE.CHECKPOINT.HEIGHT && blockHash !== CONFIG.SYMBIOTE.CHECKPOINT.HEIGHT){

        LOG(`Checkpoint verification failed. Delete the CHAINDATA/BLOCKS,CHAINDATA/METADATA,CHAINDATA/STATE and SNAPSHOTS. Resync node with the right blockchain or load the true snapshot`,'F')

        LOG('Going to stop...','W')

        process.emit('SIGINT')

    }



    if(overviewOk){

                
        let rewardBox=new Map()//To split fees

        //_________________________________________GET ACCOUNTS FROM STORAGE____________________________________________
        

        let sendersAccounts=[]
        
        //Go through each event,get accounts of initiators from state by creating promise and push to array for faster resolve
        block.e.forEach(event=>sendersAccounts.push(GET_SYMBIOTE_ACC(event.c)))
        
        //Push accounts of creators of InstantBlock
        rewardBox.forEach(reference=>sendersAccounts.push(GET_SYMBIOTE_ACC(reference.creator)))

        //Now cache has all accounts and ready for the next cycles
        await Promise.all(sendersAccounts.splice(0))
        


        //______________________________________CALCULATE TOTAL FEES AND AMOUNTS________________________________________

        block.e.forEach(event=>{

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


        //___________________________________________START TO PERFORM EVENTS____________________________________________

        
        let eventsPromises=[]


        block.e.forEach(event=>
                
            //If verifier to such event exsist-then verify it!
            SYMBIOTE_META.VERIFIERS[event.t]
            &&
            eventsPromises.push(SYMBIOTE_META.VERIFIERS[event.t](event,''))

        )
        
        await Promise.all(eventsPromises.splice(0))

        LOG(`BLACKLIST size(\u001b[38;5;177m${block.i}\x1b[32;1m ### \u001b[38;5;177m${blockHash}\u001b[38;5;3m) ———> \x1b[36;1m${SYMBIOTE_META.BLACKLIST.size}`,'W')

        
        //_________________________________________________SHARE FEES___________________________________________________
        
        
        // let controllerAcc=await GET_SYMBIOTE_ACC(symbiote)

        // rewardBox.forEach(reference=>{
        
        //     let acc=GET_SYMBIOTE_ACC(reference.creator),
                
        //         toInstant=reference.fees*CONFIG.SYMBIOTE.MANIFEST.GENERATOR_FEE//% of block to generator
                
        //     acc.ACCOUNT.B+=toInstant

        //     controllerAcc.ACCOUNT.B+=reference.fees-toInstant

        // })
        

        //Probably you would like to store only state or you just run another node via cloud module and want to store some range of blocks remotely
        if(CONFIG.SYMBIOTE.STORE_BLOCKS){
            
            //No matter if we already have this block-resave it

            SYMBIOTE_META.BLOCKS.put(block.i,block).catch(e=>LOG(`Failed to store block ${block.i} on ${SYMBIOTE_ALIAS()}\nError:${e}`,'W'))

        }else{

            //...but if we shouldn't store and have it locally(received probably by range loading)-then delete
            SYMBIOTE_META.BLOCKS.del(block.i).catch(
                
                e => LOG(`Failed to delete block ${block.i} on ${SYMBIOTE_ALIAS()}\nError:${e}`,'W')
                
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


        SYMBIOTE_META.VERIFICATION_THREAD.CHECKSUM=BLAKE3(JSON.stringify(snapshot)+block.i+blockHash+JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS)+SYMBIOTE_META.VERIFICATION_THREAD.MASTER_VALIDATOR+SYMBIOTE_META.VERIFICATION_THREAD.EPOCH_START)//like in network packages


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

        //Here we check if has proofs for this block in any hostchain for this symbiote.So here we check workflow

        let workflow=CONFIG.SYMBIOTE.WORKFLOW_CHECK.HOSTCHAINS
        
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