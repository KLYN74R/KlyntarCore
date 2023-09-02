import {
    
    GET_POOLS_URLS,GET_ALL_KNOWN_PEERS,GET_MAJORITY,IS_MY_VERSION_OLD,CHECK_IF_CHECKPOINT_STILL_FRESH,

    GET_ACCOUNT_ON_SYMBIOTE,GET_QUORUM,GET_FROM_STATE

} from './utils.js'

import {GET_VALID_CHECKPOINT,GRACEFUL_STOP,SET_REASSIGNMENT_CHAINS} from './life.js'

import SYSTEM_SYNC_OPERATIONS_VERIFIERS from './systemOperationsVerifiers.js'

import {KLY_EVM} from '../../KLY_VirtualMachines/kly_evm/vm.js'

import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import {LOG,BLAKE3} from '../../KLY_Utils/utils.js'

import Block from './essences/block.js'

import fetch from 'node-fetch'

import Web3 from 'web3'





//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let




//Make all advanced stuff here-check block locally or ask from "GET_BLOCKS_URL" node for new blocks
//If no answer - try to find blocks somewhere else

GET_BLOCK = async (epochIndex,blockCreator,index) => {

    let blockID = epochIndex+':'+blockCreator+':'+index
    
    return global.SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>

        fetch(global.CONFIG.SYMBIOTE.GET_BLOCKS_URL+`/block/`+blockCreator+':'+index,{agent:global.FETCH_HTTP_AGENT})
    
        .then(r=>r.json()).then(block=>{
                
            if(typeof block.transactions==='object' && typeof block.prevHash==='string' && typeof block.sig==='string' && block.index===index && block.creator === blockCreator){

                global.SYMBIOTE_META.BLOCKS.put(blockID,block)
    
                return block
    
            }
    
        }).catch(async _error=>{
    
            // LOG(`No block \x1b[36;1m${blockCreator+':'+index}\u001b[38;5;3m ———> ${error}`,'W')
    
            // LOG(`Going to ask for blocks from the other nodes(\x1b[32;1mGET_BLOCKS_URL\x1b[36;1m node is \x1b[31;1moffline\x1b[36;1m or another error occured)`,'I')
    

            //Combine all nodes we know about and try to find block there
            let allVisibleNodes = await GET_POOLS_URLS()

    
            for(let url of allVisibleNodes){

                if(url===global.CONFIG.SYMBIOTE.MY_HOSTNAME) continue
                
                let itsProbablyBlock = await fetch(url+`/block/`+blockID,{agent:global.FETCH_HTTP_AGENT}).then(r=>r.json()).catch(_=>false)
                
                if(itsProbablyBlock){

                    let overviewIsOk =
                    
                        typeof itsProbablyBlock.transactions==='object'
                        &&
                        typeof itsProbablyBlock.prevHash==='string'
                        &&
                        typeof itsProbablyBlock.sig==='string'
                        &&
                        itsProbablyBlock.index===index
                        &&
                        itsProbablyBlock.creator===blockCreator
                

                    if(overviewIsOk){

                        global.SYMBIOTE_META.BLOCKS.put(blockID,itsProbablyBlock).catch(_=>{})
    
                        return itsProbablyBlock
    
                    }
    
                }
    
            }
            
        })
    
    )

},




VERIFY_AGGREGATED_FINALIZATION_PROOF = async (itsProbablyAggregatedFinalizationProof,checkpoint,rootPub) => {

    // Make the initial overview
    let generalAndTypeCheck =   itsProbablyAggregatedFinalizationProof
                                    &&
                                    typeof itsProbablyAggregatedFinalizationProof.aggregatedPub === 'string'
                                    &&
                                    typeof itsProbablyAggregatedFinalizationProof.aggregatedSignature === 'string'
                                    &&
                                    typeof itsProbablyAggregatedFinalizationProof.blockID === 'string'
                                    &&
                                    typeof itsProbablyAggregatedFinalizationProof.blockHash === 'string'
                                    &&
                                    Array.isArray(itsProbablyAggregatedFinalizationProof.afkVoters)


    if(generalAndTypeCheck){

        let checkpointFullID = checkpoint.hash+"#"+checkpoint.id

        let {blockID,blockHash,aggregatedPub,aggregatedSignature,afkVoters} = itsProbablyAggregatedFinalizationProof

        let dataThatShouldBeSigned = blockID+blockHash+'FINALIZATION'+checkpointFullID

        let majority = GET_MAJORITY(checkpoint)

        let reverseThreshold = checkpoint.quorum.length-majority

        let signaIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,rootPub,dataThatShouldBeSigned,aggregatedSignature,reverseThreshold).catch(_=>false)

        return signaIsOk

    }

},




/*

<AGGREGATED_FINALIZATION_PROOF> is an aggregated proof from 2/3N+1 pools from quorum that they each have 2/3N+1 commitments from other pools

Structure => {
    
    blockID:"521:7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta:0",

    blockHash:"0123456701234567012345670123456701234567012345670123456701234567",

    aggregatedPub:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP",

    aggregatedSigna:"kffamjvjEg4CMP8VsxTSfC/Gs3T/MgV1xHSbP5YXJI5eCINasivnw07f/lHmWdJjC4qsSrdxr+J8cItbWgbbqNaM+3W4HROq2ojiAhsNw6yCmSBXl73Yhgb44vl5Q8qD",

    afkVoters:[]

}

********************************************** ONLY AFTER VERIFICATION OF AGGREGATED_FINALIZATION_PROOF YOU CAN PROCESS THE BLOCK **********************************************

Verification process:

    Saying, you need to get proofs to add some block 1337th generated by validator Andy with hash "cafe..."

    Once you find the candidate for AGGREGATED_FINALIZATION_PROOF , you should verify

        [+] let shouldAccept = await VERIFY(aggregatedPub,aggregatedSigna,"Andy:1337"+":cafe:"+'FINALIZATION')

            Also, check if QUORUM_AGGREGATED_PUB === AGGREGATE(aggregatedPub,afkVoters)

    If this both conditions is ok - then you can accept block with 100% garantee of irreversibility

*/

GET_AGGREGATED_FINALIZATION_PROOF = async (blockID,blockHash) => {


    let quorumThreadCheckpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.id

    let vtCheckpoint = global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT

    let verificationThreadCheckpointFullID = vtCheckpoint.hash+"#"+vtCheckpoint.id

    let rootPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('VT_ROOTPUB'+verificationThreadCheckpointFullID)


    // Need for async safety
    if(verificationThreadCheckpointFullID!==quorumThreadCheckpointFullID || !global.SYMBIOTE_META.TEMP.has(quorumThreadCheckpointFullID)) return {verify:false}

    
    let aggregatedFinalizationProof = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+blockID).catch(_=>false)


    //We shouldn't verify local version of AFP, because we already did it. See the GET /aggregated_finalization_proof route handler

    if(aggregatedFinalizationProof){

        return aggregatedFinalizationProof.blockHash === blockHash ? {verify:true} : {verify:false,shouldDelete:true}

    }

    //Go through known hosts and find AGGREGATED_FINALIZATION_PROOF. Call GET /aggregated_finalization_proof route
    
    let quorumMembersURLs = [global.CONFIG.SYMBIOTE.GET_AGGREGATED_FINALIZATION_PROOF_URL,...await GET_POOLS_URLS(),...GET_ALL_KNOWN_PEERS()]

    for(let memberURL of quorumMembersURLs){

        let itsProbablyAggregatedFinalizationProof = await fetch(memberURL+'/aggregated_finalization_proof/'+blockID,{agent:global.FETCH_HTTP_AGENT}).then(r=>r.json()).catch(_=>false)

        if(itsProbablyAggregatedFinalizationProof){

            let isOK = await VERIFY_AGGREGATED_FINALIZATION_PROOF(itsProbablyAggregatedFinalizationProof,vtCheckpoint,rootPub)

            if(isOK && itsProbablyAggregatedFinalizationProof.blockID === blockID && itsProbablyAggregatedFinalizationProof.blockHash === blockHash) return isOK 

        }

    }

    //If we can't find - try next time

    return {verify:false}

},




