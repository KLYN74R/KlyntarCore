import {GRACEFUL_STOP, BLOCKCHAIN_DATABASES, WORKING_THREADS, GLOBAL_CACHES, EPOCH_METADATA_MAPPING} from '../blockchain_preparation.js'

import {getCurrentEpochQuorum, getQuorumMajority, getQuorumUrlsAndPubkeys} from '../common_functions/quorum_related.js'

import {verifyAggregatedEpochFinalizationProof} from '../common_functions/work_with_proofs.js'

import {blake3Hash, logColors, customLog, pathResolve} from '../../../KLY_Utils/utils.js'

import {verifyTxSignatureAndVersion} from '../verification_process/txs_verifiers.js'

import {getUserAccountFromState} from '../common_functions/state_interactions.js'

import {setLeadersSequenceForShards} from './shards_leaders_monitoring.js'

import {EPOCH_EDGE_SYSTEM_CONTRACTS} from '../system_contracts/root.js'

import {getBlock} from '../verification_process/verification.js'

import {epochStillFresh, isMyCoreVersionOld} from '../utils.js'

import {CONFIGURATION} from '../../../klyn74r.js'

import Block from '../structures/block.js'

import level from 'level'

import fs from 'fs'




export let executeEpochEdgeTransaction = async(threadID,tx) => {


       /*

        Reminder: full tx structure is

        {
            
            v,
            fee:<zero for epoch edge txs>,
            creator:tx.creator,
            type:<always WVM_CALL>,
            nonce:<any, doesn't matter for epoch edge txs>,
            payload,
            sig

        }
    
        tx.payload is

        {

            contractID:<BLAKE3 hashID of contract OR alias of contract>,
            method:<string method to call>,
            gasLimit:<maximum allowed in KLY to execute contract>,
            params:[] params to pass to function,
            imports:[] imports which should be included to contract instance to call. Example ['default.CROSS-CONTRACT','storage.GET_FROM_ARWEAVE']. As you understand, it's form like <MODULE_NAME>.<METHOD_TO_IMPORT>

        }

    */

    let syncTxOverviewIsOk = typeof tx.payload?.contractID==='string' && tx.payload.contractID.length<=256 && typeof tx.payload.method==='string' && Array.isArray(tx.payload.params) && Array.isArray(tx.payload.imports)

    let filteredTransaction

    if(syncTxOverviewIsOk){

        let shardOfTxCreator = tx.payload.params[1]

        let creatorAccount = await getUserAccountFromState(shardOfTxCreator+':'+tx.creator)
    
        let result = await verifyTxSignatureAndVersion(threadID,tx,creatorAccount,shardOfTxCreator).catch(()=>false)

        if(result){
        
            filteredTransaction = {
                
                v:tx.v,
                fee:tx.fee,
                creator:tx.creator,
                type:tx.type,
                nonce:tx.nonce,
                payload:tx.payload,
                sig:tx.sig
            
            }
    
        }

    }
    
    if(filteredTransaction && tx.payload.params[0]){

        let {contractID, method} = tx.payload.params[0]

        let contractEntity = EPOCH_EDGE_SYSTEM_CONTRACTS.get(contractID)

        if(contractEntity && contractEntity[method]){

            await contractEntity[method](threadID,tx).catch(()=>{})

        }

    }

}




// Use it to find checkpoints on hostchains, perform them and join to QUORUM by finding the latest valid checkpoint

