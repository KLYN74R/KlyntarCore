import {LOG,SYMBIOTE_ALIAS,BLAKE3} from '../../KLY_Utils/utils.js'

import {GET_ACCOUNT_ON_SYMBIOTE,BLOCKLOG,VERIFY} from './utils.js'

import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import Block from './essences/block.js'

import fetch from 'node-fetch'

import Base58 from 'base-58'





//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let



//blocksSet - array of blocks
PERFORM_BLOCK_MULTISET=blocksArray=>blocksArray.forEach(
            
    async block => {

        let blockHash=Block.genHash(block.c,block.e,block.i,block.p)

        if(await VERIFY(blockHash,block.sig,block.c)){

            SYMBIOTE_META.BLOCKS.put(block.c+":"+block.i,block)

        }

    }

),




/*

? Initially we ask blocks from CONFIG.SYMBIOTE.GET_MULTI node. It might be some CDN service, special API, private fast node and so on

We need to send an array of block IDs e.g. [Validator1:1337,Validator2:1337,Validator3:1337,Validator1337:1337, ... ValidatorX:2294]

*/

GET_BLOCKS_FOR_FUTURE = () => {


    let blocksIDs=[],
    
        limitedPool = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.slice(0,CONFIG.SYMBIOTE.GET_MULTIPLY_BLOCKS_LIMIT)



    for(let validator of limitedPool) blocksIDs.push(validator+":"+(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[validator].INDEX+1))

    
    let blocksIDsInJSON = JSON.stringify({symbiote:CONFIG.SYMBIOTE.SYMBIOTE_ID,blocksIDs})

 
    fetch(CONFIG.SYMBIOTE.GET_MULTI+`/multiplicity`,{
    
        method:'POST',
    
        body: blocksIDsInJSON
    
    
    }).then(r=>r.json()).then(PERFORM_BLOCK_MULTISET).catch(async error=>{
        
        LOG(`Some problem when load multiplicity of blocks on \x1b[32;1m${SYMBIOTE_ALIAS()}\n${error}`,'I')
    
        LOG(`Going to ask for blocks from the other nodes(\x1b[32;1mGET_MULTI\x1b[36;1m node is \x1b[31;1moffline\x1b[36;1m or another error occured)`,'I')

        //Combine all nodes we know about and try to find block there
        let allVisibleNodes=[CONFIG.SYMBIOTE.GET_MULTI,...CONFIG.SYMBIOTE.BOOTSTRAP_NODES,...SYMBIOTE_META.NEAR]


        for(let url of allVisibleNodes){

            let itsProbablyArrayOfBlocks=await fetch(url+'/multiplicity',{method:'POST',body:blocksIDsInJSON}).then(r=>r.json()).catch(e=>false)

            if(itsProbablyArrayOfBlocks){

                PERFORM_BLOCK_MULTISET(itsProbablyArrayOfBlocks)

                return //and leave function

            }

        }

    })

},




//Make all advanced stuff here-check block locally or ask from "GET_BLOCKS_URI" node for new blocks
//If no answer - try to find blocks somewhere else

