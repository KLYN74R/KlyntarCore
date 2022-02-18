import {VERIFY,BROADCAST,LOG,GET_SYMBIOTE_ACC,BLOCKLOG,SYMBIOTE_ALIAS,BLAKE3,PATH_RESOLVE} from '../KLY_Space/utils.js'

import ControllerBlock from '../KLY_Blocks/controllerblock.js'

import InstantBlock from '../KLY_Blocks/instantblock.js'

import {symbiotes,hostchains} from '../klyn74r.js'

import fetch from 'node-fetch'




//TODO:Provide async formatting ratings due to fair addresses and liars
let BLOCK_PATTERN=process.platform==='linux'?'——':'———',




SET_INSTANT_BLOCK=async(symbiReference,symbiote,hash,block,rewardBox)=>{

    //If no-it's like SPV clients
    CONFIG.SYMBIOTES[symbiote].STORE_INSTANT_BLOCKS
    ?
    await symbiReference.INSTANT_BLOCKS.put(hash,block).catch(
        
        e => LOG(`Can't store InstantBlock \x1b[36;1m${hash})\x1b[33;1m on ${symbiote}\n${e}\n`,'W')
        
    )
    :
    await symbiReference.INSTANT_BLOCKS.del(hash).catch(
        
        e => LOG(`Can't delete InstantBlock \x1b[36;1m${hash})\x1b[33;1m on ${symbiote}\n${e}\n`,'W')
        
    )

    //Delete useless copy from candidates
    symbiReference.CANDIDATES.del(hash).catch(e=>LOG(`Can't delete candidate \x1b[36;1m${hash}\x1b[33;1m\n${e}\n`,'W'))
    
    rewardBox.set(hash,{creator:block.c,fees:0})//fees sum is 0 yet

}




//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let




GET_FORWARD_BLOCKS=(symbiote,fromHeight)=>{

    fetch(CONFIG.SYMBIOTES[symbiote].GET_MULTI+`/multiplicity/${symbiote}/`+fromHeight)

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

                    controllerHash=ControllerBlock.genHash(symbiote,controllerBlock.a,controllerBlock.i,controllerBlock.p)
    
                if(await VERIFY(controllerHash,controllerBlock.sig,symbiote)){

                    symbiotes.get(symbiote).CONTROLLER_BLOCKS.put(controllerBlock.i,controllerBlock)

                    instantBlocks.forEach(
                        
                        iBlock => {

                            let hash=InstantBlock.genHash(iBlock.c,iBlock.e,symbiote)

                            controllerBlock.a?.includes(hash) && symbiotes.get(symbiote).INSTANT_BLOCKS.put(hash,iBlock)

                        }
                        
                    )

                }

            }

        )

    }).catch(
        
        e => LOG(`Some problem when load multiplicity of blocks on \x1b[32;1m${symbiote}`,'I')
    
    )

},




//Make all advanced stuff here-check block locally or ask from "GET_CONTROLLER" for set of block and ask them asynchronously
GET_CONTROLLER_BLOCK=(symbiote,blockId)=>symbiotes.get(symbiote).CONTROLLER_BLOCKS.get(blockId).catch(e=>

    //FOR FUTURE:
    //Request and get current height of symbiote from CONTROLLER(maxId will be returned)
    //Then we ask for block with <blockId> and asynchronously request the other blocks
    
    fetch(CONFIG.SYMBIOTES[symbiote].GET_CONTROLLER+`/block/${symbiote}/c/`+blockId)

    .then(r=>r.json()).then(block=>{

        //FOR FUTURE:ASK another blocks for future process optimization here

        let hash=ControllerBlock.genHash(block.c,block.a,block.i,block.p)
            

        if(symbiotes.has(block.c)&&typeof block.a==='object'&&typeof block.i==='number'&&typeof block.p==='string'&&typeof block.sig==='string'){

            BLOCKLOG(`New \x1b[36m\x1b[41;1mControllerBlock\x1b[0m\x1b[32m  fetched  \x1b[31m${BLOCK_PATTERN}│`,'S',block.c,hash,59,'\x1b[31m')

            //Try to instantly and asynchronously load more blocks if it's possible
            GET_FORWARD_BLOCKS(symbiote,blockId+1)

            return block

        }

    }).catch(e=>LOG(`No ControllerBlock \x1b[36;1m${blockId}\u001b[38;5;3m for symbiote \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m ———> ${e}`,'W'))


),




