import {VERIFY,BROADCAST,LOG,GET_CHAIN_ACC,BLOCKLOG,CHAIN_LABEL,BLAKE3,PATH_RESOLVE} from '../KLY_Space/utils.js'

import ControllerBlock from '../KLY_Blocks/controllerblock.js'

import {symbiotes,hostchains,metadata} from '../klyn74r.js'

import InstantBlock from '../KLY_Blocks/instantblock.js'

import fetch from 'node-fetch'




//TODO:Provide async formatting ratings due to fair addresses and liars
let BLOCK_PATTERN=process.platform==='linux'?'——':'———',




verifyOffspringCreationTx=async(from,manifest,blockCreator,chain,nonce,sig)=>{
    
    //Добавить проверку--->если в делегатах есть некий узел,то отминусовать у делегата ставку(чтоб не нарушать стейкинг)

    let sender=GET_CHAIN_ACC(from,chain)
    
    if(!(symbiotes.get(chain).BLACKLIST.has(from)||sender.ND.has(nonce)) && (sender.ACCOUNT.D===blockCreator.creator || await VERIFY(manifest+chain+nonce,sig,from))){

        sender.ACCOUNT.B-=CONFIG.CHAINS[chain].MANIFEST.FEE+CONFIG.CHAINS[chain].MANIFEST.CONTROLLER_FREEZE

        sender.ACCOUNT.N<nonce&&(sender.ACCOUNT.N=nonce)//update maximum nonce
    
        blockCreator.fees+=CONFIG.CHAINS[chain].MANIFEST.FEE

    }

},




verifyNewsTransaction=async(from,newsHash,blockCreator,chain,nonce,sig)=>{
        
    let sender=GET_CHAIN_ACC(from,chain)

    if(newsHash.length===64 && !(symbiotes.get(chain).BLACKLIST.has(from)||sender.ND.has(nonce)) && (sender.ACCOUNT.D===blockCreator.creator || await VERIFY(newsHash+chain+nonce,sig,from))){

        sender.ACCOUNT.B-=CONFIG.CHAINS[chain].MANIFEST.FEE

        sender.ACCOUNT.N<nonce&&(sender.ACCOUNT.N=nonce)
    
        blockCreator.fees+=CONFIG.CHAINS[chain].MANIFEST.FEE

    }
    
},




verifyDelegation=async(from,newDelegate,blockCreator,chain,nonce,sig)=>{

    let sender=GET_CHAIN_ACC(from,chain)

    if(!(symbiotes.get(chain).BLACKLIST.has(from)||sender.ND.has(nonce)) && await VERIFY(newDelegate+chain+nonce,sig,from)){

        sender.ACCOUNT.B-=CONFIG.CHAINS[chain].MANIFEST.FEE
        
        //Make changes only for bigger nonces.This way in async mode all nodes will have common state
        if(sender.ACCOUNT.N<nonce){

            sender.ACCOUNT.D=newDelegate

            sender.ACCOUNT.N=nonce

        }
    
        blockCreator.fees+=CONFIG.CHAINS[chain].MANIFEST.FEE

    }

},




verifyTransaction=async(from,to,tag,amount,blockCreator,chain,nonce,sig)=>{

    let sender=GET_CHAIN_ACC(from,chain),
    
        recipient=await GET_CHAIN_ACC(to,chain)


        
    if(!recipient){

        recipient={ACCOUNT:{B:0,N:0,D:''}}//default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
        
        symbiotes.get(chain).ACCOUNTS.set(to,recipient)//add to cache to collapse after all txs in ControllerBlock
    
    }
    

    if(!(symbiotes.get(chain).BLACKLIST.has(from)||sender.ND.has(nonce)) && (sender.ACCOUNT.D===blockCreator.creator || await VERIFY(to+tag+amount+chain+nonce,sig,from))){

        sender.ACCOUNT.B-=CONFIG.CHAINS[chain].MANIFEST.FEE+amount
        
        recipient.ACCOUNT.B+=amount

        sender.ACCOUNT.N<nonce&&(sender.ACCOUNT.N=nonce)
    
        blockCreator.fees+=CONFIG.CHAINS[chain].MANIFEST.FEE

    }

},




