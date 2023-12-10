import {
    
    GET_VERIFIED_AGGREGATED_FINALIZATION_PROOF_BY_BLOCK_ID,START_VERIFICATION_THREAD, CHECK_ALRP_CHAIN_VALIDITY,GET_BLOCK, VERIFY_AGGREGATED_FINALIZATION_PROOF

} from './verification.js'

import {
    
    GET_QUORUM_URLS_AND_PUBKEYS,GET_MAJORITY,EPOCH_STILL_FRESH,USE_TEMPORARY_DB,

    GET_QUORUM,GET_FROM_QUORUM_THREAD_STATE,IS_MY_VERSION_OLD,GET_HTTP_AGENT,

    DECRYPT_KEYS,HEAP_SORT,GET_ALL_KNOWN_PEERS,BLOCKLOG, GET_RANDOM_FROM_ARRAY

} from './utils.js'

import {LOG,PATH_RESOLVE,BLAKE3,GET_GMT_TIMESTAMP,ED25519_SIGN_DATA,ED25519_VERIFY} from '../../KLY_Utils/utils.js'

import EPOCH_EDGE_OPERATIONS_VERIFIERS from './epochEdgeOperationsVerifiers.js'

import {KLY_EVM} from '../../KLY_VirtualMachines/kly_evm/vm.js'

import Block from './essences/block.js'

import UWS from 'uWebSockets.js'

import fetch from 'node-fetch'

import WS from 'websocket'

import level from 'level'

import Web3 from 'web3'

import ora from 'ora'

import fs from 'fs'




//______________________________________________________________VARIABLES POOL___________________________________________________________________


//++++++++++++++++++++++++ Define general global object  ++++++++++++++++++++++++

global.SYSTEM_SIGNAL_ACCEPTED=false

//Your decrypted private key
global.PRIVATE_KEY=null




//*********************** SET HANDLERS ON USEFUL SIGNALS ************************



export let GRACEFUL_STOP=()=>{
    
    global.SYSTEM_SIGNAL_ACCEPTED=true

    console.log('\n')

    LOG('\x1b[31;1mKLYNTAR\x1b[36;1m stop has been initiated.Keep waiting...','I')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/termination.txt')).toString(),'W')

    console.log('\n')

    LOG('Closing server connections...','I')

    global.UWS_DESC && UWS.us_listen_socket_close(global.UWS_DESC)

    LOG('Node was gracefully stopped','I')
        
    process.exit(0)

}




//Define listeners on typical signals to safely stop the node
process.on('SIGTERM',GRACEFUL_STOP)
process.on('SIGINT',GRACEFUL_STOP)
process.on('SIGHUP',GRACEFUL_STOP)


//************************ END SUB ************************




export let SET_LEADERS_SEQUENCE_FOR_SHARDS = async (epochHandler,epochSeed) => {


    epochHandler.leadersSequence = {}


    let reservePoolsRelatedToShard = new Map() // shardID => [] - array of reserve pools

    let primePoolsPubKeys = new Set(epochHandler.poolsRegistry.primePools)


    for(let reservePoolPubKey of epochHandler.poolsRegistry.reservePools){

        // Otherwise - it's reserve pool
        
        let poolStorage = await GET_FROM_QUORUM_THREAD_STATE(reservePoolPubKey+`(POOL)_STORAGE_POOL`)
    
        if(poolStorage){

            let {reserveFor} = poolStorage

            if(!reservePoolsRelatedToShard.has(reserveFor)) reservePoolsRelatedToShard.set(reserveFor,[])

            reservePoolsRelatedToShard.get(reserveFor).push(reservePoolPubKey)
                    
        }

    }


    /*
    
        After this cycle we have:

        [0] primePoolsIDs - Set(primePool0,primePool1,...)
        [1] reservePoolsRelatedToShardAndStillNotUsed - Map(primePoolPubKey=>[reservePool1,reservePool2,...reservePoolN])

    
    */

    let hashOfMetadataFromOldEpoch = BLAKE3(JSON.stringify(epochHandler.poolsRegistry)+epochSeed)

    
    //___________________________________________________ Now, build the leaders sequence ___________________________________________________
    
    for(let primePoolID of primePoolsPubKeys){


        let arrayOfReservePoolsRelatedToThisShard = reservePoolsRelatedToShard.get(primePoolID) || []

        let mapping = new Map()

        let arrayOfChallanges = arrayOfReservePoolsRelatedToThisShard.map(validatorPubKey=>{

            let challenge = parseInt(BLAKE3(validatorPubKey+hashOfMetadataFromOldEpoch),16)

            mapping.set(challenge,validatorPubKey)

            return challenge

        })


        let sortedChallenges = HEAP_SORT(arrayOfChallanges)

        let leadersSequence = []

        for(let challenge of sortedChallenges) leadersSequence.push(mapping.get(challenge))

        
        epochHandler.leadersSequence[primePoolID] = leadersSequence
        
    }
    
}




//________________________________________________________________INTERNAL_______________________________________________________________________




let 


//TODO:Add more advanced logic(e.g. number of txs,ratings,etc.)

GET_TRANSACTIONS = () => global.SYMBIOTE_META.MEMPOOL.splice(0,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.TXS_LIMIT_PER_BLOCK),




GET_EPOCH_EDGE_OPERATIONS = epochFullID => {

    if(!global.SYMBIOTE_META.TEMP.has(epochFullID)) return []

    let epochEdgeOperationsMempool = global.SYMBIOTE_META.TEMP.get(epochFullID).EPOCH_EDGE_OPERATIONS_MEMPOOL

    return epochEdgeOperationsMempool.splice(0,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.EPOCH_EDGE_OPERATIONS_LIMIT_PER_BLOCK)

},




BLOCKS_GENERATION=async()=>{

    await GENERATE_BLOCKS_PORTION()

    setTimeout(BLOCKS_GENERATION,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.BLOCK_TIME)
 
},




DELETE_POOLS_WITH_LACK_OF_STAKING_POWER = async (validatorPubKey,fullCopyOfQuorumThread) => {

    //Try to get storage "POOL" of appropriate pool

    let poolStorage = await GET_FROM_QUORUM_THREAD_STATE(validatorPubKey+'(POOL)_STORAGE_POOL')


    poolStorage.lackOfTotalPower = true

    poolStorage.stopEpochID = fullCopyOfQuorumThread.EPOCH.id

    
    //Remove from POOLS array(to prevent be elected to quorum) and metadata

    let arrayToDeleteFrom = fullCopyOfQuorumThread.EPOCH.poolsRegistry[ poolStorage.isReserve ? 'reservePools' : 'primePools' ]

    let indexToDelete = arrayToDeleteFrom.indexOf(validatorPubKey)

    arrayToDeleteFrom.splice(indexToDelete,1)


},




EXECUTE_EPOCH_EDGE_OPERATIONS = async (atomicBatch,fullCopyOfQuorumThread,epochEdgeOperations) => {

    
    //_______________________________Perform SPEC_OPERATIONS_____________________________

    let workflowOptionsTemplate = {...fullCopyOfQuorumThread.WORKFLOW_OPTIONS}
    
    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set('WORKFLOW_OPTIONS',workflowOptionsTemplate)
    
    // Structure is <poolID> => true if pool should be deleted
    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set('SLASH_OBJECT',{})
    

    // But, initially, we should execute the SLASH_UNSTAKE operations because we need to prevent withdraw of stakes by rogue pool(s)/stakers
    for(let operation of epochEdgeOperations){
     
        if(operation.type==='SLASH_UNSTAKE') await EPOCH_EDGE_OPERATIONS_VERIFIERS.SLASH_UNSTAKE(operation.payload,false,true)
    
    }

    // Here we have the filled(or empty) array of pools and delayed IDs to delete it from state

    for(let operation of epochEdgeOperations){
        
        if(operation.type==='SLASH_UNSTAKE') continue
          /*
            
            Perform changes here before move to the next epoch
            
            OPERATION in epoch has the following structure
            {
                type:<TYPE> - type from './epochEdgeOperationsVerifiers.js' to perform this operation
                payload:<PAYLOAD> - operation body. More detailed about structure & verification process here => ./epochEdgeOperationsVerifiers.js
            }
            
        */
        await EPOCH_EDGE_OPERATIONS_VERIFIERS[operation.type](operation.payload,false,true,fullCopyOfQuorumThread)
    
    }

    //_______________________Remove pools if lack of staking power_______________________

    let epochHandlerReference = fullCopyOfQuorumThread.EPOCH

    let toRemovePools = [], promises = [], allThePools = epochHandlerReference.poolsRegistry.primePools.concat(epochHandlerReference.poolsRegistry.reservePools)


    for(let poolPubKey of allThePools){

        let promise = GET_FROM_QUORUM_THREAD_STATE(poolPubKey+'(POOL)_STORAGE_POOL').then(poolStorage=>{

            if(poolStorage.totalPower < fullCopyOfQuorumThread.WORKFLOW_OPTIONS.VALIDATOR_STAKE) toRemovePools.push(poolPubKey)

        })

        promises.push(promise)

    }

    await Promise.all(promises.splice(0))
    
    //Now in toRemovePools we have IDs of pools which should be deleted from POOLS
    
    let deletePoolsPromises=[]
    
    for(let address of toRemovePools){
    
        deletePoolsPromises.push(DELETE_POOLS_WITH_LACK_OF_STAKING_POWER(address,fullCopyOfQuorumThread))
    
    }


    await Promise.all(deletePoolsPromises.splice(0))


    //________________________________Remove rogue pools_________________________________

    
    let slashObject = await GET_FROM_QUORUM_THREAD_STATE('SLASH_OBJECT')
    
    let slashObjectKeys = Object.keys(slashObject)
        

    for(let poolIdentifier of slashObjectKeys){
    
        //___________slashObject has the structure like this <pool> => true___________
    
        // Delete from DB
        atomicBatch.del(poolIdentifier+'(POOL)_STORAGE_POOL')

        // Remove from pools
        let arrayToDeleteFrom = fullCopyOfQuorumThread.EPOCH.poolsRegistry.reservePools[ slashObject[poolIdentifier].isReserve ? 'reservePools' : 'primePools' ]

        let indexToDelete = arrayToDeleteFrom.indexOf(poolIdentifier)
        
        arrayToDeleteFrom.splice(indexToDelete,1)
    
        // Remove from cache
        global.SYMBIOTE_META.QUORUM_THREAD_CACHE.delete(poolIdentifier+'(POOL)_STORAGE_POOL')

    }


    // Update the WORKFLOW_OPTIONS
    fullCopyOfQuorumThread.WORKFLOW_OPTIONS={...workflowOptionsTemplate}

    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.delete('WORKFLOW_OPTIONS')

    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.delete('SLASH_OBJECT')


    //After all ops - commit state and make changes to workflow

    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.forEach((value,recordID)=>{

        atomicBatch.put(recordID,value)

    })


},




