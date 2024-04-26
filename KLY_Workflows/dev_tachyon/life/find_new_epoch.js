import {
    
    EPOCH_STILL_FRESH,GET_FIRST_BLOCK_ON_EPOCH,GET_FROM_APPROVEMENT_THREAD_STATE,GET_MAJORITY,GET_QUORUM,GET_QUORUM_URLS_AND_PUBKEYS,
    
    IS_MY_VERSION_OLD, VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF

} from '../utils.js'

import {GRACEFUL_STOP, SET_LEADERS_SEQUENCE_FOR_SHARDS, BLOCKCHAIN_DATABASES, WORKING_THREADS, GLOBAL_CACHES, EPOCH_METADATA_MAPPING} from '../blockchain_preparation.js'

import EPOCH_EDGE_OPERATIONS_VERIFIERS from '../verification_process/epoch_edge_operations_verifiers.js'

import {BLAKE3, COLORS, LOG, PATH_RESOLVE} from '../../../KLY_Utils/utils.js'

import {GET_BLOCK} from '../verification_process/verification.js'

import {CONFIGURATION} from '../../../klyn74r.js'

import Block from '../essences/block.js'

import level from 'level'

import fs from 'fs'




let DELETE_POOLS_WITH_LACK_OF_STAKING_POWER = async (validatorPubKey,fullCopyOfQuorumThread) => {

    // Try to get storage "POOL" of appropriate pool

    let poolStorage = await GET_FROM_APPROVEMENT_THREAD_STATE(validatorPubKey+'(POOL)_STORAGE_POOL')


    poolStorage.lackOfTotalPower = true

    poolStorage.stopEpochID = fullCopyOfQuorumThread.EPOCH.id

    
    // Remove from POOLS array(to prevent be elected to quorum) and metadata

    let arrayToDeleteFrom = fullCopyOfQuorumThread.EPOCH.poolsRegistry[ poolStorage.isReserve ? 'reservePools' : 'primePools' ]

    let indexToDelete = arrayToDeleteFrom.indexOf(validatorPubKey)

    arrayToDeleteFrom.splice(indexToDelete,1)


}