GET_BLOCK = (blockCreator,index) => SYMBIOTE_META.BLOCKS.get(blockCreator+":"+index).catch(e=>

    fetch(CONFIG.SYMBIOTE.GET_BLOCKS_URI+`/block/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/`+blockCreator+":"+index)

    .then(r=>r.json()).then(block=>{

        let hash=Block.genHash(block.c,block.e,block.i,block.p)
            
        if(typeof block.e==='object'&&typeof block.p==='string'&&typeof block.sig==='string' && block.i===index && block.c === blockCreator){

            BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m  fetched  \x1b[31m——│`,'S',hash,48,'\x1b[31m',block)

            //Try to instantly and asynchronously load more blocks if it's possible
            GET_BLOCKS_FOR_FUTURE()

            return block

        }

    }).catch(async error=>{

        LOG(`No block \x1b[36;1m${blockCreator} ### ${index}\u001b[38;5;3m for symbiote \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m ———> ${error}`,'W')

        LOG(`Going to ask for blocks from the other nodes(\x1b[32;1mGET_BLOCKS_URI\x1b[36;1m node is \x1b[31;1moffline\x1b[36;1m or another error occured)`,'I')

        //Combine all nodes we know about and try to find block there
        let allVisibleNodes=[CONFIG.SYMBIOTE.GET_MULTI,...CONFIG.SYMBIOTE.BOOTSTRAP_NODES,...SYMBIOTE_META.NEAR],

            blockID=blockCreator+":"+index
        

        for(let url of allVisibleNodes){

            
            let itsProbablyBlock=await fetch(url+`/block/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/`+blockID).then(r=>r.json()).catch(e=>false)
            

            if(itsProbablyBlock){

                let hash=Block.genHash(itsProbablyBlock.c,itsProbablyBlock.e,itsProbablyBlock.i,itsProbablyBlock.p)
            

                if(typeof itsProbablyBlock.e==='object'&&typeof itsProbablyBlock.p==='string'&&typeof itsProbablyBlock.sig==='string' && itsProbablyBlock.i===index && itsProbablyBlock.c===blockCreator){

                    BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m  fetched  \x1b[31m——│`,'S',hash,48,'\x1b[31m',itsProbablyBlock)

                    //Try to instantly and asynchronously load more blocks if it's possible
                    GET_BLOCKS_FOR_FUTURE()

                    return itsProbablyBlock

                }

            }

        }
        
    })

),




START_TO_FIND_PROOFS_FOR_BLOCK = async blockID => {

    fetch(CONFIG.SYMBIOTE.GET_VALIDATORS_PROOFS_URI+`/proofs/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/`+blockID)

    .then(r=>r.json()).then(block=>{

        // let hash=Block.genHash(block.c,block.e,block.i,block.p)
            
        // if(typeof block.e==='object'&&typeof block.p==='string'&&typeof block.sig==='string' && block.i===index && block.c === blockCreator){

        //     BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m  fetched  \x1b[31m——│`,'S',hash,48,'\x1b[31m',block)

        //     //Try to instantly and asynchronously load more blocks if it's possible
        //     GET_BLOCKS_FOR_FUTURE()

        //     return block

        // }

    }).catch(async error=>{

        LOG(`Can't find BFT proofs for \x1b[36;1m${blockID}\u001b[38;5;3m for symbiote \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m ———> ${error}`,'W')

        //Combine all nodes we know about and try to find block there
        let allVisibleNodes=[CONFIG.SYMBIOTE.GET_MULTI,...CONFIG.SYMBIOTE.BOOTSTRAP_NODES,...SYMBIOTE_META.NEAR]
        

        for(let url of allVisibleNodes){

            
            let itsProbablyBlock=await fetch(url+`/proofs/${CONFIG.SYMBIOTE.SYMBIOTE_ID}/`+blockID).then(r=>r.json()).catch(e=>false)
            

            if(itsProbablyBlock){

                let hash=Block.genHash(itsProbablyBlock.c,itsProbablyBlock.e,itsProbablyBlock.i,itsProbablyBlock.p)
            

                if(typeof itsProbablyBlock.e==='object'&&typeof itsProbablyBlock.p==='string'&&typeof itsProbablyBlock.sig==='string' && itsProbablyBlock.i===index && itsProbablyBlock.c===blockCreator){

                    BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m  fetched  \x1b[31m——│`,'S',hash,48,'\x1b[31m',itsProbablyBlock)


                }

            }

        }
        
    })

},




/*

This is the function where we check the agreement from validators to understand what we should to do

Algorithm:

[+] 0. Initially,we should check if proofs from validators for block with BLOCK_ID have no <skipPoint>

        * skipPoint - is a hash of verification thread to know when we should skip and don't verify block of some validator. We'll check this block later, after validator return to game 



[+] 1. If skipPoint presents in proofs and majority of validators agree with this, then we compare the skipPoint with the current hash of VERIFICATION_THREAD (VERIFICATION_THREAD.CHECKSUM)

It they are equal - then we can skip the block and mark current validator as offline(ACTIVE:false)



[+] 2. If no skipPoint present and majority agree with this - we can securely verify the block following order of VERIFICATION_THREAD


*/
CHECK_BFT_PROOFS_FOR_BLOCK = async (blockId,blockHash) => {


    let proofs = await SYMBIOTE_META.VALIDATORS_PROOFS.get(blockId).catch(e=>false),


        //We should skip the block in case when skipPoint exsists in validators proofs and it equal to checksum of VERIFICATION_THREAD state
        shouldSkip = proofs.S && SYMBIOTE_META.VERIFICATION_THREAD.CHECKSUM === proofs.S

    


    if(proofs){

    
    /*    
        __________________________ Check if (2/3)*N validators have voted to accept this block on this thread or skip and continue after some state of VERIFICATION_THREAD __________________________
        
        Proofs - it's object with the following structure

        {
            ? skipPoint:<BLAKE3 HASH OF VERIFICATION_THREAD WHEN WE SHOULD SKIP THIS BLOCK>

            + votes:{

                [<Validator1_BLS_PubKey>]:<Validator1_BLS_Signature>,
                [<Validator2_BLS_PubKey>]:<Validator2_BLS_Signature>,
                
                ...

                [<Validator3_BLS_PubKey>]:<Validator3_BLS_Signature>,

            }
            
        }

        
    ███    ██  ██████  ████████ ███████ 
    ████   ██ ██    ██    ██    ██      
    ██ ██  ██ ██    ██    ██    █████   
    ██  ██ ██ ██    ██    ██    ██      
    ██   ████  ██████     ██    ███████ 
                                    
                                    
    1. If we have 1 pair in votes array - then it's already aggregated version of proofs
    
    2. If we have 2 objects in array and the second pair is array - then it's case when the first object - aggregated BLS pubkeys & signatures of validators and second object - array of AFK validators
    
    3. Otherwise - we have raw version of proofs

        
    */




        let bftProofsIsOk=false, // so optimistically
    
            {V:votes,S:skipPoint} = proofs,

            aggregatedValidatorsPublicKey = SYMBIOTE_META.STUFF_CACHE.get('VALIDATORS_AGGREGATED_PUB') || Base58.encode(await bls.aggregatePublicKeys(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.map(Base58.decode))),

            metadataToVerify = skipPoint ? skipPoint+":"+blockId : blockId+":"+blockHash




        if(votes.length===1){
    
            // 1. If we have 1 pair in votes array - then it's already aggregated version of proofs

            let aggregatedVote = votes[0]
                
            bftProofsIsOk = aggregatedValidatorsPublicKey === aggregatedVote.V && await VERIFY(metadataToVerify,aggregatedVote.S,aggregatedVote.V)
   
        }else if (votes.length===2 && Array.isArray(votes[1])){

            /*
        
                If we have 2 objects in array and the second pair is array - then it's case when the
            
                *    First object - aggregated BLS pubkeys & signatures of validators
            
                *    Second object - array of AFK validators        
        
            */
    
            let [aggregatedVote,afkValidators] = votes,

                validatorsNumber=SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length,

                majority = Math.ceil(validatorsNumber*(2/3))



            bftProofsIsOk = (validatorsNumber-afkValidators.length)>=majority && await VERIFY(metadataToVerify,aggregatedVote.S,aggregatedVote.V)

    
        }else{
        
            //3. Otherwise - we have raw version of proofs
            // In this case we need to through the proofs,make sure that majority has voted for the same version of proofs(agree/disagree, skip/verify and so on)
            let votesPromises = []
            
            for(let singleVote of votes){

                votesPromises.push(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(singleVote.V) && VERIFY(metadataToVerify,singleVote.S,singleVote.V).then(isOk=>isOk&&singleVote))

            }

            let verifiedVotesOfCurrentValidators = await Promise.all(votesPromises).then(
                
                array => array.filter(Boolean) //delete useless / unverified stuff
                
            ).catch(e=>false)




            let validatorsNumber=SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length,

                majority = Math.ceil(validatorsNumber*(2/3)),

                aggregatedSignature = '', 
            
                votersPubKeys = [],

                pureSignatures = []
            



            verifiedVotesOfCurrentValidators.forEach(
                        
                singleVote => {
                    
                    votersPubKeys.push(singleVote.V)

                    pureSignatures.push(Buffer.from(singleVote.S,'base64'))

                }
                    
            )


            aggregatedSignature = Buffer.from(await bls.aggregateSignatures(pureSignatures)).toString('base64')
            
            
            if(verifiedVotesOfCurrentValidators.length===validatorsNumber){

                //If 100% of validators approve this block - OK,accept it and aggregate data

                let aggregatedProofsArray = [{V:aggregatedValidatorsPublicKey,S:aggregatedSignature}],

                    finalProof = proofs.R ? {R:proofs.R,V:aggregatedProofsArray} : {V:aggregatedProofsArray}//this will be stored locally for future verification or to share over the network


                //And store proof locally
                await SYMBIOTE_META.VALIDATORS_PROOFS.put(blockId,finalProof).catch(e=>{})

                bftProofsIsOk=true


            }else if(verifiedVotesOfCurrentValidators.length>=majority) {
                
                //If more than 2/3 have voted for block - then ok,but firstly we need to do some extra operations(aggregate to less size,delete useless data and so on)

                //Firstly - find AFK validators
                let pubKeysOfAFKValidators = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS
                        
                                                        .filter(pubKey => !votersPubKeys.includes(pubKey)) //get validators whose votes we don't have
                        
                                                        .map(publicKey => Base58.decode(publicKey)) //decode from base58 format to raw buffer(need for .aggregatePublicKeys() function)
            


                
                let aggregatedPubKeyOfVoters = Base58.encode(await bls.aggregatePublicKeys(votersPubKeys.map(key=>Base58.decode(key)))),

                    aggregatedProofsArray = [{V:aggregatedPubKeyOfVoters,S:aggregatedSignature},pubKeysOfAFKValidators],

                    finalProof = proofs.R ? {R:proofs.R,V:aggregatedProofsArray} : {V:aggregatedProofsArray}//this will be stored locally for future verification or to share over the network




                //And store proof locally
                await SYMBIOTE_META.VALIDATORS_PROOFS.put(blockId,finalProof).catch(e=>{})

                bftProofsIsOk=true

            }else{

                LOG(`Currently,less than majority have voted for block \x1b[32;1m${blockId} \x1b[36;1m(\x1b[31;1mvotes/validators/majority\x1b[36;1m => \x1b[32;1m${verifiedVotesOfCurrentValidators.length}/${validatorsNumber}/${majority}\x1b[36;1m)`,'I')

            }

       
        }


        //Finally - return results

        return {bftProofsIsOk,shouldSkip}

    
    }else{

        //Let's find proofs over the network asynchronously
        START_TO_FIND_PROOFS_FOR_BLOCK(blockId)

        return {bftProofsIsOk:false}
    
    }

},




START_VERIFY_POLLING=async()=>{


    //This option will stop workflow of verification for each symbiote
    if(!SYSTEM_SIGNAL_ACCEPTED){


        THREADS_STILL_WORKS.GENERATION=true


        let prevValidatorWeChecked = SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.VALIDATOR,

            validatorsPool=SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS,

            //take the next validator in a row. If it's end of validators pool - start from the first validator in array
            currentValidatorToCheck = validatorsPool[validatorsPool.indexOf(prevValidatorWeChecked)+1] || validatorsPool[0],

            //We receive {INDEX,HASH,ACTIVE} - it's data from previously checked blocks on this validators' track. We're going to verify next block(INDEX+1)
            currentSessionMetadata = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[currentValidatorToCheck],

            blockID =  currentValidatorToCheck+":"+(currentSessionMetadata.INDEX+1),

            //take the next validator in a row. If it's end of validators pool - start from the first validator
            nextValidatorToCheck=validatorsPool[validatorsPool.indexOf(currentValidatorToCheck)+1] || validatorsPool[0],

            nextBlock//to verify block as fast as possible




        //If current validator was marked as "offline" or AFK - skip his blocks till his activity signals
        if(!currentSessionMetadata.ACTIVE){

            /*
                    
                Here we do everything to skip this block and move to the next validator's block
                        
                If 2/3 validators have voted to "skip" block - we take the "NEXT+1" block and continue work in verification thread
                    
                Here we just need to change finalized pointer to imitate that "skipped" block was successfully checked and next validator's block should be verified(in the next iteration)

            */

                
            SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.VALIDATOR=currentValidatorToCheck

            SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.INDEX=block.i
                                    
            SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.HASH=blockHash


        }else {

            let validatorsSolution = await CHECK_BFT_PROOFS_FOR_BLOCK(blockID)
        

            if(validatorsSolution.shouldSkip){

                /*
                        
                    Here we do everything to skip this block and move to the next validator's block
                            
                    If 2/3 validators have voted to "skip" block - we take the "NEXT+1" block and continue work in verification thread
                        
                    Here we just need to change finalized pointer to imitate that "skipped" block was successfully checked and next validator's block should be verified(in the next iteration)
    
                */

                currentSessionMetadata.ACTIVE=false
    
                SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.VALIDATOR=currentValidatorToCheck

                SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.INDEX=block.i
                                        
                SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.HASH=blockHash
    
            }else{

                //Try to get block
                let block=await GET_BLOCK(currentValidatorToCheck,currentSessionMetadata.INDEX+1),

                    pointerThatVerificationWasSuccessful = currentSessionMetadata.INDEX+1 //if the id will be increased - then the block was verified and we can move on 




                if(block && validatorsSolution.bftProofsIsOk){
                     
            
                    await verifyBlock(block)
            
                    //Signal that verification was successful
                    if(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[currentValidatorToCheck].INDEX===pointerThatVerificationWasSuccessful){
                
                        nextBlock=await GET_BLOCK(nextValidatorToCheck,SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[nextValidatorToCheck].INDEX+1)
                
                    }
                    //If verification failed - delete block. It will force to find another(valid) block from network
                    else SYMBIOTE_META.BLOCKS.del(currentValidatorToCheck+':'+(currentSessionMetadata.INDEX+1)).catch(e=>'')    
            
                }

            }                

        }

        LOG(!currentSessionMetadata.ACTIVE?'Oops, this validator is sleeping. Jump to next one':'Current validator generated blocks for us','I')

        LOG(nextBlock?'Next is available':`Wait for nextblock \x1b[36;1m${nextValidatorToCheck} ### ${SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[nextValidatorToCheck].INDEX+1}`,'W')


        if(CONFIG.SYMBIOTE.STOP_VERIFY) return//step over initiation of another timeout and this way-stop the Verification thread


        //If next block is available-instantly start perform.Otherwise-wait few seconds and repeat request
        setTimeout(()=>START_VERIFY_POLLING(),(nextBlock||!currentSessionMetadata.ACTIVE)?0:CONFIG.SYMBIOTE.VERIFICATION_THREAD_POLLING)

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
    await Promise.all(write.splice(0))
    
                    .then(_=>SNAPSHOT.METADATA.put('CANARY',canary))//put canary to snapshot
                    
                    .then(()=>SNAPSHOT.METADATA.put('VT',VERIFICATION_THREAD))//...and VERIFICATION_THREAD(to get info about collapsed height,hash etc.)
                    
                    .catch(e => {

                        LOG(`Snapshot creation failed for ${SYMBIOTE_ALIAS()}\n${e}`,'W')
        
                        process.emit('SIGINT',130)

                    })

    LOG(`Snapshot was successfully created for \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m on height \x1b[36;1m${VERIFICATION_THREAD.FINALIZED_POINTER.HASH} ### ${VERIFICATION_THREAD.FINALIZED_POINTER.INDEX}`,'S')




},




verifyBlock=async block=>{


    let blockHash=Block.genHash(block.c,block.e,block.i,block.p),


    overviewOk=
    
        block.e?.length<=CONFIG.SYMBIOTE.MANIFEST.EVENTS_LIMIT_PER_BLOCK
        &&
        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[block.c].HASH === block.p//it should be a chain
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
        block.e.forEach(event=>sendersAccounts.push(GET_ACCOUNT_ON_SYMBIOTE(event.c)))
        
        //Push accounts of creators of InstantBlock
        rewardBox.forEach(reference=>sendersAccounts.push(GET_ACCOUNT_ON_SYMBIOTE(reference.creator)))

        //Now cache has all accounts and ready for the next cycles
        await Promise.all(sendersAccounts.splice(0))
        


        //______________________________________CALCULATE TOTAL FEES AND AMOUNTS________________________________________

        block.e.forEach(event=>{

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
        
        
        // let controllerAcc=await GET_ACCOUNT_ON_SYMBIOTE(symbiote)

        // rewardBox.forEach(reference=>{
        
        //     let acc=GET_ACCOUNT_ON_SYMBIOTE(reference.creator),
                
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



        //Change finalization pointer
        SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.VALIDATOR=block.c

        SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.INDEX=block.i
                
        SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.HASH=blockHash

        
        //Change metadata
        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[block.c].INDEX=block.i

        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[block.c].HASH=blockHash



        SYMBIOTE_META.VERIFICATION_THREAD.DATA=snapshot

        SYMBIOTE_META.VERIFICATION_THREAD.CHECKSUM=BLAKE3(
            
            JSON.stringify(snapshot)
            +
            JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER)
            +
            JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS)
            +
            JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA)
        
        )


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