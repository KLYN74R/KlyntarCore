import {GET_ACCOUNT_ON_SYMBIOTE,BLOCKLOG,VERIFY,GET_STUFF} from './utils.js'

import {LOG,SYMBIOTE_ALIAS,BLAKE3} from '../../KLY_Utils/utils.js'

import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import Block from './essences/block.js'

import fetch from 'node-fetch'

import Base58 from 'base-58'



global.GETTING_BLOCK_FROM_NETWORK_PROCESS=false




//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let



//blocksAndProofs - array like this [{b:blockX,p:Proof_for_blockX}, {b:blockY,p:Proof_for_blockY}, ...]
PERFORM_BLOCK_MULTISET=blocksAndProofs=>{

    blocksAndProofs.forEach(
            
        //blockAndProof - {b:<block object>,p:<proof object>}
        async blockAndProof => {
    
            let {b:block,p:bftProof} = blockAndProof,
    
                blockHash=Block.genHash(block.c,block.e,block.i,block.p)
    
            if(await VERIFY(blockHash,block.sig,block.c)){
    
                SYMBIOTE_META.BLOCKS.put(block.c+":"+block.i,block).catch(e=>{})
    
            }
    
            if(bftProof) SYMBIOTE_META.VALIDATORS_PROOFS.put(block.c+":"+block.i,bftProof).catch(e=>{})
    
        }
    
    )

    //Reset flag
    GETTING_BLOCK_FROM_NETWORK_PROCESS=false

},




/*

? Initially we ask blocks from CONFIG.SYMBIOTE.GET_MULTI node. It might be some CDN service, special API, private fast node and so on

We need to send an array of block IDs e.g. [Validator1:1337,Validator2:1337,Validator3:1337,Validator1337:1337, ... ValidatorX:2294]

*/

GET_BLOCKS_FOR_FUTURE = () => {

    //Set locker
    global.GETTING_BLOCK_FROM_NETWORK_PROCESS=true


    let blocksIDs=[],

        currentValidators=SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS,
    
        limitedPool = currentValidators.slice(0,CONFIG.SYMBIOTE.GET_MULTIPLY_BLOCKS_LIMIT)

    
    if(CONFIG.SYMBIOTE.GET_MULTIPLY_BLOCKS_LIMIT>currentValidators.length){

        let perValidator = Math.ceil(CONFIG.SYMBIOTE.GET_MULTIPLY_BLOCKS_LIMIT/currentValidators.length)

        for(let index=0;index<perValidator;index++){

            for(let validator of currentValidators){

                if(validator===CONFIG.SYMBIOTE.PUB) continue

                blocksIDs.push(validator+":"+(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[validator].INDEX+index))

            }

        }


    }else{

        //If number of validators is bigger than our configurated limit to ask in advance blocks, then we ask 1 block per validator(according to VERIFICATION_THREAD state)
        for(let validator of limitedPool) blocksIDs.push(validator+":"+(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[validator].INDEX+1))

    }    


    let blocksIDsInJSON = JSON.stringify(blocksIDs)

    console.log('Going to ask ',blocksIDs)
 
    fetch(CONFIG.SYMBIOTE.GET_MULTI+`/multiplicity`,{
    
        method:'POST',
    
        body: blocksIDsInJSON
    
    
    }).then(r=>r.json()).then(PERFORM_BLOCK_MULTISET).catch(async error=>{
        
        LOG(`Some problem when load multiplicity of blocks on \x1b[32;1m${SYMBIOTE_ALIAS()}\n${error}`,'I')
    
        LOG(`Going to ask for blocks from the other nodes(\x1b[32;1mGET_MULTI\x1b[36;1m node is \x1b[31;1moffline\x1b[36;1m or another error occured)`,'I')

        //Combine all nodes we know about and try to find block there
        let allVisibleNodes=[...CONFIG.SYMBIOTE.BOOTSTRAP_NODES,...SYMBIOTE_META.NEAR]


        for(let url of allVisibleNodes){

            let itsProbablyArrayOfBlocksAndProofs=await fetch(url+'/multiplicity',{method:'POST',body:blocksIDsInJSON}).then(r=>r.json()).catch(e=>false)

            if(itsProbablyArrayOfBlocksAndProofs){

                PERFORM_BLOCK_MULTISET(itsProbablyArrayOfBlocksAndProofs)

                break
                
            }

        }

        //Reset flag
        GETTING_BLOCK_FROM_NETWORK_PROCESS=false

    })

},