//Use it to find checkpoints on hostchains, perform them and join to QUORUM by finding the latest valid checkpoint
FIND_AGGREGATED_EPOCH_FINALIZATION_PROOFS=async()=>{


    //_________________________FIND THE NEXT CHECKPOINT AND EXECUTE EPOCH EDGE OPERATIONS INSTANTLY_____________________________

    /*
    

        1. Check if new epoch must be started(new day by default)

        2. Try to find AEFPs(Aggregated Epoch Finalization Proofs) for each of shards by calling GET /aggregated_epoch_finalization_proof/:EPOCH_INDEX/:SHARD_ID

            Reminder - the structure of AEFP must be:

                {

                    shard,

                    lastLeader,
                    
                    lastIndex,
                    
                    lastHash,

                    hashOfFirstBlockByLastLeader,

                    proofs:{

                        ed25519PubKey0:ed25519Signa0,
                        ...
                        ed25519PubKeyN:ed25519SignaN
                         
                    }
                
                }

                Data that must be signed by 2/3N+1 => 'EPOCH_DONE'+shard+lastLeader+lastIndex+lastHash+hashOfFirstBlockByLastLeader+checkpointFullID

        3. Once we find the AEFPs for ALL the shards - it's a signal to start to find the first X blocks in current epoch for each shard

            We'll use 1 option for this:

                [*] global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.MAX_NUM_OF_BLOCKS_PER_SHARD_FOR_SYNC_OPS - 1 by default. Don't change it
                
                    This value shows how many first blocks we need to get to extract epoch edge operations to execute before move to next epoch
                    
                    Epoch edge operations used mostly for staking/unstaking operations, to change network params(e.g. epoch time, minimal stake,etc.)
 
            
        4. Now try to find our own assumption about the first block in epoch locally

            For this, iterate over reassignment chains:
            
            
            for(shardID of shards){

                ------Find first block for prime pool here------

                Otherwise - try to find first block created by other pools on this shard

                for(pool of leadersSequence[shardID])

            }
                        
            and try to find AFP_FOR_FIRST_BLOCK => await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:epochID:PubKey:0').catch(()=>false)

            If we can't get it - make call to GET /aggregated_finalization_proof/:BLOCK_ID to quorum members

            In case we have AFP for the first block(with index 0) - it's a clear proof that block 0 is 100% accepted by network and we can get the hash of first block from here:

                AFP_FOR_FIRST_BLOCK.blockHash
 

        6. Once we find all of them - extract EPOCH_EDGE_OPERATIONS from block headers and run it in a sync mode

        7. Increment value of checkpoint index(checkpoint.id) and recount new hash(checkpoint.hash)
    
        8. Prepare new object in TEMP(checkpointFullID) and set new version of checkpoint on QT
    
    
    */

    if(!EPOCH_STILL_FRESH(global.SYMBIOTE_META.QUORUM_THREAD)){

        let qtEpochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

        let oldEpochFullID = qtEpochHandler.hash+"#"+qtEpochHandler.id
    
        let temporaryObject = global.SYMBIOTE_META.TEMP.get(oldEpochFullID)
    
        if(!temporaryObject){
    
            setTimeout(FIND_AGGREGATED_EPOCH_FINALIZATION_PROOFS,3000)
    
            return
    
        }


        // let numberOfFirstBlocksToFetchFromEachShard = global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.MAX_NUM_OF_BLOCKS_PER_SHARD_FOR_SYNC_OPS // 1. DO NOT CHANGE

        let totalNumberOfShards = 0

        let totalNumberOfReadyShards = 0

        let leadersSequence = qtEpochHandler.leadersSequence

        let majority = GET_MAJORITY(qtEpochHandler)

        let allKnownPeers = [...await GET_QUORUM_URLS_AND_PUBKEYS(),...GET_ALL_KNOWN_PEERS()]

        // Get the special object from DB not to repeat requests

        let epochCache = await global.SYMBIOTE_META.EPOCH_DATA.get(`EPOCH_CACHE:${oldEpochFullID}`).catch(()=>false) || {} // {shardID:{firstBlockCreator,firstBlockHash,aefp,firstBlockOnShardFound}}

        epochCache = {}

        let entries = Object.entries(leadersSequence)

        //____________________Ask the quorum for AEFP for shard___________________
        
        for(let [primePoolPubKey,arrayOfReservePools] of entries){
        
            totalNumberOfShards++
        
            if(!epochCache[primePoolPubKey]) epochCache[primePoolPubKey] = {firstBlockOnShardFound:false}

            if(epochCache[primePoolPubKey].aefp && epochCache[primePoolPubKey].firstBlockOnShardFound){

                totalNumberOfReadyShards++

                // No more sense to find AEFPs or first block for this shard. Just continue

                continue

            }

            /*
        
                ███████╗██╗███╗   ██╗██████╗      █████╗ ███████╗███████╗██████╗ ███████╗
                ██╔════╝██║████╗  ██║██╔══██╗    ██╔══██╗██╔════╝██╔════╝██╔══██╗██╔════╝
                █████╗  ██║██╔██╗ ██║██║  ██║    ███████║█████╗  █████╗  ██████╔╝███████╗
                ██╔══╝  ██║██║╚██╗██║██║  ██║    ██╔══██║██╔══╝  ██╔══╝  ██╔═══╝ ╚════██║
                ██║     ██║██║ ╚████║██████╔╝    ██║  ██║███████╗██║     ██║     ███████║
                ╚═╝     ╚═╝╚═╝  ╚═══╝╚═════╝     ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝     ╚══════╝

                
                Reminder: AEFP structure is

                    {
                        shard:<ed25519 pubkey of prime pool - ID of shard>,
                        lastLeader:<index of ed25519 pubkey of some pool in shard's reassignment chain>,
                        lastIndex:<index of his block in previous epoch>,
                        lastHash:<hash of this block>,
                        hashOfFirstBlockByLastLeader,
                        
                        proofs:{

                            ed25519PubKey0:ed25519Signa0,
                            ...
                            ed25519PubKeyN:ed25519SignaN
                         
                        }
    
                    }

            */

            
            if(!epochCache[primePoolPubKey].aefp){

                // Try to find locally

                let aefp = await global.SYMBIOTE_META.EPOCH_DATA.get(`AEFP:${qtEpochHandler.id}:${primePoolPubKey}`).catch(()=>false)

                if(aefp){

                    epochCache[primePoolPubKey].aefp = aefp


                }else{

                    // Ask quorum for AEFP
                    for(let peerURL of allKnownPeers){
            
                        let itsProbablyAggregatedEpochFinalizationProof = await fetch(peerURL+`/aggregated_epoch_finalization_proof/${qtEpochHandler.id}/${primePoolPubKey}`,{agent:GET_HTTP_AGENT(peerURL)}).then(r=>r.json()).catch(()=>false)
                
                        if(itsProbablyAggregatedEpochFinalizationProof){
                
                            let aefpPureObject = await VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF(itsProbablyAggregatedEpochFinalizationProof,qtEpochHandler.quorum,majority,oldEpochFullID)
    
                            if(aefpPureObject && aefpPureObject.shard === primePoolPubKey){
    
                                epochCache[primePoolPubKey].aefp = aefpPureObject

                                // Store locally

                                await global.SYMBIOTE_META.EPOCH_DATA.put(`AEFP:${qtEpochHandler.id}:${primePoolPubKey}`,aefpPureObject).catch(()=>{})
    
                            }
                                        
                        }
                
                    }    

                }

            }
            


            /*
        
                ███████╗██╗███╗   ██╗██████╗     ███████╗██╗██████╗ ███████╗████████╗    ██████╗ ██╗      ██████╗  ██████╗██╗  ██╗███████╗
                ██╔════╝██║████╗  ██║██╔══██╗    ██╔════╝██║██╔══██╗██╔════╝╚══██╔══╝    ██╔══██╗██║     ██╔═══██╗██╔════╝██║ ██╔╝██╔════╝
                █████╗  ██║██╔██╗ ██║██║  ██║    █████╗  ██║██████╔╝███████╗   ██║       ██████╔╝██║     ██║   ██║██║     █████╔╝ ███████╗
                ██╔══╝  ██║██║╚██╗██║██║  ██║    ██╔══╝  ██║██╔══██╗╚════██║   ██║       ██╔══██╗██║     ██║   ██║██║     ██╔═██╗ ╚════██║
                ██║     ██║██║ ╚████║██████╔╝    ██║     ██║██║  ██║███████║   ██║       ██████╔╝███████╗╚██████╔╝╚██████╗██║  ██╗███████║
                ╚═╝     ╚═╝╚═╝  ╚═══╝╚═════╝     ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝       ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝
    
            */

            if(!epochCache[primePoolPubKey].firstBlockOnShardFound){

                // First of all - try to find AFP for first block created in this epoch by the first pool in any reassignment chain => epochID:PrimePoolPubKey:0

                let firstBlockID = qtEpochHandler.id+':'+primePoolPubKey+':0'

                let afpForFirstBlockOfPrimePool = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+firstBlockID).catch(()=>null)

                if(afpForFirstBlockOfPrimePool){

                    epochCache[primePoolPubKey].firstBlockCreator = primePoolPubKey

                    epochCache[primePoolPubKey].firstBlockHash = afpForFirstBlockOfPrimePool.blockHash

                    epochCache[primePoolPubKey].firstBlockOnShardFound = true // if we get the block 0 by prime pool - it's 100% the first block

                }else{

                    // Ask quorum for AFP for first block of prime pool

                    // Descriptor is {url,pubKey}

                    for(let peerURL of allKnownPeers){
            
                        let itsProbablyAggregatedFinalizationProof = await fetch(peerURL+'/aggregated_finalization_proof/'+firstBlockID,{agent:GET_HTTP_AGENT(peerURL)}).then(r=>r.json()).catch(()=>null)
            
                        if(itsProbablyAggregatedFinalizationProof){
            
                            let isOK = await VERIFY_AGGREGATED_FINALIZATION_PROOF(itsProbablyAggregatedFinalizationProof,qtEpochHandler)
            
                            if(isOK && itsProbablyAggregatedFinalizationProof.blockID === firstBlockID){                            
                            
                                epochCache[primePoolPubKey].firstBlockCreator = primePoolPubKey

                                epochCache[primePoolPubKey].firstBlockHash = itsProbablyAggregatedFinalizationProof.blockHash

                                epochCache[primePoolPubKey].firstBlockOnShardFound = true

                                break // no more sense to find

                            }
            
                        }
            
                    }
            
                }

        
                //_____________________________________ Find AFPs for first blocks of reserve pools _____________________________________
            
                if(!epochCache[primePoolPubKey].firstBlockOnShardFound){

                    // Find AFPs for reserve pools
                
                    for(let position = 0, length = arrayOfReservePools.length ; position < length ; position++){

                        let reservePoolPubKey = arrayOfReservePools[position]

                        let firstBlockIDBySomePool = qtEpochHandler.id+':'+reservePoolPubKey+':0'

                        let afp = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+firstBlockIDBySomePool).catch(()=>null)

                        if(afp && afp.blockID === firstBlockIDBySomePool){

                            //______________Now check if block is really the first one. Otherwise, run reverse cycle from <position> to -1 get the first block in epoch______________

                            let potentialFirstBlock = await GET_BLOCK(qtEpochHandler.id,reservePoolPubKey,0)

                            if(potentialFirstBlock && afp.blockHash === Block.genHash(potentialFirstBlock)){

                                /*
                            
                                    Now, when we have block of some pool with index 0(first block in epoch) we're interested in block.extraData.aggregatedLeadersRotationProofs
                            
                                    We should get the ALRP for previous pool in reassignment chain
                                
                                        1) If previous pool was reassigned on height -1 (alrp.skipIndex === -1) then try next pool

                                */

                                let currentPosition = position

                                let alrpData = {}
                                
                                while(true){

                                    let shouldBreakInfiniteWhile = false

                                    while(true) {
    
                                        let previousPoolPubKey = arrayOfReservePools[currentPosition-1] || primePoolPubKey
    
                                        let leaderRotationProofForPreviousPool = potentialFirstBlock.extraData.aggregatedLeadersRotationProofs[previousPoolPubKey]


                                        if(previousPoolPubKey === primePoolPubKey){

                                            // In case we get the start of reassignment chain - break the cycle

                                            epochCache[primePoolPubKey].firstBlockCreator = primePoolPubKey

                                            epochCache[primePoolPubKey].firstBlockHash = alrpData.firstBlockHash
        
                                            epochCache[primePoolPubKey].firstBlockOnShardFound = true
                                    
                                            shouldBreakInfiniteWhile = true

                                            break

                                        }else if(leaderRotationProofForPreviousPool.skipIndex !== -1){
    
                                            // Get the first block of pool reassigned on not-null height
                                            let potentialFirstBlockBySomePool = await GET_BLOCK(qtEpochHandler.id,previousPoolPubKey,0)

                                            if(potentialFirstBlockBySomePool && Block.genHash(potentialFirstBlockBySomePool) === leaderRotationProofForPreviousPool.firstBlockHash){

                                                potentialFirstBlock = potentialFirstBlockBySomePool

                                                alrpData.firstBlockCreator = previousPoolPubKey

                                                alrpData.firstBlockHash = leaderRotationProofForPreviousPool.firstBlockHash

                                                currentPosition--

                                                break // break the first(inner) while

                                            }else{

                                                // If we can't find required block - break the while & while cycles

                                                shouldBreakInfiniteWhile = true

                                                break

                                            }
                                        
                                        }

                                        // Continue iteration in current block

                                        currentPosition--
    
                                    }

                                    if(shouldBreakInfiniteWhile) break
    
                                }

                            }

                        }

                    }

                }

            }

            
            //_____________________________ Here we should have understanding of first block for each shard __________________________

            if(epochCache[primePoolPubKey].firstBlockOnShardFound && epochCache[primePoolPubKey].aefp) totalNumberOfReadyShards++

            if(!epochCache[primePoolPubKey].firstBlockHash) epochCache[primePoolPubKey] = {}
    
        
        }

        // Store the changes in CHECKPOINT_CACHE for persistence

        await global.SYMBIOTE_META.EPOCH_DATA.put(`EPOCH_CACHE:${oldEpochFullID}`,epochCache).catch(()=>false)


        //_____Now, when we've resolved all the first blocks & found all the AEFPs - get blocks, extract epoch edge operations and set the new epoch____


        if(totalNumberOfShards === totalNumberOfReadyShards){

            let epochEdgeOperations = []

            let firstBlocksHashes = []

            let cycleWasBreak = false

            for(let [primePoolPubKey] of entries){

                // Try to get the epoch edge operations from the first blocks

                let firstBlockOnThisShard = await GET_BLOCK(qtEpochHandler.id,epochCache[primePoolPubKey].firstBlockCreator,0)

                if(firstBlockOnThisShard && Block.genHash(firstBlockOnThisShard) === epochCache[primePoolPubKey].firstBlockHash){

                    if(Array.isArray(firstBlockOnThisShard.epochEdgeOperations)){

                        epochEdgeOperations.push(...firstBlockOnThisShard.epochEdgeOperations)

                    }
                    

                    firstBlocksHashes.push(epochCache[primePoolPubKey].firstBlockHash)

                }else{

                    cycleWasBreak = true

                    break

                }

            }

            if(!cycleWasBreak){

                // Store the system sync operations locally because we'll need it later(to change the epoch on VT - Verification Thread)
                // So, no sense to grab it twice(on QT and later on VT). On VT we just get it from DB and execute these operations
                await global.SYMBIOTE_META.EPOCH_DATA.put(`EEO:${oldEpochFullID}`,epochEdgeOperations).catch(()=>false)


                // Store the legacy data about this epoch that we'll need in future - epochFullID,quorum,majority
                await global.SYMBIOTE_META.EPOCH_DATA.put(`LEGACY_DATA:${qtEpochHandler.id}`,{

                    epochFullID:oldEpochFullID,
                    quorum:qtEpochHandler.quorum,
                    majority

                }).catch(()=>false)


                // We need it for changes
                let fullCopyOfQuorumThread = JSON.parse(JSON.stringify(global.SYMBIOTE_META.QUORUM_THREAD))

                // All operations must be atomic
                let atomicBatch = global.SYMBIOTE_META.QUORUM_THREAD_METADATA.batch()


                // Execute epoch edge operations from new checkpoint using our copy of QT and atomic handler
                await EXECUTE_EPOCH_EDGE_OPERATIONS(atomicBatch,fullCopyOfQuorumThread,epochEdgeOperations)

               
                // Now, after the execution we can change the checkpoint id and get the new hash + prepare new temporary object
                
                let nextEpochId = qtEpochHandler.id + 1

                let nextEpochHash = BLAKE3(JSON.stringify(firstBlocksHashes))

                let nextEpochFullID = nextEpochHash+'#'+nextEpochId


                await global.SYMBIOTE_META.EPOCH_DATA.put(`NEXT_EPOCH_HASH:${oldEpochFullID}`,nextEpochHash).catch(()=>false)


                // After execution - create the reassignment chains
                await SET_LEADERS_SEQUENCE_FOR_SHARDS(fullCopyOfQuorumThread.EPOCH,nextEpochHash)


                await global.SYMBIOTE_META.EPOCH_DATA.put(`NEXT_EPOCH_LS:${oldEpochFullID}`,fullCopyOfQuorumThread.EPOCH.leadersSequence).catch(()=>false)


                LOG(`\u001b[38;5;154mEpoch edge operations were executed for epoch \u001b[38;5;93m${oldEpochFullID} (QT)\u001b[0m`,'S')

                //_______________________ Update the values for new epoch _______________________

                fullCopyOfQuorumThread.EPOCH.timestamp = qtEpochHandler.timestamp + fullCopyOfQuorumThread.WORKFLOW_OPTIONS.EPOCH_TIME

                fullCopyOfQuorumThread.EPOCH.id = nextEpochId

                fullCopyOfQuorumThread.EPOCH.hash = nextEpochHash

                fullCopyOfQuorumThread.EPOCH.quorum = GET_QUORUM(fullCopyOfQuorumThread.EPOCH.poolsRegistry,fullCopyOfQuorumThread.WORKFLOW_OPTIONS,nextEpochHash)

                await global.SYMBIOTE_META.EPOCH_DATA.put(`NEXT_EPOCH_QUORUM:${oldEpochFullID}`,fullCopyOfQuorumThread.EPOCH.quorum).catch(()=>false)
                
                // Create new temporary db for the next epoch
                let nextTempDB = level(process.env.CHAINDATA_PATH+`/${nextEpochFullID}`,{valueEncoding:'json'})

                // Commit changes
                atomicBatch.put('QT',fullCopyOfQuorumThread)

                await atomicBatch.write()


                // Create mappings & set for the next epoch
                let nextTemporaryObject = {

                    FINALIZATION_PROOFS:new Map(),

                    FINALIZATION_STATS:new Map(),

                    TEMP_CACHE:new Map(),

                    EPOCH_EDGE_OPERATIONS_MEMPOOL:[],

                    SYNCHRONIZER:new Map(),
            
                    SHARDS_LEADERS_HANDLERS:new Map(),
      
                    DATABASE:nextTempDB
            
                }


                global.SYMBIOTE_META.QUORUM_THREAD = fullCopyOfQuorumThread

                LOG(`Epoch on quorum thread was updated => \x1b[34;1m${nextEpochHash}#${nextEpochId}`,'S')


                //_______________________Check the version required for the next checkpoint________________________


                if(IS_MY_VERSION_OLD('QUORUM_THREAD')){

                    LOG(`New version detected on QUORUM_THREAD. Please, upgrade your node software`,'W')

                    console.log('\n')
                    console.log(fs.readFileSync(PATH_RESOLVE('images/events/update.txt')).toString())
        
                    // Stop the node to update the software
                    GRACEFUL_STOP()

                }


                // Close & delete the old temporary db
            
                await global.SYMBIOTE_META.TEMP.get(oldEpochFullID).DATABASE.close()
        
                fs.rm(process.env.CHAINDATA_PATH+`/${oldEpochFullID}`,{recursive:true},()=>{})
        
                global.SYMBIOTE_META.TEMP.delete(oldEpochFullID)

                
                
                //________________________________ If it's fresh checkpoint and we present there as a member of quorum - then continue the logic ________________________________


                let iAmInTheQuorum = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.quorum.includes(global.CONFIG.SYMBIOTE.PUB)


                if(EPOCH_STILL_FRESH(global.SYMBIOTE_META.QUORUM_THREAD) && iAmInTheQuorum){

                    // Fill the checkpoints manager with the latest data

                    let currentEpochManager = nextTemporaryObject.FINALIZATION_STATS

                    global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.poolsRegistry.primePools.forEach(poolPubKey=>

                        currentEpochManager.set(poolPubKey,{index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}})

                    )

                    global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.poolsRegistry.reservePools.forEach(poolPubKey=>

                        currentEpochManager.set(poolPubKey,{index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}})

                    )


                }

                // Set next temporary object by ID
                global.SYMBIOTE_META.TEMP.set(nextEpochFullID,nextTemporaryObject)

                // Delete the cache that we don't need more
                await global.SYMBIOTE_META.EPOCH_DATA.del(`EPOCH_CACHE:${oldEpochFullID}`).catch(()=>{})


            }

        }

        // Continue to find checkpoints
        setImmediate(FIND_AGGREGATED_EPOCH_FINALIZATION_PROOFS)

    }

},




CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH=async()=>{

    let qtEpochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = qtEpochHandler.hash+"#"+qtEpochHandler.id

    let temporaryObject = global.SYMBIOTE_META.TEMP.get(epochFullID)


    if(!temporaryObject){

        setTimeout(CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH,3000)

        return

    }


    let iAmInTheQuorum = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.quorum.includes(global.CONFIG.SYMBIOTE.PUB)


    if(iAmInTheQuorum && !EPOCH_STILL_FRESH(global.SYMBIOTE_META.QUORUM_THREAD)){
        
        // Stop to generate commitments/finalization proofs
        temporaryObject.SYNCHRONIZER.set('TIME_TO_NEW_EPOCH',true)

        let canGenerateEpochFinalizationProof = true

        
        for(let primePoolPubKey of qtEpochHandler.poolsRegistry.primePools){

            let reassignmentData = temporaryObject.SHARDS_LEADERS_HANDLERS.get(primePoolPubKey) || {currentLeader:-1}

            let pubKeyOfLeader = qtEpochHandler.leadersSequence[primePoolPubKey][reassignmentData.currentLeader] || primePoolPubKey


            if(temporaryObject.SYNCHRONIZER.has('GENERATE_FINALIZATION_PROOFS:'+pubKeyOfLeader)){

                canGenerateEpochFinalizationProof = false

                break

            }

        }

        if(canGenerateEpochFinalizationProof){

            await USE_TEMPORARY_DB('put',temporaryObject.DATABASE,'TIME_TO_NEW_EPOCH',true).then(()=>

                temporaryObject.SYNCHRONIZER.set('READY_FOR_NEW_EPOCH',true)


            ).catch(()=>{})

        }
        

        // Check the safety
        if(!temporaryObject.SYNCHRONIZER.has('READY_FOR_NEW_EPOCH')){

            setTimeout(CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH,3000)

            return

        }
    

        let epochFinishProposition = {}

        let majority = GET_MAJORITY(qtEpochHandler)

        let leadersSequence = qtEpochHandler.leadersSequence // primePoolPubKey => [reservePool0,reservePool1,...,reservePoolN]

        
    
        for(let [primePoolPubKey,reassignmentArray] of Object.entries(leadersSequence)){

            let handlerWithIndexOfCurrentLeaderOnShard = temporaryObject.SHARDS_LEADERS_HANDLERS.get(primePoolPubKey) || {currentLeader:-1}// {currentLeader:<number>}

            let pubKeyOfLeader, indexOfLeader
            
            
            if(handlerWithIndexOfCurrentLeaderOnShard.currentLeader !== -1){

                pubKeyOfLeader = reassignmentArray[handlerWithIndexOfCurrentLeaderOnShard.currentLeader]

                indexOfLeader = handlerWithIndexOfCurrentLeaderOnShard.currentLeader

            }else{

                pubKeyOfLeader = primePoolPubKey

                indexOfLeader = -1

            }
            
            
            // Structure is Map(shard=>Map(quorumMember=>SIG('EPOCH_DONE'+shard+lastLeaderInRcIndex+lastIndex+lastHash+hashOfFirstBlockByLastLeader+epochFullId)))
            let agreements = temporaryObject.TEMP_CACHE.get('EPOCH_PROPOSITION')

            if(!agreements){

                agreements = new Map()

                temporaryObject.TEMP_CACHE.set('EPOCH_PROPOSITION',agreements)
            
            }

            let agreementsForThisShard = agreements.get(primePoolPubKey)

            if(!agreementsForThisShard){

                agreementsForThisShard = new Map()

                agreements.set(primePoolPubKey,agreementsForThisShard)
            
            }


            /*
            
                Thanks to verification process of block 0 on route POST /block (see routes/main.js) we know that each block created by shard leader will contain all the ALRPs
        
                1) Start to build so called CHECKPOINT_PROPOSITION. This object has the following structure


                {
                
                    "shard0":{

                        currentLeader:<int - pointer to current leader of shard based on QT.EPOCH.leadersSequence[primePool]. In case -1 - it's prime pool>

                        metadataForCheckpoint:{
                            index:,
                            hash:,
                            
                            afp:{

                                prevBlockHash:<must be the same as metadataForCheckpoint.hash>

                                blockID:<must be next to metadataForCheckpoint.index>,

                                blockHash,

                                proofs:{

                                    quorumMember0_Ed25519PubKey: ed25519Signa0,
                                    ...
                                    quorumMemberN_Ed25519PubKey: ed25519SignaN
                
                                }

                            }
                    
                        }

                    },

                    "shard1":{
                        
                    }

                    ...
                    
                    "shardN":{
                        ...
                    }
                
                }


                2) Take the <metadataForCheckpoint> for <currentLeader> from TEMP.get(<checkpointID>).FINALIZATION_STATS

                3) If nothing in FINALIZATION_STATS - then set index to -1 and hash to default(0123...)

                4) Send CHECKPOINT_PROPOSITION to POST /checkpoint_proposition to all(or at least 2/3N+1) quorum members


                ____________________________________________After we get responses____________________________________________

                5) If validator agree with all the propositions - it generate signatures for all the shard to paste this short proof to the fist block in the next epoch(to section block.extraData.aefpForPreviousEpoch)

                6) If we get 2/3N+1 agreements for ALL the shards - aggregate it and store locally. This called AGGREGATED_EPOCH_FINALIZATION_PROOF (AEFP)

                    The structure is


                       {
                
                            lastLeader:<index of Ed25519 pubkey of some pool in shard's reassignment chain>,
                            lastIndex:<index of his block in previous epoch>,
                            lastHash:<hash of this block>,
                            firstBlockHash,

                            proofs:{

                                ed25519PubKey0:ed25519Signa0,
                                ...
                                ed25519PubKeyN:ed25519SignaN
                         
                            }

                        }


                7) Then, we can share these proofs by route GET /aggregated_epoch_finalization_proof/:EPOCH_ID/:SHARD_ID

                8) Prime pool and other reserve pools on each shard can query network for this proofs to set to
                
                    block.extraData.aefpForPreviousEpoch to know where to start VERIFICATION_THREAD in a new epoch                
                

            */
         

            epochFinishProposition[primePoolPubKey] = {

                currentLeader:indexOfLeader,

                afpForFirstBlock:{},

                metadataForCheckpoint:temporaryObject.FINALIZATION_STATS.get(pubKeyOfLeader) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}

            }

            // In case we vote for index > 0 - we need to add the AFP proof to proposition. This will be added to AEFP and used on verification thread to build reassignment metadata

            if(epochFinishProposition[primePoolPubKey].metadataForCheckpoint.index >= 0){

                let firstBlockID = qtEpochHandler.id+':'+pubKeyOfLeader+':0'

                epochFinishProposition[primePoolPubKey].afpForFirstBlock = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+firstBlockID).catch(()=>({}))

            }
            
        }

        
        //____________________________________ Send the epoch finish proposition ____________________________________


        let optionsToSend = {method:'POST',body:JSON.stringify(epochFinishProposition)}
        
        let quorumMembers = await GET_QUORUM_URLS_AND_PUBKEYS(true)


        //Descriptor is {url,pubKey}
        for(let descriptor of quorumMembers){

            // No sense to get the commitment if we already have

            optionsToSend.agent = GET_HTTP_AGENT(descriptor.url)
        

            await fetch(descriptor.url+'/epoch_proposition',optionsToSend).then(r=>r.json()).then(async possibleAgreements => {

                /*
                
                    possibleAgreements structure is:
                    
                    
                        {
                            shardA:{
                                
                                status:'UPGRADE'|'OK',

                                -------------------------------[In case 'OK']-------------------------------

                                sig: SIG('EPOCH_DONE'+shard+lastAuth+lastIndex+lastHash+hashOfFirstBlockByLastLeader+epochFullId)
                        
                                -----------------------------[In case 'UPGRADE']----------------------------

                                currentLeader:<index>,
                                metadataForCheckpoint:{
                                    index,hash,afp:{prevBlockHash,blockID,blockHash,proofs}
                                }

                            },

                            shardB:{
                                ...(same)
                            },
                            ...,
                            shardQ:{
                                ...(same)
                            }
                        }
                
                
                */

                if(typeof possibleAgreements === 'object'){

                    // Start iteration

                    for(let [primePoolPubKey,metadata] of Object.entries(epochFinishProposition)){

                        let agreementsForThisShard = temporaryObject.TEMP_CACHE.get('EPOCH_PROPOSITION').get(primePoolPubKey) // signer => signature                        

                        let response = possibleAgreements[primePoolPubKey]

                        if(response){

                            if(response.status==='OK' && typeof metadata.afpForFirstBlock.blockHash === 'string'){

                                // Verify EPOCH_FINALIZATION_PROOF signature and store to mapping

                                let dataThatShouldBeSigned = 'EPOCH_DONE'+primePoolPubKey+metadata.currentLeader+metadata.metadataForCheckpoint.index+metadata.metadataForCheckpoint.hash+metadata.afpForFirstBlock.blockHash+epochFullID

                                let isOk = await ED25519_VERIFY(dataThatShouldBeSigned,response.sig,descriptor.pubKey)

                                if(isOk) agreementsForThisShard.set(descriptor.pubKey,response.sig)


                            }else if(response.status==='UPGRADE'){

                                // Check the AFP and update the local data

                                let {index,hash,afp} = response.metadataForCheckpoint
                            
                                let pubKeyOfProposedLeader = leadersSequence[primePoolPubKey][response.currentLeader] || primePoolPubKey
                                
                                let afpToUpgradeIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(afp,qtEpochHandler)

                                let blockIDThatShouldBeInAfp = qtEpochHandler.id+':'+pubKeyOfProposedLeader+':'+index
                            
                                if(afpToUpgradeIsOk && blockIDThatShouldBeInAfp === afp.blockID && hash === afp.blockHash){

                                    let {prevBlockHash,blockID,blockHash,proofs} = afp
                            
                                    // Update the SHARDS_LEADERS_HANDLERS

                                    temporaryObject.SHARDS_LEADERS_HANDLERS.set(primePoolPubKey,{currentLeader:response.currentLeader})
                                    
                                    // Update FINALIZATION_STATS

                                    temporaryObject.FINALIZATION_STATS.set(pubKeyOfProposedLeader,{index,hash,afp:{prevBlockHash,blockID,blockHash,proofs}})                                    
                            
                                    // Clear the mapping with signatures because it becomes invalid

                                    agreementsForThisShard.clear()

                                }

                            }

                        }

                    }

                }
                
            }).catch(()=>{});
            
            
        }
            
    
        // Iterate over upgrades and set new values for finalization proofs

        for(let [primePoolPubKey,metadata] of Object.entries(epochFinishProposition)){

            let agreementsForEpochManager = temporaryObject.TEMP_CACHE.get('EPOCH_PROPOSITION').get(primePoolPubKey) // signer => signature

            if(agreementsForEpochManager.size >= majority){

        
                let aggregatedEpochFinalizationProof = {

                    shard:primePoolPubKey,

                    lastLeader:metadata.currentLeader,
                    
                    lastIndex:metadata.metadataForCheckpoint.index,
                    
                    lastHash:metadata.metadataForCheckpoint.hash,

                    hashOfFirstBlockByLastLeader:metadata.afpForFirstBlock.blockHash,

                    proofs:Object.fromEntries(agreementsForEpochManager)
                    
                }

                await global.SYMBIOTE_META.EPOCH_DATA.put(`AEFP:${qtEpochHandler.id}:${primePoolPubKey}`,aggregatedEpochFinalizationProof).catch(()=>{})

            }

        }

    }

    setTimeout(CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH,3000) // each 3 seconds - do monitoring

},