WAIT_SOME_TIME = async() =>

    new Promise(resolve=>

        setTimeout(()=>resolve(),global.CONFIG.SYMBIOTE.WAIT_IF_CANT_FIND_CHECKPOINT)

    )
,




DELETE_POOLS_WITH_LACK_OF_STAKING_POWER = async ({poolHashID,poolPubKey}) => {

    //Try to get storage "POOL" of appropriate pool

    let poolStorage = await GET_FROM_STATE(poolHashID)

    poolStorage.lackOfTotalPower=true

    poolStorage.stopCheckpointID=global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id

    delete global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[poolPubKey]

},




CHECK_AGGREGATED_SKIP_PROOF_VALIDITY = async (skippedPoolPubKey,aggregatedSkipProof,checkpointFullID,checkpoint,threadID) => {

    /*

    Check the <aggregatedSkipProof>(ASP) signed by majority(2/3N+1) and aggregated
    
    ASP structure is:
    
    {

        firstBlockHash,

        (?) tmbIndex,

        (?) tmbHash,

        skipIndex,

        skipHash,

        aggregatedPub:bls.aggregatePublicKeys(pubkeysWhoAgreeToSkip),

        aggregatedSignature:bls.aggregateSignatures(signaturesToSkip),

        afkVoters:currentQuorum.filter(pubKey=>!pubkeysWhoAgreeToSkip.has(pubKey))

    }

        Check the skip proof:

            1) If tmb proofs exists => `SKIP:${skippedPoolPubKey}:${firstBlockHash}:${tmbIndex}:${tmbHash}:${skipIndex}:${skipHash}:${checkpointFullID}`
            1) If no tmb proofs => `SKIP:${skippedPoolPubKey}:${firstBlockHash}:${skipIndex}:${skipHash}:${checkpointFullID}`

        Also, if skipIndex === 0 - it's signal that firstBlockHash = skipHash
        If skipIndex === -1 - skipHash and firstBlockHash will be default - '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

    */

    
    if(typeof aggregatedSkipProof === 'object'){


        let quorumRootPub = threadID === 'QUORUM_THREAD' ? global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID) : global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('VT_ROOTPUB'+checkpointFullID)

        let majority = GET_MAJORITY(checkpoint)
    
        let reverseThreshold = checkpoint.quorum.length-majority
    

        // Check the proof
    

        let {firstBlockHash,tmbIndex,tmbHash,skipIndex,skipHash,aggregatedPub,aggregatedSignature,afkVoters} = aggregatedSkipProof
    
        let dataThatShouldBeSigned

        if(typeof tmbIndex === 'number' && typeof tmbHash === 'string'){

            dataThatShouldBeSigned = `SKIP:${skippedPoolPubKey}:${firstBlockHash}:${tmbIndex}:${tmbHash}:${skipIndex}:${skipHash}:${checkpointFullID}`

        }else{

            dataThatShouldBeSigned = `SKIP:${skippedPoolPubKey}:${firstBlockHash}:${skipIndex}:${skipHash}:${checkpointFullID}`

        }

    
        let aspIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,quorumRootPub,dataThatShouldBeSigned,aggregatedSignature,reverseThreshold).catch(_=>false)
    
        return aspIsOk

    }

},




CHECK_IF_ALL_ASP_PRESENT = async (primePoolPubKey,firstBlockInThisEpochByPool,reassignmentArray,position,checkpointFullID,oldCheckpoint,threadID,dontCheckSignature) => {

    /*
    
        Here we need to check the integrity of reassignment chain to make sure that we can get the obvious variant of a valid chain to verify

        We need to check if <firstBlockInThisEpochByPool.extraData.reassignments> contains all the ASPs(aggregated skip proofs)
        
            for pools from <position>(index of current pool in <reassignmentArray>) to the first pool with not-null ASPs

        
        So, we simply start the reverse enumeration in <reassignmentArray> from <position> to the beginning of <reassignment array> and extract the ASPs

        Once we met the ASP with index not equal to -1 (>=0) - we can stop enumeration and return true
    
    */


    let reassignmentsRef = firstBlockInThisEpochByPool.extraData?.reassignments

    let filteredReassignments = {}


    if(typeof reassignmentsRef === 'object'){


        let arrayForIteration = reassignmentArray.slice(0,position).reverse() // take all the pools till position of current pool and reverse it because in optimistic case we just need to find the closest pool to us with non-null ASP 

        let arrayIndexer = 0


        for(let poolPubKey of arrayForIteration){

            let aspForThisPool = reassignmentsRef[poolPubKey]
    
            if(typeof aspForThisPool === 'object'){

                let signaIsOk = dontCheckSignature || await CHECK_AGGREGATED_SKIP_PROOF_VALIDITY(poolPubKey,aspForThisPool,checkpointFullID,oldCheckpoint,threadID)

                if(signaIsOk){

                    filteredReassignments[poolPubKey] = {
                        
                        index:aspForThisPool.skipIndex,
                        
                        hash:aspForThisPool.skipHash,
                        
                        firstBlockHash:aspForThisPool.firstBlockHash
                    
                    }

                    arrayIndexer++

                    if(aspForThisPool.skipIndex>=0) break

                }else return {isOK:false}

            } else return {isOK:false}
    
        }

        if(arrayIndexer === position){

            // In case we've iterated over the whole range - check the ASP for prime pool

            let aspForPrimePool = reassignmentsRef[primePoolPubKey]

            let signaIsOk = dontCheckSignature || await CHECK_AGGREGATED_SKIP_PROOF_VALIDITY(primePoolPubKey,aspForPrimePool,checkpointFullID,oldCheckpoint,threadID)

            if(signaIsOk){

                filteredReassignments[primePoolPubKey] = {
                    
                    index:aspForPrimePool.skipIndex,
                    
                    hash:aspForPrimePool.skipHash,
                    
                    firstBlockHash:aspForPrimePool.firstBlockHash
                
                }

            }else return {isOK:false}

        }
    

    } else return {isOK:false}


    return {isOK:true,filteredReassignments}

},