let EXECUTE_EPOCH_EDGE_OPERATIONS = async (atomicBatch,fullCopyOfQuorumThread,epochEdgeOperations) => {

    
    //_______________________________Perform SPEC_OPERATIONS_____________________________

    let workflowOptionsTemplate = {...fullCopyOfQuorumThread.WORKFLOW_OPTIONS}
    
    GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.set('WORKFLOW_OPTIONS',workflowOptionsTemplate)
    
    // Structure is <poolID> => true if pool should be deleted
    GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.set('SLASH_OBJECT',{})
    

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
                type:<TYPE> - type from './epoch_edge_operations_verifiers.js' to perform this operation
                payload:<PAYLOAD> - operation body. More detailed about structure & verification process here => ./epoch_edge_operations_verifiers.js
            }
            
        */
        await EPOCH_EDGE_OPERATIONS_VERIFIERS[operation.type](operation.payload,false,true,fullCopyOfQuorumThread)
    
    }

    //_______________________Remove pools if lack of staking power_______________________

    let epochHandlerReference = fullCopyOfQuorumThread.EPOCH

    let toRemovePools = [], promises = [], allThePools = epochHandlerReference.poolsRegistry.primePools.concat(epochHandlerReference.poolsRegistry.reservePools)


    for(let poolPubKey of allThePools){

        let promise = GET_FROM_APPROVEMENT_THREAD_STATE(poolPubKey+'(POOL)_STORAGE_POOL').then(poolStorage=>{

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

    
    let slashObject = await GET_FROM_APPROVEMENT_THREAD_STATE('SLASH_OBJECT')
    
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
        GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.delete(poolIdentifier+'(POOL)_STORAGE_POOL')

    }


    // Update the WORKFLOW_OPTIONS
    fullCopyOfQuorumThread.WORKFLOW_OPTIONS={...workflowOptionsTemplate}

    GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.delete('WORKFLOW_OPTIONS')

    GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.delete('SLASH_OBJECT')


    //After all ops - commit state and make changes to workflow

    GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.forEach((value,recordID)=>{

        atomicBatch.put(recordID,value)

    })


}





//Use it to find checkpoints on hostchains, perform them and join to QUORUM by finding the latest valid checkpoint
export let FIND_AGGREGATED_EPOCH_FINALIZATION_PROOFS=async()=>{


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

                [*] WORKING_THREADS.APPROVEMENT_THREAD.WORKFLOW_OPTIONS.MAX_NUM_OF_BLOCKS_PER_SHARD_FOR_SYNC_OPS - 1 by default. Don't change it
                
                    This value shows how many first blocks we need to get to extract epoch edge operations to execute before move to next epoch
                    
                    Epoch edge operations used mostly for staking/unstaking operations, to change network params(e.g. epoch time, minimal stake,etc.)
 
            
        4. Now try to find our own assumption about the first block in epoch locally

            For this, iterate over reassignment chains:
            
            
            for(shardID of shards){

                ------Find first block for prime pool here------

                Otherwise - try to find first block created by other pools on this shard

                for(pool of leadersSequence[shardID])

            }
                        
            and try to find AFP_FOR_FIRST_BLOCK => await BLOCKCHAIN_DATABASES.EPOCH_DATA.get('AFP:epochID:PubKey:0').catch(()=>false)

            If we can't get it - make call to GET /aggregated_finalization_proof/:BLOCK_ID to quorum members

            In case we have AFP for the first block(with index 0) - it's a clear proof that block 0 is 100% accepted by network and we can get the hash of first block from here:

                AFP_FOR_FIRST_BLOCK.blockHash
 

        6. Once we find all of them - extract EPOCH_EDGE_OPERATIONS from block headers and run it in a sync mode

        7. Increment value of checkpoint index(checkpoint.id) and recount new hash(checkpoint.hash)
    
        8. Prepare new object in TEMP(checkpointFullID) and set new version of checkpoint on QT
    
    
    */

    if(!EPOCH_STILL_FRESH(WORKING_THREADS.APPROVEMENT_THREAD)){

        let qtEpochHandler = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH

        let oldEpochFullID = qtEpochHandler.hash+"#"+qtEpochHandler.id
    
        let temporaryObject = EPOCH_METADATA_MAPPING.get(oldEpochFullID)
    
        if(!temporaryObject){
    
            setTimeout(FIND_AGGREGATED_EPOCH_FINALIZATION_PROOFS,3000)
    
            return
    
        }


        // let numberOfFirstBlocksToFetchFromEachShard = WORKING_THREADS.APPROVEMENT_THREAD.WORKFLOW_OPTIONS.MAX_NUM_OF_BLOCKS_PER_SHARD_FOR_SYNC_OPS // 1. DO NOT CHANGE

        let totalNumberOfShards = 0

        let totalNumberOfReadyShards = 0

        let leadersSequence = qtEpochHandler.leadersSequence

        let majority = GET_MAJORITY(qtEpochHandler)

        let allKnownPeers = await GET_QUORUM_URLS_AND_PUBKEYS()

        // Get the special object from DB not to repeat requests

        let epochCache = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get(`EPOCH_CACHE:${oldEpochFullID}`).catch(()=>null) || {} // {shardID:{firstBlockCreator,firstBlockHash,aefp,firstBlockOnShardFound}}

        let entries = Object.entries(leadersSequence)

        //____________________Ask the quorum for AEFP for shard___________________
        
        for(let [primePoolPubKey] of entries){
        
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

                let aefp = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get(`AEFP:${qtEpochHandler.id}:${primePoolPubKey}`).catch(()=>false)

                if(aefp){

                    epochCache[primePoolPubKey].aefp = aefp

                }else{

                    // Ask quorum for AEFP
                    for(let peerURL of allKnownPeers){
            
                        let itsProbablyAggregatedEpochFinalizationProof = await fetch(peerURL+`/aggregated_epoch_finalization_proof/${qtEpochHandler.id}/${primePoolPubKey}`).then(r=>r.json()).catch(()=>false)
                
                        if(itsProbablyAggregatedEpochFinalizationProof){
                
                            let aefpPureObject = await VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF(itsProbablyAggregatedEpochFinalizationProof,qtEpochHandler.quorum,majority,oldEpochFullID)
    
                            if(aefpPureObject && aefpPureObject.shard === primePoolPubKey){
    
                                epochCache[primePoolPubKey].aefp = aefpPureObject

                                // Store locally

                                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`AEFP:${qtEpochHandler.id}:${primePoolPubKey}`,aefpPureObject).catch(()=>{})

                                // No sense to find more

                                break
    
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

                let findResult = await GET_FIRST_BLOCK_ON_EPOCH(qtEpochHandler,primePoolPubKey,GET_BLOCK)

                if(findResult){

                    epochCache[primePoolPubKey].firstBlockCreator = findResult.firstBlockCreator

                    epochCache[primePoolPubKey].firstBlockHash = findResult.firstBlockHash

                    epochCache[primePoolPubKey].firstBlockOnShardFound = true // if we get the block 0 by prime pool - it's 100% the first block

                }

            }

            
            //___________________ Here we should have understanding of first block for each shard on this epoch __________________________

            if(epochCache[primePoolPubKey].firstBlockOnShardFound && epochCache[primePoolPubKey].aefp) totalNumberOfReadyShards++

            if(!epochCache[primePoolPubKey].firstBlockHash) epochCache[primePoolPubKey] = {}
    
        
        }

        // Store the changes in CHECKPOINT_CACHE for persistence

        await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`EPOCH_CACHE:${oldEpochFullID}`,epochCache).catch(()=>false)


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
                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`EEO:${oldEpochFullID}`,epochEdgeOperations).catch(()=>false)


                // Store the legacy data about this epoch that we'll need in future - epochFullID,quorum,majority
                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`LEGACY_DATA:${qtEpochHandler.id}`,{

                    epochFullID:oldEpochFullID,
                    quorum:qtEpochHandler.quorum,
                    majority

                }).catch(()=>false)


                // We need it for changes
                let fullCopyOfQuorumThread = JSON.parse(JSON.stringify(WORKING_THREADS.APPROVEMENT_THREAD))

                // All operations must be atomic
                let atomicBatch = BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.batch()


                // Execute epoch edge operations from new checkpoint using our copy of QT and atomic handler
                await EXECUTE_EPOCH_EDGE_OPERATIONS(atomicBatch,fullCopyOfQuorumThread,epochEdgeOperations)

               
                // Now, after the execution we can change the checkpoint id and get the new hash + prepare new temporary object
                
                let nextEpochId = qtEpochHandler.id + 1

                let nextEpochHash = BLAKE3(JSON.stringify(firstBlocksHashes))

                let nextEpochFullID = nextEpochHash+'#'+nextEpochId


                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`NEXT_EPOCH_HASH:${oldEpochFullID}`,nextEpochHash).catch(()=>false)


                // After execution - create the reassignment chains
                await SET_LEADERS_SEQUENCE_FOR_SHARDS(fullCopyOfQuorumThread.EPOCH,nextEpochHash)

                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`NEXT_EPOCH_LS:${oldEpochFullID}`,fullCopyOfQuorumThread.EPOCH.leadersSequence).catch(()=>false)


                LOG(`\u001b[38;5;154mEpoch edge operations were executed for epoch \u001b[38;5;93m${oldEpochFullID} (QT)\u001b[0m`,COLORS.GREEN)

                //_______________________ Update the values for new epoch _______________________

                fullCopyOfQuorumThread.EPOCH.startTimestamp = qtEpochHandler.startTimestamp + fullCopyOfQuorumThread.WORKFLOW_OPTIONS.EPOCH_TIME

                fullCopyOfQuorumThread.EPOCH.id = nextEpochId

                fullCopyOfQuorumThread.EPOCH.hash = nextEpochHash

                fullCopyOfQuorumThread.EPOCH.quorum = GET_QUORUM(fullCopyOfQuorumThread.EPOCH.poolsRegistry,fullCopyOfQuorumThread.WORKFLOW_OPTIONS,nextEpochHash)

                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`NEXT_EPOCH_QUORUM:${oldEpochFullID}`,fullCopyOfQuorumThread.EPOCH.quorum).catch(()=>false)
                
                // Create new temporary db for the next epoch
                let nextTempDB = level(process.env.CHAINDATA_PATH+`/${nextEpochFullID}`,{valueEncoding:'json'})

                // Commit changes
                atomicBatch.put('AT',fullCopyOfQuorumThread)

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


                WORKING_THREADS.APPROVEMENT_THREAD = fullCopyOfQuorumThread

                LOG(`Epoch on quorum thread was updated => \x1b[34;1m${nextEpochHash}#${nextEpochId}`,COLORS.GREEN)


                //_______________________Check the version required for the next checkpoint________________________


                if(IS_MY_VERSION_OLD('APPROVEMENT_THREAD')){

                    LOG(`New version detected on APPROVEMENT_THREAD. Please, upgrade your node software`,COLORS.YELLOW)

                    console.log('\n')
                    console.log(fs.readFileSync(PATH_RESOLVE('images/events/update.txt')).toString())
        
                    // Stop the node to update the software
                    GRACEFUL_STOP()

                }


                // Close & delete the old temporary db
            
                await EPOCH_METADATA_MAPPING.get(oldEpochFullID).DATABASE.close()
        
                fs.rm(process.env.CHAINDATA_PATH+`/${oldEpochFullID}`,{recursive:true},()=>{})
        
                EPOCH_METADATA_MAPPING.delete(oldEpochFullID)

                
                
                //________________________________ If it's fresh checkpoint and we present there as a member of quorum - then continue the logic ________________________________


                let iAmInTheQuorum = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.quorum.includes(CONFIGURATION.NODE_LEVEL.PUBLIC_KEY)


                if(EPOCH_STILL_FRESH(WORKING_THREADS.APPROVEMENT_THREAD) && iAmInTheQuorum){

                    // Fill the checkpoints manager with the latest data

                    let currentEpochManager = nextTemporaryObject.FINALIZATION_STATS

                    WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.poolsRegistry.primePools.forEach(poolPubKey=>

                        currentEpochManager.set(poolPubKey,{index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}})

                    )

                    WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.poolsRegistry.reservePools.forEach(poolPubKey=>

                        currentEpochManager.set(poolPubKey,{index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}})

                    )


                }

                // Set next temporary object by ID

                EPOCH_METADATA_MAPPING.set(nextEpochFullID,nextTemporaryObject)

                // Delete the cache that we don't need more

                await BLOCKCHAIN_DATABASES.EPOCH_DATA.del(`EPOCH_CACHE:${oldEpochFullID}`).catch(()=>{})


            }

        }

        // Continue to find checkpoints
        setImmediate(FIND_AGGREGATED_EPOCH_FINALIZATION_PROOFS)

    }else{

        setTimeout(FIND_AGGREGATED_EPOCH_FINALIZATION_PROOFS,3000)

    }

}