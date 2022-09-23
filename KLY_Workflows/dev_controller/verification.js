import {VERIFY,LOG,BLOCKLOG,SYMBIOTE_ALIAS,BLAKE3} from '../../KLY_Utils/utils.js'

import {BROADCAST,GET_ACCOUNT_ON_SYMBIOTE} from './utils.js'

import ControllerBlock from './blocks/controllerblock.js'

import InstantBlock from './blocks/instantblock.js'

import fetch from 'node-fetch'




//TODO:Provide async formatting ratings due to fair addresses and liars
let SET_INSTANT_BLOCK=async(symbioteMetaData,hash,block,rewardBox)=>{

    //If no-it's like SPV clients
    CONFIG.SYMBIOTE.STORE_INSTANT_BLOCKS
    ?
    await symbioteMetaData.INSTANT_BLOCKS.put(hash,block).catch(
        
        error => LOG(`Can't store InstantBlock \x1b[36;1m${hash})\x1b[33;1m on ${SYMBIOTE_ALIAS()}\n${error}\n`,'W')
        
    )
    :
    await symbioteMetaData.INSTANT_BLOCKS.del(hash).catch(
        
        error => LOG(`Can't delete InstantBlock \x1b[36;1m${hash})\x1b[33;1m on ${SYMBIOTE_ALIAS()}\n${error}\n`,'W')
        
    )

    //Delete useless copy from candidates
    symbioteMetaData.CANDIDATES.del(hash).catch(e=>LOG(`Can't delete candidate \x1b[36;1m${hash}\x1b[33;1m\n${e}\n`,'W'))
    
    rewardBox.set(hash,{creator:block.c,fees:0})//fees sum is 0 yet

}




//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let




GET_FORWARD_BLOCKS = fromHeight => {

    fetch(CONFIG.SYMBIOTE.GET_MULTI+`/multiplicity/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/${fromHeight}`)

    .then(r=>r.json()).then(blocksSet=>{

        /*

        Receive set in format:
            
            {
                ...

                45(index):{
                    c:<ControllerBLock object with index 45>
                    i:[<InstantBlock 0>,<InstantBlock 1>,<InstantBlock 2>,...]
                }
                
                ...

            }
        
        */

        Object.keys(blocksSet).forEach(
            
            async blockIndex => {

                let {c:controllerBlock,i:instantBlocks}=blocksSet[blockIndex],

                    controllerHash=ControllerBlock.genHash(controllerBlock.a,controllerBlock.i,controllerBlock.p)
    
                if(await VERIFY(controllerHash,controllerBlock.sig,CONFIG.SYMBIOTE.CONTROLLER.PUBKEY)){

                    SYMBIOTE_META.CONTROLLER_BLOCKS.put(controllerBlock.i,controllerBlock)

                    instantBlocks.forEach(
                        
                        iBlock => {

                            let hash=InstantBlock.genHash(iBlock.c,iBlock.e)

                            controllerBlock.a?.includes(hash) && SYMBIOTE_META.INSTANT_BLOCKS.put(hash,iBlock)

                        }
                        
                    )

                }

            }

        )

    }).catch(
        
        e => LOG(`Some problem when load multiplicity of blocks on \x1b[32;1m${SYMBIOTE_ALIAS()}`,'I')
    
    )

},




//Make all advanced stuff here-check block locally or ask from "GET_CONTROLLER" for set of block and ask them asynchronously
GET_CONTROLLER_BLOCK = blockId => SYMBIOTE_META.CONTROLLER_BLOCKS.get(blockId).catch(e=>

    //FOR FUTURE:
    //Request and get current height of symbiote from CONTROLLER(maxId will be returned)
    //Then we ask for block with <blockId> and asynchronously request the other blocks
    
    fetch(CONFIG.SYMBIOTE.GET_CONTROLLER+`/block/c/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/`+blockId)

    .then(r=>r.json()).then(block=>{

        //FOR FUTURE:ASK another blocks for future process optimization here

        let hash=ControllerBlock.genHash(block.a,block.i,block.p,CONFIG.SYMBIOTE.SYMBIOTE_ID)
            

        if(block.c===CONFIG.SYMBIOTE.CONTROLLER.PUBKEY&&typeof block.a==='object'&&typeof block.i==='number'&&typeof block.p==='string'&&typeof block.sig==='string'){

            BLOCKLOG(`New \x1b[36m\x1b[41;1mControllerBlock\x1b[0m\x1b[32m  fetched  \x1b[31m——│`,'S',hash,59,'\x1b[31m',block.i)

            //Try to instantly and asynchronously load more blocks if it's possible
            GET_FORWARD_BLOCKS(blockId+1)

            return block

        }

    }).catch(e=>LOG(`No ControllerBlock \x1b[36;1m${blockId}\u001b[38;5;3m for symbiote \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m ———> ${e}`,'W'))


),