BUILD_REASSIGNMENT_METADATA = async (verificationThread,oldCheckpoint,newCheckpoint,checkpointFullID) => {

    verificationThread.REASSIGNMENT_METADATA={}

    // verificationThread is global.SYMBIOTE_META.VERIFICATION_THREAD

    /*
    
    VT.REASSIGNMENT_METADATA has the following structure

        KEY = <BLS pubkey of prime pool>
    
        VALUE = {

            primePool:{index,hash},
            reservePool0:{index,hash},
            reservePool1:{index,hash},
            
            ...

            reservePoolN:{index,hash}

        }

        
        We should finish to verify blocks upto height in prime pool and reserve pools

        ________________________________Let's use this algorithm________________________________

        0) Once we get the new valid checkpoint, use the REASSIGNMENT_CHAINS built for this checkpoint(from global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT)

        1) Using global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT[<primePool>] in reverse order to find the first block in this epoch(checkpoint) and do filtration. The valid points will be those pools which includes the <aggregatedSkipProof> for all the previous reserve pools

        2) Once we get it, run the second cycle for another filtration - now we should ignore pointers in pools which was skipped on the first block of this epoch

        3) Using this values - we can build the reasssignment metadata to finish verification process on checkpoint and move to a new one

            _________________________________For example:_________________________________
            
            Imagine that prime pool <MAIN_POOL_A> has 5 reserve pools: [Reserve0,Reserve1,Reserve2,Reserve3,Reserve4]

            The pools metadata from checkpoint shows us that previous epoch finished on these heights for pools:
            
                For prime pool => INDEX:1337 HASH:adcd...

                For reserve pools:

                    [Reserve0]: INDEX:1245 HASH:0012...

                    [Reserve1]: INDEX:1003 HASH:2363...
                    
                    [Reserve2]: INDEX:1000 HASH:fa56...

                    [Reserve3]: INDEX:2003 HASH:ad79...

                    [Reserve4]: INDEX:1566 HASH:ce77...


            (1) We run the initial cycle in reverse order to find the <aggregatedSkipProof>

                Each next pool in a row must have ASP for all the previous pools.

                For example, imagine the following situation:
                    
                    🙂[Reserve0]: [ASP for prime pool]           <==== in header of block 1246(1245+1 - first block in new epoch)

                    🙂[Reserve1]: [ASP for prime pool,ASP for reserve pool 0]       <==== in header of block 1004(1003+1 - first block in new epoch)
                    
                    🙂[Reserve2]: [ASP for prime pool,ASP for reserve pool 0,ASP for reserve pool 1]         <==== in header of block 1001(1000+1 - first block in new epoch)

                    🙂[Reserve3]: [ASP for prime pool,ASP for reserve pool 0,ASP for reserve pool 1,ASP for reserve pool 2]      <==== in header of block 2004(2003+1 - first block in new epoch)

                    🙂[Reserve4]: [ASP for prime pool,ASP for reserve pool 0,ASP for reserve pool 1,ASP for reserve pool 2,ASP for reserve pool 3]       <==== in header of block 1567(1566+1 - first block in new epoch)


                It was situation when all the reserve pools are fair players(non malicious). However, some of reserve pools will be byzantine(offline or in ignore mode), so

                we should cope with such a situation. That's why in the first iteration we should go through the pools in reverse order, get only those who have ASP for all the previous pools

                For example, in situation with malicious players:
                    
                    🙂[Reserve0]: [ASP for prime pool]

                    😈[Reserve1]: []    - nothing because AFK(offline/ignore)
                    
                    🙂[Reserve2]: [ASP for prime pool,ASP for reserve pool 0,ASP for reserve pool 1]

                    😈[Reserve3]: [ASP for prime pool,ASP for reserve pool 2]        - no ASP for ReservePool0  and ReservePool1

                    🙂[Reserve4]: [ASP for prime pool,ASP for reserve pool 0,ASP for reserve pool 1,ASP for reserve pool 2,ASP for reserve pool 3]
                

                In this case we'll find that reserve pools 0,2,4 is OK because have ASPs for ALL the previous pools(including prime pool)

            (2) Then, we should check if all of them weren't skipped on their first block in epoch:
                
                    For this, if we've found that pools 0,2,4 are valid, check if:

                        0) Pool 4 doesn't have ASP for ReservePool2 on block 1000. If so, then ReservePool2 is also invalid and should be excluded
                        0) Pool 2 doesn't have ASP for ReservePool0 on block 1245. If so, then ReservePool0 is also invalid and should be excluded
                    
                    After this final filtration, take the first ASP in valid pools and based on this - finish the verification to checkpoint's range.

                    In our case, imagine that Pool2 was skipped on block 1000 and we have a ASP proof in header of block 1567(first block by ReservePool4 in this epoch)

                    That's why, take ASP for primePool from ReservePool0 and ASPs for reserve pools 0,1,2,3 from pool4


            ___________________________________________This is how it works___________________________________________

    */

        let filtratratedReassignment = new Map() // poolID => {skippedPool:ASP,skippedPool0:ASP,...skippedPoolX:ASP}
        
        // Start the iteration over prime pools in REASSIGNMENT_CHAINS

        for(let [primePoolPubKey,reassignmentArray] of Object.entries(oldCheckpoint.reassignmentChains)){

            // Prepare the empty array
            verificationThread.REASSIGNMENT_METADATA[primePoolPubKey] = {}

            // Start the cycle in reverse order
            for(let position = reassignmentArray.length - 1; position >= 0; position--){

                let currentAuthorityPubKey = reassignmentArray[position]

                // In case no progress from the last reserve pool in a row(height on previous checkpoint equal to height on new checkpoint) - do nothing and mark pool as invalid

                if(newCheckpoint.poolsMetadata[currentAuthorityPubKey].index > -1){

                    // Get the first block of this epoch from POOLS_METADATA

                    let firstBlockInThisEpochByPool = await GET_BLOCK(oldCheckpoint.id,currentAuthorityPubKey,0)

                    // In this block we should have ASP for all the previous reservePool + primePool

                    let {isOK,filteredReassignments} = await CHECK_IF_ALL_ASP_PRESENT(primePoolPubKey,firstBlockInThisEpochByPool,reassignmentArray,position,checkpointFullID,oldCheckpoint)

                    if(isOK){

                        filtratratedReassignment.set(currentAuthorityPubKey,filteredReassignments) // filteredReassignments = {skippedPrimePool:{index,hash},skippedReservePool0:{index,hash},...skippedReservePoolX:{index,hash}}


                    }

                }

            }

            // In direct way - use the filtratratedReassignment to build the REASSIGNMENT_METADATA[primePoolID] based on ASP

            for(let reservePool of reassignmentArray){

                if(filtratratedReassignment.has(reservePool)){

                    let metadataForReassignment = filtratratedReassignment.get(reservePool)

                    for(let [skippedPoolPubKey,asp] of Object.entries(metadataForReassignment)){

                        if(!verificationThread.REASSIGNMENT_METADATA[primePoolPubKey][skippedPoolPubKey]) verificationThread.REASSIGNMENT_METADATA[primePoolPubKey][skippedPoolPubKey] = asp

                    }

                }

            }

        }


        /*
        
        
        After execution of this function we have:

        [0] global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.reassignmentChains with structure:
        
        {
            primePoolA:[ReservePool0A,ReservePool1A,....,ReservePoolNA],
            
            primePoolB:[ReservePool0B,ReservePool1B,....,ReservePoolNB]
        
            ...
        }

        Using this chains we'll finish the verification process to get the ranges of checkpoint

        [1] global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA with structure:

        {
            primePoolA:{

                ReservePool0A:{index,hash},
                ReservePool1A:{index,hash},
                ....,
                ReservePoolNA:{index,hash}

            },
            
            primePoolB:{

                ReservePool0B:{index,hash},
                ReservePool1B:{index,hash},
                ....,
                ReservePoolNB:{index,hash}

            }

            ...
        
        }

        ___________________________________ So ___________________________________

        Using the order in REASSIGNMENT_CHAINS finish the verification based on index:hash pairs in REASSIGNMENT_METADATA
        
        
        */
   

},