export let findAefpsAndFirstBlocksForCurrentEpoch=async()=>{


    //_________________________FIND THE NEXT CHECKPOINT AND EXECUTE EPOCH EDGE TRANSACTIONS INSTANTLY_____________________________

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

                [*] WORKING_THREADS.APPROVEMENT_THREAD.NETWORK_PARAMETERS.MAX_NUM_OF_BLOCKS_PER_SHARD_FOR_SYNC_OPS - 1 by default. Don't change it
                
                    This value shows how many first blocks we need to get to extract epoch edge transactions to execute before move to next epoch
                    
                    Epoch edge transactions used mostly for staking/unstaking operations, to change network params(e.g. epoch time, minimal stake,etc.)
 
            
        4. Now try to find our own assumption about the first block in epoch locally

            For this, iterate over leaders sequences for shards:
            
            
            for(shardID of shards){

                Try to find first block created by other pools on this shard

                for(pool of leadersSequence[shardID])

            }
                        
            and try to find AFP_FOR_FIRST_BLOCK => await BLOCKCHAIN_DATABASES.EPOCH_DATA.get('AFP:epochID:PubKey:0').catch(()=>false)

            If we can't get it - make call to GET /aggregated_finalization_proof/:BLOCK_ID to quorum members

            In case we have AFP for the first block(with index 0) - it's a clear proof that block 0 is 100% accepted by network and we can get the hash of first block from here:

                AFP_FOR_FIRST_BLOCK.blockHash
 

        6. Once we find all of them - extract EPOCH_EDGE_TRANSACTIONS from block headers and run it in a sync mode

        7. Increment value of checkpoint index(checkpoint.id) and recount new hash(checkpoint.hash)
    
        8. Prepare new object in TEMP(checkpointFullID) and set new version of checkpoint on AT
    
    
    */

    if(!epochStillFresh(WORKING_THREADS.APPROVEMENT_THREAD)){

        let currentEpochHandler = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH

        let currentEpochFullID = currentEpochHandler.hash+"#"+currentEpochHandler.id
    
        let temporaryObject = EPOCH_METADATA_MAPPING.get(currentEpochFullID)
    
        if(!temporaryObject){
    
            setTimeout(findAefpsAndFirstBlocksForCurrentEpoch,3000)
    
            return
    
        }


        // let numberOfFirstBlocksToFetchFromEachShard = WORKING_THREADS.APPROVEMENT_THREAD.NETWORK_PARAMETERS.MAX_NUM_OF_BLOCKS_PER_SHARD_FOR_SYNC_OPS

        let totalNumberOfShards = 0

        let totalNumberOfReadyShards = 0

        let leadersSequence = currentEpochHandler.leadersSequence

        let majority = getQuorumMajority(currentEpochHandler)

        let allKnownPeers = await getQuorumUrlsAndPubkeys()



        let aefpAndFirstBlockData = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get(`FIRST_BLOCKS_DATA_AND_AEFPS:${currentEpochFullID}`).catch(()=>({})) // {shardID:{firstBlockCreator,firstBlockHash,aefp}}

        let entries = Object.entries(leadersSequence)

        //____________________Ask the quorum for AEFP for shard___________________
        
        for(let [shardID] of entries){
        
            totalNumberOfShards++
        
            if(!aefpAndFirstBlockData[shardID]) aefpAndFirstBlockData[shardID] = {}

            if(aefpAndFirstBlockData[shardID].aefp && aefpAndFirstBlockData[shardID].firstBlockHash){

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
                        shard:<ID of shard>,
                        lastLeader:<index of ed25519 pubkey of some pool in sequence of pool for this shard in current epoch>,
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

            
            if(!aefpAndFirstBlockData[shardID].aefp){

                // Try to find locally

                let aefp = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get(`AEFP:${currentEpochHandler.id}:${shardID}`).catch(()=>false)

                if(aefp){

                    aefpAndFirstBlockData[shardID].aefp = aefp

                }else{

                    // Ask quorum for AEFP
                    for(let peerURL of allKnownPeers){
            
                        let itsProbablyAggregatedEpochFinalizationProof = await fetch(peerURL+`/aggregated_epoch_finalization_proof/${currentEpochHandler.id}/${shardID}`).then(r=>r.json()).catch(()=>false)
                
                        if(itsProbablyAggregatedEpochFinalizationProof){
                
                            let aefpPureObject = await verifyAggregatedEpochFinalizationProof(itsProbablyAggregatedEpochFinalizationProof,currentEpochHandler.quorum,majority,currentEpochFullID)
    
                            if(aefpPureObject && aefpPureObject.shard === shardID){
    
                                aefpAndFirstBlockData[shardID].aefp = aefpPureObject

                                // Store locally

                                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`AEFP:${currentEpochHandler.id}:${shardID}`,aefpPureObject).catch(()=>{})

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

            if(!aefpAndFirstBlockData[shardID].firstBlockHash){

                // Structure is {firstBlockCreator,firstBlockHash}
            
                let storedFirstBlockData = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get(`FIRST_BLOCK:${currentEpochHandler.id}:${shardID}`).catch(()=>null)

                if(storedFirstBlockData){

                    aefpAndFirstBlockData[shardID].firstBlockCreator = storedFirstBlockData.firstBlockCreator

                    aefpAndFirstBlockData[shardID].firstBlockHash = storedFirstBlockData.firstBlockHash

                }

            }

        
            if(aefpAndFirstBlockData[shardID].firstBlockHash && aefpAndFirstBlockData[shardID].aefp) totalNumberOfReadyShards++

            if(!aefpAndFirstBlockData[shardID].firstBlockHash) aefpAndFirstBlockData[shardID] = {}
    
        
        }

        // Save the changes(caching)

        await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`FIRST_BLOCKS_DATA_AND_AEFPS:${currentEpochFullID}`,aefpAndFirstBlockData).catch(()=>{})


        //_____Now, when we've resolved all the first blocks & found all the AEFPs - get blocks, extract epoch edge transactions and set the new epoch____


        if(totalNumberOfShards === totalNumberOfReadyShards){

            let epochEdgeTransactions = []

            let firstBlocksHashes = []

            let cycleWasBreak = false

            for(let [shardID] of entries){

                // Try to get the epoch edge transactions from the first blocks

                let firstBlockOnThisShard = await getBlock(currentEpochHandler.id,aefpAndFirstBlockData[shardID].firstBlockCreator,0)

                if(firstBlockOnThisShard && Block.genHash(firstBlockOnThisShard) === aefpAndFirstBlockData[shardID].firstBlockHash){

                    if(Array.isArray(firstBlockOnThisShard.epochEdgeTransactions)){

                        epochEdgeTransactions.push(...firstBlockOnThisShard.epochEdgeTransactions)

                    }

                    firstBlocksHashes.push(aefpAndFirstBlockData[shardID].firstBlockHash)

                }else{

                    cycleWasBreak = true

                    break

                }

            }

            if(!cycleWasBreak){

                // Store the legacy data about this epoch that we'll need in future - epochFullID,quorum,majority
                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`LEGACY_DATA:${currentEpochHandler.id}`,{

                    epochFullID:currentEpochFullID,
                    quorum:currentEpochHandler.quorum,
                    majority

                }).catch(()=>{})

                // For API - store the whole epoch handler object by epoch numerical index
                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`EPOCH_HANDLER:${currentEpochHandler.id}`,currentEpochHandler).catch(()=>{})
                                
                // ... and delete the legacy data for previos epoch(don't need it anymore for approvements)
                await BLOCKCHAIN_DATABASES.EPOCH_DATA.del(`LEGACY_DATA:${currentEpochHandler.id-1}`).catch(()=>{})


                let daoVotingContractCalls = [], slashingContractCalls = [], reduceUnoContractCalls = [], allTheRestContractCalls = []

                let atomicBatch = BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.batch()

                for(let operation of epochEdgeTransactions){

                    let contractID = operation?.payload?.contractID

                    let methodID = operation?.payload?.method

                    if(contractID === 'system/dao_voting') daoVotingContractCalls.push(operation)

                    else if (contractID === 'system/epoch_edge_staking_calls' && methodID === 'slashing') slashingContractCalls.push(operation)

                    else if (contractID === 'system/epoch_edge_staking_calls' && methodID === 'reduceAmountOfUno') reduceUnoContractCalls.push(operation)

                    else allTheRestContractCalls.push(operation)

                }


                let epochEdgeTransactionsOrderByPriority = daoVotingContractCalls.concat(slashingContractCalls).concat(reduceUnoContractCalls).concat(allTheRestContractCalls)


                // Store the epoch edge transactions locally because we'll need it later(to change the epoch on VT - Verification Thread)
                // So, no sense to grab it twice(on AT and later on VT). On VT we just get it from DB and execute these transactions(already in priority order)
                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`EPOCH_EDGE_TXS:${currentEpochFullID}`,epochEdgeTransactions).catch(()=>false)


                for(let operation of epochEdgeTransactionsOrderByPriority){

                    /*
                    
                        operation structure is:

                        {   v,
                            fee,
                            creator,
                            type,
                            nonce,
                            payload:{

                                contractID, method, gasLimit, params, imports, shardContext

                            },
                            sig
        
                        }
                    
                    */
        
                    await executeEpochEdgeTransaction('APPROVEMENT_THREAD',operation).catch(()=>{})
                
                }
                
                // After all ops - commit state and make changes in databases
            
                GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.forEach((value,storageCellID)=>{
            
                    atomicBatch.put(storageCellID,value)
            
                })

               
                // Now, after the execution we can change the checkpoint id and get the new hash + prepare new temporary object
                
                let nextEpochId = currentEpochHandler.id + 1

                let nextEpochHash = blake3Hash(JSON.stringify(firstBlocksHashes))

                let nextEpochFullID = nextEpochHash+'#'+nextEpochId


                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`EPOCH_HASH:${nextEpochId}`,nextEpochHash).catch(()=>{})


                // After execution - assign pools(validators) to shards

                await setLeadersSequenceForShards(currentEpochHandler,nextEpochHash)

                
                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`EPOCH_LEADERS_SEQUENCES:${nextEpochId}`,WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.leadersSequence).catch(()=>{})


                customLog(`\u001b[38;5;154mEpoch edge transactions were executed for epoch \u001b[38;5;93m${currentEpochFullID} (AT)\u001b[0m`,logColors.GREEN)


                //_______________________ Update the values for new epoch _______________________

                WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.startTimestamp = currentEpochHandler.startTimestamp + WORKING_THREADS.APPROVEMENT_THREAD.NETWORK_PARAMETERS.EPOCH_TIME

                WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.id = nextEpochId

                WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash = nextEpochHash

                WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.quorum = getCurrentEpochQuorum(WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.poolsRegistry,WORKING_THREADS.APPROVEMENT_THREAD.NETWORK_PARAMETERS,nextEpochHash)

                await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`EPOCH_QUORUM:${nextEpochId}`,WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.quorum).catch(()=>{})
                
                // Create new temporary db for the next epoch

                let nextTempDB = level(process.env.CHAINDATA_PATH+`/${nextEpochFullID}`,{valueEncoding:'json'})

                // Commit changes

                atomicBatch.put('AT',WORKING_THREADS.APPROVEMENT_THREAD)

                await atomicBatch.write()


                // Create mappings & set for the next epoch
                let nextTemporaryObject = {

                    FINALIZATION_PROOFS:new Map(),

                    FINALIZATION_STATS:new Map(),

                    TEMP_CACHE:new Map(),

                    EPOCH_EDGE_TRANSACTIONS_MEMPOOL:[],

                    SYNCHRONIZER:new Map(),
            
                    SHARDS_LEADERS_HANDLERS:new Map(),
      
                    DATABASE:nextTempDB
            
                }

                customLog(`Epoch on approvement thread was updated => \x1b[34;1m${nextEpochHash}#${nextEpochId}`,logColors.GREEN)

                //_______________________Check the version required for the next checkpoint________________________


                if(isMyCoreVersionOld('APPROVEMENT_THREAD')){

                    customLog(`New version detected on APPROVEMENT_THREAD. Please, upgrade your node software`,logColors.YELLOW)

                    console.log('\n')
                    console.log(fs.readFileSync(pathResolve('images/events/update.txt')).toString())
        
                    // Stop the node to update the software
                    GRACEFUL_STOP()

                }


                // Close & delete the old temporary db
            
                await EPOCH_METADATA_MAPPING.get(currentEpochFullID).DATABASE.close()
        
                fs.rm(process.env.CHAINDATA_PATH+`/${currentEpochFullID}`,{recursive:true},()=>{})
        
                EPOCH_METADATA_MAPPING.delete(currentEpochFullID)

                
                
                //________________________________ If it's fresh checkpoint and we present there as a member of quorum - then continue the logic ________________________________


                let iAmInTheQuorum = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.quorum.includes(CONFIGURATION.NODE_LEVEL.PUBLIC_KEY)


                if(epochStillFresh(WORKING_THREADS.APPROVEMENT_THREAD) && iAmInTheQuorum){

                    // Fill the checkpoints manager with the latest data

                    let currentEpochManager = nextTemporaryObject.FINALIZATION_STATS

                    WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.poolsRegistry.forEach(poolPubKey=>

                        currentEpochManager.set(poolPubKey,{index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}})

                    )

                }

                // Set next temporary object by ID

                EPOCH_METADATA_MAPPING.set(nextEpochFullID,nextTemporaryObject)

                // Delete the cache that we don't need more

                await BLOCKCHAIN_DATABASES.EPOCH_DATA.del(`FIRST_BLOCKS_DATA_AND_AEFPS:${currentEpochFullID}`).catch(()=>{})


            }

        }

        // Continue to find
        setImmediate(findAefpsAndFirstBlocksForCurrentEpoch)

    }else{

        setTimeout(findAefpsAndFirstBlocksForCurrentEpoch,3000)

    }

}