GET_BLOCKS_FOR_FUTURE_WRAPPER = async() => {

    !GETTING_BLOCK_FROM_NETWORK_PROCESS //if flag is not disabled - then we still find blocks in another thread
    &&
    await GET_BLOCKS_FOR_FUTURE()

    setTimeout(GET_BLOCKS_FOR_FUTURE_WRAPPER,CONFIG.SYMBIOTE.GET_BLOCKS_FOR_FUTURE_TIMEOUT)

},




//Make all advanced stuff here-check block locally or ask from "GET_BLOCKS_URL" node for new blocks
//If no answer - try to find blocks somewhere else

GET_BLOCK = (blockCreator,index) => {

    let blockID=blockCreator+":"+index

    
    return SYMBIOTE_META.BLOCKS.get(blockID).catch(e=>

        fetch(CONFIG.SYMBIOTE.GET_BLOCKS_URL+`/block/`+blockCreator+":"+index)
    
        .then(r=>r.json()).then(block=>{
    
            let hash=Block.genHash(block.c,block.e,block.i,block.p)
                
            if(typeof block.e==='object'&&typeof block.p==='string'&&typeof block.sig==='string' && block.i===index && block.c === blockCreator){
    
                BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m  fetched  \x1b[31m——│`,'S',hash,48,'\x1b[31m',block)

                SYMBIOTE_META.BLOCKS.put(blockID,block)
    
                return block
    
            }
    
        }).catch(async error=>{
    
            LOG(`No block \x1b[36;1m${blockCreator} ### ${index}\u001b[38;5;3m for symbiote \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m ———> ${error}`,'W')
    
            LOG(`Going to ask for blocks from the other nodes(\x1b[32;1mGET_BLOCKS_URL\x1b[36;1m node is \x1b[31;1moffline\x1b[36;1m or another error occured)`,'I')
    
            //Combine all nodes we know about and try to find block there
            let allVisibleNodes=[CONFIG.SYMBIOTE.GET_MULTI,...CONFIG.SYMBIOTE.BOOTSTRAP_NODES,...SYMBIOTE_META.NEAR]
            
    
            for(let url of allVisibleNodes){

                if(url===CONFIG.SYMBIOTE.MY_HOSTNAME) continue
                
                let itsProbablyBlock=await fetch(url+`/block/`+blockID).then(r=>r.json()).catch(e=>false)
                
                if(itsProbablyBlock){
    
                    let hash=Block.genHash(itsProbablyBlock.c,itsProbablyBlock.e,itsProbablyBlock.i,itsProbablyBlock.p)
                
                    if(typeof itsProbablyBlock.e==='object'&&typeof itsProbablyBlock.p==='string'&&typeof itsProbablyBlock.sig==='string' && itsProbablyBlock.i===index && itsProbablyBlock.c===blockCreator){
    
                        BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m  fetched  \x1b[31m——│`,'S',hash,48,'\x1b[31m',itsProbablyBlock)

                        SYMBIOTE_META.BLOCKS.put(blockID,itsProbablyBlock)
    
                        return itsProbablyBlock
    
                    }
    
                }
    
            }
            
        })
    
    )

},




START_TO_FIND_PROOFS_FOR_BLOCK = async blockID => {


    let promises = [],

        proofRef = SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.get(blockID) || {V:{}}


    //0. Initially,try to get pubkey => node_ip binding 
    SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.forEach(
        
        pubKey => promises.push(GET_STUFF(pubKey).then(
            
            url => ({pubKey,pureUrl:url.payload.url})
            
        ))
    
    )


    let validatorsUrls = await Promise.all(promises.splice(0)).then(array=>array.filter(Boolean)),

        //Combine all nodes we know about and try to find proofs for block there. We starts with validators and so on(order by priority)
        allVisibleNodes=[...CONFIG.SYMBIOTE.GET_MULTI,...CONFIG.SYMBIOTE.BOOTSTRAP_NODES,...SYMBIOTE_META.NEAR]

        
    //Try to find proofs
    for(let validatorHandler of validatorsUrls){

        //No sense to ask someone whose proof we already have
        if(proofRef.V[validatorHandler.pubKey]) continue

        fetch(validatorHandler.pureUrl+`/createvalidatorsproofs/`+blockID).then(r=>r.json()).then(
            
            proof =>{

                if(proof.S){

                    //Check if it's aggregated proof - it will be so called "optimization"
                    //Aggregated proof has "A" array (array of AFK validators)
                    
                    if(proof.A){

                        console.log('Aggregated proof received ',proof)

                    }
                    
                    proofRef.V[validatorHandler.pubKey]=proof.S
                    
                    SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.set(blockID,proofRef)

                }

            }
            
        ).catch(_=>{})


    }


    // //In the worst case
    // for(let url of allVisibleNodes){

    //     let itsProbablyProofs=await fetch(url+`/createvalidatorsproofs/`+blockID).then(r=>r.json()).catch(e=>false)
        
    //     if(itsProbablyProofs){            

    //         SYMBIOTE_META.VALIDATORS_PROOFS.put(blockID,itsProbablyProofs).catch(e=>false)                

    //     }

    // }
    


    // fetch(CONFIG.SYMBIOTE.GET_VALIDATORS_PROOFS_URL+`/proofs/`+blockID)

    // .then(r=>r.json()).then(proofObject=>{

    //     console.log('Receive ',proofObject)

    //     //Here we find the proofs and store localy to use in the next iteration of CHECK_BFT_PROOFS_FOR_BLOCK
    //     proofObject && SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.set(blockID,proofObject)

    // }).catch(async error=>{

    // })

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




    let proofs = SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.get(blockId) || await SYMBIOTE_META.VALIDATORS_PROOFS.get(blockId).catch(e=>false),

        //We should skip the block in case when skipPoint exsists in validators proofs and it equal to checksum of VERIFICATION_THREAD state
        shouldSkip = proofs.S && SYMBIOTE_META.VERIFICATION_THREAD.CHECKSUM === proofs.S




    //Optimization stuff
    if(blockId===CONFIG.SYMBIOTE.SKIP_BFT_PROOFS.POINT) CONFIG.SYMBIOTE.SKIP_BFT_PROOFS.ACTIVATE=false
    
    if(CONFIG.SYMBIOTE.SKIP_BFT_PROOFS.ACTIVATE) return {bftProofsIsOk:true,shouldSkip}




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

            ? a:<AGGREGATED or NOT>
            
        }

        
    ███    ██  ██████  ████████ ███████ 
    ████   ██ ██    ██    ██    ██      
    ██ ██  ██ ██    ██    ██    █████   
    ██  ██ ██ ██    ██    ██    ██      
    ██   ████  ██████     ██    ███████ 
                                    
                                    
    
    1. If we have 2 properties and the second is A(aggregated) - then it's case when the first property-value pair - aggregated BLS pubkey & signature of validators and second property - array of AFK validators
    
    2. Otherwise - we have raw version of proofs like previously shown(where string "Check if (2/3)*N validators...")

        
    */




        let bftProofsIsOk=false, // so optimistically
    
            {V:votes,S:skipPoint} = proofs,

            aggregatedValidatorsPublicKey = SYMBIOTE_META.STUFF_CACHE.get('VALIDATORS_AGGREGATED_PUB') || Base58.encode(await bls.aggregatePublicKeys(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.map(Base58.decode))),

            metadataToVerify = skipPoint ? (skipPoint+":"+blockId) : (blockId+":"+blockHash),

            validatorsWhoVoted = Object.keys(votes),

            isAggregatedBranch = true

 


        if (validatorsWhoVoted.length===2 && validatorsWhoVoted[1]==='A'){

            /*

                In this case, structure looks like this

                {
                    "AggregatedPubKey as property name":<Signature as value>
                    A:[Pub1,Pub2,Pub3] //array of AFK validators
                }

                Example:

                {
                
                    "7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta":"iueh10NIDO9XEAQ2DYf6CrJtVtDCPSQ187BUI42XO1fJCFBlcNHWOc0mX0RbsZSMBk98D1eYE3gN2moo/vorgexuh/C/v1GRgwzeSBnJ6KJg54/GBfOoKuwa6lmvSWpj",
                    
                    A:["7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta","7Wnx41FLF6Pp2vEeigTtrU5194LTyQ9uVq4xe48XZScxpaRjkjSi8oPbQcUVC2LYUT"]
                
                }
        
                If we have 2 properties where the first one is BLS aggregated pubkey of validators(as property name) and aggregated signature as value
                
                the second pair is array - then it's case when the
            
                *    First object - aggregated BLS pubkeys & signatures of validators
            
                *    Second object - array of AFK validators        
        
            */
    
            let validatorsNumber=SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length,

                majority = Math.ceil(validatorsNumber*(2/3))



            bftProofsIsOk = (validatorsNumber-votes['A'].length)>=majority && await VERIFY(metadataToVerify,validatorsWhoVoted[0],votes[validatorsWhoVoted[0]])

    
        }else{

            isAggregatedBranch = false
        
            //3. Otherwise - we have raw version of proofs
            // In this case we need to through the proofs,make sure that majority has voted for the same version of proofs(agree/disagree, skip/verify and so on)
            let votesPromises = []

            
            for(let singleValidator in votes){

                votesPromises.push(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(singleValidator)
                &&
                VERIFY(metadataToVerify,votes[singleValidator],singleValidator).then(isOk=>isOk&&singleValidator))

            }

            let validatorsWithVerifiedSignatures = await Promise.all(votesPromises).then(
                
                array => array.filter(Boolean) //delete useless / unverified stuff
                
            ).catch(e=>false)




            let validatorsNumber=SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length,

                majority = Math.ceil(validatorsNumber*(2/3)),

                aggregatedSignature = '',

                pureSignatures = []
            



            validatorsWithVerifiedSignatures.forEach(
                        
                validator => pureSignatures.push(Buffer.from(votes[validator],'base64'))
                    
            )


            aggregatedSignature = Buffer.from(await bls.aggregateSignatures(pureSignatures)).toString('base64')
            
            
            if(validatorsWithVerifiedSignatures.length===validatorsNumber){

                //If 100% of validators approve this block - OK,accept it and aggregate data

                let aggregatedProof = {V:{[aggregatedValidatorsPublicKey]:aggregatedSignature},A:[]}

                //And store proof locally
                await SYMBIOTE_META.VALIDATORS_PROOFS.put(blockId,aggregatedProof).catch(e=>{})

                bftProofsIsOk=true


            }else if(validatorsWithVerifiedSignatures.length>=majority){
                
                //If more than 2/3 have voted for block - then ok,but firstly we need to do some extra operations(aggregate to less size,delete useless data and so on)

                //Firstly - find AFK validators
                let pubKeysOfAFKValidators = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS
                        
                                                        .filter( pubKey => !validatorsWithVerifiedSignatures.includes(pubKey) ) //get validators whose votes we don't have
                        
                                                        .map(Base58.decode) //decode from base58 format to raw buffer(need for .aggregatePublicKeys() function)
            


                
                let aggregatedPubKeyOfVoters = Base58.encode(await bls.aggregatePublicKeys(validatorsWithVerifiedSignatures.map(Base58.decode))),

                    aggregatedProof = {V:{[aggregatedPubKeyOfVoters]:aggregatedSignature},A:pubKeysOfAFKValidators}



                //And store proof locally
                await SYMBIOTE_META.VALIDATORS_PROOFS.put(blockId,aggregatedProof).catch(e=>{})

                bftProofsIsOk=true

            }else{

                LOG(`Currently,less than majority have voted for block \x1b[32;1m${blockId} \x1b[36;1m(\x1b[31;1mvotes/validators/majority\x1b[36;1m => \x1b[32;1m${validatorsWithVerifiedSignatures.length}/${validatorsNumber}/${majority}\x1b[36;1m)`,'I')

                START_TO_FIND_PROOFS_FOR_BLOCK(blockId)

            }

       
        }

        
        if(!bftProofsIsOk && isAggregatedBranch) START_TO_FIND_PROOFS_FOR_BLOCK(blockId) //run


        //Finally - return results
        return {bftProofsIsOk,shouldSkip}

    
    }else{

        //Let's find proofs over the network asynchronously
        START_TO_FIND_PROOFS_FOR_BLOCK(blockId)
 
        return {bftProofsIsOk:false}
    
    }

},




PREPARE_TO_SKIP_PROCEDURE = blockID => {

    LOG('Skip procedure is going to start. But let`s await firstly for block','W')

    setTimeout(async()=>{

        let block = await SYMBIOTE_META.BLOCKS.get(blockID).catch(e=>false)

        if(!block){

            global.SKIP_METADATA={
            
                GOING_TO_SKIP_STATE:true
        
            }
    
            SKIP_METADATA.BLOCK_TO_SKIP=blockID

            SKIP_METADATA.VOTES={}

            //Go through the validators and grab proofs to skip

            let pureUrls = []

        }

    },CONFIG.SYMBIOTE.AWAIT_FOR_AFK_VALIDATOR)


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

            //Try to get block
            let block=await GET_BLOCK(currentValidatorToCheck,currentSessionMetadata.INDEX+1),

                blockHash = block && Block.genHash(block.c,block.e,block.i,block.p),

                validatorsSolution = await CHECK_BFT_PROOFS_FOR_BLOCK(blockID,blockHash)
        



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
                
                let pointerThatVerificationWasSuccessful = currentSessionMetadata.INDEX+1 //if the id will be increased - then the block was verified and we can move on 

                if(block && validatorsSolution.bftProofsIsOk){

                    await verifyBlock(block)
            
                    //Signal that verification was successful
                    if(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[currentValidatorToCheck].INDEX===pointerThatVerificationWasSuccessful){
                
                        nextBlock=await GET_BLOCK(nextValidatorToCheck,SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[nextValidatorToCheck].INDEX+1)
                
                    }
                    //If verification failed - delete block. It will force to find another(valid) block from network
                    else SYMBIOTE_META.BLOCKS.del(currentValidatorToCheck+':'+(currentSessionMetadata.INDEX+1)).catch(e=>console.log('Going to delete'))    
                
                }else if (!block && SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(CONFIG.SYMBIOTE.PUB)){

                    PREPARE_TO_SKIP_PROCEDURE(blockID)

                }
                
            }

        }



        if(CONFIG.SYMBIOTE.STOP_VERIFY) return//step over initiation of another timeout and this way-stop the Verification thread


        //If next block is available-instantly start perform.Otherwise-wait few seconds and repeat request
        setTimeout(START_VERIFY_POLLING,(nextBlock||!currentSessionMetadata.ACTIVE)?0:CONFIG.SYMBIOTE.VERIFICATION_THREAD_POLLING)

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
            
        ).catch(e=>{
    
                LOG(`Snapshot creation failed on state copying stage for ${SYMBIOTE_ALIAS()}\n${e}`,'W')
                
                process.emit('SIGINT',130)
    
            })

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


        //To calculate fees and split between validators.Currently - general fees sum is 0. It will be increased each performed transaction
        let rewardBox={fees:0}


        global.SYNC_OPERATIONS={VALIDATORS:{}}


        //_________________________________________GET ACCOUNTS FROM STORAGE____________________________________________
        

        let sendersAccounts=[]
        
        //Go through each event,get accounts of initiators from state by creating promise and push to array for faster resolve
        block.e.forEach(event=>sendersAccounts.push(GET_ACCOUNT_ON_SYMBIOTE(event.c)))
        
        //Push accounts of validators
        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.forEach(pubKey=>sendersAccounts.push(GET_ACCOUNT_ON_SYMBIOTE(pubKey)))

        //Now cache has all accounts and ready for the next cycles
        await Promise.all(sendersAccounts.splice(0))


        //______________________________________CALCULATE TOTAL FEES AND AMOUNTS________________________________________


        block.e.forEach(event=>{

            //O(1),coz it's set
            if(!SYMBIOTE_META.BLACKLIST.has(event.c)){

                
                let acc=GET_ACCOUNT_ON_SYMBIOTE(event.c),
                    
                    spend=SYMBIOTE_META.SPENDERS[event.t]?.(event) || CONFIG.SYMBIOTE.MANIFEST.DEFAULT_PAYMENT_IF_WRONG_TYPE



                        
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
            eventsPromises.push(SYMBIOTE_META.VERIFIERS[event.t](event,rewardBox))

        )
        
        await Promise.all(eventsPromises.splice(0))

        LOG(`BLACKLIST size(\u001b[38;5;177m${block.i}\x1b[32;1m ### \u001b[38;5;177m${blockHash}\x1b[32;1m ### \u001b[38;5;177m${block.c}\u001b[38;5;3m) ———> \x1b[36;1m${SYMBIOTE_META.BLACKLIST.size}`,'W')

        
        //____________________________________________PERFORM SYNC OPERATIONS___________________________________________


        let validatorsToMakeSyncOperations = Object.keys(SYNC_OPERATIONS.VALIDATORS)

        //Currently we have sync operations only for changes in validators' stuff

        if(validatorsToMakeSyncOperations.length!==0){

            validatorsToMakeSyncOperations.forEach(pubKey=>{

                let operation = SYNC_OPERATIONS.VALIDATORS[pubKey]
    
                if(operation==='DELETE'){
    
                    //Delete from general list of VERIFICATION_THREAD
                    SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.splice(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.indexOf(pubKey),1)
    
                    //Delete metadata of validator
                    delete SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[pubKey]
    
                }else if (operation==='ADD'){
    
                    //Add to general list of VERIFICATION_THREAD
                    SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.push(pubKey)
    
                    //Add metadata of validator
                    SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[pubKey]={INDEX:-1,HASH:'Poyekhali!@Y.A.Gagarin',ACTIVE:true}
    
                }
    
            })

            //Recount root BLS pubkey after all
            SYMBIOTE_META.STUFF_CACHE.set('VALIDATORS_AGGREGATED_PUB',Base58.encode(await bls.aggregatePublicKeys(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.map(Base58.decode))))


        }


        //__________________________________________SHARE FEES AMONG VALIDATORS_________________________________________
        

        let shareFeesPromises=[], 

            payToValidator = rewardBox.fees * CONFIG.SYMBIOTE.MANIFEST.VALIDATOR_REWARD_PERCENTAGE, //the biggest part is usually delegated to creator of block
        
            payToSingleNonCreatorValidator = Math.floor((rewardBox.fees - payToValidator)/(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length-1))//and share the rest among other validators




        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.forEach(validatorPubKey=>

            shareFeesPromises.push(

                GET_ACCOUNT_ON_SYMBIOTE(validatorPubKey).then(accountRef=>accountRef.ACCOUNT.B+=payToSingleNonCreatorValidator)

            )
            
        )
     
        await Promise.all(shareFeesPromises.splice(0))


        //Probably you would like to store only state or you just run another node via cloud module and want to store some range of blocks remotely
        if(CONFIG.SYMBIOTE.STORE_BLOCKS){
            
            //No matter if we already have this block-resave it

            SYMBIOTE_META.BLOCKS.put(block.c+":"+block.i,block).catch(e=>LOG(`Failed to store block ${block.i} on ${SYMBIOTE_ALIAS()}\nError:${e}`,'W'))

        }else{

            //...but if we shouldn't store and have it locally(received probably by range loading)-then delete
            SYMBIOTE_META.BLOCKS.del(block.c+":"+block.i).catch(
                
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
                
            }).catch(e=>{})
            
        )

    }

}