// Function to find,validate and process logic with new checkpoint
SET_UP_NEW_CHECKPOINT=async(limitsReached,checkpointIsCompleted)=>{


    // When we reach the limits of current checkpoint - then we need to execute the system sync operations

    if(limitsReached && !checkpointIsCompleted){


        let operations = global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.operations


        //_____________________________To change it via operations___________________________

        let workflowOptionsTemplate = {...global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS}
        
        global.SYMBIOTE_META.STATE_CACHE.set('WORKFLOW_OPTIONS',workflowOptionsTemplate)

        //___________________Create array of delayed unstaking transactions__________________

        global.SYMBIOTE_META.STATE_CACHE.set('DELAYED_OPERATIONS',[])

        //_____________________________Create object for slashing____________________________

        // Structure <pool> => <{delayedIds,pool}>
        global.SYMBIOTE_META.STATE_CACHE.set('SLASH_OBJECT',{})

        //But, initially, we should execute the SLASH_UNSTAKE operations because we need to prevent withdraw of stakes by rogue pool(s)/stakers
        for(let operation of operations){
        
            if(operation.type==='SLASH_UNSTAKE') await SYSTEM_SYNC_OPERATIONS_VERIFIERS.SLASH_UNSTAKE(operation.payload) //pass isFromRoute=undefined to make changes to state
        
        }


        //Here we have the filled(or empty) array of pools and delayed IDs to delete it from state
        
        
        //____________________Go through the SPEC_OPERATIONS and perform it__________________

        for(let operation of operations){
    
            if(operation.type==='SLASH_UNSTAKE') continue

            /*
            
            Perform changes here before move to the next checkpoint
            
            OPERATION in checkpoint has the following structure

            {
                type:<TYPE> - type from './systemOperationsVerifiers.js' to perform this operation
                payload:<PAYLOAD> - operation body. More detailed about structure & verification process here => ./systemOperationsVerifiers.js
            }
            

            */

            await SYSTEM_SYNC_OPERATIONS_VERIFIERS[operation.type](operation.payload) //pass isFromRoute=undefined to make changes to state
    
        }


        //_______________________Remove pools if lack of staking power_______________________


        let poolsToBeRemoved = [], poolsArray = Object.keys(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA)


        for(let poolPubKey of poolsArray){

            let poolOrigin = await GET_FROM_STATE(poolPubKey+'(POOL)_POINTER')

            let poolHashID = poolOrigin+':'+poolPubKey+'(POOL)_STORAGE_POOL'

            let poolStorage = await GET_FROM_STATE(poolHashID)

            if(poolStorage.totalPower<global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS.VALIDATOR_STAKE) poolsToBeRemoved.push({poolHashID,poolPubKey})

        }

        //Now in toRemovePools we have IDs of pools which should be deleted from POOLS

        let deletePoolsPromises=[]

        for(let poolHandlerWithPubKeyAndHashID of poolsToBeRemoved){

            deletePoolsPromises.push(DELETE_POOLS_WITH_LACK_OF_STAKING_POWER(poolHandlerWithPubKeyAndHashID))

        }

        await Promise.all(deletePoolsPromises.splice(0))


        //________________________________Remove rogue pools_________________________________

        // These operations must be atomic
        let atomicBatch = global.SYMBIOTE_META.STATE.batch()

        let slashObject = await GET_FROM_STATE('SLASH_OBJECT')
        
        let slashObjectKeys = Object.keys(slashObject)
        


        for(let poolIdentifier of slashObjectKeys){


            //_____________ SlashObject has the structure like this <pool> => <{delayedIds,pool,poolOrigin}> _____________
            
            let poolStorageHashID = slashObject[poolIdentifier].poolOrigin+':'+poolIdentifier+'(POOL)_STORAGE_POOL'

            let poolMetadataHashID = slashObject[poolIdentifier].poolOrigin+':'+poolIdentifier+'(POOL)'

            // Delete the single storage
            atomicBatch.del(poolStorageHashID)

            // Delete metadata
            atomicBatch.del(poolMetadataHashID)

            // Remove from pools tracking
            delete global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[poolIdentifier]

            // Delete from cache
            global.SYMBIOTE_META.STATE_CACHE.delete(poolStorageHashID)

            global.SYMBIOTE_META.STATE_CACHE.delete(poolMetadataHashID)


            let arrayOfDelayed = slashObject[poolIdentifier].delayedIds

            //Take the delayed operations array, move to cache and delete operations where pool === poolIdentifier
            for(let id of arrayOfDelayed){

                let delayedArray = await GET_FROM_STATE('DEL_OPER_'+id)

                // Each object in delayedArray has the following structure {fromPool,to,amount,units}
                let toDeleteArray = []

                for(let i=0;i<delayedArray.length;i++){

                    if(delayedArray[i].fromPool===poolIdentifier) toDeleteArray.push(i)

                }

                // Here <toDeleteArray> contains id's of UNSTAKE operations that should be deleted

                for(let txidIndex of toDeleteArray) delayedArray.splice(txidIndex,1) //remove single tx

            }


        }


        //______________Perform earlier delayed operations & add new operations______________

        let delayedTableOfIds = await GET_FROM_STATE('DELAYED_TABLE_OF_IDS')

        //If it's first checkpoints - add this array
        if(!delayedTableOfIds) delayedTableOfIds=[]

        
        let currentCheckpointIndex = global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id
        
        let idsToDelete = []


        for(let i=0, lengthOfTable = delayedTableOfIds.length ; i < lengthOfTable ; i++){

            //Here we get the arrays of delayed operations from state and perform those, which is old enough compared to WORKFLOW_OPTIONS.UNSTAKING_PERIOD

            if(delayedTableOfIds[i] + global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS.UNSTAKING_PERIOD < currentCheckpointIndex){

                let oldDelayOperations = await GET_FROM_STATE('DEL_OPER_'+delayedTableOfIds[i])

                if(oldDelayOperations){

                    for(let delayedTx of oldDelayOperations){

                        /*

                            Get the accounts and add appropriate amount of KLY / UNO

                            delayedTX has the following structure

                            {
                                fromPool:<id of pool that staker withdraw stake from>,

                                storageOrigin:<origin of where your pool created. Your unstaking will be returned there>,

                                to:<staker pubkey/address>,
                    
                                amount:<number>,
                    
                                units:< KLY | UNO >
                    
                            }
                        
                        */

                        let account = await GET_ACCOUNT_ON_SYMBIOTE(BLAKE3(delayedTx.storageOrigin+delayedTx.to)) // return funds(unstaking) to account that binded to 

                        //Return back staked KLY / UNO to the state of user's account
                        if(delayedTx.units==='kly') account.balance += delayedTx.amount

                        else account.uno += delayedTx.amount
                        

                    }


                    //Remove ID (delayedID) from delayed table of IDs because we already used it
                    idsToDelete.push(i)

                }

            }

        }

        //Remove "spent" ids
        for(let id of idsToDelete) delayedTableOfIds.splice(id,1)



        //Also, add the array of delayed operations from THIS checkpoint if it's not empty
        let currentArrayOfDelayedOperations = await GET_FROM_STATE('DELAYED_OPERATIONS')
        
        if(currentArrayOfDelayedOperations.length !== 0){

            delayedTableOfIds.push(currentCheckpointIndex)

            global.SYMBIOTE_META.STATE_CACHE.set('DEL_OPER_'+currentCheckpointIndex,currentArrayOfDelayedOperations)

        }

        // Set the DELAYED_TABLE_OF_IDS to DB
        global.SYMBIOTE_META.STATE_CACHE.set('DELAYED_TABLE_OF_IDS',delayedTableOfIds)

        //Delete the temporary from cache
        global.SYMBIOTE_META.STATE_CACHE.delete('DELAYED_OPERATIONS')

        global.SYMBIOTE_META.STATE_CACHE.delete('SLASH_OBJECT')


        //_______________________Commit changes after operations here________________________

        //Update the WORKFLOW_OPTIONS
        global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS={...workflowOptionsTemplate}

        global.SYMBIOTE_META.STATE_CACHE.delete('WORKFLOW_OPTIONS')


        // Mark checkpoint as completed not to repeat the operations twice
        global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.completed = true
       
        //Create new quorum based on new POOLS_METADATA state
        global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.quorum = GET_QUORUM(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA,global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS)

        let vtCheckpointFullID = global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.hash+"#"+global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id

        //Get the new rootpub
        global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('VT_ROOTPUB'+vtCheckpointFullID,bls.aggregatePublicKeys(global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.quorum))


        // Create the reassignment chains for each prime pool based on new data
        await SET_REASSIGNMENT_CHAINS(global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT,'VT','')


        // Update the array of prime pools

        let primePools = Object.keys(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA).filter(
                
            pubKey => !global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[pubKey].isReserve
            
        )

        global.SYMBIOTE_META.STATE_CACHE.set('PRIME_POOLS',primePools)


        // Finally - delete the reassignment metadata
        delete global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA


        LOG(`\u001b[38;5;154mSystem sync operations were executed for checkpoint \u001b[38;5;93m${global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id} ### ${global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.hash} (VT)\u001b[0m`,'S')


        //Commit the changes of state using atomic batch
        global.SYMBIOTE_META.STATE_CACHE.forEach(
            
            (value,recordID) => atomicBatch.put(recordID,value)
            
        )


        atomicBatch.put('VT',global.SYMBIOTE_META.VERIFICATION_THREAD)

        await atomicBatch.write()
    
    }


    //________________________________________ FIND NEW CHECKPOINT ________________________________________


    //If checkpoint is not fresh - find "fresh" one on hostchain

    if(!CHECK_IF_CHECKPOINT_STILL_FRESH(global.SYMBIOTE_META.VERIFICATION_THREAD)){


        let nextCheckpoint = await GET_VALID_CHECKPOINT('VERIFICATION_THREAD').catch(_=>false)


        if(nextCheckpoint){

            let oldCheckpoint = JSON.parse(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT))

            let oldCheckpointFullID = oldCheckpoint.hash+"#"+oldCheckpoint.id



            // Set the new checkpoint to know the ranges that we should get
            global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT = nextCheckpoint

            // But quorum is the same as previous
            global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.quorum = oldCheckpoint.quorum

            // And reassignment chains should be the same
            global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.reassignmentChains = oldCheckpoint.reassignmentChains

            //Get the rootpub
            // global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('VT_ROOTPUB',bls.aggregatePublicKeys(global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.quorum))
           

            // To finish with pools metadata to the ranges of previous checkpoint - call this function to know the blocks that you should finish to verify
            
            await BUILD_REASSIGNMENT_METADATA(global.SYMBIOTE_META.VERIFICATION_THREAD,oldCheckpoint,nextCheckpoint,oldCheckpointFullID)
            
            
            // On this step, in global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA we have arrays with reserve pools which also should be verified in context of subchain for a final valid state



            //_______________________Check the version required for the next checkpoint________________________

            if(IS_MY_VERSION_OLD('VERIFICATION_THREAD')){

                LOG(`New version detected on VERIFICATION_THREAD. Please, upgrade your node software`,'W')

                // Stop the node to update the software
                GRACEFUL_STOP()

            }

        } else {

            LOG(`Going to wait for next checkpoint, because current is non-fresh and no new checkpoint found. No sense to spam. Wait ${global.CONFIG.SYMBIOTE.WAIT_IF_CANT_FIND_CHECKPOINT/1000} seconds ...`,'I')

            await WAIT_SOME_TIME()

        }
    
    }

},