START_VERIFY_POLLING=async symbiote=>{


    //This option will stop workflow of verification for each symbiote
    if(!SIG_SIGNAL){

        //Try to get block
        let verifThread=symbiotes.get(symbiote).VERIFICATION_THREAD,
            
            blockId=verifThread.COLLAPSED_INDEX+1,
        
            block=await GET_CONTROLLER_BLOCK(symbiote,blockId), nextBlock
    

            
        if(block){

            await verifyControllerBlock(block)

            //Signal that verification was successful
            if(blockId===verifThread.COLLAPSED_INDEX) nextBlock=await GET_CONTROLLER_BLOCK(symbiote,verifThread.COLLAPSED_INDEX+1)

        }

        LOG(nextBlock?'Next is available':`Wait for nextblock \x1b[36;1m${verifThread.COLLAPSED_INDEX+1}`,'W')


        if(CONFIG.SYMBIOTES[symbiote]['STOP_VERIFY']) return//step over initiation of another timeout and this way-stop the Verification thread


        //If next block is available-instantly start perform.Otherwise-wait few seconds and repeat request
        setTimeout(()=>START_VERIFY_POLLING(symbiote),nextBlock?0:CONFIG.SYMBIOTES[symbiote].CONTROLLER_POLLING)

        //Probably no sense to stop polling via .clearTimeout()
        //UPD:Do it to provide dynamic functionality for start/stop Verification Thread
        

    
    }else{

        LOG(`Polling for \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[36;1m was stopped`,'I',symbiote)

        SIG_PROCESS[symbiote].VERIFY=true

    }

},




MAKE_SNAPSHOT=async symbiote=>{

    let {SNAPSHOT,STATE,VERIFICATION_THREAD,METADATA}=symbiotes.get(symbiote),//get appropriate dbs of symbiote

        canary=await METADATA.get('CANARY').catch(e=>{
            
            LOG(`Can't load canary for snapshot of \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\n${e}`,'W')

            return false
        
        })



    
    //Delete old canary and VT.Now we can't use snapshot till the next canary will be added(in the end of snapshot creating)
    await SNAPSHOT.del('CANARY').then(()=>SNAPSHOT.del('VT')).catch(e=>{

        LOG(`Can't delete canary or VT from snapshot on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\n\x1b[31;1m${e}`,'F')

        process.emit('SIGINT',137)

    })




    //_____________________________________________________Now we can make snapshot_____________________________________________________

    LOG(`Start making snapshot for ${SYMBIOTE_ALIAS(symbiote)}`,'I')

    let accounts={}


    //Check if we should do full or partial snapshot.See https://github.com/KLYN74R/CIIPs
    if(CONFIG.SYMBIOTES[symbiote].SNAPSHOTS.ALL){
        
        await new Promise(
        
            resolve => STATE.createReadStream()
            
                            .on('data',data => accounts[data.key]=data.value)//add state of each account to snapshot dbs
            
                            .on('close',resolve)
            
    
        ).catch(
    
            e => {
    
                LOG(`Snapshot creation failed for ${SYMBIOTE_ALIAS(symbiote)}\n${e}`,'W')
                
                process.emit('SIGINT',130)
    
            }
    
        )

    }else{

        //Read only part of state to make snapshot for backups
        //Set your own policy of backups with your other nodes,infrastructure etc.
        let choosen=JSON.parse(PATH_RESOLVE(`SNAPSHOTS/separation/${symbiote}.json`)),
        
            promises=[]


        Object.keys(choosen).forEach(
            
            addr => promises.push(STATE.get(addr).then(acc=>accounts[addr]=acc))
            
        )

        await Promise.all(promises).catch(
           
            e => {

                LOG(`Snapshot creation failed for ${SYMBIOTE_ALIAS(symbiote)}\n${e}`,'F')
                
                process.emit('SIGINT',130)

            }
            
        )

    }
    


    let promises=[]

    Object.keys(accounts).forEach(
        
        addr => promises.push(SNAPSHOT.put(addr,accounts[addr]))
        
    )

    //After that-put another updated canary,to tell the core that this snapshot is valid and state inside is OK
    await Promise.all(promises)
    
                    .then(_=>SNAPSHOT.put('CANARY',canary))//put canary to snapshot
                    
                    .then(()=>SNAPSHOT.put('VT',VERIFICATION_THREAD))//...and VERIFICATION_THREAD(to get info about collapsed height,hash etc.)
                    
                    .catch(e => {

                        LOG(`Snapshot creation failed for ${SYMBIOTE_ALIAS(symbiote)}\n${e}`,'W')
        
                        process.emit('SIGINT',130)

                    })

    LOG(`Snapshot was successfully created for \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[32;1m on height \x1b[36;1m${VERIFICATION_THREAD.COLLAPSED_INDEX}`,'S')

},