RUN_FINALIZATION_PROOFS_GRABBING = async (epochHandler,proofsGrabber) => {

    let epochFullID = epochHandler.hash + "#" + epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    if(!tempObject) return

    let {FINALIZATION_PROOFS,DATABASE,TEMP_CACHE} = tempObject


    // Get the block index & hash that we're currently hunting for

    let blockIDForHunting = epochHandler.id+':'+global.CONFIG.SYMBIOTE.PUB+':'+(proofsGrabber.acceptedIndex+1)

    let finalizationProofsMapping


    if(FINALIZATION_PROOFS.has(blockIDForHunting)) finalizationProofsMapping = FINALIZATION_PROOFS.get(blockIDForHunting)

    else{

        finalizationProofsMapping = new Map()

        FINALIZATION_PROOFS.set(blockIDForHunting,finalizationProofsMapping)

    }

    let majority = GET_MAJORITY(epochHandler)

    let blockToSend = TEMP_CACHE.get(blockIDForHunting) || await global.SYMBIOTE_META.BLOCKS.get(blockIDForHunting).catch(()=>null)


    if(!blockToSend) return


    let blockHash = Block.genHash(blockToSend)


    TEMP_CACHE.set(blockIDForHunting,blockToSend)


    proofsGrabber.huntingForBlockID = blockIDForHunting

    proofsGrabber.huntingForHash = blockHash


    if(finalizationProofsMapping.size<majority){

        // To prevent spam

        if(TEMP_CACHE.has('FP_SPAM_FLAG')) return
    
        TEMP_CACHE.set('FP_SPAM_FLAG',true)

        let dataToSend = JSON.stringify({

            route:'get_finalization_proof',
        
            block:blockToSend,
            
            previousBlockAFP:proofsGrabber.afpForPrevious

            
        })


        for(let pubKeyOfQuorumMember of epochHandler.quorum){

            // No sense to get the commitment if we already have

            if(finalizationProofsMapping.has(pubKeyOfQuorumMember)) continue

            let connection = TEMP_CACHE.get('WS:'+pubKeyOfQuorumMember)

            if(connection) connection.sendUTF(dataToSend)

        }


    }


    //_______________________ It means that we now have enough FINALIZATION_PROOFs for appropriate block. Now we can start to generate AGGREGATED_FINALIZATION_PROOF _______________________


    if(finalizationProofsMapping.size >= majority){

        // In this case , aggregate FINALIZATION_PROOFs to get the AGGREGATED_FINALIZATION_PROOF and share over the network
        // Also, increase the counter of tempObject.TEMP_CACHE.get('PROOFS_GRABBER') to move to the next block and udpate the hash

        /*
        
        Aggregated version of FINALIZATION_PROOFs (it's AGGREGATED_FINALIZATION_PROOF)
        
        {
            prevBlockHash:"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        
            blockID:"93:7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

            blockHash:"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        
            proofs:{

                voterPubKey0:hisEd25519Signa,
                ...
                voterPubKeyN:hisEd25519Signa

            }

        }
    

        */
        
        let aggregatedFinalizationProof = {

            prevBlockHash:proofsGrabber.acceptedHash,

            blockID:blockIDForHunting,
            
            blockHash,

            proofs:Object.fromEntries(finalizationProofsMapping)
            
        }


        // Store locally
        await global.SYMBIOTE_META.EPOCH_DATA.put('AFP:'+blockIDForHunting,aggregatedFinalizationProof).catch(()=>false)

        LOG(`Approved height for epoch \u001b[38;5;50m${epochHandler.id} \x1b[31;1mis \u001b[38;5;50m${proofsGrabber.acceptedIndex} \x1b[32;1m(${(finalizationProofsMapping.size/epochHandler.quorum.length).toFixed(3)*100}% agreements)`,'F')

        console.log('\n')

        // Delete finalization proofs that we don't need more
        FINALIZATION_PROOFS.delete(blockIDForHunting)


        // Repeat procedure for the next block and store the progress
        await USE_TEMPORARY_DB('put',DATABASE,'PROOFS_GRABBER',proofsGrabber).then(()=>{

            proofsGrabber.afpForPrevious = aggregatedFinalizationProof

            proofsGrabber.acceptedIndex++
    
            proofsGrabber.acceptedHash = proofsGrabber.huntingForHash

        }).catch(()=>{})

        
        TEMP_CACHE.delete('FP_SPAM_FLAG')

        TEMP_CACHE.delete(blockIDForHunting)


    }else{

        setTimeout(()=>TEMP_CACHE.delete('FP_SPAM_FLAG'),1000)

    }

},




OPEN_CONNECTIONS_WITH_QUORUM = async (epochHandler,tempObject) => {

    // Now we can open required WebSocket connections with quorums majority

    let {FINALIZATION_PROOFS,TEMP_CACHE} = tempObject

    let epochFullID = epochHandler.hash + "#" + epochHandler.id

    for(let pubKey of epochHandler.quorum){

        // Check if we already have an open connection stored in cache

        if(!TEMP_CACHE.has('WS:'+pubKey)){

            let poolStorage = global.SYMBIOTE_META.QUORUM_THREAD_CACHE.get(pubKey+'(POOL)_STORAGE_POOL') || await GET_FROM_QUORUM_THREAD_STATE(pubKey+'(POOL)_STORAGE_POOL').catch(()=>null)

            if(poolStorage){

                let WebSocketClient = WS.client
    
                let client = new WebSocketClient({})
                
                
                // Connect to remote WSS server
                client.connect(poolStorage.wssPoolURL,'echo-protocol')
                
                client.on('connect',connection=>{

                    connection.on('message',async message=>{

                        if(message.type === 'utf8'){

                            let parsedData = JSON.parse(message.utf8Data)
                        
                            let proofsGrabber = TEMP_CACHE.get('PROOFS_GRABBER')
 
                            if (parsedData.finalizationProof && proofsGrabber.huntingForHash === parsedData.votedForHash && FINALIZATION_PROOFS.has(proofsGrabber.huntingForBlockID)){
                    
                                // Verify the finalization proof
                    
                                let dataThatShouldBeSigned = proofsGrabber.acceptedHash+proofsGrabber.huntingForBlockID+proofsGrabber.huntingForHash+epochFullID
                    
                                let finalizationProofIsOk = epochHandler.quorum.includes(parsedData.voter) && await ED25519_VERIFY(dataThatShouldBeSigned,parsedData.finalizationProof,parsedData.voter)
                        
                                if(finalizationProofIsOk && FINALIZATION_PROOFS.has(proofsGrabber.huntingForBlockID)){
                    
                                    FINALIZATION_PROOFS.get(proofsGrabber.huntingForBlockID).set(parsedData.voter,parsedData.finalizationProof)
                    
                                }
                    
                            }        
                        
                        }        

                    })

                    connection.on('close',()=>TEMP_CACHE.delete('WS:'+pubKey))
                      
                    connection.on('error',()=>TEMP_CACHE.delete('WS:'+pubKey))

                    TEMP_CACHE.set('WS:'+pubKey,connection)

                })
                
            }
                 
        }

    }

},




SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS = async () => {

    let qtEpochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH
    
    let epochFullID = qtEpochHandler.hash + "#" + qtEpochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)



    if(!tempObject){

        setTimeout(SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS,2000)

        return

    }


    // If we don't generate the blocks - skip this function
    if(!tempObject.TEMP_CACHE.get('CAN_PRODUCE_BLOCKS')){

        setTimeout(SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS,2000)

        return

    }

    let {DATABASE,TEMP_CACHE} = tempObject

    // Descriptor has the following structure - {checkpointID,height}
    let proofsGrabber = TEMP_CACHE.get('PROOFS_GRABBER')


    if(!proofsGrabber || proofsGrabber.epochID !== qtEpochHandler.id){

        //If we still works on the old checkpoint - continue
        //Otherwise,update the latest height/hash and send them to the new QUORUM
        proofsGrabber = await USE_TEMPORARY_DB('get',DATABASE,'PROOFS_GRABBER').catch(()=>false)

        if(!proofsGrabber){

            // Set the new handler with index 0(because each new epoch start with block index 0)
            proofsGrabber = {
    
                epochID:qtEpochHandler.id,

                acceptedIndex:-1,

                acceptedHash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

                afpForPrevious:{}
    
            }
    
        }
        
        // And store new descriptor

        await USE_TEMPORARY_DB('put',DATABASE,'PROOFS_GRABBER',proofsGrabber).catch(()=>false)

        TEMP_CACHE.set('PROOFS_GRABBER',proofsGrabber)

    }


    await OPEN_CONNECTIONS_WITH_QUORUM(qtEpochHandler,tempObject)

    await RUN_FINALIZATION_PROOFS_GRABBING(qtEpochHandler,proofsGrabber).catch(()=>{})


    setImmediate(SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS)

},




TIME_IS_OUT_FOR_CURRENT_SHARD_LEADER=(epochHandler,indexOfCurrentLeaderInSequence,leaderShipTimeframe)=>{

    // Function to check if time frame for current shard leader is done and we have to move to next reserve pools in reassignment chain

    return GET_GMT_TIMESTAMP() >= epochHandler.timestamp+(indexOfCurrentLeaderInSequence+2)*leaderShipTimeframe

},