START_VERIFICATION_THREAD=async()=>{

    //This option will stop verification for symbiote
    
    if(!global.SYSTEM_SIGNAL_ACCEPTED){

        //_______________________________ Check if we reach checkpoint stats to find out next one and continue work on VT _______________________________

        let currentPoolsMetadataHash = BLAKE3(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA)),

            poolsMetadataHashFromCheckpoint = BLAKE3(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.poolsMetadata))

        

        //If we reach the limits of current checkpoint - find another one. In case there are no more checkpoints - mark current checkpoint as "completed"
        await SET_UP_NEW_CHECKPOINT(currentPoolsMetadataHash === poolsMetadataHashFromCheckpoint,global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.completed)


        //Updated checkpoint on previous step might be old or fresh,so we should update the variable state

        let updatedIsFreshCheckpoint = CHECK_IF_CHECKPOINT_STILL_FRESH(global.SYMBIOTE_META.VERIFICATION_THREAD)


        /*

            ! Glossary - AGGREGATED_FINALIZATION_PROOF on high level is proof that for block Y created by validator PubX with hash H exists at least 2/3N+1 from quorum who has 2/3N+1 commitments for this block

                [+] If our current checkpoint are "too old", no sense to find AGGREGATED_FINALIZATION_PROOF. Just find & process block
        
                [+] If latest checkpoint was created & published on hostchains(primary and other hostchains via HiveMind) we should find AGGREGATED_FINALIZATION_PROOF to proceed the block
        

        */

        let primePoolsPubkeys = global.SYMBIOTE_META.STATE_CACHE.get('PRIME_POOLS')

        if(!primePoolsPubkeys){

            let primePools = Object.keys(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA).filter(
                
                pubKey => !global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[pubKey].isReserve
                
            )

            global.SYMBIOTE_META.STATE_CACHE.set('PRIME_POOLS',primePools)

            primePoolsPubkeys = primePools

        }

        


        let previousSubchainWeChecked = global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.subchain

        let indexOfPreviousSubchain = primePoolsPubkeys.indexOf(previousSubchainWeChecked)

        let currentSubchainToCheck = primePoolsPubkeys[indexOfPreviousSubchain+1] || primePoolsPubkeys[0] // Take the next prime pool in a row. If it's end of pools - start from the first validator in array

        let vtCheckpointFullID = global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.hash+"#"+global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id

        let vtCheckpointIndex = global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id

        
        
        // Get the stats from reassignments

        let tempReassignments = global.SYMBIOTE_META.VERIFICATION_THREAD.TEMP_REASSIGNMENTS[vtCheckpointFullID][currentSubchainToCheck] // {currentAuthority,currentToVerify,reassignments:{poolPubKey:{index,hash}}}


        if(global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA){

            let reassignmentsBasedOnCheckpointData = global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA[currentSubchainToCheck] // {pool:{index,hash}}

            // This means that new checkpoint is already here, so we can ignore the TEMP_REASSIGNMENTS and orientate to these pointers

            let indexOfCurrentPoolToVerify = reassignmentsBasedOnCheckpointData.currentToVerify

            if(typeof indexOfCurrentPoolToVerify !== 'number'){

                reassignmentsBasedOnCheckpointData.currentToVerify = indexOfCurrentPoolToVerify = -1

            }

            // Take the pool by it's position in reassignment chains. If -1 - then it's prime pool, otherwise - get the reserve pool by index

            let poolToVerifyRightNow = indexOfCurrentPoolToVerify === -1 ?  currentSubchainToCheck : global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.reassignmentChains[currentSubchainToCheck][indexOfCurrentPoolToVerify]

            let metadataOfThisPoolLocal = global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[poolToVerifyRightNow] // {index,hash,isReserve}

            let metadataOfThisPoolBasedOnReassignmentsFromCheckpoint = reassignmentsBasedOnCheckpointData[poolToVerifyRightNow] // {index,hash}
            

            //_________________________Now check - if this pool already have the same index & hash as in checkpoint - change the pointer to the next in a row_________________________

            if(metadataOfThisPoolLocal.index < metadataOfThisPoolBasedOnReassignmentsFromCheckpoint.index){

                // Process the block
                
                let block = await GET_BLOCK(vtCheckpointIndex,poolToVerifyRightNow,metadataOfThisPoolLocal.index+1)

                if(block){

                    await verifyBlock(block,currentSubchainToCheck)

                    LOG(`Local VERIFICATION_THREAD state is \x1b[32;1m${global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.currentAuthority} \u001b[38;5;168m}———{\x1b[32;1m ${global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.index} \u001b[38;5;168m}———{\x1b[32;1m ${global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.hash}\n`,'I')

                }else{

                    // If we can't get the block - try to skip this subchain and verify the next subchain in the next iteration

                    global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.subchain = currentSubchainToCheck

                }
                

            }else if(metadataOfThisPoolLocal.index === metadataOfThisPoolBasedOnReassignmentsFromCheckpoint.index){

                global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[poolToVerifyRightNow] = global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.poolsMetadata[poolToVerifyRightNow]

                reassignmentsBasedOnCheckpointData.currentToVerify++

            }


        }else if(updatedIsFreshCheckpoint && tempReassignments){

            let indexOfCurrentPoolToVerify = tempReassignments.currentToVerify

            // Take the pool by it's position in reassignment chains. If -1 - then it's prime pool, otherwise - get the reserve pool by index

            let poolToVerifyRightNow = indexOfCurrentPoolToVerify === -1 ?  currentSubchainToCheck : global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.reassignmentChains[currentSubchainToCheck][indexOfCurrentPoolToVerify]

            let metadataOfThisPoolLocal = global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[poolToVerifyRightNow] // {index,hash,isReserve}

            let metadataOfThisPoolBasedOnTempReassignments = tempReassignments.reassignments[poolToVerifyRightNow] // {index,hash}


            
            if(tempReassignments.currentToVerify === tempReassignments.currentAuthority){


                // Ask the N+1 block

                let block = await GET_BLOCK(vtCheckpointIndex,poolToVerifyRightNow,metadataOfThisPoolLocal.index+1)


                if(block){

                    let blockHash = Block.genHash(block)

                    let blockID = vtCheckpointIndex+':'+poolToVerifyRightNow+':'+(metadataOfThisPoolLocal.index+1)

                    // Get the AFP for this block

                    let {verify,shouldDelete} = await GET_AGGREGATED_FINALIZATION_PROOF(blockID,blockHash).catch(_=>({verify:false}))


                    if(shouldDelete){
        
                        // Probably - hash mismatch 
        
                        await global.SYMBIOTE_META.BLOCKS.del(blockID).catch(_=>{})

        
                    }else if(verify){

                        await verifyBlock(block,currentSubchainToCheck)

                        LOG(`Local VERIFICATION_THREAD state is \x1b[32;1m${global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.currentAuthority} \u001b[38;5;168m}———{\x1b[32;1m ${global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.index} \u001b[38;5;168m}———{\x1b[32;1m ${global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.hash}\n`,'I')

                    }else{

                        // If we can't get the block - try to skip this subchain and verify the next subchain in the next iteration

                        global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.subchain = currentSubchainToCheck

                    }

                }else{

                    // If we can't get the block - try to skip this subchain and verify the next subchain in the next iteration

                    global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.subchain = currentSubchainToCheck

                }

            }else{

                // Just verify block with no AFP
                
                
                // Ask the N+1 block

                let block = await GET_BLOCK(vtCheckpointIndex,poolToVerifyRightNow,metadataOfThisPoolLocal.index+1)

                if(block){

                    await verifyBlock(block,currentSubchainToCheck)

                    LOG(`Local VERIFICATION_THREAD state is \x1b[32;1m${global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.currentAuthority} \u001b[38;5;168m}———{\x1b[32;1m ${global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.index} \u001b[38;5;168m}———{\x1b[32;1m ${global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.hash}\n`,'I')

                } else global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.subchain = currentSubchainToCheck

            }

            // To move to the next one

            if(metadataOfThisPoolBasedOnTempReassignments && metadataOfThisPoolLocal.index === metadataOfThisPoolBasedOnTempReassignments.index) tempReassignments.currentToVerify++
            
        }


        if(global.CONFIG.SYMBIOTE.STOP_WORK_ON_VERIFICATION_THREAD) return//step over initiation of another timeout and this way-stop the Verification Thread

        //If next block is available-instantly start perform.Otherwise-wait few seconds and repeat request

        setImmediate(START_VERIFICATION_THREAD)

    
    }

},