SET_INSTANT_BLOCK=async(chainReference,chain,hash,block,rewardBox)=>{

    //If no-it's like SPV clients
    CONFIG.CHAINS[chain].STORE_INSTANT_BLOCKS
    ?
    await chainReference.INSTANT_BLOCKS.put(hash,block).catch(
        
        e => LOG(`Can't store InstantBlock \x1b[36;1m${hash})\x1b[33;1m on ${chain}\n${e}\n`,'W')
        
    )
    :
    await chainReference.INSTANT_BLOCKS.del(hash).catch(
        
        e => LOG(`Can't delete InstantBlock \x1b[36;1m${hash})\x1b[33;1m on ${chain}\n${e}\n`,'W')
        
    )

    //Delete useless copy from candidates
    chainReference.CANDIDATES.del(hash).catch(e=>LOG(`Can't delete candidate \x1b[36;1m${hash}\x1b[33;1m\n${e}\n`,'W'))
    
    rewardBox.set(hash,{creator:block.c,fees:0})//fees sum is 0 yet

}




//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let




GET_FORWARD_BLOCKS=(chain,fromHeight)=>{

    fetch(CONFIG.CHAINS[chain].GET_MULTI+`/multiplicity/${Buffer.from(chain,'base64').toString('hex')}/`+fromHeight)

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

                    controllerHash=ControllerBlock.genHash(chain,controllerBlock.a,controllerBlock.i,controllerBlock.p)
    
                if(await VERIFY(controllerHash,controllerBlock.sig,chain)){

                    symbiotes.get(chain).CONTROLLER_BLOCKS.put(controllerBlock.i,controllerBlock)

                    instantBlocks.forEach(
                        
                        iBlock => {

                            let hash=InstantBlock.genHash(chain,iBlock.d,iBlock.s,iBlock.c)

                            controllerBlock.a?.includes(hash) && symbiotes.get(chain).INSTANT_BLOCKS.put(hash,iBlock)

                        }
                        
                    )

                }

            }

        )

    }).catch(
        
        e => LOG(`Some problem when load multiplicity of blocks on \x1b[32;1m${chain}`,'I')
    
    )

},




//Make all advanced stuff here-check block locally or ask from "GET_CONTROLLER" for set of block and ask them asynchronously
GET_CONTROLLER_BLOCK=(chain,blockId)=>symbiotes.get(chain).CONTROLLER_BLOCKS.get(blockId).catch(e=>

    //FOR FUTURE:
    //Request and get current height of chain from CONTROLLER(maxId will be returned)
    //Then we ask for block with <blockId> and asynchronously request the other blocks
    
    fetch(CONFIG.CHAINS[chain].GET_CONTROLLER+`/block/${Buffer.from(chain,'base64').toString('hex')}/c/`+blockId)

    .then(r=>r.json()).then(block=>{

        //FOR FUTURE:ASK another blocks for future process optimization here

        let hash=ControllerBlock.genHash(block.c,block.a,block.i,block.p)
            

        if(symbiotes.has(block.c)&&typeof block.a==='object'&&typeof block.i==='number'&&typeof block.p==='string'&&typeof block.sig==='string'){

            BLOCKLOG(`New \x1b[36m\x1b[41;1mControllerBlock\x1b[0m\x1b[32m  fetched  \x1b[31m${BLOCK_PATTERN}│`,'S',block.c,hash,59,'\x1b[31m')

            //Try to instantly and asynchronously load more blocks if it's possible
            GET_FORWARD_BLOCKS(chain,blockId+1)

            return block

        }

    }).catch(e=>LOG(`No ControllerBlock \x1b[36;1m${blockId}\u001b[38;5;3m for chain \x1b[36;1m${CHAIN_LABEL(chain)}\u001b[38;5;3m ———> ${e}`,'W'))


),