GET_AGGREGATED_LEADER_ROTATION_PROOF = async (epochHandler,pubKeyOfOneOfPreviousLeader,hisIndexInLeadersSequence,shardID) => {

    /**
    * This function is used once you become shard leader and you need to get the ALRPs for all the previous leaders
    * on this shard till the pool which was reassigned on non-zero height
    */

    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    if(!tempObject){

        return

    }

    // Prepare the template that we're going to send to quorum to get the ALRP
    // Send payload to => POST /leader_rotation_proof

    let firstBlockIDByThisLeader = epochHandler.id+':'+pubKeyOfOneOfPreviousLeader+':0' // epochID:PubKeyOfCreator:0 - first block in epoch

    let afpForFirstBlock = await GET_VERIFIED_AGGREGATED_FINALIZATION_PROOF_BY_BLOCK_ID(firstBlockIDByThisLeader,epochHandler)

    let firstBlockHash

    let localFinalizationStatsForThisPool = tempObject.FINALIZATION_STATS.get(pubKeyOfOneOfPreviousLeader) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}


    if(localFinalizationStatsForThisPool.index === -1){

        localFinalizationStatsForThisPool.hash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

        afpForFirstBlock = null

    }


    // Set the hash of first block for pool
    // In case previous leader created zero blocks - set the <firstBlockHash> to "null-hash-value"('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
    // Otherwise, if at least one block was created & shared among quorum - take the hash value from AFP (.blockHash field(see AFP structure))
    if(!afpForFirstBlock && localFinalizationStatsForThisPool.index === -1) firstBlockHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

    else firstBlockHash = afpForFirstBlock.blockHash


    // In case we haven't define hash of first block - stop searching process. Try next time

    if(firstBlockHash){

        let responsePromises = []

        let sendOptions = {
     
            method:'POST',
    
            body:JSON.stringify({
    
                poolPubKey:pubKeyOfOneOfPreviousLeader,

                hisIndexInLeadersSequence,
    
                shard:shardID,
    
                afpForFirstBlock,
    
                skipData:localFinalizationStatsForThisPool
    
            })
    
        }

        let quorumMembers = await GET_QUORUM_URLS_AND_PUBKEYS(true,epochHandler)


        // Descriptor is {url,pubKey}
        for(let descriptor of quorumMembers){

            let responsePromise = fetch(descriptor.url+'/leader_rotation_proof',sendOptions).then(r=>r.json()).then(response=>{

                response.pubKey = descriptor.pubKey
       
                return response
       
            }).catch(()=>false)
       
            responsePromises.push(responsePromise)            
    
        }

        let results = (await Promise.all(responsePromises)).filter(Boolean)

        /*
 
            ___________________________ Now analyze the responses ___________________________

            [1] In case quroum member has the same or lower index in own FINALIZATION_STATS for this pool - we'll get the response like this:

            {
                type:'OK',
                sig: ED25519_SIG('LEADER_ROTATION_PROOF:<poolPubKey>:<firstBlockHash>:<skipIndex>:<skipHash>:<epochFullID>')
            }

            We should just verify this signature and add to local list for further aggregation
            And this quorum member update his own local version of FP to have FP with bigger index


            [2] In case quorum member has bigger index in FINALIZATION_STATS - it sends us 'UPDATE' message with the following format:

            {
                
                type:'UPDATE',
             
                skipData:{
                 
                    index,
                    hash,
                    afp:{

                        prevBlockHash,      => must be the same as skipData.hash
                        blockID,            => must be skipData.index+1 === blockID
                        blockHash,
                        proofs:{

                            pubKey0:signa0,         => prevBlockHash+blockID+blockHash+QT.EPOCH.HASH+"#"+QT.EPOCH.id
                            ...

                        }

                    }

                }
             
            }


            Again - we should verify the signature, update local version of FINALIZATION_STATS and repeat the grabbing procedure

        */


        let skipAgreementSignatures = {} // pubkey => signa

        let totalNumberOfSignatures = 0
            
        let dataThatShouldBeSigned = `LEADER_ROTATION_PROOF:${pubKeyOfOneOfPreviousLeader}:${firstBlockHash}:${localFinalizationStatsForThisPool.index}:${localFinalizationStatsForThisPool.hash}:${epochFullID}`
        
        let majority = GET_MAJORITY(epochHandler)
        

        // Start the cycle over results

        for(let result of results){

            if(result.type === 'OK' && typeof result.sig === 'string'){
        
                let signatureIsOk = await ED25519_VERIFY(dataThatShouldBeSigned,result.sig,result.pubKey)
        
                if(signatureIsOk){
        
                    skipAgreementSignatures[result.pubKey] = result.sig
        
                    totalNumberOfSignatures++
        
                }
        
                // If we get 2/3N+1 signatures to skip - we already have ability to create <aggregatedSkipProof>
        
                if(totalNumberOfSignatures >= majority) break
        
        
            }else if(result.type === 'UPDATE' && typeof result.skipData === 'object'){
        
        
                let {index,hash,afp} = result.skipData
        
                let blockIdInAfp = (epochHandler.id+':'+pubKeyOfOneOfPreviousLeader+':'+index)
        
        
                if(typeof afp === 'object' && hash === afp.blockHash && blockIdInAfp === afp.blockID && await VERIFY_AGGREGATED_FINALIZATION_PROOF(afp,epochHandler)){
        
                    // If signature is ok and index is bigger than we have - update the <skipData> in our local skip handler
         
                    if(localFinalizationStatsForThisPool.index < index){
                         
                        let {prevBlockHash,blockID,blockHash,proofs} = afp
                         
        
                        localFinalizationStatsForThisPool.index = index
        
                        localFinalizationStatsForThisPool.hash = hash
        
                        localFinalizationStatsForThisPool.afp = {prevBlockHash,blockID,blockHash,proofs}
         
    
                        // Store the updated version of finalization stats

                        tempObject.FINALIZATION_STATS.set(pubKeyOfOneOfPreviousLeader,localFinalizationStatsForThisPool)                    
    
                        // If our local version had lower index - break the cycle and try again next time with updated value
        
                        break
        
                    }
        
                }
             
            }
        
        }


        //____________________If we get 2/3+1 of LRPs - aggregate and get the ALRP(<aggregated LRP>)____________________

        if(totalNumberOfSignatures >= majority){

            return {

                firstBlockHash,

                skipIndex:localFinalizationStatsForThisPool.index,

                skipHash:localFinalizationStatsForThisPool.hash,

                proofs:skipAgreementSignatures

            }

        }

    }

},




// Iterate over shards and change the leader if it's appropriate timeframe
SHARDS_LEADERS_MONITORING=async()=>{

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    if(!tempObject){

        setTimeout(SHARDS_LEADERS_MONITORING,3000)

        return

    }


    if(!EPOCH_STILL_FRESH(global.SYMBIOTE_META.QUORUM_THREAD)){

        setTimeout(SHARDS_LEADERS_MONITORING,3000)

        return

    }

    //____________________ Now iterate over shards to check if time is out for current shards leaders and we have to move to next ones ____________________

    for(let primePoolPubKey of epochHandler.poolsRegistry.primePools){

        // Get the current handler and check the timeframe

        let leaderSequenceHandler = tempObject.SHARDS_LEADERS_HANDLERS.get(primePoolPubKey) || {currentLeader:-1}

        let pubKeyOfCurrentShardLeader, indexOfCurrentLeaderInSequence

        if(leaderSequenceHandler.currentLeader !== -1){

            indexOfCurrentLeaderInSequence = leaderSequenceHandler.currentLeader

            pubKeyOfCurrentShardLeader = epochHandler.leadersSequence[primePoolPubKey][indexOfCurrentLeaderInSequence]

        }else{

            indexOfCurrentLeaderInSequence = -1

            pubKeyOfCurrentShardLeader = primePoolPubKey

        }


        // In case more pools in sequence exists - we can move to it. Otherwise - no sense to change pool as leader because no more candidates
        let itsNotFinishOfSequence = epochHandler.leadersSequence[primePoolPubKey][indexOfCurrentLeaderInSequence+1]

        if(itsNotFinishOfSequence && TIME_IS_OUT_FOR_CURRENT_SHARD_LEADER(epochHandler,indexOfCurrentLeaderInSequence,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.LEADERSHIP_TIMEFRAME)){

            // Inform websocket server that we shouldn't generate proofs for this leader anymore
            tempObject.SYNCHRONIZER.set('STOP_PROOFS_GENERATION:'+pubKeyOfCurrentShardLeader,true)

            // But anyway - in async env wait until server callback us here that proofs creation is stopped
            if(!tempObject.SYNCHRONIZER.has('GENERATE_FINALIZATION_PROOFS:'+pubKeyOfCurrentShardLeader)){

                // Now, update the LEADERS_HANDLER

                let newLeadersHandler = {
                    
                    currentLeader: leaderSequenceHandler.currentLeader+1
                
                }

                await USE_TEMPORARY_DB('put',tempObject.DATABASE,'LEADERS_HANDLER:'+primePoolPubKey,newLeadersHandler).then(()=>{

                    // Set new reserve pool and delete the old one

                    // Delete the pointer to prime pool for old leader
                    tempObject.SHARDS_LEADERS_HANDLERS.delete(pubKeyOfCurrentShardLeader)

                    // Set new value of handler
                    tempObject.SHARDS_LEADERS_HANDLERS.set(primePoolPubKey,newLeadersHandler)

                    // Add the pointer: NewShardLeaderPubKey => ShardID 
                    tempObject.SHARDS_LEADERS_HANDLERS.set(epochHandler.leadersSequence[primePoolPubKey][newLeadersHandler.currentLeader],primePoolPubKey)

                    tempObject.SYNCHRONIZER.delete('STOP_PROOFS_GENERATION:'+pubKeyOfCurrentShardLeader)

                }).catch(()=>false)

            }

        }

    }

    // Start again
    setImmediate(SHARDS_LEADERS_MONITORING)
    
},




RESTORE_STATE=async()=>{

    let poolsRegistry = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.poolsRegistry

    let allThePools = poolsRegistry.primePools.concat(poolsRegistry.reservePools)

    let epochFullID = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)
    


    for(let poolPubKey of allThePools){

        // If this value is related to the current epoch - set to manager, otherwise - take from the VERIFICATION_STATS_PER_POOL as a start point
        // Returned value is {index,hash,(?)afp}

        let {index,hash,afp} = await tempObject.DATABASE.get(poolPubKey).catch(()=>null) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}

        
        tempObject.FINALIZATION_STATS.set(poolPubKey,{index,hash,afp})

        //___________________________________ Get the info about current leader _______________________________________

        // *only for prime pools
        
        if(poolsRegistry.primePools.includes(poolPubKey)){

            let leadersHandler = await tempObject.DATABASE.get('LEADERS_HANDLER:'+poolPubKey).catch(()=>false) // {currentLeader:<pointer to current reserve pool in (QT/VT).EPOCH.leadersSequence[<primePool>]>}

            if(leadersHandler){

                tempObject.SHARDS_LEADERS_HANDLERS.set(poolPubKey,leadersHandler)

                // Using pointer - find the appropriate reserve pool

                let currentLeaderPubKey = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.leadersSequence[poolPubKey][leadersHandler.currentLeader]

                // Key is reserve pool which points to his prime pool

                tempObject.SHARDS_LEADERS_HANDLERS.set(currentLeaderPubKey,poolPubKey)                

            }

        }

    }


    // Finally, once we've started the "next epoch" process - restore it

    let itsTimeForTheNextEpoch = await tempObject.DATABASE.get('TIME_TO_NEW_EPOCH').catch(()=>false)

    if(itsTimeForTheNextEpoch) {

        tempObject.SYNCHRONIZER.set('TIME_TO_NEW_EPOCH',true)

        tempObject.SYNCHRONIZER.set('READY_FOR_NEW_EPOCH',true)

    }

},




/*

Function to find the AGGREGATED_EPOCH_FINALIZATION_PROOFS for appropriate shard

Ask the network in special order:

    1) Special configured URL (it might be plugin's API)
    2) Quorum members
    3) Other known peers

*/
GET_PREVIOUS_AGGREGATED_EPOCH_FINALIZATION_PROOF = async() => {

    // global.SYMBIOTE_META.GENERATION_THREAD

    let allKnownNodes = [global.CONFIG.SYMBIOTE.GET_PREVIOUS_EPOCH_AGGREGATED_FINALIZATION_PROOF_URL,...await GET_QUORUM_URLS_AND_PUBKEYS(),...GET_ALL_KNOWN_PEERS()]

    let shardID = global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY || global.CONFIG.SYMBIOTE.PUB

    // Find locally

    let aefpProof = await global.SYMBIOTE_META.EPOCH_DATA.get(`AEFP:${global.SYMBIOTE_META.GENERATION_THREAD.epochIndex}:${shardID}`).catch(()=>null)

    if(aefpProof) return aefpProof

    else {

        for(let nodeEndpoint of allKnownNodes){

            let finalURL = `${nodeEndpoint}/aggregated_epoch_finalization_proof/${global.SYMBIOTE_META.GENERATION_THREAD.epochIndex}/${shardID}`
    
            let itsProbablyAggregatedEpochFinalizationProof = await fetch(finalURL,{agent:GET_HTTP_AGENT(finalURL)}).then(r=>r.json()).catch(()=>false)
    
            let aefpProof = itsProbablyAggregatedEpochFinalizationProof?.shard === shardID && await VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF(
                
                itsProbablyAggregatedEpochFinalizationProof,
    
                global.SYMBIOTE_META.GENERATION_THREAD.quorum,
    
                global.SYMBIOTE_META.GENERATION_THREAD.majority,        
    
                global.SYMBIOTE_META.GENERATION_THREAD.epochFullId
            
            )
    
            if(aefpProof) return aefpProof
    
        }    

    }
    
}