GET_EMPTY_ACCOUNT_TEMPLATE_BINDED_TO_SUBCHAIN=async(subchainContext,publicKey)=>{

    let emptyTemplate = {
        
        type:"account",
        balance:0,
        uno:0,
        nonce:0,
        rev_t:0
    
    }

    // Add to cache to write to permanent db after block verification

    global.SYMBIOTE_META.STATE_CACHE.set(subchainContext+':'+publicKey,emptyTemplate)

    return emptyTemplate

},




SHARE_FEES_AMONG_STAKERS_OF_BLOCK_CREATOR=async(subchainContext,feeToPay,blockCreator)=>{

    let blockCreatorOrigin = await GET_FROM_STATE(blockCreator+'(POOL)_POINTER')

    let mainStorageOfBlockCreator = await GET_FROM_STATE(blockCreatorOrigin+':'+blockCreator+'(POOL)_STORAGE_POOL')

    // Transfer part of fees to account with pubkey associated with block creator
    if(mainStorageOfBlockCreator.percentage!==0){

        // Get the pool percentage and send to appropriate BLS address in the <subchainContext>
        let poolBindedAccount = await GET_ACCOUNT_ON_SYMBIOTE(subchainContext+':'+blockCreator)|| await GET_EMPTY_ACCOUNT_TEMPLATE_BINDED_TO_SUBCHAIN(subchainContext,blockCreator)

        poolBindedAccount.balance += mainStorageOfBlockCreator.percentage*feeToPay
        
    }

    let restOfFees = feeToPay - mainStorageOfBlockCreator.percentage*feeToPay


    // Share the rest of fees among stakers due to their % part in total pool stake
    
    for(let [stakerPubKey,stakerMetadata] of Object.entries(mainStorageOfBlockCreator.stakers)){

        // Iteration over the stakerPubKey = <any of supported pubkeys>     |       stakerMetadata = {kly,uno}

        let stakerTotalPower = stakerMetadata.uno + stakerMetadata.kly

        let totalStakerPowerPercent = stakerTotalPower/mainStorageOfBlockCreator.totalPower

        let stakerAccountBindedToCurrentSubchainContext = await GET_ACCOUNT_ON_SYMBIOTE(subchainContext+':'+stakerPubKey) || await GET_EMPTY_ACCOUNT_TEMPLATE_BINDED_TO_SUBCHAIN(subchainContext,stakerPubKey)

        stakerAccountBindedToCurrentSubchainContext.balance += totalStakerPowerPercent*restOfFees

    }

},