START_VERIFY_POLLING=async()=>{


    //This option will stop workflow of verification for each symbiote
    if(!SYSTEM_SIGNAL_ACCEPTED){

        THREADS_STILL_WORKS.GENERATION=true

        //Try to get block
        let verifThread=SYMBIOTE_META.VERIFICATION_THREAD,
            
            blockId=verifThread.COLLAPSED_INDEX+1,
        
            block=await GET_CONTROLLER_BLOCK(blockId), nextBlock
    

            
        if(block){

            await verifyControllerBlock(block)

            //Signal that verification was successful
            if(blockId===verifThread.COLLAPSED_INDEX) nextBlock=await GET_CONTROLLER_BLOCK(verifThread.COLLAPSED_INDEX+1)

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




verifyControllerBlock=async controllerBlock=>{




    let symbiote=controllerBlock.c,
    
        controllerHash=ControllerBlock.genHash(controllerBlock.a,controllerBlock.i,controllerBlock.p,CONFIG.SYMBIOTE.SYMBIOTE_ID)



    /*  Maximum 100 InstantBlocks per 1 ControllerBlock(set in configs)
        
        We have maximum N*K events where N-number of InstantBlocks and K-number of events

        It's better to take 100 blocks from different creators with 100 events instead of 10 blocks with 1000 events-this we'll accept from bigger range of creators
    */

    let overviewOk=
    
        controllerBlock.a?.length<=CONFIG.SYMBIOTE.MANIFEST.CONTROLLER_BLOCK_MAX_SIZE
        &&
        SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_HASH === controllerBlock.p
        &&
        await VERIFY(controllerHash,controllerBlock.sig,CONFIG.SYMBIOTE.CONTROLLER.PUBKEY)
   



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
        for(let i=0,l=controllerBlock.a.length;i<l;i++){
            
            /*
            
              ▄█
              ░█.Try to get it from local storage-we assume that block was delivered to our node earlier
            
            */
            getBlocksPromises.push(SYMBIOTE_META.CANDIDATES.get(controllerBlock.a[i]).then(instantBlock=>

                eventsToSift.set(controllerBlock.a[i],instantBlock.e)
                &&
                SET_INSTANT_BLOCK(SYMBIOTE_META,controllerBlock.a[i],instantBlock,rewardBox)
            
            ).catch(e=>
                
                /*  
                  ▀█
                  █▄.If no block locally-get from some reliable source,we defined in config file(cloud,CDN,some cluster-something which are fast,reliable and has ~100% uptime)
                */
               
                fetch(CONFIG.SYMBIOTE.GET_INSTANT+`/block/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/i/`+controllerBlock.a[i]).then(r=>r.json()).then(async instant=>

                    //Check hash and if OK-sift events from inside,otherwise-occur exception to ask block from another sources
                    InstantBlock.genHash(instant.c,instant.e)===controllerBlock.a[i]&&await VERIFY(controllerBlock.a[i],instant.sig,instant.c)
                    ?
                    eventsToSift.set(controllerBlock.a[i],instant.e)&&SET_INSTANT_BLOCK(SYMBIOTE_META,controllerBlock.a[i],instant,rewardBox)
                    :
                    new Error()

                ).catch(async e=>{
                    
                    LOG(`No InstantBlock for \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m even from GET_INSTANT service`,'W')
                    
                    //3.Last chance-ask from nodes directly | Последний рубеж-запрос из PEERS или BOOTSTRAP_NODES напрямую
                    let permNear=CONFIG.SYMBIOTE.BOOTSTRAP_NODES,breakPoint=false

                    
                    
                    for(let j=0;j<permNear.length;j++){
                    
                        if(breakPoint) break//no more ense to ask the rest nodes if we get block

                        await fetch(permNear[j]+`/block/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/i/`+controllerBlock.a[i]).then(r=>r.json()).then(async instant=>

                            InstantBlock.genHash(instant.c,instant.e)===controllerBlock.a[i]
                            &&
                            await VERIFY(controllerBlock.a[i],instant.sig,instant.c)
                            &&
                            eventsToSift.set(controllerBlock.a[i],instant.e)
                            &&
                            (await SET_INSTANT_BLOCK(SYMBIOTE_META,controllerBlock.a[i],instant,rewardBox),breakPoint=true)
                            
                        ).catch(e=>'')
                    
                    }
                   
                    

                    !eventsToSift.has(controllerBlock.a[i])
                    &&                        
                    LOG(`Unfortunately,can't get InstantBlock \x1b[36;1m${controllerBlock.a[i]}\x1b[31;1m on \x1b[36;1m${SYMBIOTE_ALIAS()}`,'F')
                    
                
                })

            ))
        
        }


        await Promise.all(getBlocksPromises.splice(0)) 


        if(eventsToSift.size!==controllerBlock.a.length){

            LOG(`Going to ask for InstantBlocks later for \x1b[36;1m${SYMBIOTE_ALIAS()}`,'W')

            return
        
        }
        



        //_________________________________________GET ACCOUNTS FROM STORAGE____________________________________________
        

        let sendersAccounts=[]
        
        //Go through each event,get accounts of initiators from state by creating promise and push to array for faster resolve
        eventsToSift.forEach(eventsSet=>
             
            eventsSet.forEach(event=>sendersAccounts.push(GET_ACCOUNT_ON_SYMBIOTE(event.c)))
                
        )

        //Push accounts of creators of InstantBlock
        rewardBox.forEach(reference=>sendersAccounts.push(GET_ACCOUNT_ON_SYMBIOTE(reference.creator)))

        //Now cache has all accounts and ready for the next cycles
        await Promise.all(sendersAccounts.splice(0))
        


        //______________________________________CALCULATE TOTAL FEES AND AMOUNTS________________________________________


        eventsToSift.forEach(eventsSet=>
            
            eventsSet.forEach(event=>{

                //O(1),coz it's set
                if(!SYMBIOTE_META.BLACKLIST.has(event.c)){

                    
                    let acc=GET_ACCOUNT_ON_SYMBIOTE(event.c),
                        
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

        LOG(`BLACKLIST size(\u001b[38;5;177m${controllerBlock.i}\x1b[32;1m ### \u001b[38;5;177m${controllerHash}\u001b[38;5;3m) ———> \x1b[36;1m${SYMBIOTE_META.BLACKLIST.size}`,'W')

        


        //_________________________________________________SHARE FEES___________________________________________________
        

        //Instant generator receive 80% of fees from his created block,controller receive 20% of his block
        
        let controllerAcc=await GET_ACCOUNT_ON_SYMBIOTE(symbiote)

        rewardBox.forEach(reference=>{
        
            let acc=GET_ACCOUNT_ON_SYMBIOTE(reference.creator),
                
                toInstant=reference.fees*CONFIG.SYMBIOTE.MANIFEST.GENERATOR_FEE//% of block to generator
                
            acc.ACCOUNT.B+=toInstant

            controllerAcc.ACCOUNT.B+=reference.fees-toInstant

        })
        

        //Probably you would like to store only state or you just run another node via cloud module and want to store some range of blocks remotely
        if(CONFIG.SYMBIOTE.STORE_CONTROLLER_BLOCKS){
            
            //No matter if we already have this block-resave it

            SYMBIOTE_META.CONTROLLER_BLOCKS.put(controllerBlock.i,controllerBlock).catch(e=>LOG(`Failed to store ControllerBlock ${controllerBlock.i} on ${SYMBIOTE_ALIAS()}\nError:${e}`,'W'))

        }else{

            //...but if we shouldn't store and have it locally(received probably by range loading)-then delete
            SYMBIOTE_META.CONTROLLER_BLOCKS.del(controllerBlock.i).catch(
                
                e => LOG(`Failed to delete ControllerBlock ${controllerBlock.i} on ${SYMBIOTE_ALIAS()}\nError:${e}`,'W')
                
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




        SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX=controllerBlock.i
                
        SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_HASH=controllerHash

        SYMBIOTE_META.VERIFICATION_THREAD.DATA=snapshot


        SYMBIOTE_META.VERIFICATION_THREAD.CHECKSUM=BLAKE3(JSON.stringify(snapshot)+controllerBlock.i+controllerHash)//like in network packages


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

        controllerBlock.i!==0//no sense to snaphost if no blocks yet
        &&
        CONFIG.SYMBIOTE.SNAPSHOTS.ENABLE//probably you don't won't to make snapshot on this machine
        &&
        controllerBlock.i%CONFIG.SYMBIOTE.SNAPSHOTS.RANGE===0//if it's time to make snapshot(e.g. next 200th block generated)
        &&
        await MAKE_SNAPSHOT()


        //____________________________________________FINALLY-CHECK WORKFLOW____________________________________________




        //Controller shouldn't check
        if(!CONFIG.SYMBIOTE.CONTROLLER.ME){

            let monitoringOptions=CONFIG.SYMBIOTE.MONITORING.HOSTCHAINS
            //Here we check if has proofs for this block in any hostchain for this symbiote.So here we check workflow
            
            Object.keys(monitoringOptions).forEach(ticker=>
    
                monitoringOptions[ticker].STORE
                &&
                SYMBIOTE_META.HOSTCHAINS_DATA.get(controllerBlock.i+ticker).then(async proof=>{

                    let response = await HOSTCHAINS.CONNECTORS.get(ticker).checkCommit(proof.HOSTCHAIN_HASH,controllerBlock.i,proof.KLYNTAR_HASH).catch(e=>-1)
                        
                    if(proof.KLYNTAR_HASH===controllerHash && response!=-1 && response){
    
                        LOG(`Proof for block \x1b[36;1m${controllerBlock.i}\x1b[32;1m on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m verified and stored`,'S')
    
                    }else{
    
                        LOG(`Can't write proof for block \x1b[36;1m${controllerBlock.i}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W')
    
                        //...send report
    
                    }
                    
                }).catch(e=>LOG(`No proofs for block \x1b[36;1m${controllerBlock.i}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W'))
                
            )

        }

    }

},








verifyInstantBlock=async block=>{

    let hash=InstantBlock.genHash(block.c,block.e),
    
        symbioteData=SYMBIOTE_META,
        
        symbioteConfig=CONFIG.SYMBIOTE


    /*
  
        Check if this address can produce InstantBlocks-we need to make "quick" verification
        Deep inspection will be when this block will be included to ControllerBlock
        
        NOTE:Even if option <STORE_INSTANT_BLOCKS> is false we store this block(if overview below is ok) to candidates
        coz we'll need this block later,while perform ControllerBLock
    
    */


    let allow=
    
    CONFIG.SYMBIOTE.SYMBIOTE_ID===block.s//if we still support this symbiote
    &&
    block.e.length<=symbioteConfig.MANIFEST.EVENTS_LIMIT_PER_BLOCK
    &&
    block.e.length!==0//filter empty blocks
    &&
    !symbioteData.INSTANT_CANDIDATES.has(hash)//check if we already have this block-it will be in mapping anyway
    &&
    symbioteConfig.CANDIDATES_CACHE_SIZE>symbioteData.INSTANT_CANDIDATES.size//check if cache size is allow us to push this block to temporary storage
    &&
    !await symbioteData.CANDIDATES.get(hash).catch(e=>symbioteData.INSTANT_BLOCKS.get(hash).catch(e=>false))//check if we don't have this block
    &&
    await symbioteData.STATE.get(block.c).then(acc=>acc.B>=symbioteConfig.MANIFEST.INSTANT_FREEZE).catch(e=>false)//check if address still has stake(doesn't matter that we can be far away from our collapsed state to real)
    &&
    await VERIFY(hash,block.sig,block.c)//...finally-check signature


    

    if(allow){
        
        symbioteData.CANDIDATES.put(hash,block)
        
        .then(()=>{

            Promise.all(BROADCAST('/ib',block,block.s))//share with the network
            
            symbioteData.INSTANT_CANDIDATES.set(hash,block.c)
        
            BLOCKLOG(`New \x1b[36;1m\x1b[44;1mInstantBlock\x1b[0m\x1b[32m accepted  \x1b[31m——│`,'S',hash,56,'\x1b[31m')
            
        })
        
        .catch(e=>LOG(`Problem with adding candidate block \x1b[36;1m${hash}...\x1b[33;1m from \x1b[36;1m${block.s}... \x1b[33;1m ———> ${e.message}`,'W'))

    }

}