verifyControllerBlock=async controllerBlock=>{


    let symbiote=controllerBlock.c,
    
        controllerHash=ControllerBlock.genHash(symbiote,controllerBlock.a,controllerBlock.i,controllerBlock.p),

        symbioteReference=symbiotes.get(symbiote)



    /*  Maximum 100 InstantBlocks per 1 ControllerBlock(set in configs)
        
        We have maximum N*K events where N-number of InstantBlocks and K-number of events

        It's better to take 100 blocks from different creators with 100 events instead of 10 blocks with 1000 events-this we'll accept from bigger range of creators
    */

   
    //block.a.length<=100.At least this limit is only for first times
    if(await VERIFY(controllerHash,controllerBlock.sig,symbiote) && symbioteReference.VERIFICATION_THREAD.COLLAPSED_HASH === controllerBlock.p){




        //____________________________________GET TXS FROM INSTANT BLOCK TO SIFT THEM___________________________________
        
        
        let rewardBox=new Map(),//To split fees
        
            eventsToSift=new Map(),//mapping(hash=>{defaultEvents,securedEvents})
            
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
            getBlocksPromises.push(symbioteReference.CANDIDATES.get(controllerBlock.a[i]).then(instantBlock=>

                eventsToSift.set(controllerBlock.a[i],instantBlock.e)
                &&
                SET_INSTANT_BLOCK(symbioteReference,symbiote,controllerBlock.a[i],instantBlock,rewardBox)
            
            ).catch(e=>
                
                /*  
                  ▀█
                  █▄.If no block locally-get from some reliable source,we defined in config file(cloud,CDN,some cluster-something which are fast,reliable and has ~100% uptime)
                */
               
                fetch(CONFIG.SYMBIOTES[symbiote].GET_INSTANT+`/block/${symbiote}/i/`+controllerBlock.a[i]).then(r=>r.json()).then(async instant=>

                    //Check hash and if OK-sift events from inside,otherwise-occur exception to ask block from another sources
                    InstantBlock.genHash(instant.c,instant.e,symbiote)===controllerBlock.a[i]&&await VERIFY(controllerBlock.a[i],instant.sig,instant.c)
                    ?
                    eventsToSift.set(controllerBlock.a[i],instant.e)&&SET_INSTANT_BLOCK(symbioteReference,symbiote,controllerBlock.a[i],instant,rewardBox)
                    :
                    new Error()

                ).catch(async e=>{
                    
                    LOG(`No InstantBlock for \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m even from GET_INSTANT service`,'W')
                    
                    //3.Last chance-ask from nodes directly | Последний рубеж-запрос из NEAR или PERMANENT_NEAR напрямую
                    let permNear=CONFIG.SYMBIOTES[symbiote].PERMANENT_NEAR,breakPoint=false

                    
                    
                    for(let j=0;j<permNear.length;j++){
                    
                        if(breakPoint) break//no more ense to ask the rest nodes if we get block

                        await fetch(permNear[j]+`/block/${symbiote}/i/`+controllerBlock.a[i]).then(r=>r.json()).then(async instant=>

                            InstantBlock.genHash(instant.c,instant.e,symbiote)===controllerBlock.a[i]
                            &&
                            await VERIFY(controllerBlock.a[i],instant.sig,instant.c)
                            &&
                            eventsToSift.set(controllerBlock.a[i],instant.e)
                            &&
                            (await SET_INSTANT_BLOCK(symbioteReference,symbiote,controllerBlock.a[i],instant,rewardBox),breakPoint=true)
                            
                        ).catch(e=>'')
                    
                    }
                   
                    

                    !eventsToSift.has(controllerBlock.a[i])
                    &&                        
                    LOG(`Unfortunately,can't get InstantBlock \x1b[36;1m${controllerBlock.a[i]}\x1b[31;1m on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}`,'F')
                    
                
                })

            ))
        
        }


        await Promise.all(getBlocksPromises.splice(0)) 


        if(eventsToSift.size!==controllerBlock.a.length){

            LOG(`Going to ask for InstantBlocks later for \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}`,'W')

            return
        
        }
        



        //_________________________________________GET ACCOUNTS FROM STORAGE____________________________________________
        
        
        let sendersAccounts=[]
        
        //Go through each event,get accounts of initiators from state by creating promise and push to array for faster resolve
        eventsToSift.forEach(eventsSet=>
             
            eventsSet.forEach(event=>sendersAccounts.push(GET_SYMBIOTE_ACC(event.c,symbiote)))
                
        )

        //Push accounts of creators of InstantBlock
        rewardBox.forEach(reference=>sendersAccounts.push(GET_SYMBIOTE_ACC(reference.creator,symbiote)))

        //Now cache has all accounts and ready for the next cycles
        await Promise.all(sendersAccounts.splice(0))
        


        //______________________________________CALCULATE TOTAL FEES AND AMOUNTS________________________________________


        eventsToSift.forEach(eventsSet=>
            
            eventsSet.forEach(event=>{

                //O(1),coz it's set
                if(!symbioteReference.BLACKLIST.has(event.c)){

                    //Add new type of event
                    !symbioteReference.EVENTS_STATE.has(event.t) && symbioteReference.EVENTS_STATE.set(event.t,[])


                        
                    let acc=GET_SYMBIOTE_ACC(event.c,symbiote),
                        
                        spend=symbioteReference.SPENDERS[event.t]?.(event,symbiote) || CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE//provide ability to add extra fees(or oppositely-make free) to events



                            
                    //If no such address-it's a signal that transaction can't be accepted
                    if(!acc) return
                 
                    (event.n<=acc.ACCOUNT.N||acc.NS.has(event.n)) ? acc.ND.add(event.n) : acc.NS.add(event.n);
        
                    (acc.OUT-=spend)<0 && symbioteReference.BLACKLIST.add(event.c)

                }

            })
                
        )




        //___________________________________________START TO PERFORM EVENTS____________________________________________

        
        let eventsPromises=[]


        eventsToSift.forEach((eventsSet,hash)=>{
    
            eventsSet.forEach(event=>
                
                //If verifier to such event exsist-then verify it!
                symbioteReference.VERIFIERS[event.t]
                &&
                eventsPromises.push(symbioteReference.VERIFIERS[event.t](event,rewardBox.get(hash),symbiote))

                //Stress test.DELETE
                //txsPromises.push(VERIFY('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','4ViaOoL3HF5lamTh0ZjGbLVg+59dfk5cebJGKRDtRf29l0hIbS5PHfUNt2GCUdHS+AFqs1ZU+l6cpMYkSbw3Aw==','J+tMlJexrc5bwof9oIpKiRxQy84VmZhMfdIJa53GSY4='))
            )
                        
        })
        
        await Promise.all(eventsPromises.splice(0))

        LOG(`BLACKLIST size ———> \x1b[36;1m${symbioteReference.BLACKLIST.size}`,'W')

        


        //_________________________________________________SHARE FEES___________________________________________________
        

        //Instant generator receive 80% of fees from his created block,controller receive 20% of his block
        
        let controllerAcc=await GET_SYMBIOTE_ACC(symbiote,symbiote)

        rewardBox.forEach(reference=>{
        
            let acc=GET_SYMBIOTE_ACC(reference.creator,symbiote),
                
                toInstant=reference.fees*CONFIG.SYMBIOTES[symbiote].MANIFEST.GENERATOR_FEE//% of block to generator
                
            acc.ACCOUNT.B+=toInstant

            controllerAcc.ACCOUNT.B+=reference.fees-toInstant

        })
        

        //Probably you would like to store only state or you just run another node via cloud module and want to store some range of blocks remotely
        if(CONFIG.SYMBIOTES[symbiote].STORE_CONTROLLER_BLOCKS){
            
            //No matter if we already have this block-resave it

            symbioteReference.CONTROLLER_BLOCKS.put(controllerBlock.i,controllerBlock).catch(e=>LOG(`Failed to store ControllerBlock ${controllerBlock.i} on ${SYMBIOTE_ALIAS(symbiote)}\nError:${e}`,'W'))

        }else{

            //...but if we shouldn't store and have it locally(received probably by range loading)-then delete
            symbioteReference.CONTROLLER_BLOCKS.del(controllerBlock.i).catch(
                
                e => LOG(`Failed to delete ControllerBlock ${controllerBlock.i} on ${SYMBIOTE_ALIAS(symbiote)}\nError:${e}`,'W')
                
            )

        }


        //________________________________________________COMMIT STATE__________________________________________________    

        symbioteReference.VERIFICATION_THREAD.DATA={}//prepare empty staging data


        let promises=[],snapshot={ACCOUNTS:{}}
        


        
        //Commit state
        //Use caching(such primitive for the first time)
        if(symbioteReference.ACCOUNTS.size>=CONFIG.SYMBIOTES[symbiote].BLOCK_TO_BLOCK_CACHE_SIZE){

            symbioteReference.ACCOUNTS.forEach((acc,addr)=>{

                promises.push(symbioteReference.STATE.put(addr,acc.ACCOUNT))

                snapshot.ACCOUNTS[addr]=acc.ACCOUNT

            })
            
            symbioteReference.ACCOUNTS.clear()//flush cache.NOTE-some kind of advanced upgrade soon
        
        }else{
            
            symbioteReference.ACCOUNTS.forEach((acc,addr)=>{

                promises.push(symbioteReference.STATE.put(addr,acc.ACCOUNT))
            
                snapshot.ACCOUNTS[addr]=acc.ACCOUNT



                //Update urgent balance for the next blocks
                acc.OUT=acc.ACCOUNT.B

                //Clear sets of nonces(NOTE: Optional chaining here because some accounts are newly created)
                acc.NS?.clear()
                acc.ND?.clear()

            })
        
        }


        //Create for each type of events which occured changes
        symbioteReference.EVENTS_STATE.forEach(
            
            (eventsSet,eventType)=>snapshot[eventType]=eventsSet
        
        )




        symbioteReference.VERIFICATION_THREAD.COLLAPSED_INDEX=controllerBlock.i
                
        symbioteReference.VERIFICATION_THREAD.COLLAPSED_HASH=controllerHash

        symbioteReference.VERIFICATION_THREAD.CHECKSUM=BLAKE3(JSON.stringify(snapshot)+controllerBlock.i+controllerHash)//like in network packages


        //Make commit to staging area
        await symbioteReference.METADATA.put('VT',symbioteReference.VERIFICATION_THREAD)



        
        symbiotes.get(symbiote).EVENTS_STATE.clear()

        //Also just clear and add some advanced logic later-it will be crucial important upgrade for process of phantom blocks
        symbioteReference.BLACKLIST.clear()

        


        //____________________________________NOW WE CAN SAFELY WRITE STATE OF ACCOUNTS_________________________________
        

        await Promise.all(promises.splice(0)).then(()=>
            
            symbioteReference.METADATA.put('CANARY',symbioteReference.VERIFICATION_THREAD.CHECKSUM)//canary is the signal that current height is verified and you can continue from this point

        ).catch(e=>{
            
            LOG(`Problem when write to state or canary on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\n${e}`,'F')
            
            process.emit('SIGINT',108)
        
        })

        //__________________________________________CREATE SNAPSHOT IF YOU NEED_________________________________________

        controllerBlock.i!==0
        &&
        CONFIG.SYMBIOTES[symbiote].SNAPSHOTS.ENABLE
        &&
        controllerBlock.i%CONFIG.SYMBIOTES[symbiote].SNAPSHOTS.RANGE===0
        &&
        await MAKE_SNAPSHOT(symbiote)


        //____________________________________________FINALLY-CHECK WORKFLOW____________________________________________




        //Controller shouldn't check
        if(!CONFIG.SYMBIOTES[symbiote].CONTROLLER.ME){

            let workflow=CONFIG.SYMBIOTES[symbiote].WORKFLOW_CHECK.HOSTCHAINS
            //Here we check if has proofs for this block in any hostchain for this symbiote.So here we check workflow
            
            Object.keys(workflow).forEach(ticker=>
    
                workflow[ticker].STORE
                &&
                symbioteReference.HOSTCHAINS_DATA.get(controllerBlock.i+ticker).then(async proof=>{

                    let response = await hostchains.get(symbiote).get(ticker).checkTx(proof.HOSTCHAIN_HASH,controllerBlock.i,proof.KLYNTAR_HASH,symbiote).catch(e=>-1)
                        
                    if(proof.KLYNTAR_HASH===controllerHash && response!=-1 && response){
    
                        LOG(`Proof for block \x1b[36;1m${controllerBlock.i}\x1b[32;1m on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m verified and stored`,'S')
    
                    }else{
    
                        LOG(`Can't write proof for block \x1b[36;1m${controllerBlock.i}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W')
    
                        //...send report
    
                    }
                    
                }).catch(e=>LOG(`No proofs for block \x1b[36;1m${controllerBlock.i}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W'))
                
            )

        }

    }

},








verifyInstantBlock=async block=>{

    let hash=InstantBlock.genHash(block.c,block.e,block.s),
    
        symbioteData=symbiotes.get(block.s),
        
        symbioteConfig=CONFIG.SYMBIOTES[block.s]


    /*
  
        Check if this address can produce InstantBlocks-we need to make "quick" verification
        Deep inspection will be when this block will be included to ControllerBlock
        
        NOTE:Even if option <STORE_INSTANT_BLOCKS> is false we store this block(if overview below is ok) to candidates
        coz we'll need this block later,while perform ControllerBLock
    
    */


    let allow=
    
    symbiotes.has(block.s)//if we still support this symbiote
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
    await symbioteData.STATE.get(block.c).then(acc=>acc.B>=CONFIG.SYMBIOTES[block.c].MANIFEST.INSTANT_FREEZE).catch(e=>false)//check if address still has stake(doesn't matter that we can be far away from our collapsed state to real)
    &&
    await VERIFY(hash,block.sig,block.c)//...finally-check signature


    

    if(allow){
        
        symbioteData.CANDIDATES.put(hash,block)
        
        .then(()=>{

            Promise.all(BROADCAST('/ib',block,block.s))//share with the network
            
            symbioteData.INSTANT_CANDIDATES.set(hash,block.c)
        
            BLOCKLOG(`New \x1b[36;1m\x1b[44;1mInstantBlock\x1b[0m\x1b[32m accepted  \x1b[31m${BLOCK_PATTERN}│`,'S',block.s,hash,56,'\x1b[31m')
            
        })
        
        .catch(e=>LOG(`Problem with adding candidate block \x1b[36;1m${hash}...\x1b[33;1m from \x1b[36;1m${block.s}... \x1b[33;1m ———> ${e.message}`,'W'))

    }

}