SEND_FEES_TO_ACCOUNTS_ON_THE_SAME_SUBCHAIN_CONTEXT = async(subchainID,feeRecepientPoolPubKey,feeReward) => {

    // We should get the object {reward:X}. This metric shows "How much does pool <feeRecepientPool> get as a reward from txs on subchain <subchainID>"
    // In order to protocol, not all the fees go to the subchain authority - part of them are sent to the rest of subchains authorities(to pools) and smart contract automatically distribute reward among stakers of this pool

    let accountsForFeesId = subchainID+':'+feeRecepientPoolPubKey

    let feesAccountForGivenPoolOnThisSubchain = await GET_ACCOUNT_ON_SYMBIOTE(accountsForFeesId) || await GET_EMPTY_ACCOUNT_TEMPLATE_BINDED_TO_SUBCHAIN(accountsForFeesId)

    feesAccountForGivenPoolOnThisSubchain.balance += feeReward

},




//Function to distribute stakes among blockCreator/staking pools
DISTRIBUTE_FEES_AMONG_STAKERS_AND_OTHER_POOLS=async(totalFees,subchainContext,activePoolsSet,blockCreator)=>{

    /*

        _____________________Here we perform the following logic_____________________

        [*] totalFees - number of total fees received in this block



        1) Take all the ACTIVE pools from global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA

        2) Send REWARD_PERCENTAGE_FOR_BLOCK_CREATOR * totalFees to block creator

        3) Distribute the rest among all the other pools(excluding block creator)

            For this, we should:

            3.1) Take the pool storage from state by id = validatorPubKey+'(POOL)_STORAGE_POOL'

            3.2) Run the cycle over the POOL.STAKERS(structure is STAKER_PUBKEY => {kly,uno}) and increase reward by FEES_FOR_THIS_VALIDATOR * ( STAKER_POWER_IN_UNO / TOTAL_POOL_POWER )

    
    */

    let payToCreatorAndHisPool = totalFees * global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS.REWARD_PERCENTAGE_FOR_BLOCK_CREATOR, //the bigger part is usually for block creator

        payToEachPool = Math.floor((totalFees - payToCreatorAndHisPool)/(activePoolsSet.size-1)), //and share the rest among other pools
    
        shareFeesPromises = []

          
    if(activePoolsSet.size===1) payToEachPool = totalFees - payToCreatorAndHisPool


    //___________________________________________ BLOCK_CREATOR ___________________________________________

    shareFeesPromises.push(SHARE_FEES_AMONG_STAKERS_OF_BLOCK_CREATOR(subchainContext,payToCreatorAndHisPool,blockCreator))

    //_____________________________________________ THE REST ______________________________________________

    activePoolsSet.forEach(feesRecepientPoolPubKey=>

        feesRecepientPoolPubKey !== subchainContext && shareFeesPromises.push(SEND_FEES_TO_ACCOUNTS_ON_THE_SAME_SUBCHAIN_CONTEXT(subchainContext,feesRecepientPoolPubKey,payToEachPool))
            
    )
     
    await Promise.all(shareFeesPromises.splice(0))

},