//________________________________________________________________EXTERNAL_______________________________________________________________________




export let GENERATE_BLOCKS_PORTION = async() => {

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH
    
    let qtEpochFullID = epochHandler.hash+"#"+epochHandler.id

    let epochIndex = epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(qtEpochFullID)


    if(!tempObject) return


    if(!tempObject.TEMP_CACHE.has('CAN_PRODUCE_BLOCKS')){

        let poolPresent = epochHandler.poolsRegistry[global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY ? 'reservePools' : 'primePools' ].includes(global.CONFIG.SYMBIOTE.PUB) 

        tempObject.TEMP_CACHE.set('CAN_PRODUCE_BLOCKS',poolPresent)

    }


    //Safe "if" branch to prevent unnecessary blocks generation
    if(!tempObject.TEMP_CACHE.get('CAN_PRODUCE_BLOCKS')) return


    let myDataInShardsLeadersMonitoring = tempObject.SHARDS_LEADERS_HANDLERS.get(global.CONFIG.SYMBIOTE.PUB)



    if(typeof myDataInShardsLeadersMonitoring === 'object') return


    // Check if <epochFullID> is the same in QT and in GT

    if(global.SYMBIOTE_META.GENERATION_THREAD.epochFullId !== qtEpochFullID){

        // If new epoch - add the aggregated proof of previous epoch finalization

        if(epochIndex !== 0){

            let aefpForPreviousEpoch = await GET_PREVIOUS_AGGREGATED_EPOCH_FINALIZATION_PROOF()

            // If we can't find a proof - try to do it later
            // Only in case it's initial epoch(index is -1) - no sense to push it
            if(!aefpForPreviousEpoch) return

            global.SYMBIOTE_META.GENERATION_THREAD.aefpForPreviousEpoch = aefpForPreviousEpoch

        }

        // Update the index & hash of epoch

        global.SYMBIOTE_META.GENERATION_THREAD.epochFullId = qtEpochFullID

        global.SYMBIOTE_META.GENERATION_THREAD.epochIndex = epochIndex

        // Recount new values

        global.SYMBIOTE_META.GENERATION_THREAD.quorum = epochHandler.quorum

        global.SYMBIOTE_META.GENERATION_THREAD.majority = GET_MAJORITY(epochHandler)


        // And nullish the index & hash in generation thread for new epoch

        global.SYMBIOTE_META.GENERATION_THREAD.prevHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
 
        global.SYMBIOTE_META.GENERATION_THREAD.nextIndex = 0
    
    }


    let extraData = {}


    //___________________ Add the AEFP to the first block of epoch ___________________

    if(global.SYMBIOTE_META.GENERATION_THREAD.epochIndex > 0){

        // Add the AEFP for previous epoch

        extraData.aefpForPreviousEpoch = global.SYMBIOTE_META.GENERATION_THREAD.aefpForPreviousEpoch

        if(!extraData.aefpForPreviousEpoch) return


    }
    
    // If we are even not in reserve - return

    if(typeof myDataInShardsLeadersMonitoring === 'string'){

        // Do it only for the first block in epoch(with index 0)

        if(global.SYMBIOTE_META.GENERATION_THREAD.nextIndex === 0){

            // Build the template to insert to the extraData of block. Structure is {primePool:ALRP,reservePool0:ALRP,...,reservePoolN:ALRP}
        
            let myPrimePool = global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY

            let leadersSequenceOfMyShard = epochHandler.leadersSequence[myPrimePool]
    
            let myIndexInLeadersSequenceForShard = leadersSequenceOfMyShard.indexOf(global.CONFIG.SYMBIOTE.PUB)
    

            // Get all previous pools - from zero to <my_position>

            let pubKeysOfAllThePreviousPools = leadersSequenceOfMyShard.slice(0,myIndexInLeadersSequenceForShard).reverse()


            // Add the pubkey of prime pool because we have to add the ALRP for it too

            pubKeysOfAllThePreviousPools.push(myPrimePool)



            //_____________________ Fill the extraData.aggregatedLeadersRotationProofs _____________________


            extraData.aggregatedLeadersRotationProofs = {}

            /*

                Here we need to fill the object with aggregated leader rotation proofs (ALRPs) for all the previous pools till the pool which was rotated on not-zero height
            
                If we can't find all the required ALRPs - skip this iteration to try again later

            */

            // Add the ALRP for the previous pools in leaders sequence

            let indexOfPreviousLeaderInSequence = myIndexInLeadersSequenceForShard-1

            for(let pubKeyOfPreviousLeader of pubKeysOfAllThePreviousPools){

                let aggregatedLeaderRotationProof = await GET_AGGREGATED_LEADER_ROTATION_PROOF(epochHandler,pubKeyOfPreviousLeader,indexOfPreviousLeaderInSequence,myPrimePool).catch(()=>null)

                if(aggregatedLeaderRotationProof){

                    extraData.aggregatedLeadersRotationProofs[pubKeyOfPreviousLeader] = aggregatedLeaderRotationProof

                    if(aggregatedLeaderRotationProof.skipIndex >= 0) break // if we hit the ALRP with non-null index(at least index >= 0) it's a 100% that reassignment chain is not broken, so no sense to push ALRPs for previous pools 

                    indexOfPreviousLeaderInSequence--

                } else return

            }

        }


    }else if(global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY) return
    

    /*

    _________________________________________GENERATE PORTION OF BLOCKS___________________________________________
    
    Here we check how many transactions(events) we have locally and generate as many blocks as it's possible
    
    */

    let numberOfBlocksToGenerate = Math.ceil(global.SYMBIOTE_META.MEMPOOL.length/global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.TXS_LIMIT_PER_BLOCK)




    //_______________________________________FILL THE BLOCK WITH EXTRA DATA_________________________________________

    // 0.Add the epoch edge operations to block extra data

    extraData.epochEdgeOperations = GET_EPOCH_EDGE_OPERATIONS(global.SYMBIOTE_META.GENERATION_THREAD.epochFullId)

    // 1.Add the extra data to block from configs(it might be your note, for instance)

    extraData.rest = {...global.CONFIG.SYMBIOTE.EXTRA_DATA_TO_BLOCK}


    if(numberOfBlocksToGenerate===0) numberOfBlocksToGenerate++

    let atomicBatch = global.SYMBIOTE_META.BLOCKS.batch()

    for(let i=0;i<numberOfBlocksToGenerate;i++){


        let blockCandidate = new Block(GET_TRANSACTIONS(),extraData,global.SYMBIOTE_META.GENERATION_THREAD.epochFullId)
                        
        let hash = Block.genHash(blockCandidate)


        blockCandidate.sig = await ED25519_SIGN_DATA(hash,global.PRIVATE_KEY)
            
        BLOCKLOG(`New block generated`,hash,blockCandidate,global.SYMBIOTE_META.GENERATION_THREAD.epochIndex)


        global.SYMBIOTE_META.GENERATION_THREAD.prevHash = hash
 
        global.SYMBIOTE_META.GENERATION_THREAD.nextIndex++
    
        // BlockID has the following format => epochID(epochIndex):Ed25519_Pubkey:IndexOfBlockInCurrentEpoch
        let blockID = global.SYMBIOTE_META.GENERATION_THREAD.epochIndex+':'+global.CONFIG.SYMBIOTE.PUB+':'+blockCandidate.index

        //Store block locally
        atomicBatch.put(blockID,blockCandidate)
           
    }

    //Update the GENERATION_THREAD after all
    atomicBatch.put('GT',global.SYMBIOTE_META.GENERATION_THREAD)

    await atomicBatch.write()

},





VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF = async (itsProbablyAggregatedEpochFinalizationProof,quorum,majority,epochFullID) => {

    let overviewIsOK =
        
        typeof itsProbablyAggregatedEpochFinalizationProof === 'object'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.shard === 'string'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.lastLeader === 'number'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.lastIndex === 'number'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.lastHash === 'string'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.hashOfFirstBlockByLastLeader === 'string'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.proofs === 'object'

    if(overviewIsOK && itsProbablyAggregatedEpochFinalizationProof){

        /*
    
            The structure of AGGREGATED_EPOCH_FINALIZATION_PROOF is

            {
                shard:<ed25519 pubkey of prime pool - creator of shard>,
                lastLeader:<index of Ed25519 pubkey of some pool in shard's reassignment chain>,
                lastIndex:<index of his block in previous epoch>,
                lastHash:<hash of this block>,
                hashOfFirstBlockByLastLeader,

                proofs:{

                    ed25519PubKey0:ed25519Signa0,
                    ...
                    ed25519PubKeyN:ed25519SignaN
                         
                }

            }

            We need to verify that majority have voted for such solution


        */

        let {shard,lastLeader,lastIndex,lastHash,hashOfFirstBlockByLastLeader} = itsProbablyAggregatedEpochFinalizationProof

        let dataThatShouldBeSigned = 'EPOCH_DONE'+shard+lastLeader+lastIndex+lastHash+hashOfFirstBlockByLastLeader+epochFullID

        let promises = []

        let okSignatures = 0

        let unique = new Set()


        for(let [signerPubKey,signa] of Object.entries(itsProbablyAggregatedEpochFinalizationProof.proofs)){

            promises.push(ED25519_VERIFY(dataThatShouldBeSigned,signa,signerPubKey).then(isOK => {

                if(isOK && quorum.includes(signerPubKey) && !unique.has(signerPubKey)){

                    unique.add(signerPubKey)

                    okSignatures++

                }

            }))

        }

        await Promise.all(promises)
        
        if(okSignatures>=majority){

            return {
            
                shard,lastLeader,lastIndex,lastHash,hashOfFirstBlockByLastLeader,
        
                proofs:itsProbablyAggregatedEpochFinalizationProof.proofs

            }

        }
        
    }

},