START_VERIFY_POLLING=async chain=>{


    //This option will stop workflow of verification for each symbiote
    if(!SIG_SIGNAL){

        //Try to get block
        let verifThread=symbiotes.get(chain).VERIFICATION_THREAD,
            
            blockId=verifThread.COLLAPSED_INDEX+1,
        
            block=await GET_CONTROLLER_BLOCK(chain,blockId), nextBlock
    

            
        if(block){

            await verifyControllerBlock(block)

            //Signal that verification was successful
            if(blockId===verifThread.COLLAPSED_INDEX) nextBlock=await GET_CONTROLLER_BLOCK(chain,verifThread.COLLAPSED_INDEX+1)

        }

        LOG(nextBlock?'Next is available':`Wait for nextblock \x1b[36;1m${verifThread.COLLAPSED_INDEX+1}`,'W')


        if(CONFIG.CHAINS[chain]['STOP_VERIFY']) return//step over initiation of another timeout and this way-stop the Verification thread


        //If next block is available-instantly start perform.Otherwise-wait few seconds and repeat request
        setTimeout(()=>START_VERIFY_POLLING(chain),nextBlock?0:CONFIG.CHAINS[chain].CONTROLLER_POLLING)

        //Probably no sense to stop polling via .clearTimeout()
        //UPD:Do it to provide dynamic functionality for start/stop Verification Thread
        

    
    }else{

        LOG(`Polling for \x1b[36;1m${CHAIN_LABEL(chain)}\x1b[36;1m was stopped`,'I',chain)

        SIG_PROCESS[chain].VERIFY=true

    }

},