verifyBlock=async(block,subchainContext)=>{


    let blockHash = Block.genHash(block),

        overviewOk=
    
            block.transactions?.length<=global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS.TXS_LIMIT_PER_BLOCK
            &&
            global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[block.creator].hash === block.prevHash // it should be a chain
            //&&
            // await BLS_VERIFY(blockHash,block.sig,block.creator)


    // if(block.i === global.CONFIG.SYMBIOTE.SYMBIOTE_CHECKPOINT.HEIGHT && blockHash !== global.CONFIG.SYMBIOTE.SYMBIOTE_CHECKPOINT.HEIGHT){

    //     LOG(`SYMBIOTE_CHECKPOINT verification failed. Delete the CHAINDATA/BLOCKS,CHAINDATA/METADATA,CHAINDATA/STATE and SNAPSHOTS. Resync node with the right blockchain or load the true snapshot`,'F')

    //     LOG('Going to stop...','W')

    //     process.emit('SIGINT')

    // }


    if(overviewOk){

        // To calculate fees and split among pools.Currently - general fees sum is 0. It will be increased each performed transaction
        
        let rewardBox = {fees:0}

        let currentCheckpointIndex = global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id

        let currentBlockID = currentCheckpointIndex+':'+block.creator+':'+block.index


        global.SYMBIOTE_META.STATE_CACHE.set('EVM_LOGS_MAP',{}) // (contractAddress => array of logs) to store logs created by KLY-EVM


        //_________________________________________PREPARE THE KLY-EVM STATE____________________________________________

        
        let currentKlyEvmContextMetadata = global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_METADATA[subchainContext] // {nextBlockIndex,parentHash,timestamp}

        // Set the next block's parameters
        KLY_EVM.setCurrentBlockParams(currentKlyEvmContextMetadata.nextBlockIndex,currentKlyEvmContextMetadata.timestamp,currentKlyEvmContextMetadata.parentHash)

        // To change the state atomically
        let atomicBatch = global.SYMBIOTE_META.STATE.batch()


        if(block.transactions.length !== 0){


            //_________________________________________GET ACCOUNTS FROM STORAGE____________________________________________
        
        
            let accountsToAddToCache=[]
    
            // Push accounts for fees of subchains authorities

            let activePools = new Set()

            for(let [validatorPubKey,metadata] of Object.entries(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA)){

                if(!metadata.isReserve) activePools.add(validatorPubKey) 

            }

            activePools.forEach(
            
                pubKey => {
    
                    // Avoid own pubkey to be added. On own chains we send rewards directly
                    if(pubKey !== block.creator) accountsToAddToCache.push(GET_FROM_STATE(subchainContext+':'+pubKey))
    
                }
                
            )
    
            // Now cache has all accounts and ready for the next cycles
            await Promise.all(accountsToAddToCache.splice(0))


            //___________________________________________START TO PERFORM TXS____________________________________________


            let txIndexInBlock = 0

            for(let transaction of block.transactions){

                if(global.SYMBIOTE_META.VERIFIERS[transaction.type]){

                    let txCopy = JSON.parse(JSON.stringify(transaction))

                    let {isOk,reason} = await global.SYMBIOTE_META.VERIFIERS[transaction.type](subchainContext,txCopy,rewardBox,atomicBatch).catch(_=>{})

                    // Set the receipt of tx(in case it's not EVM tx, because EVM automatically create receipt and we store it using KLY-EVM)
                    if(reason!=='EVM'){

                        let txid = BLAKE3(txCopy.sig) // txID is a BLAKE3 hash of event you sent to blockchain. You can recount it locally(will be used by wallets, SDKs, libs and so on)

                        atomicBatch.put('TX:'+txid,{blockID:currentBlockID,id:txIndexInBlock,isOk,reason})
    
                    }

                    txIndexInBlock++
                
                }

            }
        

            //__________________________________________SHARE FEES AMONG POOLS_________________________________________
        
            await DISTRIBUTE_FEES_AMONG_STAKERS_AND_OTHER_POOLS(rewardBox.fees,subchainContext,activePools,block.creator)

            
            //________________________________________________COMMIT STATE__________________________________________________    


            global.SYMBIOTE_META.STATE_CACHE.forEach((account,addr)=>

                atomicBatch.put(addr,account)

            )

        }

        
        // Probably you would like to store only state or you just run another node via cloud module and want to store some range of blocks remotely
        if(global.CONFIG.SYMBIOTE.STORE_BLOCKS_IN_LOCAL_DATABASE){
            
            // No matter if we already have this block-resave it

            global.SYMBIOTE_META.BLOCKS.put(currentBlockID,block).catch(
                
                error => LOG(`Failed to store block ${block.index}\nError:${error}`,'W')
                
            )

        }else if(block.creator !== global.CONFIG.SYMBIOTE.PUB){

            // ...but if we shouldn't store and have it locally(received probably by range loading)-then delete
            global.SYMBIOTE_META.BLOCKS.del(currentBlockID).catch(
                
                error => LOG(`Failed to delete block ${currentBlockID}\nError:${error}`,'W')
                
            )

        }


        
        if(global.SYMBIOTE_META.STATE_CACHE.size>=global.CONFIG.SYMBIOTE.BLOCK_TO_BLOCK_CACHE_SIZE) global.SYMBIOTE_META.STATE_CACHE.clear() // flush cache.NOTE-some kind of advanced upgrade soon


        /*
        
            Store the current subchain block index (SID)
        
            NOTE: Since the subchainID is pubkey of prime pool, but not only prime pool can generate blocks(reserve pools generate blocks in case prime pool is AFK)

            So, we need to mark each next block in subchain with SID

            For example

            _______________[Subchain 7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta]________________

            Block 0     ===> 7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta:0   (SID:0)
            Block 1     ===> 61TXxKDrBtb7bjpBym8zS9xRDoUQU6sW9aLvvqN9Bp9LVFiSxhRPd9Dwy3N3621RQ8:0   (SID:1)
            Block 2     ===> 75XPnpDxrAtyjcwXaATfDhkYTGBoHuonDU1tfqFc6JcNPf5sgtcsvBRXaXZGuJ8USG:0   (SID:2)
            Block 3     ===> 7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta:1   (SID:3)
        
            ... and so on

            To clearly understand that 'block N on subchain X is ...<this>' we need SID
        
        */


        let currentSID = global.SYMBIOTE_META.VERIFICATION_THREAD.SID_TRACKER[subchainContext]

        atomicBatch.put(`SID:${subchainContext}:${currentSID}`,currentBlockID)

        global.SYMBIOTE_META.VERIFICATION_THREAD.SID_TRACKER[subchainContext]++


        let oldGRID = global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.grid

        // Change finalization pointer
        
        global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.subchain = subchainContext

        global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.currentAuthority = block.creator

        global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.index = block.index
                
        global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.hash = blockHash

        global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER.grid++

        atomicBatch.put(`GRID:${oldGRID}`,currentBlockID)
        
        // Change metadata per validator's thread
        
        global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[block.creator].index = block.index

        global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[block.creator].hash = blockHash


        //___________________ Update the KLY-EVM ___________________

        // Update stateRoot
        global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_STATE_ROOT = await KLY_EVM.getStateRoot()

        // Increase block index
        let nextIndex = BigInt(currentKlyEvmContextMetadata.nextBlockIndex)+BigInt(1)

        currentKlyEvmContextMetadata.nextBlockIndex = Web3.utils.toHex(nextIndex.toString())

        // Store previous hash
        let currentHash = KLY_EVM.getCurrentBlock().hash()
    
        currentKlyEvmContextMetadata.parentHash = currentHash.toString('hex')
        

        // Imagine that it's 1 block per 2 seconds
        let nextTimestamp = currentKlyEvmContextMetadata.timestamp+2
    
        currentKlyEvmContextMetadata.timestamp = nextTimestamp
        

        // Finally, store the block
        let blockToStore = KLY_EVM.getBlockToStore(currentHash)
        
        atomicBatch.put(`${subchainContext}:EVM_BLOCK:${blockToStore.number}`,blockToStore)

        atomicBatch.put(`${subchainContext}:EVM_INDEX:${blockToStore.hash}`,blockToStore.number)

        atomicBatch.put(`${subchainContext}:EVM_LOGS:${blockToStore.number}`,global.SYMBIOTE_META.STATE_CACHE.get('EVM_LOGS_MAP'))

        atomicBatch.put(`${subchainContext}:EVM_BLOCK_RECEIPT:${blockToStore.number}`,{kly_block:currentBlockID})
        
        atomicBatch.put(`BLOCK_RECEIPT:${currentBlockID}`,{

            sid:currentSID

        })

        
        //_________________________________Commit the state of VERIFICATION_THREAD_________________________________


        atomicBatch.put('VT',global.SYMBIOTE_META.VERIFICATION_THREAD)

        await atomicBatch.write()
        

    }

}