LOAD_GENESIS=async()=>{


    let atomicBatch = global.SYMBIOTE_META.STATE.batch(),

        quorumThreadAtomicBatch = global.SYMBIOTE_META.QUORUM_THREAD_METADATA.batch(),
    
        epochTimestamp,

        startPool,

        poolsRegistryForEpochHandler = {primePools:[],reservePools:[]}




    //__________________________________ Load all the configs __________________________________

        
    epochTimestamp = global.GENESIS.EPOCH_TIMESTAMP

    let primePools = new Set(Object.keys(global.GENESIS.POOLS))

    global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL = {} // poolPubKey => {index,hash,isReserve}


    for(let [poolPubKey,poolContractStorage] of Object.entries(global.GENESIS.POOLS)){

        let {isReserve} = poolContractStorage

        if(!isReserve) startPool ||= poolPubKey

        // Create the value in VT

        global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[poolPubKey] = {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',isReserve}


        //Create the appropriate storage for pre-set pools. We'll create the simplest variant - but pools will have ability to change it via txs during the chain work
        
        let contractMetadataTemplate = {

            type:"contract",
            lang:'spec/stakingPool',
            balance:0,
            uno:0,
            storages:['POOL'],
            bytecode:''

        }            
        
        let idToAdd = poolPubKey+':'+poolPubKey

        let templateForQt = {

            totalPower:poolContractStorage.totalPower,
            lackOfTotalPower:false,
            stopEpochID:-1,
            isReserve,
            poolURL:poolContractStorage.poolURL,
            wssPoolURL:poolContractStorage.wssPoolURL
        
        }

        // Put the pointer to know the shard which store the pool's data(metadata+storages)
        // Pools' contract metadata & storage are in own shard. Also, reserve pools also here as you see below
        if(isReserve){

            atomicBatch.put(poolPubKey+'(POOL)_POINTER',poolContractStorage.reserveFor)

            idToAdd = poolContractStorage.reserveFor+':'+poolPubKey

            templateForQt.reserveFor = poolContractStorage.reserveFor

            poolsRegistryForEpochHandler.reservePools.push(poolPubKey)

        }else {

            atomicBatch.put(poolPubKey+'(POOL)_POINTER',poolPubKey)

            global.SYMBIOTE_META.VERIFICATION_THREAD.SID_TRACKER[poolPubKey] = 0

            poolsRegistryForEpochHandler.primePools.push(poolPubKey)

        }
        

        quorumThreadAtomicBatch.put(poolPubKey+'(POOL)_STORAGE_POOL',templateForQt)


        //Put metadata
        atomicBatch.put(idToAdd+'(POOL)',contractMetadataTemplate)

        //Put storage
        //NOTE: We just need a simple storage with ID="POOL"
        atomicBatch.put(idToAdd+'(POOL)_STORAGE_POOL',poolContractStorage)

        // Add the account for fees for each leader
        primePools.forEach(anotherValidatorPubKey=>{

            if(anotherValidatorPubKey!==poolPubKey){

                atomicBatch.put(BLAKE3(poolPubKey+':'+anotherValidatorPubKey),{
    
                    type:"account",
                    balance:0,
                    uno:0,
                    nonce:0,
                    rev_t:0
                
                })

            }

        })

        //________________________ Fill the state of KLY-EVM ________________________

        if(!isReserve){

            let evmStateForThisShard = global.GENESIS.EVM[poolPubKey]

            if(evmStateForThisShard){

                let evmKeys = Object.keys(evmStateForThisShard)
    
                for(let evmKey of evmKeys) {
    
                    let {isContract,balance,nonce,code,storage} = evmStateForThisShard[evmKey]
    
                    //Put KLY-EVM to KLY-EVM state db which will be used by Trie
    
                    if(isContract){
    
                        await KLY_EVM.putContract(evmKey,balance,nonce,code,storage)
    
                    }else{
                    
                        await KLY_EVM.putAccount(evmKey,balance,nonce)
                    }


                    let caseIgnoreAccountAddress = Buffer.from(evmKey.slice(2),'hex').toString('hex')

                    // Add assignment to shard
                    atomicBatch.put('SHARD_BIND:'+caseIgnoreAccountAddress,{shard:poolPubKey})
    
                }

            }

            global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_METADATA[poolPubKey] = {
        
                nextBlockIndex:Web3.utils.toHex(BigInt(0).toString()),
        
                parentHash:'0000000000000000000000000000000000000000000000000000000000000000',
        
                timestamp:Math.floor(epochTimestamp/1000)
        
            }

        }

    }


    //_______________________ Now add the data to state _______________________

    // * Each account / contract must have <shard> property to assign it to appropriate shard

    Object.keys(global.GENESIS.STATE).forEach(
    
        addressOrContractID => {

            if(global.GENESIS.STATE[addressOrContractID].type==='contract'){

                let {lang,balance,uno,storages,bytecode,shard} = global.GENESIS.STATE[addressOrContractID]

                let contractMeta = {

                    type:"contract",
                    lang,
                    balance,
                    uno,
                    storages,
                    bytecode
                
                } 

                //Write metadata first
                atomicBatch.put(shard+':'+addressOrContractID,contractMeta)

                //Finally - write genesis storage of contract sharded by contractID_STORAGE_ID => {}(object)
                for(let storageID of global.GENESIS.STATE[addressOrContractID].storages){

                    global.GENESIS.STATE[addressOrContractID][storageID].shard = shard

                    atomicBatch.put(shard+':'+addressOrContractID+'_STORAGE_'+storageID,global.GENESIS.STATE[addressOrContractID][storageID])

                }

            } else {

                let shardID = global.GENESIS.STATE[addressOrContractID].shard

                atomicBatch.put(shardID+':'+addressOrContractID,global.GENESIS.STATE[addressOrContractID]) //else - it's default account

            }

        }
        
    )


    /*
    
    Set the initial workflow version from genesis

    We keep the official semver notation x.y.z(major.minor.patch)

    You can't continue to work if QUORUM and major part of POOLS decided to vote for major update.
    
    However, if workflow_version has differences in minor or patch values - you can continue to work


    KLYNTAR threads holds only MAJOR version(VERIFICATION_THREAD and QUORUM_THREAD) because only this matter

    */

    //We update this during the verification process(in VERIFICATION_THREAD). Once we find the VERSION_UPDATE - update it !
    global.SYMBIOTE_META.VERIFICATION_THREAD.VERSION = global.GENESIS.VERSION

    //We update this during the work on QUORUM_THREAD. But initially, QUORUM_THREAD has the same version as VT
    global.SYMBIOTE_META.QUORUM_THREAD.VERSION = global.GENESIS.VERSION

    //Also, set the WORKFLOW_OPTIONS that will be changed during the threads' work

    global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS={...global.GENESIS.WORKFLOW_OPTIONS}

    global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS={...global.GENESIS.WORKFLOW_OPTIONS}



    
    await atomicBatch.write()

    await quorumThreadAtomicBatch.write()




    // Node starts to verify blocks from the first validator in genesis, so sequency matter
    
    global.SYMBIOTE_META.VERIFICATION_THREAD.SHARD_POINTER = startPool

    global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_STATE_ROOT = await KLY_EVM.getStateRoot()


    global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH = {

        id:0,

        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        poolsRegistry:JSON.parse(JSON.stringify(poolsRegistryForEpochHandler)),
        
        timestamp:epochTimestamp,

        quorum:[],

        leadersSequence:{}
    
    }
    

    //Make template, but anyway - we'll find checkpoints on hostchains
    global.SYMBIOTE_META.QUORUM_THREAD.EPOCH = {

        id:0,

        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        poolsRegistry:JSON.parse(JSON.stringify(poolsRegistryForEpochHandler)),

        timestamp:epochTimestamp,

        quorum:[],

        leadersSequence:{}
    
    }


    // Set the rubicon to stop tracking spent txs from WAITING_ROOMs of pools' contracts. Value means the checkpoint id lower edge
    // If your stake/unstake tx was below this line - it might be burned. However, the line is set by QUORUM, so it should be safe
    global.SYMBIOTE_META.VERIFICATION_THREAD.RUBICON = 0
    
    global.SYMBIOTE_META.QUORUM_THREAD.RUBICON = 0


    let nullHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

    let vtEpochHandler = global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH

    let qtEpochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH


    //We get the quorum for VERIFICATION_THREAD based on own local copy of VERIFICATION_STATS_PER_POOL state
    vtEpochHandler.quorum = GET_QUORUM(vtEpochHandler.poolsRegistry,global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS,nullHash)

    //...However, quorum for QUORUM_THREAD might be retrieved from VERIFICATION_STATS_PER_POOL of checkpoints. It's because both threads are async
    qtEpochHandler.quorum = GET_QUORUM(qtEpochHandler.poolsRegistry,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS,nullHash)


    //Finally, build the reassignment chains for current epoch in QT and VT

    await SET_LEADERS_SEQUENCE_FOR_SHARDS(qtEpochHandler,nullHash)

    vtEpochHandler.leadersSequence = JSON.parse(JSON.stringify(qtEpochHandler.leadersSequence))

},




PREPARE_SYMBIOTE=async()=>{

    //Loading spinner
    let initSpinner

    if(!global.CONFIG.PRELUDE.NO_SPINNERS){

        initSpinner = ora({
        
            color:'red',
        
            prefixText:`\u001b[38;5;${process.env.KLY_MODE==='main'?'23':'202'}m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})  \x1b[36;1mPreparing symbiote\x1b[0m`
        
        }).start()

    }


    //____________________________________________Prepare structures_________________________________________________


    //Contains default set of properties for major part of potential use-cases on symbiote
    global.SYMBIOTE_META = {

        VERSION:+(fs.readFileSync(PATH_RESOLVE('KLY_Workflows/dev_tachyon/version.txt')).toString()),
        
        MEMPOOL:[], //to hold onchain transactions here(contract calls,txs,delegations and so on)

   
        STATE_CACHE:new Map(), // ID => ACCOUNT_STATE

        QUORUM_THREAD_CACHE:new Map(), // ADDRESS => ACCOUNT_STATE

        STUFF_CACHE:new Map(),

        
        PEERS:[], // Peers to exchange data with

        //________________ CONSENSUS RELATED MAPPINGS(per epoch) _____________

        TEMP:new Map()
    
    }


    !fs.existsSync(process.env.CHAINDATA_PATH) && fs.mkdirSync(process.env.CHAINDATA_PATH)



    //___________________________Load functionality to verify/filter/transform txs_______________________________


    //Importnat and must be the same for symbiote at appropriate chunks of time
    await import(`./verifiers.js`).then(mod=>
    
        global.SYMBIOTE_META.VERIFIERS=mod.VERIFIERS
        
    )

    //Might be individual for each node
    global.SYMBIOTE_META.FILTERS=(await import(`./filters.js`)).default;


    //______________________________________Prepare databases and storages___________________________________________


    //Create subdirs due to rational solutions
    [
    
        'BLOCKS', // For blocks. BlockID => block
    
        'STATE', // Contains state of accounts, contracts, services, metadata and so on. The main database like NTDS.dit

        'EPOCH_DATA', // Contains epoch data - AEFPs, AFPs, etc.

        'QUORUM_THREAD_METADATA', // QUORUM_THREAD itself and other stuff

        //_______________________________ EVM storage _______________________________

        //'KLY_EVM' Contains state of EVM

        //'KLY_EVM_METADATA' Contains metadata for KLY-EVM pseudochain (e.g. blocks, logs and so on)
        

    ].forEach(
        
        dbName => global.SYMBIOTE_META[dbName]=level(process.env.CHAINDATA_PATH+`/${dbName}`,{valueEncoding:'json'})
        
    )
    

    global.SYMBIOTE_META.GENERATION_THREAD = await global.SYMBIOTE_META.BLOCKS.get('GT').catch(error=>
        
        error.notFound
        ?
        {
            
            epochFullId:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef#-1',

            epochIndex:0,
            
            prevHash:`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`, // "null" hash
            
            nextIndex:0 // so the first block will be with index 0
        
        }
        :
        (LOG(`Some problem with loading metadata of generation thread\nError:${error}`,'F'),process.exit(106))
                        
    )


    //Load from db or return empty object
    global.SYMBIOTE_META.QUORUM_THREAD = await global.SYMBIOTE_META.QUORUM_THREAD_METADATA.get('QT').catch(()=>({}))
        


    //________________Load metadata about symbiote-current hight,collaped height,height for export,etc.___________________


    
    global.SYMBIOTE_META.VERIFICATION_THREAD = await global.SYMBIOTE_META.STATE.get('VT').catch(error=>{

        if(error.notFound){

            //Default initial value
            return {
            
                SHARD_POINTER:'',

                VT_FINALIZATION_STATS:{}, // primePoolPubKey => {currentLeaderOnShard,index,hash}

                VERIFICATION_STATS_PER_POOL:{}, // PUBKEY => {index:'',hash:'',isReserve:boolean}

                KLY_EVM_STATE_ROOT:'', // General KLY-EVM state root
 
                KLY_EVM_METADATA:{}, // primePoolEd25519PubKey => {nextBlockIndex,parentHash,timestamp}

                TEMP_REASSIGNMENTS:{}, // epochID => primePool => {currentLeader:<uint - index of current shard leader based on REASSIGNMENT_CHAINS>,reassignments:{ReservePool=>{index,hash}}}

                SID_TRACKER:{}, // shardID(Ed25519 pubkey of prime pool) => index

                EPOCH:{} // epoch handler

            }

        }else{

            LOG(`Some problem with loading metadata of verification thread\nError:${error}`,'F')
            
            process.exit(105)

        }
        
    })

        
    if(global.SYMBIOTE_META.VERIFICATION_THREAD.VERSION===undefined){

        await LOAD_GENESIS()

        //______________________________________Commit the state of VT and QT___________________________________________

        await global.SYMBIOTE_META.STATE.put('VT',global.SYMBIOTE_META.VERIFICATION_THREAD)

        await global.SYMBIOTE_META.QUORUM_THREAD_METADATA.put('QT',global.SYMBIOTE_META.QUORUM_THREAD)

    }


    //________________________________________Set the state of KLY-EVM______________________________________________


    await KLY_EVM.setStateRoot(global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_STATE_ROOT)


    //_______________________________Check the version of QT and VT and if need - update________________________________
    



    if(IS_MY_VERSION_OLD('QUORUM_THREAD')){

        LOG(`New version detected on QUORUM_THREAD. Please, upgrade your node software`,'W')

        console.log('\n')
        console.log(fs.readFileSync(PATH_RESOLVE('images/events/update.txt')).toString())
    

        // Stop the node to update the software
        GRACEFUL_STOP()

    }


    if(IS_MY_VERSION_OLD('VERIFICATION_THREAD')){

        LOG(`New version detected on VERIFICATION_THREAD. Please, upgrade your node software`,'W')

        console.log('\n')
        console.log(fs.readFileSync(PATH_RESOLVE('images/events/update.txt')).toString())
    

        // Stop the node to update the software
        GRACEFUL_STOP()

    }


    let epochFullID = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.id


    if(global.SYMBIOTE_META.GENERATION_THREAD.epochFullId === epochFullID && !global.SYMBIOTE_META.GENERATION_THREAD.quorum){

        global.SYMBIOTE_META.GENERATION_THREAD.quorum = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.quorum

        global.SYMBIOTE_META.GENERATION_THREAD.majority = GET_MAJORITY(global.SYMBIOTE_META.QUORUM_THREAD.EPOCH)

    }

    //_________________________________Add the temporary data of current QT__________________________________________
    
    let quorumTemporaryDB = level(process.env.CHAINDATA_PATH+`/${epochFullID}`,{valueEncoding:'json'})
    
    global.SYMBIOTE_META.TEMP.set(epochFullID,{

        FINALIZATION_PROOFS:new Map(), // blockID => Map(quorumMemberPubKey=>SIG(prevBlockHash+blockID+blockHash+QT.EPOCH.HASH+"#"+QT.EPOCH.id)). Proofs that validator voted for block epochID:blockCreatorX:blockIndexY with hash H

        TEMP_CACHE:new Map(),  // simple key=>value mapping to be used as temporary cache for epoch
    
        FINALIZATION_STATS:new Map(), // mapping( validatorID => {index,hash,afp} ). Used to start voting for checkpoints.      Each pair is a special handler where key is a pubkey of appropriate validator and value is the ( index <=> id ) which will be in checkpoint
    
        EPOCH_EDGE_OPERATIONS_MEMPOOL:[],  // default mempool for epoch edge operations
        
        SYNCHRONIZER:new Map(), // used as mutex to prevent async changes of object | multiple operations with several await's | etc.

        SHARDS_LEADERS_HANDLERS:new Map(), // primePoolPubKey => {currentLeader:<number>} | ReservePool => PrimePool


        //____________________Mapping which contains temporary databases for____________________

        DATABASE:quorumTemporaryDB // DB with temporary data that we need during epoch    

    })


    // Fill the FINALIZATION_STATS with the latest, locally stored data

    await RESTORE_STATE()


    //__________________________________Decrypt private key to memory of process__________________________________



    await DECRYPT_KEYS(initSpinner).then(()=>
    
        //Print just first few bytes of keys to view that they were decrypted well.Looks like checksum
        LOG(`Private key was decrypted successfully`,'S')        
    
    ).catch(error=>{
    
        LOG(`Keys decryption failed.Please,check your password carefully.In the worst case-use your decrypted keys from safezone and repeat procedure of encryption via CLI\n${error}`,'F')
 
        process.exit(107)

    })

},




BUILD_TEMPORARY_SEQUENCE_OF_VERIFICATION_THREAD=async()=>{

    /*
    
        [+] In this function we should time by time ask for ALRPs for pools to build the reassignment chains

        [+] Use VT.TEMP_REASSIGNMENTS


        Based on current epoch in QUORUM_THREAD - build the temporary reassignments
    
    */


    let verificationThread = global.SYMBIOTE_META.VERIFICATION_THREAD

    let tempReassignmentOnVerificationThread = verificationThread.TEMP_REASSIGNMENTS

    let vtEpochHandler = verificationThread.EPOCH

    let vtEpochFullID = vtEpochHandler.hash+'#'+vtEpochHandler.id

    let vtLeadersSequences = vtEpochHandler.leadersSequence


    if(!tempReassignmentOnVerificationThread[vtEpochFullID]){

        tempReassignmentOnVerificationThread[vtEpochFullID] = {} // create empty template

        // Fill with data from here. Structure: primePool => [reservePool0,reservePool1,...,reservePoolN]

        for(let primePoolPubKey of vtEpochHandler.poolsRegistry.primePools){
            
            tempReassignmentOnVerificationThread[vtEpochFullID][primePoolPubKey] = {

                currentLeader:-1, // -1 means that it's prime pool itself. Indexes 0,1,2...N are the pointers to reserve pools in VT.REASSIGNMENT_CHAINS
                
                currentToVerify:-1, // to start the verification in START_VERIFICATION_THREAD from prime pool(-1 index) and continue with reserve pools(0,1,2,...N)

                reassignments:{} // poolPubKey => {index,hash}

            }

        }

    }


    //________________________________ Start to find ________________________________

    // TODO: Choose only several random sources instead of the whole quorum

    let quorumMembers = await GET_QUORUM_URLS_AND_PUBKEYS(true)

    let randomTarget = GET_RANDOM_FROM_ARRAY(quorumMembers)
    
    //___________________Ask quorum member about reassignments. Grab this results, verify the proofs and build the temporary reassignment chains___________________

    let localVersionOfCurrentLeaders = {} // primePoolPubKey => assumptionAboutIndexOfCurrentLeader

    for(let primePoolPubKey of vtEpochHandler.poolsRegistry.primePools){

        localVersionOfCurrentLeaders[primePoolPubKey] = tempReassignmentOnVerificationThread[vtEpochFullID][primePoolPubKey].currentLeader

    }


    // Make request to /data_to_build_temp_data_for_verification_thread. Returns => {primePoolPubKey(shardID):<aggregatedSkipProofForProposedLeader>}

    let optionsToSend = {

        method: 'POST',

        body: JSON.stringify(localVersionOfCurrentLeaders)

    }

    let response = await fetch(randomTarget.url+'/data_to_build_temp_data_for_verification_thread',optionsToSend).then(r=>r.json()).catch(()=>({}))


    /*
        
        The response has the following structure:

        [0] - {err:'Some error text'} - ignore, do nothing

        [1] - Object with this structure

        {

            primePool0:{proposedLeaderIndex,firstBlockByProposedLeader,afpForSecondBlockProposedLeader},

            primePool1:{proposedLeaderIndex,firstBlockByProposedLeader,afpForSecondBlockProposedLeader},

            ...

            primePoolN:{proposedLeaderIndex,firstBlockByProposedLeader,afpForSecondBlockProposedLeader}

        }


        -----------------------------------------------[Decomposition]-----------------------------------------------


        [0] proposedAuthorityIndex - index of current authority for subchain X. To get the pubkey of subchain authority - take the QUORUM_THREAD.EPOCH.reassignmentChains[<primePool>][proposedAuthorityIndex]

        [1] firstBlockByCurrentAuthority - default block structure with ASP for all the previous pools in a queue

        [2] afpForSecondBlockByCurrentAuthority - default AFP structure -> 


            {
                prevBlockHash:<string>              => it should be the hash of <firstBlockByCurrentAuthority>
                blockID:<string>,
                blockHash:<string>,
                proofs:{

                    quorumMemberPubKey0:ed25519Signa,
                    ...                                             => Signa is prevBlockHash+blockID+hash+QT.EPOCH.HASH+"#"+QT.EPOCH.id
                    quorumMemberPubKeyN:ed25519Signa,

                }
                         
            }


            -----------------------------------------------[What to do next?]-----------------------------------------------
        
            Compare the <proposedAuthorityIndex> with our local pointer tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePool].currentAuthority

            In case our local version has bigger index - ignore

            In case proposed version has bigger index it's a clear signal that some of reassignments occured and we need to update our local data

            For this:

                0) Verify that this block was approved by quorum majority(2/3N+1) by checking the <afpForSecondBlockByCurrentAuthority>

                If all the verification steps is OK - add to some cache

                ---------------------------------[After the verification of all the responses?]---------------------------------

                Start to build the temporary reassignment chains

    */

    for(let [primePoolPubKey, metadata] of Object.entries(response)){

        if(typeof primePoolPubKey === 'string' && typeof metadata==='object'){

            let {proposedIndexOfLeader,firstBlockByCurrentLeader,afpForSecondBlockByCurrentLeader} = metadata
    
            if(typeof proposedIndexOfLeader === 'number' && typeof firstBlockByCurrentLeader === 'object' && typeof afpForSecondBlockByCurrentLeader==='object'){
                  
                if(localVersionOfCurrentLeaders[primePoolPubKey] <= proposedIndexOfLeader && firstBlockByCurrentLeader.index === 0){

                    // Verify the AFP for second block(with index 1 in epoch) to make sure that block 0(first block in epoch) was 100% accepted
    
                    let afpIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(afpForSecondBlockByCurrentLeader,vtEpochHandler)
    
                    afpIsOk &&= afpForSecondBlockByCurrentLeader.prevBlockHash === Block.genHash(firstBlockByCurrentLeader)

                    if(afpIsOk){

                        // Verify all the ALRPs in block header
    
                        let {isOK,filteredReassignments:filteredReassignmentsInBlockOfProposedLeader} = await CHECK_ALRP_CHAIN_VALIDITY(
                                
                            primePoolPubKey, firstBlockByCurrentLeader, vtLeadersSequences[primePoolPubKey], proposedIndexOfLeader, vtEpochFullID, vtEpochHandler, true
                            
                        )

                        let shouldChangeThisShard = true

                        if(isOK){

                            let collectionOfAlrpsFromAllThePreviousLeaders = [filteredReassignmentsInBlockOfProposedLeader] // each element here is object like {pool:{index,hash,firstBlockHash}}

                            let currentAlrpSet = {...filteredReassignmentsInBlockOfProposedLeader}

                            let position = proposedIndexOfLeader-1


                            /*
                            
                            ________________ What to do next? ________________

                            Now we know that proposed leader has created some first block(firstBlockByProposedLeader)

                            and we verified the AFP so it's clear proof that block is 100% accepted and the data inside is valid and will be a part of epoch data



                            Now, start the cycle in reverse order on range

                            [proposedLeaderIndex-1 ; localVersionOfCurrentLeaders[primePoolPubKey]]
                            
                            

                            
                            */

                            if(position>=localVersionOfCurrentLeaders[primePoolPubKey]){

                                while(true){

                                    for(; position >= localVersionOfCurrentLeaders[primePoolPubKey] ; position--){

                                        let poolOnThisPosition = position === -1 ? primePoolPubKey : vtLeadersSequences[primePoolPubKey][position]
    
                                        let alrpForThisPoolFromCurrentSet = currentAlrpSet[poolOnThisPosition]
    
                                        if(alrpForThisPoolFromCurrentSet.index !== -1){
    
                                            // Ask the first block and extract next set of ALRPs
    
                                            let firstBlockInThisEpochByPool = await GET_BLOCK(vtEpochHandler.id,poolOnThisPosition,0)
    
                                            // Compare hashes to make sure it's really the first block by pool X in epoch Y
    
                                            if(firstBlockInThisEpochByPool && Block.genHash(firstBlockInThisEpochByPool) === alrpForThisPoolFromCurrentSet.firstBlockHash){
                            
                                                let alrpChainValidation = position === -1 ? {isOK:true,filteredReassignments:{}} : await CHECK_ALRP_CHAIN_VALIDITY(
                                                    
                                                    primePoolPubKey, firstBlockInThisEpochByPool, vtLeadersSequences[primePoolPubKey], position, vtEpochFullID, vtEpochHandler, true
                                                    
                                                )
                            
                                                if(alrpChainValidation.isOK){
    
                                                    // If ok - fill the <potentialReassignments>
    
                                                    collectionOfAlrpsFromAllThePreviousLeaders.push(alrpChainValidation.filteredReassignments)
    
                                                    currentAlrpSet = alrpChainValidation.filteredReassignments
    
                                                    break
    
                                                }else{
    
                                                    shouldChangeThisShard = false
    
                                                    break
    
                                                }
    
                                            }else{
    
                                                shouldChangeThisShard = false
    
                                                break
    
                                            }
    
                                        }
    
                                    }

                                    if(!shouldChangeThisShard || position === localVersionOfCurrentLeaders[primePoolPubKey]) break

                                }


                                // Now, <collectionOfAlrpsFromAllThePreviousLeaders> is array of objects like {pool:{index,hash,firstBlockHash}}
                                // We need to reverse it and fill the temp data for VT

                                if(shouldChangeThisShard){

                                    // Update the reassignment data

                                    let tempReassignmentChain = tempReassignmentOnVerificationThread[vtEpochFullID][primePoolPubKey].reassignments // poolPubKey => {index,hash}


                                    for(let reassignStats of collectionOfAlrpsFromAllThePreviousLeaders.reverse()){

                                        // collectionOfAlrpsFromAllThePreviousLeaders[i] = {primePool:{index,hash},pool0:{index,hash},poolN:{index,hash}}

                                        for(let [poolPubKey,descriptor] of Object.entries(reassignStats)){

                                            if(!tempReassignmentChain[poolPubKey]) tempReassignmentChain[poolPubKey] = descriptor
                
                                        }

                                    }

                                    // Finally, set the <currentAuthority> to the new pointer

                                    tempReassignmentOnVerificationThread[vtEpochFullID][primePoolPubKey].currentLeader = proposedIndexOfLeader


                                }

                            }

                        }

                    }

                }

            } 
        
        }

    }
        
    setTimeout(BUILD_TEMPORARY_SEQUENCE_OF_VERIFICATION_THREAD,global.CONFIG.SYMBIOTE.TEMPORARY_REASSIGNMENTS_BUILDER_TIMEOUT)

},




RUN_SYMBIOTE=async()=>{

    await PREPARE_SYMBIOTE()


    //_________________________ RUN SEVERAL ASYNC THREADS _________________________

    //✅0.Start verification process - process blocks and find new epoch step-by-step
    START_VERIFICATION_THREAD()

    //✅1.Thread to find AEFPs and change the epoch for QT
    FIND_AGGREGATED_EPOCH_FINALIZATION_PROOFS()

    //✅2.Share our blocks within quorum members and get the finalization proofs
    SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS()

    //✅3.Thread to propose AEFPs to move to next epoch
    CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH()

    //✅4.Thread to track changes of leaders on shards
    SHARDS_LEADERS_MONITORING()

    //✅5.Function to build the temporary sequence of blocks to verify them
    BUILD_TEMPORARY_SEQUENCE_OF_VERIFICATION_THREAD()

    //✅6.Start to generate blocks
    BLOCKS_GENERATION()



    //Check if bootstrap nodes is alive
    global.CONFIG.SYMBIOTE.BOOTSTRAP_NODES.forEach(endpoint=>
                
        fetch(endpoint+'/addpeer',{method:'POST',body:JSON.stringify([global.GENESIS.SYMBIOTE_ID,global.CONFIG.SYMBIOTE.MY_HOSTNAME])})
            
            .then(res=>res.text())
            
            .then(val=>LOG(val==='OK'?`Received pingback from \x1b[32;1m${endpoint}\x1b[36;1m. Node is \x1b[32;1malive`:`\x1b[36;1mAnswer from bootstrap \x1b[32;1m${endpoint}\x1b[36;1m => \x1b[34;1m${val}`,'I'))
            
            .catch(error=>LOG(`Bootstrap node \x1b[32;1m${endpoint}\x1b[31;1m send no response or some error occured \n${error}`,'F'))

    )

}