MAKE_SNAPSHOT=async chain=>{

    let {SNAPSHOT,STATE,VERIFICATION_THREAD}=symbiotes.get(chain),//get appropriate dbs of symbiote

        canary=await metadata.get(chain+'/CANARY').catch(e=>false)



    
    //Delete old canary and VT.Now we can't use snapshot till the next canary will be added(in the end of snapshot creating)
    await SNAPSHOT.del('CANARY').then(()=>SNAPSHOT.del('VT')).catch(e=>{

        LOG(`Can't delete canary or VT from snapshot on \x1b[36;1m${CHAIN_LABEL(chain)}\n\x1b[31;1m${e}`,'F')

        process.emit('SIGINT',137)

    })




    //_____________________________________________________Now we can make snapshot_____________________________________________________

    LOG(`Start making snapshot for ${CHAIN_LABEL(chain)}`,'I')

    let accounts={}


    //Check if we should do full or partial snapshot.See https://github.com/KLYN74R/CIIPs
    if(CONFIG.CHAINS[chain].SNAPSHOTS.ALL){
        
        await new Promise(
        
            resolve => STATE.createReadStream()
            
                            .on('data',data => accounts[data.key]=data.value)//add state of each account to snapshot dbs
            
                            .on('close',resolve)
            
    
        ).catch(
    
            e => {
    
                LOG(`Snapshot creation failed for ${CHAIN_LABEL(chain)}\n${e}`,'W')
                
                process.emit('SIGINT',130)
    
            }
    
        )

    }else{

        //Read only part of state to make snapshot for backups
        //Set your own policy of backups with your other nodes,infrastructure etc.
        let choosen=JSON.parse(PATH_RESOLVE(`SNAPSHOTS/separation/${Buffer.from(chain,'base64').toString('hex')}.json`)),
        
            promises=[]


        Object.keys(choosen).forEach(
            
            addr => promises.push(STATE.get(addr).then(acc=>accounts[addr]=acc))
            
        )

        await Promise.all(promises).catch(
           
            e => {

                LOG(`Snapshot creation failed for ${CHAIN_LABEL(chain)}\n${e}`,'F')
                
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

                        LOG(`Snapshot creation failed for ${CHAIN_LABEL(chain)}\n${e}`,'W')
        
                        process.emit('SIGINT',130)

                    })

    LOG(`Snapshot was successfully created for \x1b[36;1m${CHAIN_LABEL(chain)}\x1b[32;1m on height \x1b[36;1m${VERIFICATION_THREAD.COLLAPSED_INDEX}`,'S')

},




verifyControllerBlock=async controllerBlock=>{


    let chain=controllerBlock.c,
    
        controllerHash=ControllerBlock.genHash(chain,controllerBlock.a,controllerBlock.i,controllerBlock.p),

        chainReference=symbiotes.get(chain)



    /*  Maximum 100 InstantBlocks per 1 ControllerBlock
        
        We have maximum N*K transactions where N-number of InstantBlocks and K-number of transactions

        It's better to take 100 blocks from different creators with 100 txs instead of 10 blocks with 1000 txs-this we'll accept from bigger range of creators
    */

   
    //block.a.length<=100.At least this limit is only for first times
    if(await VERIFY(controllerHash,controllerBlock.sig,chain) && chainReference.VERIFICATION_THREAD.COLLAPSED_HASH === controllerBlock.p){




        //____________________________________GET TXS FROM INSTANT BLOCK TO SIFT THEM___________________________________
        
        
        let rewardBox=new Map(),//To split fees
        
            txsToSift=new Map(),//mapping(hash=>{defaultTxs,securedTxs})
            
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
            getBlocksPromises.push(chainReference.CANDIDATES.get(controllerBlock.a[i]).then(instantBlock=>

                txsToSift.set(controllerBlock.a[i],{d:instantBlock.d,s:instantBlock.s})
                &&
                SET_INSTANT_BLOCK(chainReference,chain,controllerBlock.a[i],instantBlock,rewardBox)
            
            ).catch(e=>
                
                /*  
                  ▀█
                  █▄.If no block locally-get from some reliable source,we defined in config file(cloud,CDN,some cluster-something which are fast,reliable and has ~100% uptime)
                */
               
                fetch(CONFIG.CHAINS[chain].GET_INSTANT+`/block/${Buffer.from(chain,'base64').toString('hex')}/i/`+controllerBlock.a[i]).then(r=>r.json()).then(async instant=>

                    //Check hash and if OK-sift transactions from inside,otherwise-occur exceprion to ask block from another sources
                    InstantBlock.genHash(chain,instant.d,instant.s,instant.c)===controllerBlock.a[i]&&await VERIFY(controllerBlock.a[i],instant.sig,instant.c)
                    ?
                    txsToSift.set(controllerBlock.a[i],{d:instant.d,s:instant.s})&&SET_INSTANT_BLOCK(chainReference,chain,controllerBlock.a[i],instant,rewardBox)
                    :
                    new Error()

                ).catch(async e=>{
                    
                    LOG(`No InstantBlock for \x1b[36;1m${CHAIN_LABEL(chain)}\u001b[38;5;3m even from GET_INSTANT service`,'W')
                    
                    //3.Last chance-ask from nodes directly | Последний рубеж-запрос из NEAR или PERMANENT_NEAR напрямую
                    let permNear=CONFIG.CHAINS[chain].PERMANENT_NEAR,breakPoint=false

                    
                    
                    for(let j=0;j<permNear.length;j++){
                    
                        if(breakPoint) break//no more ense to ask the rest nodes if we get block

                        await fetch(permNear[j]+`/block/${Buffer.from(chain,'base64').toString('hex')}/i/`+controllerBlock.a[i]).then(r=>r.json()).then(async instant=>

                            InstantBlock.genHash(chain,instant.d,instant.s,instant.c)===controllerBlock.a[i]
                            &&
                            await VERIFY(controllerBlock.a[i],instant.sig,instant.c)
                            &&
                            txsToSift.set(controllerBlock.a[i],{d:instant.d,s:instant.s})
                            &&
                            (await SET_INSTANT_BLOCK(chainReference,chain,controllerBlock.a[i],instant,rewardBox),breakPoint=true)
                            
                        ).catch(e=>'')
                    
                    }
                   
                    

                    !txsToSift.has(controllerBlock.a[i])
                    &&                        
                    LOG(`Unfortunately,can't get InstantBlock \x1b[36;1m${controllerBlock.a[i]}\x1b[31;1m on \x1b[36;1m${CHAIN_LABEL(chain)}`,'F')
                    
                
                })

            ))
        
        }


        await Promise.all(getBlocksPromises.splice(0)) 


        if(txsToSift.size!==controllerBlock.a.length){

            LOG(`Going to ask for InstantBlocks later for \x1b[36;1m${CHAIN_LABEL(chain)}`,'W')

            return
        
        }
        

        //________________________________________GET ACCOUNTS AND MODIFY THEM__________________________________________
        
        
        let sendersAccounts=[]
        
        //Go through each transaction("d" and "s" type),get accounts of senders from state by creating promise and push to array for faster resolve
        txsToSift.forEach(txsSet=>
            
            ['d','s'].forEach(type=>
             
                txsSet[type].forEach(tx=>sendersAccounts.push(GET_CHAIN_ACC(tx.c,chain)))
                
            )
        
        )

        //Push accounts of creators of InstantBlock
        rewardBox.forEach(reference=>sendersAccounts.push(GET_CHAIN_ACC(reference.creator,chain)))

        //Now cache has all accounts and ready for the next cycles
        await Promise.all(sendersAccounts.splice(0))
        


        //______________________________________CALCULATE TOTAL FEES AND AMOUNTS________________________________________


        txsToSift.forEach(txsSet=>
            
            //We have "d"(default,without signature) and "s"(secured,with signature) txs buffers
            ['d','s'].forEach(type=>
                
                txsSet[type].forEach(tx=>{

                    //O(1),coz it's set
                    if(!chainReference.BLACKLIST.has(tx.c)){
                        
                        let acc=GET_CHAIN_ACC(tx.c,chain),
                        
                            spend=CONFIG.CHAINS[chain].MANIFEST.FEE+( tx.a  ||  tx.m&&CONFIG.CHAINS[chain].MANIFEST.CONTROLLER_FREEZE  ||  0 );


                            
                        //If no such address-it's signal that transaction can't be accepted
                        if(!acc) return
                 
                        (tx.n<=acc.ACCOUNT.N||acc.NS.has(tx.n)) ? acc.ND.add(tx.n) : acc.NS.add(tx.n);
        
                        (acc.OUT-=spend)<0 && chainReference.BLACKLIST.add(tx.c)

                    }

                })
                
            )
            
        )




        //________________________________________START TO PERFORM TRANSACTIONS_________________________________________

        
        let txsPromises=[]


        txsToSift.forEach((txsSet,hash)=>{

            ['d','s'].forEach(txType=>
                
                txsSet[txType].forEach(obj=>{
                    
                    let sig = txType==='s' && obj.s

                    //Sequence depends on priority and frequency-the highest frequency have transaction address<->address
                    if(obj.a) txsPromises.push(verifyTransaction(obj.c,obj.r,obj.t,obj.a,rewardBox.get(hash),chain,obj.n,sig))
                    
                    else if(obj.h) txsPromises.push(verifyNewsTransaction(obj.c,obj.h,rewardBox.get(hash),chain,obj.n,sig))
                
                    else if(obj.d) txsPromises.push(verifyDelegation(obj.c,obj.d,rewardBox.get(hash),chain,obj.n,sig))
                    
                    else if(obj.m) txsPromises.push(verifyOffspringCreationTx(obj.c,obj.m,rewardBox.get(hash),chain,obj.n,sig))    
                
                    //Stress test.DELETE
                    //txsPromises.push(VERIFY('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','4ViaOoL3HF5lamTh0ZjGbLVg+59dfk5cebJGKRDtRf29l0hIbS5PHfUNt2GCUdHS+AFqs1ZU+l6cpMYkSbw3Aw==','J+tMlJexrc5bwof9oIpKiRxQy84VmZhMfdIJa53GSY4='))
                })
                
            )
        
        })
        
        await Promise.all(txsPromises.splice(0))

        LOG(`BLACKLIST size ———> \x1b[36;1m${chainReference.BLACKLIST.size}`,'W')

        


        //_________________________________________________SHARE FEES___________________________________________________
        

        //Instant generator receive 80% of fees from his created block,controller receive 20% of his block
        
        let controllerAcc=await GET_CHAIN_ACC(chain,chain)

        rewardBox.forEach(reference=>{
        
            let acc=GET_CHAIN_ACC(reference.creator,chain),
                
                toInstant=reference.fees*0.8//80% of block to generator
                
            acc.ACCOUNT.B+=toInstant

            controllerAcc.ACCOUNT.B+=reference.fees-toInstant

        })
        

        //Probably you would like to store only state or you just run another node via cloud module and want to store some range of blocks remotely
        if(CONFIG.CHAINS[chain].STORE_CONTROLLER_BLOCKS){
            
            //No matter if we already have this block-resave it

            chainReference.CONTROLLER_BLOCKS.put(controllerBlock.i,controllerBlock).catch(e=>LOG(`Failed to store ControllerBlock ${controllerBlock.i} on ${CHAIN_LABEL(chain)}\nError:${e}`,'W'))

        }else{

            //...but if we shouldn't store and have it locally(received probably by range loading)-then delete
            chainReference.CONTROLLER_BLOCKS.del(controllerBlock.i).catch(
                
                e => LOG(`Failed to delete ControllerBlock ${controllerBlock.i} on ${CHAIN_LABEL(chain)}\nError:${e}`,'W')
                
            )

        }


        //________________________________________________COMMIT STATE__________________________________________________    

        chainReference.VERIFICATION_THREAD.DATA={}//prepare clear staging data


        let promises=[],snapshot=chainReference.VERIFICATION_THREAD.DATA
        


        
        //Commit state
        //Use caching(such primitive for the first time)
        if(chainReference.ACCOUNTS.size>=CONFIG.CHAINS[chain].BLOCK_TO_BLOCK_CACHE_SIZE){

            chainReference.ACCOUNTS.forEach((acc,addr)=>{

                promises.push(chainReference.STATE.put(addr,acc.ACCOUNT))

                snapshot[addr]=acc.ACCOUNT       

            })
            
            chainReference.ACCOUNTS.clear()//flush cache.NOTE-some kind of advanced upgrade soon
        
        }else{
            
            chainReference.ACCOUNTS.forEach((acc,addr)=>{

                promises.push(chainReference.STATE.put(addr,acc.ACCOUNT))
            
                snapshot[addr]=acc.ACCOUNT



                //Update urgent balance for the next blocks
                acc.OUT=acc.ACCOUNT.B

                //Clear sets of nonces(NOTE: Optional chaining here because some accounts are newly created)
                acc.NS?.clear()
                acc.ND?.clear()

            })
        
        }




        chainReference.VERIFICATION_THREAD.COLLAPSED_INDEX=controllerBlock.i
                
        chainReference.VERIFICATION_THREAD.COLLAPSED_HASH=controllerHash

        chainReference.VERIFICATION_THREAD.CHECKSUM=BLAKE3(JSON.stringify(snapshot)+controllerBlock.i+controllerHash)//like in network packages


        //Make commit to staging area
        await metadata.put(chain+'/VT',chainReference.VERIFICATION_THREAD)



        //Also just clear and add some advanced logic later-it will be crucial important upgrade for process of phantom blocks
        chainReference.BLACKLIST.clear()

        


        //____________________________________NOW WE CAN SAFELY WRITE STATE OF ACCOUNTS_________________________________
        

        await Promise.all(promises.splice(0)).then(()=>
            
            metadata.put(chain+'/CANARY',chainReference.VERIFICATION_THREAD.CHECKSUM)//canary is the signal that current height is verified and you can continue from this point

        ).catch(e=>{
            
            LOG(`Problem when write to state or canary on \x1b[36;1m${CHAIN_LABEL(chain)}\n${e}`,'F')
            
            process.emit('SIGINT',108)
        
        })

        //__________________________________________CREATE SNAPSHOT IF YOU NEED_________________________________________

        controllerBlock.i!==0
        &&
        CONFIG.CHAINS[chain].SNAPSHOTS.ENABLE
        &&
        controllerBlock.i%CONFIG.CHAINS[chain].SNAPSHOTS.RANGE===0
        &&
        await MAKE_SNAPSHOT(chain)


        //____________________________________________FINALLY-CHECK WORKFLOW____________________________________________




        //Controller shouldn't check
        if(!CONFIG.CHAINS[chain].CONTROLLER.ME){

            let workflow=CONFIG.CHAINS[chain].WORKFLOW_CHECK.HOSTCHAINS
            //Here we check if has proofs for this block in any hostchain for this symbiote.So here we check workflow
            
            Object.keys(workflow).forEach(ticker=>
    
                workflow[ticker].STORE
                &&
                chainReference.HOSTCHAINS_DATA.get(controllerBlock.i+ticker).then(async proof=>{

                    let response = await hostchains.get(chain).get(ticker).checkTx(proof.HOSTCHAIN_HASH,controllerBlock.i,proof.KLYNTAR_HASH,chain).catch(e=>-1)
                        
                    if(proof.KLYNTAR_HASH===controllerHash && response!=-1 && response){
    
                        LOG(`Proof for block \x1b[36;1m${controllerBlock.i}\x1b[32;1m on \x1b[36;1m${CHAIN_LABEL(chain)}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m verified and stored`,'S')
    
                    }else{
    
                        LOG(`Can't write proof for block \x1b[36;1m${controllerBlock.i}\u001b[38;5;3m on \x1b[36;1m${CHAIN_LABEL(chain)}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W')
    
                        //...send report
    
                    }
                    
                }).catch(e=>LOG(`No proofs for block \x1b[36;1m${controllerBlock.i}\u001b[38;5;3m on \x1b[36;1m${CHAIN_LABEL(chain)}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W'))
                
            )

        }

    }

},








verifyInstantBlock=async block=>{

    let hash=InstantBlock.genHash(block.n,block.d,block.s,block.c),chainData=symbiotes.get(block.n),chainConfig=CONFIG.CHAINS[block.n]

    /*
  
        Check if this address can produce InstantBlocks-we need to make "quick" verification
        Deep inspection will be when this block will be included to ControllerBlock
        
        NOTE:Even if option <STORE_INSTANT_BLOCKS> is false we store this block(if overview below is ok) to candidates
        coz we'll need this block later,while perform ControllerBLock
    
    */


    let allow=
    
    symbiotes.has(block.n)//if we still support this chain
    &&
    block.s.length<=chainConfig.MANIFEST.INSTANT_BLOCK_STXS_MAX
    &&
    block.d.length<=chainConfig.MANIFEST.INSTANT_BLOCK_DTXS_MAX
    &&
    !(block.s.length===0&&block.d.length===0)//check quantity of txs
    &&
    !chainData.INSTANT_CANDIDATES.has(hash)//check if we already have this block-it will be in mapping anyway
    &&
    chainConfig.CANDIDATES_CACHE_SIZE>chainData.INSTANT_CANDIDATES.size//check if cache size is allow us to push this block to temporary storage
    &&
    !await chainData.CANDIDATES.get(hash).catch(e=>chainData.INSTANT_BLOCKS.get(hash).catch(e=>false))//check if we don't have this block
    &&
    await chainData.STATE.get(block.c).then(acc=>acc.B>=CONFIG.CHAINS[block.c].MANIFEST.INSTANT_FREEZE).catch(e=>false)//check if address still has stake(doesn't matter that we can be far away from our collapsed state to real)
    &&
    await VERIFY(hash,block.sig,block.c)//...finally-check signature


    

    if(allow){
        
        chainData.CANDIDATES.put(hash,block)
        
        .then(()=>{

            Promise.all(BROADCAST('/ib',block,block.n))//share with the network
            
            chainData.INSTANT_CANDIDATES.set(hash,block.c)
        
            BLOCKLOG(`New \x1b[36;1m\x1b[44;1mInstantBlock\x1b[0m\x1b[32m accepted  \x1b[31m${BLOCK_PATTERN}│`,'S',block.n,hash,56,'\x1b[31m')
            
        })
        
        .catch(e=>LOG(`Problem with adding candidate block \x1b[36;1m${hash}...\x1b[33;1m from \x1b[36;1m${block.n}... \x1b[33;1m ———> ${e.message}`,'W'))

    }

}