import {CHECK_AGGREGATED_SKIP_PROOF_VALIDITY,CHECK_ASP_CHAIN_VALIDITY,GET_BLOCK,START_VERIFICATION_THREAD,VERIFY_AGGREGATED_FINALIZATION_PROOF} from './verification.js'

import {
    
    GET_QUORUM_URLS_AND_PUBKEYS,GET_MAJORITY,BROADCAST,CHECK_IF_CHECKPOINT_STILL_FRESH,USE_TEMPORARY_DB,

    DECRYPT_KEYS,BLOCKLOG,BLS_SIGN_DATA,HEAP_SORT,GET_ALL_KNOWN_PEERS,

    GET_QUORUM,GET_FROM_QUORUM_THREAD_STATE,IS_MY_VERSION_OLD, GET_HTTP_AGENT

} from './utils.js'

import {LOG,PATH_RESOLVE,BLAKE3,GET_GMT_TIMESTAMP} from '../../KLY_Utils/utils.js'

import SYSTEM_OPERATIONS_VERIFIERS from './systemOperationsVerifiers.js'

import AdvancedCache from '../../KLY_Utils/structures/advancedcache.js'

import {KLY_EVM} from '../../KLY_VirtualMachines/kly_evm/vm.js'

import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import Block from './essences/block.js'

import UWS from 'uWebSockets.js'

import readline from 'readline'

import fetch from 'node-fetch'

import crypto from 'crypto'

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




export let SET_REASSIGNMENT_CHAINS = async (checkpoint,epochSeed) => {


    checkpoint.reassignmentChains = {}


    //__________________Based on POOLS_METADATA get the reassignments to instantly get the commitments / finalization proofs__________________


    let reservePoolsRelatedToSubchain = new Map() // subchainID => [] - array of reserve pools

    let primePoolsPubKeys = new Set(checkpoint.poolsRegistry.primePools)


    for(let reservePoolPubKey of checkpoint.poolsRegistry.reservePools){

        // Otherwise - it's reserve pool
        
        let poolStorage = await GET_FROM_QUORUM_THREAD_STATE(reservePoolPubKey+`(POOL)_STORAGE_POOL`)
    
        if(poolStorage){

            let {reserveFor} = poolStorage

            if(!reservePoolsRelatedToSubchain.has(reserveFor)) reservePoolsRelatedToSubchain.set(reserveFor,[])

            reservePoolsRelatedToSubchain.get(reserveFor).push(reservePoolPubKey)
                    
        }

    }


    /*
    
        After this cycle we have:

        [0] primePoolsIDs - Set(primePool0,primePool1,...)
        [1] reservePoolsRelatedToSubchainAndStillNotUsed - Map(primePoolPubKey=>[reservePool1,reservePool2,...reservePoolN])

    
    */

    let hashOfMetadataFromOldCheckpoint = BLAKE3(JSON.stringify(checkpoint.poolsRegistry)+epochSeed)

    
    //___________________________________________________ Now, build the reassignment chains ___________________________________________________
    
    for(let primePoolID of primePoolsPubKeys){


        let arrayOfReservePoolsRelatedToThisSubchain = reservePoolsRelatedToSubchain.get(primePoolID) || []

        let mapping = new Map()

        let arrayOfChallanges = arrayOfReservePoolsRelatedToThisSubchain.map(validatorPubKey=>{

            let challenge = parseInt(BLAKE3(validatorPubKey+hashOfMetadataFromOldCheckpoint),16)

            mapping.set(challenge,validatorPubKey)

            return challenge

        })


        let sortedChallenges = HEAP_SORT(arrayOfChallanges)

        let reassignmentChain = []

        for(let challenge of sortedChallenges) reassignmentChain.push(mapping.get(challenge))

        
        checkpoint.reassignmentChains[primePoolID] = reassignmentChain
        
    }
    
}




//________________________________________________________________INTERNAL_______________________________________________________________________




let 


//TODO:Add more advanced logic(e.g. number of txs,ratings,etc.)

GET_TRANSACTIONS = () => global.SYMBIOTE_META.MEMPOOL.splice(0,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.TXS_LIMIT_PER_BLOCK),




GET_SYSTEM_SYNC_OPERATIONS = checkpointFullID => {

    if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)) return []

    let specialOperationsMempool = global.SYMBIOTE_META.TEMP.get(checkpointFullID).SYSTEM_SYNC_OPERATIONS_MEMPOOL

    return specialOperationsMempool.splice(0,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.SYSTEM_SYNC_OPERATIONS_LIMIT_PER_BLOCK)

},




BLOCKS_GENERATION_POLLING=async()=>{

    if(!global.SYSTEM_SIGNAL_ACCEPTED){

        await GENERATE_BLOCKS_PORTION()    

        global.STOP_GEN_BLOCKS_CLEAR_HANDLER = setTimeout(BLOCKS_GENERATION_POLLING,global.CONFIG.SYMBIOTE.BLOCK_TIME)
        
        global.CONFIG.SYMBIOTE.STOP_WORK_ON_GENERATION_THREAD
        &&
        clearTimeout(global.STOP_GEN_BLOCKS_CLEAR_HANDLER)

    }else LOG(`Block generation was stopped`,'I')
    
},




DELETE_POOLS_WITH_LACK_OF_STAKING_POWER = async (validatorPubKey,fullCopyOfQuorumThread) => {

    //Try to get storage "POOL" of appropriate pool

    let poolStorage = await GET_FROM_QUORUM_THREAD_STATE(validatorPubKey+'(POOL)_STORAGE_POOL')


    poolStorage.lackOfTotalPower = true

    poolStorage.stopCheckpointID = fullCopyOfQuorumThread.CHECKPOINT.id

    
    //Remove from POOLS array(to prevent be elected to quorum) and metadata

    let arrayToDeleteFrom = fullCopyOfQuorumThread.CHECKPOINT.poolsRegistry[ poolStorage.isReserve ? 'reservePools' : 'primePools' ]

    let indexToDelete = arrayToDeleteFrom.indexOf(validatorPubKey)

    arrayToDeleteFrom.splice(indexToDelete,1)


},




EXECUTE_SYSTEM_SYNC_OPERATIONS = async (atomicBatch,fullCopyOfQuorumThread,systemSyncOperations) => {

    
    //_______________________________Perform SPEC_OPERATIONS_____________________________

    let workflowOptionsTemplate = {...fullCopyOfQuorumThread.WORKFLOW_OPTIONS}
    
    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set('WORKFLOW_OPTIONS',workflowOptionsTemplate)
    
    // Structure is <poolID> => true if pool should be deleted
    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set('SLASH_OBJECT',{})
    

    // But, initially, we should execute the SLASH_UNSTAKE operations because we need to prevent withdraw of stakes by rogue pool(s)/stakers
    for(let operation of systemSyncOperations){
     
        if(operation.type==='SLASH_UNSTAKE') await SYSTEM_OPERATIONS_VERIFIERS.SLASH_UNSTAKE(operation.payload,false,true)
    
    }

    // Here we have the filled(or empty) array of pools and delayed IDs to delete it from state

    for(let operation of systemSyncOperations){
        
        if(operation.type==='SLASH_UNSTAKE') continue
          /*
            
            Perform changes here before move to the next checkpoint
            
            OPERATION in checkpoint has the following structure
            {
                type:<TYPE> - type from './systemOperationsVerifiers.js' to perform this operation
                payload:<PAYLOAD> - operation body. More detailed about structure & verification process here => ./systemOperationsVerifiers.js
            }
            
        */
        await SYSTEM_OPERATIONS_VERIFIERS[operation.type](operation.payload,false,true,fullCopyOfQuorumThread)
    
    }

    //_______________________Remove pools if lack of staking power_______________________

    let checkpointRef = fullCopyOfQuorumThread.CHECKPOINT

    let toRemovePools = [], promises = [], allThePools = checkpointRef.poolsRegistry.primePools.concat(checkpointRef.poolsRegistry.reservePools)


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
        let arrayToDeleteFrom = fullCopyOfQuorumThread.CHECKPOINT.poolsRegistry.reservePools[ slashObject[poolIdentifier].isReserve ? 'reservePools' : 'primePools' ]

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
START_QUORUM_THREAD_CHECKPOINT_TRACKER=async()=>{


    //_________________________FIND THE NEXT CHECKPOINT AND EXECUTE SYNC SYSTEM OPERATIONS INSTANTLY_____________________________

    /*
    

        1. Check if new epoch must be started(new day by default)

        2. Try to find AEFPs(Aggregated Epoch Finalization Proofs) for each of subchains by calling GET /aggregated_epoch_finalization_proof/:EPOCH_INDEX/:SUBCHAIN_ID

            Reminder - the structure of AEFP must be:

                {

                    subchain:primePoolPubKey,

                    lastAuthority,
                    
                    lastIndex,
                    
                    lastHash,

                    firstBlockHash,

                    proof:{

                        aggregatedPub,
                    
                        aggregatedSignature,
                        
                        afkVoters
            
                    }
                
                }

                Data that must be signed by 2/3N+1 => 'EPOCH_DONE'+lastAuthority+lastIndex+lastHash+firstBlockHash+checkpointFullID

        3. Once we find the AEFPs for ALL the subchains - it's a signal to start to find the first X blocks in current epoch for each subchain

            We'll use 1 option for this:

                [*] global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.MAX_NUM_OF_BLOCKS_PER_SUBCHAIN_FOR_SYNC_OPS - 1 by default. Don't change it
                
                    This value shows how many first blocks we need to get to extract system sync operations to execute
 
            
        4. Now try to find our own assumption about the first block in epoch locally

            For this, iterate over reassignment chains and try to find AFP_FOR_FIRST_BLOCK => await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:epochID:PubKey:0').catch(()=>false)

            If we can't get it - make call to GET /aggregated_finalization_proof/:BLOCK_ID to quorum members
        
            This is a clear proof that block is 100% accepted by network 


        5. Using these proofs, check the blockID field. If it contain prime pool pubkey and index 0 - it's the first block on subchain. 100%

            Otherwise we'll get the index 0 and pubkey which will be the pubkey of pool which is in reassignment chain

                global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.reassignmentChains[<primePoolPubKey>]


            Run a reverse cycle to find block 0 of this pool and extract the ASP for previous pool in reassignment chain

            ASP 100% contains the field <firstBlockHash>

            Then repeat it to find the block 0 of prime pool or one of the first pools in reassignment chains    

        6. Once we find all of them - extract SYSTEM_SYNC_OPERATIONS from block headers and run it in a sync mode

        7. Increment value of checkpoint index(checkpoint.id) and recount new hash(checkpoint.hash)
    
        8. Prepare new object in TEMP(checkpointFullID) and set new version of checkpoint on QT
    
    
    */
    

    if(!CHECK_IF_CHECKPOINT_STILL_FRESH(global.SYMBIOTE_META.QUORUM_THREAD)){

        let qtCheckpoint = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT

        let oldEpochFullID = qtCheckpoint.hash+"#"+qtCheckpoint.id
    
        let temporaryObject = global.SYMBIOTE_META.TEMP.get(oldEpochFullID)
    
        let rootPubKey = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+oldEpochFullID)
    
        if(!temporaryObject){
    
            setTimeout(START_QUORUM_THREAD_CHECKPOINT_TRACKER,3000)
    
            return
    
        }


        // let numberOfFirstBlocksToFetchFromEachSubchain = global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.MAX_NUM_OF_BLOCKS_PER_SUBCHAIN_FOR_SYNC_OPS // 1. DO NOT CHANGE

        let totalNumberOfSubchains = 0

        let totalNumberOfReadySubchains = 0

        let reassignmentChains = qtCheckpoint.reassignmentChains

        let majority = GET_MAJORITY(qtCheckpoint)

        let allKnownPeers = [...await GET_QUORUM_URLS_AND_PUBKEYS(),...GET_ALL_KNOWN_PEERS()]

        // Get the special object from DB not to repeat requests

        let checkpointCache = await global.SYMBIOTE_META.EPOCH_DATA.get(`CHECKPOINT_CACHE:${oldEpochFullID}`).catch(()=>false) || {} // {subchainID:{firstBlockCreator,firstBlockHash,aefp,realFirstBlockFound}}

        let entries = Object.entries(reassignmentChains)

        //____________________Ask the quorum for AEFP for subchain___________________
        
        for(let [primePoolPubKey,arrayOfReservePools] of entries){
        
            totalNumberOfSubchains++
        
            if(!checkpointCache[primePoolPubKey]) checkpointCache[primePoolPubKey] = {realFirstBlockFound:false}

            if(checkpointCache[primePoolPubKey].aefp && checkpointCache[primePoolPubKey].realFirstBlockFound){

                totalNumberOfReadySubchains++

                // No more sense to find AEFPs or first block for this subchain. Just continue

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
                        lastAuthority:<index of BLS pubkey of some pool in subchain's reassignment chain>,
                        lastIndex:<index of his block in previous epoch>,
                        lastHash:<hash of this block>,
                        firstBlockHash,
                        
                        proof:{

                            aggregatedPub:<BLS aggregated pubkey of signers>,
                            aggregatedSignature: SIG('EPOCH_DONE'+lastAuth+lastIndex+lastHash+firstBlockHash+checkpointFullId)
                            afkVoters:[] - array of BLS pubkeys who haven't voted

                        }
    
                    }

            */

            
            if(!checkpointCache[primePoolPubKey].aefp){

                // Try to find locally

                let aefp = await global.SYMBIOTE_META.EPOCH_DATA.get(`AEFP:${qtCheckpoint.id}:${primePoolPubKey}`).catch(()=>false)

                if(aefp){

                    checkpointCache[primePoolPubKey].aefp = aefp


                }else{

                    // Ask quorum for AEFP
                    for(let peerURL of allKnownPeers){
            
                        let itsProbablyAggregatedEpochFinalizationProof = await fetch(peerURL+`/aggregated_epoch_finalization_proof/${qtCheckpoint.id}/${primePoolPubKey}`,{agent:GET_HTTP_AGENT(peerURL)}).then(r=>r.json()).catch(()=>false)
                
                        if(itsProbablyAggregatedEpochFinalizationProof){
                
                            let aefpPureObject = await VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF(itsProbablyAggregatedEpochFinalizationProof,qtCheckpoint.quorum,rootPubKey,majority,oldEpochFullID)
    
                            if(aefpPureObject){
    
                                checkpointCache[primePoolPubKey].aefp = aefpPureObject
    
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

            if(!checkpointCache[primePoolPubKey].realFirstBlockFound){

                // First of all - try to find AFP for block epochID:PrimePoolPubKey:0

                let firstBlockOfPrimePool = qtCheckpoint.id+':'+primePoolPubKey+':0'

                let afpForFirstBlockOfPrimePool = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+firstBlockOfPrimePool).catch(()=>false)

                if(afpForFirstBlockOfPrimePool){

                    checkpointCache[primePoolPubKey].firstBlockCreator = primePoolPubKey

                    checkpointCache[primePoolPubKey].firstBlockHash = afpForFirstBlockOfPrimePool.firstBlockHash

                    checkpointCache[primePoolPubKey].realFirstBlockFound = true // if we get the block 0 by prime pool - it's 100% the first block

                }else{

                    // Ask quorum for AFP for first block of prime pool

                    // Descriptor is {url,pubKey}

                    for(let peerURL of allKnownPeers){
            
                        let itsProbablyAggregatedFinalizationProof = await fetch(peerURL+'/aggregated_finalization_proof/'+firstBlockOfPrimePool,{agent:GET_HTTP_AGENT(peerURL)}).then(r=>r.json()).catch(()=>false)
            
                        if(itsProbablyAggregatedFinalizationProof){
            
                            let isOK = await VERIFY_AGGREGATED_FINALIZATION_PROOF(itsProbablyAggregatedFinalizationProof,qtCheckpoint,rootPubKey)
            
                            if(isOK && itsProbablyAggregatedFinalizationProof.blockID === firstBlockOfPrimePool){                            
                            
                                checkpointCache[primePoolPubKey].firstBlockCreator = primePoolPubKey

                                checkpointCache[primePoolPubKey].firstBlockHash = itsProbablyAggregatedFinalizationProof.blockHash

                                checkpointCache[primePoolPubKey].realFirstBlockFound = true

                            }
            
                        }
            
                    }
            
                }

                //_____________________________________ Find AFPs for first blocks of reserve pools _____________________________________
            
                if(!checkpointCache[primePoolPubKey].realFirstBlockFound){

                    // Find AFPs for reserve pools
                
                    for(let position = 0, length = arrayOfReservePools.length ; position < length ; position++){

                        let reservePoolPubKey = arrayOfReservePools[position]

                        let firstBlockOfPool = qtCheckpoint.id+':'+reservePoolPubKey+':0'

                        let afp = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+firstBlockOfPool).catch(()=>false)

                        if(afp){

                            //______________Now check if block is really the first one. Otherwise, run reverse cycle from <position> to -1 get the first block in epoch______________

                            let potentialFirstBlock = await GET_BLOCK(qtCheckpoint.id,reservePoolPubKey,0,true)

                            if(potentialFirstBlock && afp.blockHash === Block.genHash(potentialFirstBlock)){

                                /*
                            
                                    Now, when we have block of some pool with index 0(first block in epoch) we're interested in block.extraData.reassignments
                            
                                    We should get the ASP for previous pool in reassignment chain
                                
                                        1) If previous pool was skipped on height -1 (asp.skipIndex === -1) then try next pool

                                */

                                let currentPosition = position

                                let aspData = {}
                                
                                while(true){

                                    let shouldBreakInfiniteWhile = false

                                    while(true) {
    
                                        let previousPoolPubKey = arrayOfReservePools[currentPosition-1] || primePoolPubKey
    
                                        let aspForPreviousPool = potentialFirstBlock.extraData.reassignments[previousPoolPubKey]


                                        if(previousPoolPubKey === primePoolPubKey){

                                            // In case we get the start of reassignment chain - break the cycle. The <potentialFirstBlock> will be the first block in epoch

                                            checkpointCache[primePoolPubKey].firstBlockCreator = aspData.firstBlockCreator

                                            checkpointCache[primePoolPubKey].firstBlockHash = aspData.firstBlockHash
        
                                            checkpointCache[primePoolPubKey].realFirstBlockFound = true
                                    
                                            shouldBreakInfiniteWhile = true

                                            break

                                        }else if(aspForPreviousPool.skipIndex !== -1){
    
                                            // Get the first block of pool which was skipped on not-null height
                                            let potentialNextBlock = await GET_BLOCK(qtCheckpoint.id,previousPoolPubKey,0)

                                            if(potentialNextBlock && Block.genHash(potentialNextBlock) === aspForPreviousPool.firstBlockHash){

                                                potentialFirstBlock = potentialNextBlock

                                                aspData.firstBlockCreator = previousPoolPubKey

                                                aspData.firstBlockHash = aspForPreviousPool.firstBlockHash

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

            
            //_____________________________ Here we should have understanding of first block for each subchain __________________________

            if(checkpointCache[primePoolPubKey].realFirstBlockFound && checkpointCache[primePoolPubKey].aefp) totalNumberOfReadySubchains++
    
        
        }

        // Store the changes in CHECKPOINT_CACHE for persistence

        await global.SYMBIOTE_META.EPOCH_DATA.put(`CHECKPOINT_CACHE:${oldEpochFullID}`,checkpointCache).catch(()=>false)


        //_____Now, when we've resolved all the first blocks & found all the AEFPs - get blocks, extract system sync operations and set the new epoch____


        if(totalNumberOfSubchains === totalNumberOfReadySubchains){

            let systemSyncOperations = []

            let firstBlocksHashes = []

            let cycleWasBreak = false

            for(let [primePoolPubKey] of entries){

                // Try to get the system sync operations from the first blocks

                let firstBlockOnThisSubchain = await GET_BLOCK(qtCheckpoint.id,checkpointCache[primePoolPubKey].firstBlockCreator,0)

                if(firstBlockOnThisSubchain && Block.genHash(firstBlockOnThisSubchain) === checkpointCache[primePoolPubKey].firstBlockHash){

                    systemSyncOperations.push(...firstBlockOnThisSubchain.systemSyncOperations)

                    firstBlocksHashes.push(checkpointCache[primePoolPubKey].firstBlockHash)

                }else{

                    cycleWasBreak = true

                    break

                }

            }

            if(!cycleWasBreak){

                // Store the system sync operations locally because we'll need it later(to change the epoch on VT - Verification Thread)
                // So, no sense to grab it twice(on QT and later on VT). On VT we just get it from DB and execute these operations
                await global.SYMBIOTE_META.EPOCH_DATA.put(`SSO:${oldEpochFullID}`,systemSyncOperations).catch(()=>false)

                // We need it for changes
                let fullCopyOfQuorumThread = JSON.parse(JSON.stringify(global.SYMBIOTE_META.QUORUM_THREAD))

                // All operations must be atomic
                let atomicBatch = global.SYMBIOTE_META.QUORUM_THREAD_METADATA.batch()


                // Execute system sync operations from new checkpoint using our copy of QT and atomic handler
                await EXECUTE_SYSTEM_SYNC_OPERATIONS(atomicBatch,fullCopyOfQuorumThread,systemSyncOperations)

               
                // Now, after the execution we can change the checkpoint id and get the new hash + prepare new temporary object
                
                let nextEpochId = qtCheckpoint.id + 1

                let nextEpochHash = BLAKE3(JSON.stringify(firstBlocksHashes))

                let nextEpochFullID = nextEpochHash+'#'+nextEpochId


                await global.SYMBIOTE_META.EPOCH_DATA.put(`NEXT_EPOCH_HASH:${oldEpochFullID}`,nextEpochHash).catch(()=>false)


                // After execution - create the reassignment chains
                await SET_REASSIGNMENT_CHAINS(fullCopyOfQuorumThread.CHECKPOINT,nextEpochHash)


                await global.SYMBIOTE_META.EPOCH_DATA.put(`NEXT_EPOCH_RC:${oldEpochFullID}`,fullCopyOfQuorumThread.CHECKPOINT.reassignmentChains).catch(()=>false)


                LOG(`\u001b[38;5;154mSystem sync operations were executed for epoch \u001b[38;5;93m${oldEpochFullID} (QT)\u001b[0m`,'S')

                //_______________________ Update the values for new epoch _______________________

                fullCopyOfQuorumThread.CHECKPOINT.timestamp = qtCheckpoint.timestamp + fullCopyOfQuorumThread.WORKFLOW_OPTIONS.EPOCH_TIME

                fullCopyOfQuorumThread.CHECKPOINT.id = nextEpochId

                fullCopyOfQuorumThread.CHECKPOINT.hash = nextEpochHash

                fullCopyOfQuorumThread.CHECKPOINT.quorum = GET_QUORUM(fullCopyOfQuorumThread.CHECKPOINT.poolsRegistry,fullCopyOfQuorumThread.WORKFLOW_OPTIONS,nextEpochHash)

                await global.SYMBIOTE_META.EPOCH_DATA.put(`NEXT_EPOCH_QUORUM:${oldEpochFullID}`,fullCopyOfQuorumThread.CHECKPOINT.quorum).catch(()=>false)
                
                // Create new temporary db for the next checkpoint
                let nextTempDB = level(process.env.CHAINDATA_PATH+`/${nextEpochFullID}`,{valueEncoding:'json'})

                // Commit changes
                atomicBatch.put('QT',fullCopyOfQuorumThread)

                await atomicBatch.write()


                // Create mappings & set for the next checkpoint
                let nextTemporaryObject = {

                    COMMITMENTS:new Map(),

                    FINALIZATION_PROOFS:new Map(),

                    CHECKPOINT_MANAGER:new Map(),

                    SYSTEM_SYNC_OPERATIONS_MEMPOOL:[],
 
                    SKIP_HANDLERS:new Map(), // {extendedAggregatedCommitments,aggregatedSkipProof}

                    SYNCHRONIZER:new Map(),
            
                    REASSIGNMENTS:new Map(),

                    HEALTH_MONITORING:new Map(),
      
                    DATABASE:nextTempDB
            
                }


                global.SYMBIOTE_META.QUORUM_THREAD = fullCopyOfQuorumThread

                LOG(`QUORUM_THREAD was updated => \x1b[34;1m${nextEpochId} ### ${nextEpochHash}`,'S')


                // Get the new ROOTPUB and delete the old one
                global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('QT_ROOTPUB'+nextEpochFullID,bls.aggregatePublicKeys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum))
    
                global.SYMBIOTE_META.STATIC_STUFF_CACHE.delete('QT_ROOTPUB'+oldEpochFullID)


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


                let iAmInTheQuorum = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.includes(global.CONFIG.SYMBIOTE.PUB)


                if(CHECK_IF_CHECKPOINT_STILL_FRESH(global.SYMBIOTE_META.QUORUM_THREAD) && iAmInTheQuorum){

                    // Fill the checkpoints manager with the latest data

                    let currentCheckpointManager = nextTemporaryObject.CHECKPOINT_MANAGER

                    global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.poolsRegistry.primePools.forEach(poolPubKey=>

                        currentCheckpointManager.set(poolPubKey,{index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',isReserve:false})

                    )

                    global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.poolsRegistry.reservePools.forEach(poolPubKey=>

                        currentCheckpointManager.set(poolPubKey,{index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',isReserve:true})

                    )


                }

                // Set next temporary object by ID
                global.SYMBIOTE_META.TEMP.set(nextEpochFullID,nextTemporaryObject)

                //Continue to find checkpoints
                setImmediate(START_QUORUM_THREAD_CHECKPOINT_TRACKER)


            }

        }

    }

},




CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT=async()=>{

    let qtCheckpoint = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT

    let checkpointFullID = qtCheckpoint.hash+"#"+qtCheckpoint.id

    let temporaryObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    if(!temporaryObject){

        setTimeout(CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT,3000)

        return

    }
    

    let iAmInTheQuorum = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.includes(global.CONFIG.SYMBIOTE.PUB)


    if(iAmInTheQuorum && !CHECK_IF_CHECKPOINT_STILL_FRESH(global.SYMBIOTE_META.QUORUM_THREAD)){

        // Stop to generate commitments/finalization proofs
        temporaryObject.SYNCHRONIZER.set('TIME_TO_NEW_EPOCH',true)


        // Check the safety
        if(!temporaryObject.SYNCHRONIZER.has('READY_FOR_CHECKPOINT')){

            setTimeout(CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT,3000)

            return

        }
    

        let checkpointProposition = {}

        let majority = GET_MAJORITY(qtCheckpoint)

        let reassignmentChains = qtCheckpoint.reassignmentChains // primePoolPubKey => [reservePool0,reservePool1,...,reservePoolN]

        let rootPubKey = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)

        
    
        for(let [primePoolPubKey,reassignmentArray] of Object.entries(reassignmentChains)){

            let handlerWithIndexOfCurrentAuthorityOnSubchain = temporaryObject.REASSIGNMENTS.get(primePoolPubKey) // {currentAuthority:<number>}

            let pubKeyOfAuthority, indexOfAuthority
            
            
            if(handlerWithIndexOfCurrentAuthorityOnSubchain){

                pubKeyOfAuthority = reassignmentArray[handlerWithIndexOfCurrentAuthorityOnSubchain.currentAuthority]

                indexOfAuthority = handlerWithIndexOfCurrentAuthorityOnSubchain.currentAuthority

            }else{

                pubKeyOfAuthority = primePoolPubKey

                indexOfAuthority = -1

            }
            
            
            // Structure is Map(subchain=>Map(quorumMember=>SIG('EPOCH_DONE'+lastAuth+lastIndex+lastHash+checkpointFullId)))
            let checkpointAgreements = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('CHECKPOINT_PROPOSITION' + checkpointFullID)

            if(!checkpointAgreements){

                checkpointAgreements = new Map()

                global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('CHECKPOINT_PROPOSITION' + checkpointFullID,checkpointAgreements)
            
            }

            let agreementsForThisSubchain = checkpointAgreements.get(primePoolPubKey)

            if(!agreementsForThisSubchain){

                agreementsForThisSubchain = new Map()

                checkpointAgreements.set(primePoolPubKey,agreementsForThisSubchain)
            
            }

            if(agreementsForThisSubchain.size >= majority) continue

            /*
            
                Thanks to verification process of block 0 on route POST /block (see routes/main.js) we know that each block created by subchain authority will contain all the ASPs
        
                1) Start to build so called CHECKPOINT_PROPOSITION. This object has the following structure


                {
                
                    "subchain0":{

                        currentAuth:<int - pointer to current authority of subchain based on QT.CHECKPOINT.reassignmentChains[primePool]. In case -1 - it's prime pool>

                        finalizationProof:{
                            index:,
                            hash:,
                            aggregatedCommitments:{

                                aggregatedPub:,
                                aggregatedSignature:,
                                afkVoters:[],

                            }
                    
                        }

                    },

                    "subchain1":{
                        
                    }

                    ...
                    
                    "subchainN":{
                        ...
                    }
                
                }


                2) Take the finalizationProof for currentAuth from TEMP.get(<checkpointID>).CHECKPOINT_MANAGER

                3) If nothing in CHECKPOINT_MANAGER - then set index to -1 and hash to default(0123...)

                4) Send CHECKPOINT_PROPOSITION to POST /checkpoint_proposition to all(or at least 2/3N+1) quorum members


                ____________________________________________After we get responses____________________________________________

                5) If validator agree with all the propositions - it generate signatures for all the subchain to paste this short proof to the fist block in the next epoch(to section block.extraData.aefpForPreviousEpoch)

                6) If we get 2/3N+1 agreements for ALL the subchains - aggregate it and store locally. This called AGGREGATED_EPOCH_FINALIZATION_PROOF (AEFP)

                    The structure is


                    {
                        
                        lastAuthority:<index of BLS pubkey of some pool in subchain's reassignment chain>,
                        lastIndex:<index of his block in previous epoch>,
                        lastHash:<hash of this block>,
                        firstBlockHash,

                        proof:{

                            aggregatedPub:<BLS aggregated pubkey of signers>,
                            aggregatedSignature: SIG('EPOCH_DONE'+lastAuth+lastIndex+lastHash+checkpointFullId)
                            afkVoters:[] - array of BLS pubkeys who haven't voted

                        }
                    
                    }

                7) Then, we can share these proofs by route GET /aggregated_epoch_finalization_proof/:EPOCH_ID/:SUBCHAIN_ID

                8) Prime pool and other reserve pools on each subchain can query network for this proofs to set to
                
                    block.extraData.aefpForPreviousEpoch to know where to start VERIFICATION_THREAD in a new epoch                
                

            */
         
            checkpointProposition[primePoolPubKey] = {

                currentAuthority:indexOfAuthority,

                afpForFirstBlock:{},

                finalizationProof:temporaryObject.CHECKPOINT_MANAGER.get(pubKeyOfAuthority) || {index:-1,hash:'0123456701234567012345670123456701234567012345670123456701234567'}

            }

            // In case we vote for index > 0 - we need to add the AFP proof to proposition. This will be added to AEFP and used on verification thread to build reassignment metadata

            if(checkpointProposition[primePoolPubKey].finalizationProof.index > 0){

                let blockID = qtCheckpoint.id+':'+pubKeyOfAuthority+':0'

                checkpointProposition[primePoolPubKey].afpForFirstBlock = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+blockID).catch(()=>false)

            }
            else if(checkpointProposition[primePoolPubKey].finalizationProof.index === 0) checkpointProposition[primePoolPubKey].afpForFirstBlock.blockHash = checkpointProposition[primePoolPubKey].finalizationProof.hash

            else if(checkpointProposition[primePoolPubKey].finalizationProof.index === -1) checkpointProposition[primePoolPubKey].afpForFirstBlock.blockHash = '0123456701234567012345670123456701234567012345670123456701234567'
            
        }

        
        //____________________________________ Send the checkpoint proposition ____________________________________


        let optionsToSend = {method:'POST',body:JSON.stringify(checkpointProposition)}
        
        let quorumMembers = await GET_QUORUM_URLS_AND_PUBKEYS(true)


        //Descriptor is {url,pubKey}
        for(let descriptor of quorumMembers){

            // No sense to get the commitment if we already have

            optionsToSend.agent = GET_HTTP_AGENT(descriptor.url)
            
            await fetch(descriptor.url+'/checkpoint_proposition',optionsToSend).then(r=>r.json()).then(async possibleAgreements => {

                /*
                
                    possibleAgreements structure is:
                    
                    
                        {
                            subchainA:{
                                
                                status:'UPGRADE'|'OK',

                                -------------------------------[In case 'OK']-------------------------------

                                sig: SIG('EPOCH_DONE'+lastAuth+lastIndex+lastHash+firstBlockHash+checkpointFullId)
                        
                                -----------------------------[In case 'UPGRADE']----------------------------

                                currentAuthority:<index>,
                                finalizationProof:{
                                    index,hash,agregatedCommitments:{aggregatedPub,aggregatedSignature,afkVoters}
                                }

                            },

                            subchainB:{
                                ...(same)
                            },
                            ...,
                            subchainQ:{
                                ...(same)
                            }
                        }
                
                
                */

                if(typeof possibleAgreements === 'object'){

                    // Start iteration

                    for(let [primePoolPubKey,metadata] of Object.entries(checkpointProposition)){

                        let agreementsForThisSubchain = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('CHECKPOINT_PROPOSITION' + checkpointFullID).get(primePoolPubKey) // signer => signature                        

                        let response = possibleAgreements[primePoolPubKey]

                        if(response){

                            if(response.status==='OK' && typeof metadata.afpForFirstBlock.blockHash === 'string'){

                                // Verify EPOCH_FINALIZATION_PROOF signature and store to mapping

                                let dataThatShouldBeSigned = 'EPOCH_DONE'+metadata.currentAuthority+metadata.finalizationProof.index+metadata.finalizationProof.hash+metadata.afpForFirstBlock.blockHash+checkpointFullID

                                let isOk = await bls.singleVerify(dataThatShouldBeSigned,descriptor.pubKey,response.sig).catch(()=>false)

                                if(isOk) agreementsForThisSubchain.set(descriptor.pubKey,response.sig)

                            }else if(response.status==='UPGRADE'){

                                // Verify finalization proof and add to upgradesForNextIterations

                                let {index,hash,aggregatedCommitments} = response.finalizationProof
                            
                                let {aggregatedPub,aggregatedSignature,afkVoters} = aggregatedCommitments
                            
                                let pubKeyOfProposedAuthority = reassignmentChains[primePoolPubKey][response.currentAuthority]

                                let dataThatShouldBeSigned = `${qtCheckpoint.id}:${pubKeyOfProposedAuthority}:${index}`+hash+checkpointFullID // typical commitment signature blockID+hash+checkpointFullID
                            
                                let reverseThreshold = qtCheckpoint.quorum.length - majority
                            
                                let isOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,rootPubKey,dataThatShouldBeSigned,aggregatedSignature,reverseThreshold).catch(()=>false)
                            
                            
                                if(isOk){
                            
                                    // Update the REASSIGNMENTS

                                    temporaryObject.REASSIGNMENTS.set(primePoolPubKey,{currentAuthority:response.currentAuthority})
                                    
                                    // Update CHECKPOINT_MANAGER

                                    temporaryObject.CHECKPOINT_MANAGER.set(pubKeyOfProposedAuthority,{index,hash,aggregatedCommitments:{aggregatedPub,aggregatedSignature,afkVoters}})                                    
                            
                                    // Clear the mapping with signatures because it becomes invalid

                                    agreementsForThisSubchain.clear()

                                }

                            }

                        }

                    }

                }
                
            }).catch(()=>{})
            
            
        }
            
    
        // Iterate over upgrades and set new values for finalization proofs

        for(let [primePoolPubKey,metadata] of Object.entries(checkpointProposition)){

            let agreementsForThisSubchain = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('CHECKPOINT_PROPOSITION' + checkpointFullID).get(primePoolPubKey) // signer => signature

            if(agreementsForThisSubchain.size >= majority){

                // Now, aggregate EPOCH_FINALIZATION_PROOFs to get the AGGREGATED_EPOCH_FINALIZATION_PROOF and store locally

                let signers = [...agreementsForThisSubchain.keys()]

                let signatures = [...agreementsForThisSubchain.values()]
        
                let afkVoters = qtCheckpoint.quorum.filter(pubKey=>!signers.includes(pubKey))
        
                let aggregatedEpochFinalizationProof = {

                    subchain:primePoolPubKey,

                    lastAuthority:metadata.currentAuthority,
                    
                    lastIndex:metadata.finalizationProof.index,
                    
                    lastHash:metadata.finalizationProof.hash,

                    firstBlockHash:metadata.afpForFirstBlock.blockHash,

                    proof:{

                        aggregatedPub:bls.aggregatePublicKeys(signers),
                    
                        aggregatedSignature:bls.aggregateSignatures(signatures),
                        
                        afkVoters
            
                    }
                    
                }

                await global.SYMBIOTE_META.EPOCH_DATA.put(`AEFP:${qtCheckpoint.id}:${primePoolPubKey}`,aggregatedEpochFinalizationProof).catch(()=>{})

            }

        }

    }

    setTimeout(CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT,3000) // each 3 seconds - do monitoring

},




RUN_FINALIZATION_PROOFS_GRABBING = async (checkpoint,blockID,block) => {


    block ||= await global.SYMBIOTE_META.BLOCKS.get(blockID).catch(()=>false)

    let blockHash = Block.genHash(block)

    let checkpointFullID = checkpoint.hash + "#" + checkpoint.id



    if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)) return


    let {COMMITMENTS,FINALIZATION_PROOFS,DATABASE} = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    //Create the mapping to get the FINALIZATION_PROOFs from the quorum members. Inner mapping contains voterValidatorPubKey => his FINALIZATION_PROOF   
    
    FINALIZATION_PROOFS.set(blockID,new Map())

    let finalizationProofsMapping = FINALIZATION_PROOFS.get(blockID)

    let aggregatedCommitments = COMMITMENTS.get(blockID) //voterValidatorPubKey => his commitment 


    let optionsToSend = {method:'POST',body:JSON.stringify(aggregatedCommitments)},

        quorumMembers = await GET_QUORUM_URLS_AND_PUBKEYS(true),

        majority = GET_MAJORITY(checkpoint),

        promises=[]


    if(finalizationProofsMapping.size<majority){

        //Descriptor is {url,pubKey}
        for(let descriptor of quorumMembers){

            // No sense to get the commitment if we already have
            if(finalizationProofsMapping.has(descriptor.pubKey)) continue
    
            optionsToSend.agent = GET_HTTP_AGENT(descriptor.url)
    
            let promise = fetch(descriptor.url+'/finalization',optionsToSend).then(r=>r.json()).then(async possibleFinalizationProof=>{
                
                let finalProofIsOk = await bls.singleVerify(blockID+blockHash+'FINALIZATION'+checkpointFullID,descriptor.pubKey,possibleFinalizationProof.fp).catch(()=>false)
    
                if(finalProofIsOk) finalizationProofsMapping.set(descriptor.pubKey,possibleFinalizationProof.fp)
    
            
            }).catch(()=>false)
    

            // To make sharing async
            promises.push(promise)
    
        }
    
        await Promise.all(promises)

    }


    //_______________________ It means that we now have enough FINALIZATION_PROOFs for appropriate block. Now we can start to generate AGGREGATED_FINALIZATION_PROOF _______________________


    if(finalizationProofsMapping.size >= majority){

        // In this case , aggregate FINALIZATION_PROOFs to get the AGGREGATED_FINALIZATION_PROOF and share over the network
        // Also, increase the counter of global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER') to move to the next block and udpate the hash
    
        let signers = [...finalizationProofsMapping.keys()]

        let signatures = [...finalizationProofsMapping.values()]

        let afkVoters = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.filter(pubKey=>!signers.includes(pubKey))


        /*
        
        Aggregated version of FINALIZATION_PROOFs (it's AGGREGATED_FINALIZATION_PROOF)
        
        {
        
            blockID:"93:7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

            blockHash:"0123456701234567012345670123456701234567012345670123456701234567",
        
            aggregatedPub:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP",

            aggregatedSigna:"kffamjvjEg4CMP8VsxTSfC/Gs3T/MgV1xHSbP5YXJI5eCINasivnw07f/lHmWdJjC4qsSrdxr+J8cItbWgbbqNaM+3W4HROq2ojiAhsNw6yCmSBXl73Yhgb44vl5Q8qD",

            afkVoters:[]

        }
    

        */


        let aggregatedPub = bls.aggregatePublicKeys(signers), aggregatedSignature = bls.aggregateSignatures(signatures)
        
        let aggregatedFinalizationProof = {

            blockID,
            
            blockHash,
            
            aggregatedPub,
            
            aggregatedSignature,
            
            afkVoters

        }


        let appropriateDescriptor = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

        // Store to cache
        global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('HEALTH',{

            index:appropriateDescriptor.height,
            
            hash:blockHash,
            
            aggregatedFinalizationProof:{
                
                aggregatedPub,aggregatedSignature,afkVoters
            
            }
        
        })


        // Share here
        BROADCAST('/aggregated_finalization_proof',aggregatedFinalizationProof)

        // Store locally
        await global.SYMBIOTE_META.EPOCH_DATA.put('AFP:'+blockID,aggregatedFinalizationProof).catch(()=>false)


        // Repeat procedure for the next block and store the progress

        await USE_TEMPORARY_DB('put',DATABASE,'BLOCK_SENDER_HANDLER',appropriateDescriptor).catch(()=>false)

        appropriateDescriptor.height++

    }

},




RUN_COMMITMENTS_GRABBING = async (checkpoint,blockID,previousBlockIndex,block) => {


    block ||= await global.SYMBIOTE_META.BLOCKS.get(blockID).catch(()=>false)

    // Check for this block after a while
    if(!block) return


    let blockHash = Block.genHash(block)

    let checkpointFullID = checkpoint.hash + "#" + checkpoint.id

    // Try to get the AFP for previous block to send the proof of segment validity for quorum members that were absent for a while and don't have a valid copy of your blocks

    let previousBlockID = checkpoint.id + ':' + global.CONFIG.SYMBIOTE.PUB + ':' + previousBlockIndex

    let previousBlockAfp = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+previousBlockID).catch(()=>null)

    let optionsToSend = {method:'POST',body:JSON.stringify({block,previousBlockAfp})},

        commitmentsMapping = global.SYMBIOTE_META.TEMP.get(checkpointFullID).COMMITMENTS,
        
        majority = GET_MAJORITY(checkpoint),

        quorumMembers = await GET_QUORUM_URLS_AND_PUBKEYS(true),

        promises = [],

        commitmentsForCurrentBlock

    
    
    if(!commitmentsMapping) return

    else if(!commitmentsMapping.has(blockID)){

        commitmentsMapping.set(blockID,new Map()) // inner mapping contains voterValidatorPubKey => his commitment 

        commitmentsForCurrentBlock = commitmentsMapping.get(blockID)

    }else commitmentsForCurrentBlock = commitmentsMapping.get(blockID)


    if(commitmentsForCurrentBlock.size<majority){

        //Descriptor is {url,pubKey}
        for(let descriptor of quorumMembers){

            // No sense to get the commitment if we already have
    
            if(commitmentsForCurrentBlock.has(descriptor.pubKey)) continue
    

            /*
            
                0. Share the block via POST /block and get the commitment as the answer
       
                1. After getting 2/3N+1 commitments, aggregate it and call POST /finalization to send the aggregated commitment to the quorum members and get the 
    
                2. Get the 2/3N+1 FINALIZATION_PROOFs, aggregate and call POST /aggregated_finalization_proof to share the AGGREGATED_FINALIZATION_PROOFS over the symbiote
    
            */

            optionsToSend.agent = GET_HTTP_AGENT(descriptor.url)
            
            let promise = fetch(descriptor.url+'/block',optionsToSend).then(r=>r.json()).then(async possibleCommitment=>{

                let commitmentIsOk = await bls.singleVerify(blockID+blockHash+checkpointFullID,descriptor.pubKey,possibleCommitment.commitment).catch(()=>false)
    
                if(commitmentIsOk) commitmentsForCurrentBlock.set(descriptor.pubKey,possibleCommitment.commitment)

            }).catch(()=>{})
    
            // To make sharing async
            promises.push(promise)
    
        }
    
        await Promise.all(promises)

    }


    //_______________________ It means that we now have enough commitments for appropriate block. Now we can start to generate FINALIZATION_PROOF _______________________

    // On this step we should go through the quorum members and share FINALIZATION_PROOF to get the AGGREGATED_FINALIZATION_PROOFS(and this way - finalize the block)
    
    if(commitmentsForCurrentBlock.size>=majority){

        let signers = [...commitmentsForCurrentBlock.keys()]

        let signatures = [...commitmentsForCurrentBlock.values()]

        let afkVoters = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.filter(pubKey=>!signers.includes(pubKey))


        /*
        
        Aggregated version of commitments

        {
        
            blockID:"79:7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

            blockHash:"0123456701234567012345670123456701234567012345670123456701234567",
        
            aggregatedPub:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP",

            aggregatedSigna:"kffamjvjEg4CMP8VsxTSfC/Gs3T/MgV1xHSbP5YXJI5eCINasivnw07f/lHmWdJjC4qsSrdxr+J8cItbWgbbqNaM+3W4HROq2ojiAhsNw6yCmSBXl73Yhgb44vl5Q8qD",

            afkVoters:[]

        }
    

        */

        let aggregatedCommitments = {

            blockID,
            
            blockHash,
            
            aggregatedPub:bls.aggregatePublicKeys(signers),
            
            aggregatedSignature:bls.aggregateSignatures(signatures),
            
            afkVoters

        }

        //Set the aggregated version of commitments to start to grab FINALIZATION_PROOFS
        commitmentsMapping.set(blockID,aggregatedCommitments)

        await RUN_FINALIZATION_PROOFS_GRABBING(checkpoint,blockID,block).catch(()=>{})

    }

},




SHARE_BLOCKS_AND_GET_PROOFS = async () => {

    let qtCheckpoint = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT
    
    let checkpointFullID = qtCheckpoint.hash + "#" + qtCheckpoint.id

    // If we don't generate the blocks - skip this function
    if(!global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('CAN_PRODUCE_BLOCKS:'+checkpointFullID)){

        setTimeout(SHARE_BLOCKS_AND_GET_PROOFS,3000)

        return

    }

    if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)){

        setTimeout(SHARE_BLOCKS_AND_GET_PROOFS,3000)

        return

    }

    // Descriptor has the following structure - {checkpointID,height}
    let appropriateDescriptor = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

    let {FINALIZATION_PROOFS,DATABASE} = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    if(!appropriateDescriptor || appropriateDescriptor.checkpointID !== qtCheckpoint.id){

        //If we still works on the old checkpoint - continue
        //Otherwise,update the latest height/hash and send them to the new QUORUM
        appropriateDescriptor = await USE_TEMPORARY_DB('get',DATABASE,'BLOCK_SENDER_HANDLER').catch(()=>false)

        if(!appropriateDescriptor){

            // Set the new handler with index 0(because each new epoch start with block index 0)
            appropriateDescriptor = {
    
                checkpointID:qtCheckpoint.id,
    
                height:0
    
            }
    
        }
        
        // And store new descriptor(till it will be old)
        global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('BLOCK_SENDER_HANDLER',appropriateDescriptor)

    }


    let blockID = qtCheckpoint.id+':'+global.CONFIG.SYMBIOTE.PUB+':'+appropriateDescriptor.height


    if(FINALIZATION_PROOFS.has(blockID)){

        //This option means that we already started to share aggregated 2/3N+1 commitments and grab 2/3+1 FINALIZATION_PROOFS
        await RUN_FINALIZATION_PROOFS_GRABBING(qtCheckpoint,blockID).catch(()=>{})

    }else{

        // This option means that we already started to share block and going to find 2/3N+1 commitments
        // Once we get it - aggregate it and start finalization proofs grabbing(previous option)

        await RUN_COMMITMENTS_GRABBING(qtCheckpoint,blockID,appropriateDescriptor.height-1).catch(()=>{})

    }

    setImmediate(SHARE_BLOCKS_AND_GET_PROOFS)

},




// Iterate over current authorities on subchains to get <aggregatedSkipProof>s and approvements to move to the next reserve pools
REASSIGN_PROCEDURE_MONITORING=async()=>{

    let checkpoint = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT

    let checkpointFullID = checkpoint.hash+"#"+checkpoint.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

    if(!tempObject){

        setTimeout(REASSIGN_PROCEDURE_MONITORING,3000)

        return

    }


    if(!CHECK_IF_CHECKPOINT_STILL_FRESH(global.SYMBIOTE_META.QUORUM_THREAD)){

        setTimeout(REASSIGN_PROCEDURE_MONITORING,3000)

        return

    }


    let majority = GET_MAJORITY(checkpoint)

    let currentCheckpointDB = tempObject.DATABASE

    let skipHandlers = tempObject.SKIP_HANDLERS

    let reassignments = tempObject.REASSIGNMENTS
    

    // Get the appropriate pubkey & url to check and validate the answer
    let quorumMembersURLsAndPubKeys = await GET_QUORUM_URLS_AND_PUBKEYS(true)



    for(let primePoolPubKey of checkpoint.poolsRegistry.primePools){

        // First of all - check for CREATE_REASSIGNMENT requests in synchronizer

        let reassignmentHandler = reassignments.get(primePoolPubKey) || {currentAuthority:-1}

        let doReassignmentRequest = tempObject.SYNCHRONIZER.get('CREATE_REASSIGNMENT:'+primePoolPubKey) // {shouldBeThisAuthority,aspsForPreviousPools}



        if(doReassignmentRequest && reassignmentHandler.currentAuthority < doReassignmentRequest.shouldBeThisAuthority){

            /*
            
                Update the local information

                1) Start(in reverse order) from shouldBeThisAuthority index in checkpoint.reassignmentChains[primePoolPubKey] to the pool which was skipped on .skipIndex > -1 

                2) Create the skipHandler for each pool

                3) Finally, update the data in tempObject.REASSIGNMENTS:
                
                    a) Put the pool checkpoint.reassignmentChains[primePoolPubKey][shouldBeThisAuthority] to tempObject.REASSIGNMENTS.set(poolPubKey,primePoolPubKey) to make it current authority for subchain

                    b) Update the reassignment handler for prime pool to point to <shouldBeThisAuthority> index => tempObject.REASSIGNMENTS.set(primePoolPubKey,{currentAuthority:shouldBeThisAuthority})

            */

            for(let positionInRc = doReassignmentRequest.shouldBeThisAuthority ; positionInRc >= -1; positionInRc--){

                let poolPubKey = checkpoint.reassignmentChains[primePoolPubKey][positionInRc]

                let aspForThisPool = doReassignmentRequest.aspsForPreviousPools[poolPubKey]

                if(!skipHandlers.has(poolPubKey)){

                    // Create the skip handler if we don't have it

                    let futureSkipHandler = {

                        aggregatedSkipProof: aspForThisPool

                    }

                    // Store to temp DB

                    await USE_TEMPORARY_DB('put',currentCheckpointDB,'SKIP_HANDLER:'+poolPubKey,futureSkipHandler).catch(()=>{})

                    skipHandlers.set(poolPubKey,futureSkipHandler)

                }

                // No sense to continue to get more ASPs

                if(aspForThisPool.skipIndex > -1) break

            }

            //__________________________ Inform the target pool and store the fact of it __________________________

            
            let nextPoolInRc = checkpoint.reassignmentChains[primePoolPubKey][doReassignmentRequest.shouldBeThisAuthority]

            let poolStorage = await GET_FROM_QUORUM_THREAD_STATE(nextPoolInRc+'(POOL)_STORAGE_POOL').catch(()=>null)


            // Send request
            let bodyToSend = {

                subchain:primePoolPubKey,

                ...doReassignmentRequest

            }

            let optionsToSend = {

                method:'POST',

                body:JSON.stringify(bodyToSend),

                agent:GET_HTTP_AGENT(poolStorage.poolURL)

            }

            // Send to target pool
            fetch(poolStorage.poolURL+'/accept_reassignment',optionsToSend).catch(()=>{})

            // ... and to quorum members
            for(let poolUrlWithPubkey of quorumMembersURLsAndPubKeys){

                optionsToSend.agent = GET_HTTP_AGENT(poolUrlWithPubkey.url)
    
                fetch(poolUrlWithPubkey.url+'/accept_reassignment',optionsToSend).catch(()=>{})
                     
            }

            // Store the fact that set of ASPs was sent to target pool(next authority in reassignment chain for this subchain)

            await USE_TEMPORARY_DB('put',currentCheckpointDB,`SENT_ALERT:${primePoolPubKey}:${doReassignmentRequest.shouldBeThisAuthority}`,true).then(async()=>{

                global.SYMBIOTE_META.STATIC_STUFF_CACHE.set(`SENT_ALERT:${primePoolPubKey}:${doReassignmentRequest.shouldBeThisAuthority}`,true)

                //______________________Finally, create the urgent reassignment stats______________________

                await USE_TEMPORARY_DB('put',currentCheckpointDB,'REASSIGN:'+primePoolPubKey,{currentAuthority:doReassignmentRequest.shouldBeThisAuthority}).then(()=>{

                
                    let oldAuthorityPubKey = checkpoint.reassignmentChains[primePoolPubKey][reassignmentHandler.currentAuthority] || primePoolPubKey

                    let nextAuthorityPubKey = checkpoint.reassignmentChains[primePoolPubKey][doReassignmentRequest.shouldBeThisAuthority]


                    reassignments.delete(oldAuthorityPubKey)

                    reassignments.set(primePoolPubKey,{currentAuthority:doReassignmentRequest.shouldBeThisAuthority})

                    reassignments.set(nextAuthorityPubKey,primePoolPubKey)


                }).catch(()=>{})


            }).catch(()=>{})
            
    

        }




        let poolPubKeyForHunting, previousPoolPubKey

        if(reassignmentHandler){

            poolPubKeyForHunting = checkpoint.reassignmentChains[primePoolPubKey][reassignmentHandler.currentAuthority]

            previousPoolPubKey = checkpoint.reassignmentChains[primePoolPubKey][reassignmentHandler.currentAuthority-1] || primePoolPubKey

        }else{

            poolPubKeyForHunting = primePoolPubKey

            previousPoolPubKey = null
        } 


        let skipHandler = skipHandlers.get(poolPubKeyForHunting)


        // If no skip handler for target pool - do nothing

        if(!skipHandler) continue
        
        if(!skipHandler.aggregatedSkipProof){


            // Otherwise, send <extendedAggregatedCommitments> and <aggregatedFinalizationProofForFirstBlock> in SKIP_HANDLER to => POST /get_skip_proof

            let responsePromises = []

            let firstBlockID = checkpoint.id+':'+poolPubKeyForHunting+':0' // epochID:PubKeyOfCreator:0 - first block in epoch

            let aggregatedFinalizationProofForFirstBlock = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+firstBlockID).catch(()=>false)

            let firstBlockHash

            let previousAspHash


            if(!aggregatedFinalizationProofForFirstBlock){

                if(skipHandler.extendedAggregatedCommitments.index === -1) firstBlockHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

                else if (skipHandler.extendedAggregatedCommitments.index === 0) firstBlockHash = skipHandler.extendedAggregatedCommitments.hash

            } else firstBlockHash = aggregatedFinalizationProofForFirstBlock.blockHash



            if(skipHandler.extendedAggregatedCommitments.index >= 0 && poolPubKeyForHunting !== primePoolPubKey){

                let firstBlock = await GET_BLOCK(checkpoint.id,poolPubKeyForHunting,0).catch(()=>null)

                if(firstBlock && Block.genHash(firstBlock) === firstBlockHash && firstBlock.extraData.reassignments[previousPoolPubKey]){

                    // Now get the hash of ASP for previous pool in reassignment chain

                    previousAspHash = BLAKE3(JSON.stringify(firstBlock.extraData.reassignments[previousPoolPubKey]))

                }

            } else previousAspHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

            // If we don't have AC(aggregated commitments) for first block(with id=0) and skipped index is not -1 or 0 - no sense to send requests because it will be rejected by quorum

            if(!firstBlockHash || !previousAspHash) continue


            let sendOptions = {
                
                method:'POST',

                body:JSON.stringify({

                    poolPubKey:poolPubKeyForHunting,

                    subchain:primePoolPubKey,

                    aggregatedFinalizationProofForFirstBlock,

                    extendedAggregatedCommitments:skipHandler.extendedAggregatedCommitments

                })

            }

            for(let poolUrlWithPubkey of quorumMembersURLsAndPubKeys){

                sendOptions.agent = GET_HTTP_AGENT(poolUrlWithPubkey.url)

                let responsePromise = fetch(poolUrlWithPubkey.url+'/get_skip_proof',sendOptions).then(r=>r.json()).then(response=>{
    
                    response.pubKey = poolUrlWithPubkey.pubKey
        
                    return response
        
                }).catch(()=>false)
        
                responsePromises.push(responsePromise)
        
            }


            let results = (await Promise.all(responsePromises)).filter(Boolean)
   

            /*
            
            ___________________________ Now analyze the responses ___________________________

            [1] In case quroum member also has this pool in SKIP_HANDLER - this is the signal that it also stopped creating finalization proofs for a given pool

                If its local version of <extendedAggregatedCommitments> in skip handler has lower index than in FP that we send - the response format is:

                
                    {
                        type:'OK',
                        sig: BLS_SIG('SKIP:<poolPubKey>:<previousAspInRcHash>:<firstBlockHash>:<skipIndex>:<skipHash>:<checkpointFullID>')
                    }

                    We should just verify this signature and add to local list for further aggregation
                    And this quorum member update his own local version of FP to have FP with bigger index


            [2] In case quorum member has bigger index of FP in its local skip handler - it sends us 'UPDATE' message with EXTENDED_FINALZATION_PROOF where:

                HIS_extendedAggregatedCommitments.index > OUR_LOCAL_extendedAggregatedCommitments.index

                Again - we should verify the signature, update local version of FP in our skip handler and repeat the grabbing procedure

                The response format in this case is:

                    {
                        type:'UPDATE',
                        
                        extendedAggregatedCommitments:{
                            
                            index,
                            hash,
                            aggregatedCommitments:{aggregatedPub,aggregatedSignature,afkVoters}
                        }
                        
                    }

            */

            let pubkeysWhoAgreeToSkip = [], signaturesToSkip = []

            let {index,hash} = skipHandler.extendedAggregatedCommitments

            let dataThatShouldBeSigned = `SKIP:${poolPubKeyForHunting}:${previousAspHash}:${firstBlockHash}:${index}:${hash}:${checkpointFullID}`

            for(let result of results){

                if(result.type === 'OK' && typeof result.sig === 'string'){

                    let signatureIsOk = await bls.singleVerify(dataThatShouldBeSigned,result.pubKey,result.sig).catch(()=>false)

                    if(signatureIsOk){

                        pubkeysWhoAgreeToSkip.push(result.pubKey)

                        signaturesToSkip.push(result.sig)

                    }

                    if(pubkeysWhoAgreeToSkip.length >= majority) break // if we get 2/3N+1 signatures to skip - we already have ability to create <aggregatedSkipProof>


                }else if(result.type === 'UPDATE' && typeof result.extendedAggregatedCommitments === 'object'){


                    let {index,hash,aggregatedCommitments} = result.extendedAggregatedCommitments


                    if(aggregatedCommitments){

                        let {aggregatedPub,aggregatedSignature,afkVoters} = aggregatedCommitments
            
                        let dataThatShouldBeSigned = (checkpoint.id+':'+poolPubKeyForHunting+':'+index)+hash+checkpointFullID
                        
                        let aggregatedCommitmentsIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID),dataThatShouldBeSigned,aggregatedSignature,checkpoint.quorum.length-majority).catch(()=>false)
            

                        //If signature is ok and index is bigger than we have - update the <extendedAggregatedCommitments> in our local skip handler
            
                        if(aggregatedCommitmentsIsOk && skipHandler.extendedAggregatedCommitments.index < index){
            
                            
                            skipHandler.extendedAggregatedCommitments.index = index

                            skipHandler.extendedAggregatedCommitments.hash = hash

                            skipHandler.extendedAggregatedCommitments.aggregatedCommitments = {aggregatedPub,aggregatedSignature,afkVoters}
            

                            // Store the updated version of skip handler

                            await USE_TEMPORARY_DB('put',currentCheckpointDB,'SKIP_HANDLER:'+poolPubKeyForHunting,skipHandler).catch(()=>{})

                            // If our local version had lower index - break the cycle and try again with updated value

                            break

                        }

                    }
                
                }

            }


            //____________________If we get 2/3+1 of votes - aggregate, get the ASP(<aggregatedSkipProof>), add to local skip handler and start to grab approvements____________________

            if(pubkeysWhoAgreeToSkip.length >= majority){

                skipHandler.aggregatedSkipProof = {

                    previousAspHash,

                    firstBlockHash,

                    skipIndex:skipHandler.extendedAggregatedCommitments.index,

                    skipHash:skipHandler.extendedAggregatedCommitments.hash,

                    aggregatedPub:bls.aggregatePublicKeys(pubkeysWhoAgreeToSkip),

                    aggregatedSignature:bls.aggregateSignatures(signaturesToSkip),

                    afkVoters:checkpoint.quorum.filter(pubKey=>!pubkeysWhoAgreeToSkip.includes(pubKey))

                }

                await USE_TEMPORARY_DB('put',currentCheckpointDB,'SKIP_HANDLER:'+poolPubKeyForHunting,skipHandler).catch(()=>{})


            }

        }


        if(skipHandler.aggregatedSkipProof){

            // Inform the next pool in reassignment chain that it's time to start to generate blocks. We need to send him ASPs for previous pools

            let indexOfSkippedPoolInRc = skipHandler.indexInReassignmentChain

            // Find next pool

            let nextPoolInRc = checkpoint.reassignmentChains[primePoolPubKey][indexOfSkippedPoolInRc+1]

            let poolStorage = await GET_FROM_QUORUM_THREAD_STATE(nextPoolInRc+'(POOL)_STORAGE_POOL').catch(()=>null)

            let aspsForPreviousPools = {}

            if(poolStorage){

                // Get all the ASPs

                let shouldTryNextTime = false // flag in case we won't get required ASPs

                for(let position = indexOfSkippedPoolInRc ; position >= -1 ; position--){

                    let pubKeyOfSomePreviousPool = checkpoint.reassignmentChains[primePoolPubKey][position] || primePoolPubKey

                    let skipHandlerForSomePreviousPool = skipHandlers.get(pubKeyOfSomePreviousPool)

                    let aspThatWeAreGoingToSend = skipHandlerForSomePreviousPool.aggregatedSkipProof

                    if(!aspThatWeAreGoingToSend){

                        // Find ASP over the quorum
                        for(let poolUrlWithPubkey of quorumMembersURLsAndPubKeys){


                            let possibleAsp = await fetch(poolUrlWithPubkey.url+`/get_asp_for_pool/${primePoolPubKey}/${position}`,{agent:GET_HTTP_AGENT(poolUrlWithPubkey.url)}).catch(()=>null)
                            
                            if(possibleAsp && await CHECK_AGGREGATED_SKIP_PROOF_VALIDITY(pubKeyOfSomePreviousPool,possibleAsp,checkpointFullID,checkpoint,'QUORUM_THREAD')){

                                aspThatWeAreGoingToSend = possibleAsp

                            }

                            
                        }


                    }

                    if(!aspThatWeAreGoingToSend){

                        shouldTryNextTime = true

                        break

                    }

                    aspsForPreviousPools[pubKeyOfSomePreviousPool] = aspThatWeAreGoingToSend

                    if(skipHandlerForSomePreviousPool.aggregatedSkipProof.skipIndex > -1) break
                
                }


                if(shouldTryNextTime) continue


                // Send request
                let bodyToSend = {

                    subchain:primePoolPubKey,

                    shouldBeThisAuthority:indexOfSkippedPoolInRc+1,

                    aspsForPreviousPools

                }

                let optionsToSend = {

                    method:'POST',

                    body:JSON.stringify(bodyToSend),

                    agent:GET_HTTP_AGENT(poolStorage.poolURL)

                }

                // Send to target pool
                fetch(poolStorage.poolURL+'/accept_reassignment',optionsToSend).catch(()=>{})

                // ... and to quorum members
                for(let poolUrlWithPubkey of quorumMembersURLsAndPubKeys){

                    optionsToSend.agent = GET_HTTP_AGENT(poolUrlWithPubkey.url)
    
                    fetch(poolUrlWithPubkey.url+'/accept_reassignment',optionsToSend).catch(()=>{})
                     
                }

                // Store the fact that set of ASPs was sent to target pool(next authority in reassignment chain for this subchain)

                await USE_TEMPORARY_DB('put',currentCheckpointDB,`SENT_ALERT:${primePoolPubKey}:${indexOfSkippedPoolInRc+1}`,true).catch(()=>{})

                global.SYMBIOTE_META.STATIC_STUFF_CACHE.set(`SENT_ALERT:${primePoolPubKey}:${indexOfSkippedPoolInRc+1}`,true)


                /*

                    If ASP already exists - ask for 2/3N+1 => POST /get_reassignment_ready_status

                    We should send

                    {
                        poolPubKey<pool's BLS public key>,
                        session:<64-bytes hex string - randomly generated>
                    }

                    If requested quorum member has ASP: 

                        Response => {type:'OK',sig:SIG(`REASSIGNMENT:<poolPubKey>:<session>:<checkpointFullID>`)}

                    Otherwise:
                
                        Response => {type:'ERR'}


                */

                let session = crypto.randomBytes(32).toString('hex')

                let dataToSend = {

                    method:'POST',
                
                    body:JSON.stringify({

                        subchain:primePoolPubKey,

                        indexOfNext:indexOfSkippedPoolInRc+1,
                        
                        session
                    
                    })

                }


                let proofsPromises=[]


                for(let poolUrlWithPubkey of quorumMembersURLsAndPubKeys){

                    dataToSend.agent = GET_HTTP_AGENT(poolUrlWithPubkey.url)
    
                    let responsePromise = fetch(poolUrlWithPubkey.url+'/get_reassignment_ready_status',dataToSend).then(r=>r.json()).then(response=>{
        
                        response.pubKey = poolUrlWithPubkey.pubKey
            
                        return response
            
                    }).catch(()=>false)
            
                    proofsPromises.push(responsePromise)
            
                }
    
                
                let results = (await Promise.all(proofsPromises)).filter(Boolean)
    
                let dataThatShouldBeSigned = `REASSIGNMENT:${poolPubKeyForHunting}:${session}:${checkpointFullID}`
    
                let numberWhoAgreeToDoReassignment = 0
    
                
                //___________________Now analyze the results___________________
    
                for(let result of results){
    
                    if(result.type === 'OK' && typeof result.sig === 'string'){
    
                        let signatureIsOk = await bls.singleVerify(dataThatShouldBeSigned,result.pubKey,result.sig).catch(()=>false)
    
                        if(signatureIsOk) numberWhoAgreeToDoReassignment++
    
                        if(numberWhoAgreeToDoReassignment >= majority) break // if we get 2/3N+1 approvements - no sense to continue
    
                    }
                
                }
    
    
                if(numberWhoAgreeToDoReassignment >= majority){


                    //_____________________________________Now, create the request for reassignment_____________________________________
                    
                    // In case typeof is string - it's reserve pool which points to prime pool, so we should put appropriate request
                    // In case currentStateInReassignments is nothing(undefined,null,etc.) - it's prime pool without any reassignments
    
                    let currentSubchainAuthority
    
    
                    // Add the reassignment
    
                    let reassignmentMetadata = reassignments.get(primePoolPubKey) // {currentAuthority:<number>} - pointer to current reserve pool in array (QT/VT).CHECKPOINT.reassignmentChains[<primePool>]
    
    
                    if(!reassignmentMetadata){
    
                        // Create new handler
    
                        reassignmentMetadata = {currentAuthority:-1}
    
                        currentSubchainAuthority = poolPubKeyForHunting
    
                    }else currentSubchainAuthority = checkpoint.reassignmentChains[primePoolPubKey][reassignmentMetadata.currentAuthority] // {primePool:[<reservePool1>,<reservePool2>,...,<reservePoolN>]}
    
    
                    let nextIndex = reassignmentMetadata.currentAuthority + 1
    
                    let nextReservePool = checkpoint.reassignmentChains[primePoolPubKey][nextIndex] // array checkpoint.reassignmentChains[primePoolID] might be empty if the prime pool doesn't have reserve pools
    
                    let skipHandlerOfAuthority = JSON.parse(JSON.stringify(skipHandlers.get(currentSubchainAuthority))) // {extendedAggregatedCommitments,aggregatedSkipProof}
    
    
                    // Use atomic operation here to write reassignment data + updated skip handler
    
                    let keysToAtomicWrite = [
    
                        'REASSIGN:'+primePoolPubKey,
                        
                        'SKIP_HANDLER:'+currentSubchainAuthority
    
                    ]
    
                    let valuesToAtomicWrite = [
    
                        {currentAuthority:nextIndex},
    
                        skipHandlerOfAuthority
    
                    ]
    
                    await USE_TEMPORARY_DB('atomicPut',currentCheckpointDB,keysToAtomicWrite,valuesToAtomicWrite).then(()=>{
        
                        // And only after successful store we can move to the next pool
    
                        // Delete the reassignment in case skipped authority was reserve pool
    
                        if(currentSubchainAuthority !== primePoolPubKey) reassignments.delete(currentSubchainAuthority)
                    
                        
                        reassignmentMetadata.currentAuthority++
        
    
                        // Set new values - handler for prime pool and pointer to prime pool for reserve pool
    
                        reassignments.set(primePoolPubKey,reassignmentMetadata)
    
                        reassignments.set(nextReservePool,primePoolPubKey)
    
    
                    }).catch(()=>false)
    
                }
              

            }else continue

    
        }


    }


    // Start again
    setImmediate(REASSIGN_PROCEDURE_MONITORING)

    
},




//Function to monitor the available block creators
SUBCHAINS_HEALTH_MONITORING=async()=>{

    let checkpoint = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT

    let checkpointFullID = checkpoint.hash+"#"+checkpoint.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

    if(!tempObject){

        setTimeout(SUBCHAINS_HEALTH_MONITORING,global.CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return

    }


    let synchronizer = tempObject.SYNCHRONIZER


    // If you're not in quorum or checkpoint is outdated - don't start health monitoring
    if(!checkpoint.quorum.includes(global.CONFIG.SYMBIOTE.PUB) || synchronizer.has('TIME_TO_NEW_EPOCH') || !CHECK_IF_CHECKPOINT_STILL_FRESH(global.SYMBIOTE_META.QUORUM_THREAD)){

        setTimeout(SUBCHAINS_HEALTH_MONITORING,global.CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return

    }



    // Get the appropriate pubkey & url to check and validate the answer
    let poolsURLsAndPubKeys = await GET_QUORUM_URLS_AND_PUBKEYS(true)

    let allThePools = checkpoint.poolsRegistry.reservePools.concat(checkpoint.poolsRegistry.primePools)

    let proofsPromises = []

    let candidatesForAnotherCheck = []

    let reassignments = tempObject.REASSIGNMENTS
    
    let reverseThreshold = checkpoint.quorum.length-GET_MAJORITY(checkpoint)

    let rootPubKey = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)


    
    for(let poolPubKey of allThePools){
        

        /*
        
        We should monitor the health only for:

        [0] Pools that are not in SKIP_HANDLERS
        [1] Reserve pools that are currently work for prime pool

        */


        let itsReservePool = checkpoint.poolsRegistry.reservePools.includes(poolPubKey)

        let poolIsInReassignment = itsReservePool && typeof reassignments.get(poolPubKey) === 'string'


        if(!tempObject.SKIP_HANDLERS.has(poolPubKey) && (!itsReservePool || poolIsInReassignment)){

            let createRequest = synchronizer.get('CREATE_SKIP_HANDLER:'+poolPubKey)


            if(createRequest && synchronizer.get('NO_FP_NOW:'+poolPubKey)){

                // This prevents creating FINALIZATION_PROOFS for pool and initiate the reassignment procedure

                let poolIndexInRc = itsReservePool ? reassignments.get(reassignments.get(poolPubKey)).currentAuthority : -1

                let futureSkipHandler = {

                    indexInReassignmentChain:poolIndexInRc,

                    extendedAggregatedCommitments:JSON.parse(JSON.stringify(tempObject.CHECKPOINT_MANAGER.get(poolPubKey))), // {index,hash,aggregatedCommitments}

                    aggregatedSkipProof:null // for future - when we get the 2/3N+1 skip proofs from POST /get_skip_proof - aggregate and use to insert in blocks of reserve pool and so on

                }

                await USE_TEMPORARY_DB('put',tempObject.DATABASE,'SKIP_HANDLER:'+poolPubKey,futureSkipHandler).then(()=>{

                    tempObject.SKIP_HANDLERS.set(poolPubKey,futureSkipHandler)

                    // Delete the request
                    synchronizer.delete('CREATE_SKIP_HANDLER:'+poolPubKey)

                    // Clear the NO_FP_NOW protection
                    synchronizer.delete('NO_FP_NOW:'+poolPubKey)


                }).catch(()=>false)

            }else if(!createRequest){

                // Received {lastSeen,index,hash,aggregatedFinalizationProof}
                let localHealthHandler = tempObject.HEALTH_MONITORING.get(poolPubKey)

                let currentTime = GET_GMT_TIMESTAMP()

                if(!localHealthHandler){

                    localHealthHandler = {

                        lastSeen:currentTime,

                        index:-1,

                        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

                    }

                    tempObject.HEALTH_MONITORING.set(poolPubKey,localHealthHandler)            

                }

                let afkLimit = global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.SUBCHAIN_AFK_LIMIT

                if(currentTime-localHealthHandler.lastSeen >= afkLimit){

                    let metadataOfCurrentPool = await GET_FROM_QUORUM_THREAD_STATE(poolPubKey+'(POOL)_STORAGE_POOL')

                    let responsePromise = fetch(metadataOfCurrentPool.poolURL+'/health',{agent:GET_HTTP_AGENT(metadataOfCurrentPool.poolURL)}).then(r=>r.json()).then(response=>{
    
                        response.pubKey = poolPubKey
            
                        return response
            
                    }).catch(()=>{candidatesForAnotherCheck.push(poolPubKey)})
            
                    proofsPromises.push(responsePromise)    

                }

            }

        }

    }

    //Run promises
    let healthCheckPingbacks = (await Promise.all(proofsPromises)).filter(Boolean)

    /*
    
        Each object in healthCheckPingbacks array has the following structure
        
        {

            pubKey,
        
            index, // height of block that we already finalized. Also, below you can see the AGGREGATED_FINALIZATION_PROOF. We need it as a quick proof that majority have voted for this segment of subchain
            
            hash:<>,

            aggregatedFinalizationProof:{
            
                aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HASH+"#"+QT.CHECKPOINT.id
                aggregatedPub:<>,
                afkVoters
        
            }

        }
    
    */


    for(let answer of healthCheckPingbacks){


        if(typeof answer !== 'object' || typeof answer.aggregatedFinalizationProof !== 'object'){

            candidatesForAnotherCheck.push(answer.pubKey)

            continue
        }

        let {aggregatedPub,aggregatedSignature,afkVoters} = answer.aggregatedFinalizationProof

        let {index,hash} = answer

        let pubKey = answer.pubKey


        // Received {lastSeen,index,hash,aggregatedFinalizationProof}
        let localHealthHandler = tempObject.HEALTH_MONITORING.get(pubKey)


        //__________________________________Verify the AFP proof_________________________________________________

        
        let data = (checkpoint.id+':'+pubKey+':'+index)+hash+'FINALIZATION'+checkpointFullID

        let aggregatedFinalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,rootPubKey,data,aggregatedSignature,reverseThreshold).catch(()=>false)


        // If signature is ok and index is bigger than we have - update the <lastSeen> time and set new height/hash/aggregatedFinalizationProof

        if(aggregatedFinalizationProofIsOk && (localHealthHandler.index < index || localHealthHandler.index === -1)){

            localHealthHandler.lastSeen = GET_GMT_TIMESTAMP()

            localHealthHandler.index = index

            localHealthHandler.hash = hash

            localHealthHandler.aggregatedFinalizationProof = {aggregatedPub,aggregatedSignature,afkVoters}

        }else candidatesForAnotherCheck.push(pubKey)
        
    }

    //______ ON THIS STEP - in <candidatesForAnotherCheck> we have pools that required to be asked via other quorum members and probably start a skip procedure _______


    let currentTime = GET_GMT_TIMESTAMP()

    let afkLimit = global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.SUBCHAIN_AFK_LIMIT


    
    for(let candidate of candidatesForAnotherCheck){

        let localHealthHandler = tempObject.HEALTH_MONITORING.get(candidate) // {lastSeen,index,hash,aggregatedFinalizationProof}

        if(currentTime-localHealthHandler.lastSeen >= afkLimit){

            let updateWasFound = false
            
            //_____________________ Now, go through the quorum members and try to get updates from them_____________________

            for(let validatorHandler of poolsURLsAndPubKeys){

                let answer = await fetch(validatorHandler.url+'/get_health_of_another_pool/'+candidate,{agent:GET_HTTP_AGENT(validatorHandler.url)}).then(r=>r.json()).catch(()=>false)

                if(typeof answer === 'object'){

                    // Verify and if ok - break the cycle

                    let {index,hash,aggregatedFinalizationProof} = answer

                    if(typeof aggregatedFinalizationProof === 'object'){

                        let {aggregatedPub,aggregatedSignature,afkVoters} = aggregatedFinalizationProof

                        let data = (checkpoint.id+':'+candidate+':'+index)+hash+'FINALIZATION'+checkpointFullID
    
                        let aggregatedFinalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,rootPubKey,data,aggregatedSignature,reverseThreshold).catch(()=>false)
    
                        //If signature is ok and index is bigger than we have - update the <lastSeen> time and set new aggregatedFinalizationProof
    
                        if(aggregatedFinalizationProofIsOk && (localHealthHandler.index < index || localHealthHandler.index === -1)){
    
                            localHealthHandler.lastSeen = currentTime

                            localHealthHandler.index = index

                            localHealthHandler.hash = hash
    
                            localHealthHandler.aggregatedFinalizationProof = {aggregatedPub,aggregatedSignature,afkVoters}
                    
                        }
                    
                    }

                }

            }

            
            let reassignmentHandlerOrPointerToPrimePool = reassignments.get(candidate)

            let primePoolPointer

            let candidateIsLatestInReassignmentChain


            if(!reassignmentHandlerOrPointerToPrimePool){

                // If nothing - then it's attempt to skip the prime pool(index -1 in reassignment chain)
                primePoolPointer = candidate

                candidateIsLatestInReassignmentChain = checkpoint.reassignmentChains[primePoolPointer].length === 0

            }else{

                primePoolPointer = candidate

                // In case it's string - then this string is a pubkey of prime pool
                if(typeof reassignmentHandlerOrPointerToPrimePool === 'string'){
    
                    primePoolPointer = reassignmentHandlerOrPointerToPrimePool
    
                    // If candidate is not a prime pool - get the handler for prime pool to get the .currentAuthority property
                    reassignmentHandlerOrPointerToPrimePool = reassignments.get(reassignmentHandlerOrPointerToPrimePool)
    
                }

                // No sense to skip the latest pool in chain. Because in this case nobody won't have ability to continue work on subchain
                candidateIsLatestInReassignmentChain = reassignmentHandlerOrPointerToPrimePool.currentAuthority === (checkpoint.reassignmentChains[primePoolPointer].length-1)

            }

            
            if(!(updateWasFound || candidateIsLatestInReassignmentChain)){

                // If no updates - add the request to create SKIP_HANDLER via a sync and secured way
                synchronizer.set('CREATE_SKIP_HANDLER:'+candidate,true)
                
            }

        }

    }

    console.log('DEBUG: Health monitoring is ', tempObject.HEALTH_MONITORING)


    setTimeout(SUBCHAINS_HEALTH_MONITORING,global.CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)


},




RESTORE_STATE=async()=>{

    let poolsRegistry = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.poolsRegistry

    let allThePools = poolsRegistry.primePools.concat(poolsRegistry.reservePools)

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)
    


    for(let poolPubKey of allThePools){

        // If this value is related to the current checkpoint - set to manager, otherwise - take from the POOLS_METADATA as a start point
        // Returned value is {index,hash,(?)aggregatedCommitments}

        let {index,hash,aggregatedCommitments} = await tempObject.DATABASE.get(poolPubKey).catch(()=>false) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'}

        
        tempObject.CHECKPOINT_MANAGER.set(poolPubKey,{index,hash,aggregatedCommitments})


        //______________________________ Try to find SKIP_HANDLER for pool ______________________________


        let skipHandler = await tempObject.DATABASE.get('SKIP_HANDLER:'+poolPubKey).catch(()=>false) // {extendedAggregatedCommitments,aggregatedSkipProof}

        if(skipHandler) tempObject.SKIP_HANDLERS.set(poolPubKey,skipHandler)


        //___________________________________ Check for reassignments _______________________________________

        // *only for prime pools
        
        if(poolsRegistry.primePools.includes(poolPubKey)){

            let reassignmentMetadata = await tempObject.DATABASE.get('REASSIGN:'+poolPubKey).catch(()=>false) // {currentAuthority:<pointer to current reserve pool in (QT/VT).CHECKPOINT.reassignmentChains[<primePool>]>}

            if(reassignmentMetadata){

                tempObject.REASSIGNMENTS.set(poolPubKey,reassignmentMetadata)

                // Using pointer - find the appropriate reserve pool

                let reservePool = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.reassignmentChains[poolPubKey][reassignmentMetadata.currentAuthority]

                // Key is reserve pool which points to his prime pool
                tempObject.REASSIGNMENTS.set(reservePool,poolPubKey)                

            }

        }

        tempObject.SYNCHRONIZER.set('NO_FP_NOW:'+poolPubKey,true)

    }


    // Finally, once we've started the "next checkpoint generation" process - restore it

    let itsTimeForTheNextCheckpoint = await tempObject.DATABASE.get('TIME_TO_NEW_EPOCH').catch(()=>false)

    if(itsTimeForTheNextCheckpoint) {

        tempObject.SYNCHRONIZER.set('TIME_TO_NEW_EPOCH',true)

        tempObject.SYNCHRONIZER.set('READY_FOR_CHECKPOINT',true)

    }

},




/*

Function to find the AGGREGATED_EPOCH_FINALIZATION_PROOFS for appropriate subchain

Ask the network in special order:

    1) Special configured URL (it might be plugin's API)
    2) Quorum members
    3) Other known peers

*/
GET_PREVIOUS_AGGREGATED_EPOCH_FINALIZATION_PROOF = async() => {

    // global.SYMBIOTE_META.GENERATION_THREAD

    let allKnownNodes = [global.CONFIG.SYMBIOTE.GET_PREVIOUS_EPOCH_AGGREGATED_FINALIZATION_PROOF_URL,...await GET_QUORUM_URLS_AND_PUBKEYS(),...GET_ALL_KNOWN_PEERS()]

    let subchainID = global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY || global.CONFIG.SYMBIOTE.PUB


    for(let nodeEndpoint of allKnownNodes){

        let finalURL = `${nodeEndpoint}/aggregated_epoch_finalization_proof/${global.SYMBIOTE_META.GENERATION_THREAD.checkpointIndex}/${subchainID}`

        let itsProbablyAggregatedEpochFinalizationProof = await fetch(finalURL,{agent:GET_HTTP_AGENT(finalURL)}).then(r=>r.json()).catch(()=>false)

        let aefpProof = await VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF(
            
            itsProbablyAggregatedEpochFinalizationProof,

            global.SYMBIOTE_META.GENERATION_THREAD.quorum,

            global.SYMBIOTE_META.GENERATION_THREAD.quorumAggregatedPub,

            global.SYMBIOTE_META.GENERATION_THREAD.majority,        

            global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId
        
        )

        if(aefpProof) return aefpProof

    }
    
}




//________________________________________________________________EXTERNAL_______________________________________________________________________




export let GENERATE_BLOCKS_PORTION = async() => {

    let checkpoint = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT
    
    let qtCheckpointFullID = checkpoint.hash+"#"+checkpoint.id

    if(!global.SYMBIOTE_META.STATIC_STUFF_CACHE.has('CAN_PRODUCE_BLOCKS:'+qtCheckpointFullID)){

        let poolPresent = checkpoint.poolsRegistry[global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY ? 'reservePools' : 'primePools' ].includes(global.CONFIG.SYMBIOTE.PUB) 

        global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('CAN_PRODUCE_BLOCKS:'+qtCheckpointFullID,poolPresent)

    }


    //Safe "if" branch to prevent unnecessary blocks generation
    if(!global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('CAN_PRODUCE_BLOCKS:'+qtCheckpointFullID)) return



    let checkpointIndex = checkpoint.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(qtCheckpointFullID)



    if(!tempObject) return


    let myDataInReassignments = tempObject.REASSIGNMENTS.get(global.CONFIG.SYMBIOTE.PUB)


    if(typeof myDataInReassignments === 'object') return


    // Check if <checkpointFullID> is the same in QT and in GT
    
    if(global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId !== qtCheckpointFullID){

        // If new epoch - add the aggregated proof of previous epoch finalization

        if(global.SYMBIOTE_META.GENERATION_THREAD.checkpointIndex !== 0){

            let aefpForPreviousEpoch = await GET_PREVIOUS_AGGREGATED_EPOCH_FINALIZATION_PROOF()

            // If we can't find a proof - try to do it later
            // Only in case it's initial epoch(index is -1) - no sense to push it
            if(!aefpForPreviousEpoch) return

            global.SYMBIOTE_META.GENERATION_THREAD.aefpForPreviousEpoch = aefpForPreviousEpoch


        }

        // Update the index & hash of epoch

        global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId = qtCheckpointFullID

        global.SYMBIOTE_META.GENERATION_THREAD.checkpointIndex = checkpointIndex

        // Recount new values

        global.SYMBIOTE_META.GENERATION_THREAD.quorum = checkpoint.quorum

        global.SYMBIOTE_META.GENERATION_THREAD.quorumAggregatedPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtCheckpointFullID)

        global.SYMBIOTE_META.GENERATION_THREAD.majority = GET_MAJORITY(checkpoint)


        // And nullish the index & hash in generation thread for new epoch

        global.SYMBIOTE_META.GENERATION_THREAD.prevHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
 
        global.SYMBIOTE_META.GENERATION_THREAD.nextIndex = 0
    
    }


    let extraData = {}

    
    // If we are even not in reserve - return

    if(typeof myDataInReassignments === 'string'){

        // Do it only for the first block in epoch(with index 0)

        if(global.SYMBIOTE_META.GENERATION_THREAD.nextIndex === 0){

            // Add the AEFP for previous epoch

            extraData.aefpForPreviousEpoch = global.SYMBIOTE_META.GENERATION_THREAD.aefpForPreviousEpoch

            // Build the template to insert to the extraData of block. Structure is {primePool:ASP,reservePool0:ASP,...,reservePoolN:ASP}
        
            let myPrimePool = global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY

            let reassignmentArrayOfMyPrimePool = checkpoint.reassignmentChains[myPrimePool]
    
            let myIndexInReassignmentChain = reassignmentArrayOfMyPrimePool.indexOf(global.CONFIG.SYMBIOTE.PUB)
    

            // Get all previous pools - from zero to <my_position>
            let pubKeysOfAllThePreviousPools = reassignmentArrayOfMyPrimePool.slice(0,myIndexInReassignmentChain).reverse()


            //_____________________ Fill the extraData.reassignments _____________________

            extraData.reassignments = {}

            /*

                If we can't find all the required ASPs (from <your position> to <position where ASP not starts from index 0>) - skip this iteration to try again later

                Here we need to fill the object with aggregated skip proofs(ASPs) for all the previous pools till the pool which wasn't reassigned from index 0
            
            */

            // Add the ASP for the previous pool in reassignment chain

            let pubKeyOfPrevious = reassignmentArrayOfMyPrimePool[myIndexInReassignmentChain-1] || myPrimePool

            let aspForPrevious = tempObject.SKIP_HANDLERS.get(pubKeyOfPrevious)?.aggregatedSkipProof

            if(aspForPrevious){

                extraData.reassignments[pubKeyOfPrevious] = aspForPrevious

                for(let reservePoolPubKey of pubKeysOfAllThePreviousPools){

                    if(reservePoolPubKey === pubKeyOfPrevious) continue

                    let aspForThisPool = tempObject.SKIP_HANDLERS.get(reservePoolPubKey)?.aggregatedSkipProof
    
                    if(aspForThisPool){
    
                        if(aspForThisPool.skipIndex >= 0) break // if we hit the ASP with non-null index(at least index >= 0) it's a 100% that reassignment chain is not broken, so no sense to push ASPs for previous pools 
    
                        else extraData.reassignments[reservePoolPubKey] = aspForThisPool
    
                    } else return
    
                }    

            }else return

        }


    }else if(global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY) return
    
    
    // In case it's the second block in epoch(with index = 1,coz numeration starts from 0) - add the aggregated commitments to header

    if(global.SYMBIOTE_META.GENERATION_THREAD.nextIndex === 1){


        let myFirstBlockInEpoch = global.SYMBIOTE_META.GENERATION_THREAD.checkpointIndex+':'+global.CONFIG.SYMBIOTE.PUB+':0'

        let aggregatedFinalizationProofForFirstBlock = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+myFirstBlockInEpoch).catch(()=>false)


        if(aggregatedFinalizationProofForFirstBlock) extraData.aggregatedFinalizationProofForFirstBlock = aggregatedFinalizationProofForFirstBlock

        else return // try later

    }

    /*

    _________________________________________GENERATE PORTION OF BLOCKS___________________________________________
    
    Here we check how many transactions(events) we have locally and generate as many blocks as it's possible
    
    */

    let numberOfBlocksToGenerate = Math.ceil(global.SYMBIOTE_META.MEMPOOL.length/global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.TXS_LIMIT_PER_BLOCK)




    //_______________________________________FILL THE BLOCK WITH EXTRA DATA_________________________________________

    // 0.Add the system sync operations to block extra data

    extraData.systemSyncOperations = GET_SYSTEM_SYNC_OPERATIONS(global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId)

    // 1.Add the extra data to block from configs(it might be your note, for instance)

    extraData.rest = {...global.CONFIG.SYMBIOTE.EXTRA_DATA_TO_BLOCK}




    //DEBUG
    numberOfBlocksToGenerate++

    //If nothing to generate-then no sense to generate block,so return
    if(numberOfBlocksToGenerate===0) return 


    LOG(`Number of blocks to generate \x1b[32;1m${numberOfBlocksToGenerate}`,'I')

    let atomicBatch = global.SYMBIOTE_META.BLOCKS.batch()

    for(let i=0;i<numberOfBlocksToGenerate;i++){


        let blockCandidate = new Block(GET_TRANSACTIONS(),extraData,global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId)
                        
        let hash = Block.genHash(blockCandidate)


        blockCandidate.sig = await BLS_SIGN_DATA(hash)
            
        BLOCKLOG(`New block generated`,hash,blockCandidate,global.SYMBIOTE_META.GENERATION_THREAD.checkpointIndex)


        global.SYMBIOTE_META.GENERATION_THREAD.prevHash = hash
 
        global.SYMBIOTE_META.GENERATION_THREAD.nextIndex++
    
        // BlockID has the following format => epochID(checkpointIndex):BLS_Pubkey:IndexOfBlockInCurrentEpoch
        let blockID = global.SYMBIOTE_META.GENERATION_THREAD.checkpointIndex+':'+global.CONFIG.SYMBIOTE.PUB+':'+blockCandidate.index

        //Store block locally
        atomicBatch.put(blockID,blockCandidate)
           
    }

    //Update the GENERATION_THREAD after all
    atomicBatch.put('GT',global.SYMBIOTE_META.GENERATION_THREAD)

    await atomicBatch.write()

},





VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF = async (itsProbablyAggregatedEpochFinalizationProof,quorum,rootPub,majority,checkpointFullID) => {

    let overviewIsOK =
        
        typeof itsProbablyAggregatedEpochFinalizationProof === 'object'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.lastAuthority === 'number'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.lastIndex === 'number'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.lastHash === 'string'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.proof === 'object'

    if(overviewIsOK && itsProbablyAggregatedEpochFinalizationProof){

        /*
    
            The structure of AGGREGATED_EPOCH_FINALIZATION_PROOF is

            {
                lastAuthority:<index of BLS pubkey of some pool in subchain's reassignment chain>,
                lastIndex:<index of his block in previous epoch>,
                lastHash:<hash of this block>,
                firstBlockHash,

                proof:{

                    aggregatedPub:<BLS aggregated pubkey of signers>,
                    aggregatedSignature: SIG('EPOCH_DONE'+lastAuth+lastIndex+lastHash+checkpointFullId)
                    afkVoters:[] - array of BLS pubkeys who haven't voted

                }
            }

            We need to verify that majority have voted for such solution

           For this:

                0) reverseThreshold = global.SYMBIOTE_META.GENERATION_THREAD.quorum.length-global.SYMBIOTE_META.GENERATION_THREAD.majority
                1) await bls.verifyThresholdSignature(aggregatedPub,afkVoters,quorumRootPub,dataThatShouldBeSigned,aggregatedSignature,reverseThreshold).catch(()=>false)

        */

        let {aggregatedPub,aggregatedSignature,afkVoters} = itsProbablyAggregatedEpochFinalizationProof.proof

        let reverseThreshold = quorum.length - majority

        let {lastAuthority,lastIndex,lastHash,firstBlockHash} = itsProbablyAggregatedEpochFinalizationProof

        let dataThatShouldBeSigned = 'EPOCH_DONE'+lastAuthority+lastIndex+lastHash+firstBlockHash+checkpointFullID

        let proofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,rootPub,dataThatShouldBeSigned,aggregatedSignature,reverseThreshold).catch(()=>false)

        if(proofIsOk){

            return {
            
                lastAuthority,lastIndex,lastHash,firstBlockHash,
        
                proof:{aggregatedPub,aggregatedSignature,afkVoters}

            }

        }

    }


},




LOAD_GENESIS=async()=>{


    let atomicBatch = global.SYMBIOTE_META.STATE.batch(),

        quorumThreadAtomicBatch = global.SYMBIOTE_META.QUORUM_THREAD_METADATA.batch(),
    
        checkpointTimestamp,

        startPool = '',

        poolsRegistryForCheckpoint = {primePools:[],reservePools:[]}




    //__________________________________ Load all the configs __________________________________

        
    checkpointTimestamp = global.GENESIS.CHECKPOINT_TIMESTAMP

    let primePools = new Set(Object.keys(global.GENESIS.POOLS))

    global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA = {} // poolPubKey => {index,hash,isReserve}


    for(let [poolPubKey,poolContractStorage] of Object.entries(global.GENESIS.POOLS)){

        let {isReserve} = poolContractStorage

        startPool = poolPubKey

        // Create the value in VT

        global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[poolPubKey] = {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',isReserve}


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
            stopCheckpointID:-1,
            isReserve,
            poolURL:poolContractStorage.poolURL,
            wssPoolURL:poolContractStorage.wssPoolURL
        
        }

        // Put the pointer to know the subchain which store the pool's data(metadata+storages)
        // Pools' contract metadata & storage are in own subchain. Also, reserve pools also here as you see below
        if(isReserve){

            atomicBatch.put(poolPubKey+'(POOL)_POINTER',poolContractStorage.reserveFor)

            idToAdd = poolContractStorage.reserveFor+':'+poolPubKey

            templateForQt.reserveFor = poolContractStorage.reserveFor

            poolsRegistryForCheckpoint.reservePools.push(poolPubKey)

        }else {

            atomicBatch.put(poolPubKey+'(POOL)_POINTER',poolPubKey)

            global.SYMBIOTE_META.VERIFICATION_THREAD.SID_TRACKER[poolPubKey] = 0

            poolsRegistryForCheckpoint.primePools.push(poolPubKey)

        }
        

        quorumThreadAtomicBatch.put(poolPubKey+'(POOL)_STORAGE_POOL',templateForQt)


        //Put metadata
        atomicBatch.put(idToAdd+'(POOL)',contractMetadataTemplate)

        //Put storage
        //NOTE: We just need a simple storage with ID="POOL"
        atomicBatch.put(idToAdd+'(POOL)_STORAGE_POOL',poolContractStorage)

        // Add the account for fees for each authority
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

            let evmStateForThisSubchain = global.GENESIS.EVM[poolPubKey]

            if(evmStateForThisSubchain){

                let evmKeys = Object.keys(evmStateForThisSubchain)
    
                for(let evmKey of evmKeys) {
    
                    let {isContract,balance,nonce,code,storage} = evmStateForThisSubchain[evmKey]
    
                    //Put KLY-EVM to KLY-EVM state db which will be used by Trie
    
                    if(isContract){
    
                        await KLY_EVM.putContract(evmKey,balance,nonce,code,storage)
    
                    }else{
                    
                        await KLY_EVM.putAccount(evmKey,balance,nonce)
                    }


                    let caseIgnoreAccountAddress = Buffer.from(evmKey.slice(2),'hex').toString('hex')

                    // Add assignment to subchain
                    atomicBatch.put('SUB:'+caseIgnoreAccountAddress,{subchain:poolPubKey})
    
                }

            }

            global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_METADATA[poolPubKey] = {
        
                nextBlockIndex:Web3.utils.toHex(BigInt(0).toString()),
        
                parentHash:'0000000000000000000000000000000000000000000000000000000000000000',
        
                timestamp:Math.floor(checkpointTimestamp/1000)
        
            }

        }

    }


    //_______________________ Now add the data to state _______________________

    // * Each account / contract must have <subchain> property to assign it to appropriate shard(subchain)

    Object.keys(global.GENESIS.STATE).forEach(
    
        addressOrContractID => {

            if(global.GENESIS.STATE[addressOrContractID].type==='contract'){

                let {lang,balance,uno,storages,bytecode,subchain} = global.GENESIS.STATE[addressOrContractID]

                let contractMeta = {

                    type:"contract",
                    lang,
                    balance,
                    uno,
                    storages,
                    bytecode
                
                } 

                //Write metadata first
                atomicBatch.put(subchain+':'+addressOrContractID,contractMeta)

                //Finally - write genesis storage of contract sharded by contractID_STORAGE_ID => {}(object)
                for(let storageID of global.GENESIS.STATE[addressOrContractID].storages){

                    global.GENESIS.STATE[addressOrContractID][storageID].subchain = subchain

                    atomicBatch.put(subchain+':'+addressOrContractID+'_STORAGE_'+storageID,global.GENESIS.STATE[addressOrContractID][storageID])

                }

            } else {

                let subchainID = global.GENESIS.STATE[addressOrContractID].subchain

                atomicBatch.put(subchainID+':'+addressOrContractID,global.GENESIS.STATE[addressOrContractID]) //else - it's default account

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

    //We update this during the verification process(in VERIFICATION_THREAD). Once we find the VERSION_UPDATE in checkpoint - update it !
    global.SYMBIOTE_META.VERIFICATION_THREAD.VERSION = global.GENESIS.VERSION

    //We update this during the work on QUORUM_THREAD. But initially, QUORUM_THREAD has the same version as VT
    global.SYMBIOTE_META.QUORUM_THREAD.VERSION = global.GENESIS.VERSION

    //Also, set the WORKFLOW_OPTIONS that will be changed during the threads' work

    global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS={...global.GENESIS.WORKFLOW_OPTIONS}

    global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS={...global.GENESIS.WORKFLOW_OPTIONS}



    
    await atomicBatch.write()

    await quorumThreadAtomicBatch.write()




    //Node starts to verify blocks from the first validator in genesis, so sequency matter
    
    global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER={
        
        subchain:startPool,

        currentAuthority:startPool,
        
        index:-1,
        
        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        grid:0
    
    }


    global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_STATE_ROOT = await KLY_EVM.getStateRoot()


    global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT={

        id:0,

        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        poolsRegistry:JSON.parse(JSON.stringify(poolsRegistryForCheckpoint)),
        
        timestamp:checkpointTimestamp,

        quorum:[],

        reassignmentChains:{}
    
    }
    

    //Make template, but anyway - we'll find checkpoints on hostchains
    global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT={

        id:0,

        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        poolsRegistry:JSON.parse(JSON.stringify(poolsRegistryForCheckpoint)),

        timestamp:checkpointTimestamp,

        quorum:[],

        reassignmentChains:{}
    
    }


    // Set the rubicon to stop tracking spent txs from WAITING_ROOMs of pools' contracts. Value means the checkpoint id lower edge
    // If your stake/unstake tx was below this line - it might be burned. However, the line is set by QUORUM, so it should be safe
    global.SYMBIOTE_META.VERIFICATION_THREAD.RUBICON = 0
    
    global.SYMBIOTE_META.QUORUM_THREAD.RUBICON = 0


    let nullHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

    let vtCheckpoint = global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT

    let qtCheckpoint = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT


    //We get the quorum for VERIFICATION_THREAD based on own local copy of POOLS_METADATA state
    vtCheckpoint.quorum = GET_QUORUM(vtCheckpoint.poolsRegistry,global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS,nullHash)

    //...However, quorum for QUORUM_THREAD might be retrieved from POOLS_METADATA of checkpoints. It's because both threads are async
    qtCheckpoint.quorum = GET_QUORUM(qtCheckpoint.poolsRegistry,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS,nullHash)


    //Finally, build the reassignment chains for current checkpoint in QT and VT

    await SET_REASSIGNMENT_CHAINS(qtCheckpoint,nullHash)

    vtCheckpoint.reassignmentChains = JSON.parse(JSON.stringify(qtCheckpoint.reassignmentChains))

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
    global.SYMBIOTE_META={

        VERSION:+(fs.readFileSync(PATH_RESOLVE('KLY_Workflows/dev_tachyon/version.txt')).toString()),
        
        MEMPOOL:[], //to hold onchain transactions here(contract calls,txs,delegations and so on)

        //Сreate mapping for account and it's state to optimize processes while we check blocks-not to read/write to db many times
        STATE_CACHE:new Map(), // ID => ACCOUNT_STATE

        QUORUM_THREAD_CACHE:new Map(), // ADDRESS => ACCOUNT_STATE


        //________________________ AUXILIARY_MAPPINGS ________________________
        
        PEERS:[], // Peers to exchange data with

        STATIC_STUFF_CACHE:new Map(),

        //____________________ CONSENSUS RELATED MAPPINGS ____________________

        TEMP:new Map() // checkpointID => {COMMITMENTS,FINALIZATION_PROOFS,CHECKPOINT_MANAGER,SYNC_HELPER,PROOFS,HEALTH_MONITORING,SKIP,DATABASE}

    
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
    
        'STUFF', // Some data like combinations of pools for aggregated BLS pubkey, endpoint <-> pubkey bindings and so on. Available stuff URL_PUBKEY_BIND | VALIDATORS_PUBKEY_COMBINATIONS | BLOCK_HASHES | .etc

        'STATE', // Contains state of accounts, contracts, services, metadata and so on. The main database like NTDS.dit

        'EPOCH_DATA', // Contains epoch data - AEFPs, AFPs, etc.

        'QUORUM_THREAD_METADATA', // QUORUM_THREAD itself and other stuff

        //_______________________________ EVM storage _______________________________

        //'KLY_EVM' Contains state of EVM

        //'KLY_EVM_METADATA' Contains metadata for KLY-EVM pseudochain (e.g. blocks, logs and so on)
        

    ].forEach(
        
        dbName => global.SYMBIOTE_META[dbName]=level(process.env.CHAINDATA_PATH+`/${dbName}`,{valueEncoding:'json'})
        
    )
    
    
    //____________________________________________Load stuff to db___________________________________________________


    Object.keys(global.CONFIG.SYMBIOTE.LOAD_STUFF).forEach(
        
        id => global.SYMBIOTE_META.STUFF.put(id,global.CONFIG.SYMBIOTE.LOAD_STUFF[id])
        
    )


    global.SYMBIOTE_META.GENERATION_THREAD = await global.SYMBIOTE_META.BLOCKS.get('GT').catch(error=>
        
        error.notFound
        ?
        {
            
            checkpointFullId:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef#-1',

            checkpointIndex:0,
            
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
            
                FINALIZATION_POINTER:{subchain:'',currentAuthority:'',index:-1,hash:'',grid:0}, // pointer to know where we should start to process further blocks

                POOLS_METADATA:{}, // PUBKEY => {index:'',hash:'',isReserve:boolean}

                KLY_EVM_STATE_ROOT:'', // General KLY-EVM state root
 
                KLY_EVM_METADATA:{}, // primePoolBlsPubKey => {nextBlockIndex,parentHash,timestamp}

                TEMP_REASSIGNMENTS:{}, // CheckpointID => primePool => {currentAuthority:<uint - index of current subchain authority based on REASSIGNMENT_CHAINS>,reassignments:{ReservePool=>{index,hash}}}

                SID_TRACKER:{}, // subchainID(BLS pubkey of prime pool) => index

                CHECKPOINT:'genesis'

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

    
    //_____________________________________Set some values to stuff cache___________________________________________

    global.SYMBIOTE_META.STUFF_CACHE = new AdvancedCache(global.CONFIG.SYMBIOTE.STUFF_CACHE_SIZE,global.SYMBIOTE_META.STUFF)


    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.id

    let vtCheckpointFullID = global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.hash+"#"+global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id


    //Because if we don't have quorum, we'll get it later after discovering checkpoints

    global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('VT_ROOTPUB'+vtCheckpointFullID,bls.aggregatePublicKeys(global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.quorum))

    global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('QT_ROOTPUB'+checkpointFullID,bls.aggregatePublicKeys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum))


    if(global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId === checkpointFullID && !global.SYMBIOTE_META.GENERATION_THREAD.quorum){

        global.SYMBIOTE_META.GENERATION_THREAD.quorum = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum

        global.SYMBIOTE_META.GENERATION_THREAD.quorumAggregatedPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)

        global.SYMBIOTE_META.GENERATION_THREAD.majority = GET_MAJORITY(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT)

    }

    //_________________________________Add the temporary data of current QT__________________________________________
    
    let quorumTemporaryDB = level(process.env.CHAINDATA_PATH+`/${checkpointFullID}`,{valueEncoding:'json'})

    global.SYMBIOTE_META.TEMP.set(checkpointFullID,{

        COMMITMENTS:new Map(), // blockID => BLS_SIG(blockID+hash).     The first level of "proofs". Commitments is just signatures by some validator from current quorum that "validator accept some block X by ValidatorY with hash H"

        FINALIZATION_PROOFS:new Map(), // blockID => SIG(blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HASH+"#"+QT.CHECKPOINT.id).    Aggregated proofs which proof that some validator has 2/3N+1 commitments for block PubX:Y with hash H. Key is blockID and value is FINALIZATION_PROOF object

    
        CHECKPOINT_MANAGER:new Map(), // mapping( validatorID => {index,hash} ). Used to start voting for checkpoints.      Each pair is a special handler where key is a pubkey of appropriate validator and value is the ( index <=> id ) which will be in checkpoint
    
        SYSTEM_SYNC_OPERATIONS_MEMPOOL:[],
        
        SYNCHRONIZER:new Map(),

        HEALTH_MONITORING:new Map(), // used to perform SKIP procedure when we need it and to track changes on subchains. poolPubKey => {lastSeen,index,hash,aggregatedFinalizationProof:{aggregatedPub,aggregatedSig,afkVoters}}

        SKIP_HANDLERS:new Map(), // {extendedAggregatedCommitments,aggregatedSkipProof}

        REASSIGNMENTS:new Map(), // PrimePool => {currentAuthority:<number>} | ReservePool => PrimePool


        //____________________Mapping which contains temporary databases for____________________

        DATABASE:quorumTemporaryDB // DB with potential checkpoints, timetrackers, finalization proofs, skip procedure and so on    

    })


    // Fill the CHECKPOINT_MANAGER with the latest, locally stored data

    await RESTORE_STATE()


    //__________________________________Decrypt private key to memory of process__________________________________



    await DECRYPT_KEYS(initSpinner).then(()=>
    
        //Print just first few bytes of keys to view that they were decrypted well.Looks like checksum
        LOG(`Private key was decrypted successfully`,'S')        
    
    ).catch(error=>{
    
        LOG(`Keys decryption failed.Please,check your password carefully.In the worst case-use your decrypted keys from safezone and repeat procedure of encryption via CLI\n${error}`,'F')
 
        process.exit(107)

    })


    //____________________________________________GENERAL INFO OUTPUT____________________________________________


    //Ask to approve current set of hostchains
    !global.CONFIG.PRELUDE.OPTIMISTIC
    &&        
    await new Promise(resolve=>
    
        readline.createInterface({input:process.stdin, output:process.stdout, terminal:false})
            
        .question(`\n ${`\u001b[38;5;${process.env.KLY_MODE==='main'?'23':'202'}m`}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${'\x1b[36;1m'}  Do you agree with the current set of hostchains? Enter \x1b[32;1mYES\x1b[36;1m to continue ———> \x1b[0m`,resolve)
                
    ).then(answer=>answer!=='YES' && process.exit(108))

},




TEMPORARY_REASSIGNMENTS_BUILDER=async()=>{

    /*
    
        [+] In this function we should time by time ask for ASPs for pools to build the reassignment chains

        [+] Use VT.TEMP_REASSIGNMENTS


        Based on current checkpoint in QUORUM_THREAD - build the temporary reassignments
    
    */

    let qtCheckpoint = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT

    let quorumThreadCheckpointFullID = qtCheckpoint.hash+"#"+qtCheckpoint.id

    let quorumThreadCheckpointIndex = qtCheckpoint.id

    let tempObject = global.SYMBIOTE_META.TEMP.has(quorumThreadCheckpointFullID)

    if(!tempObject){

        setTimeout(TEMPORARY_REASSIGNMENTS_BUILDER,global.CONFIG.SYMBIOTE.TEMPORARY_REASSIGNMENTS_BUILDER_TIMEOUT)

        return

    }


    let verificationThread = global.SYMBIOTE_META.VERIFICATION_THREAD

    
    let tempReassignmentOnVerificationThread = verificationThread.TEMP_REASSIGNMENTS

    let vtCheckpoint = verificationThread.CHECKPOINT

    let reassignmentChains = vtCheckpoint.reassignmentChains


    if(!tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID]){

        tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID] = {} // create empty template

        // Fill with data from here. Structure: primePool => [reservePool0,reservePool1,...,reservePoolN]

        for(let primePoolPubKey of vtCheckpoint.poolsRegistry.primePools){
            
            tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePoolPubKey] = {

                currentAuthority:-1, // -1 means that it's prime pool itself. Indexes 0,1,2...N are the pointers to reserve pools in VT.REASSIGNMENT_CHAINS
                
                currentToVerify:-1, // to start the verification in START_VERIFICATION_THREAD from prime pool(-1 index) and continue with reserve pools(0,1,2,...N)

                reassignments:{} // poolPubKey => {index,hash}

            }

        }

    }

    //________________________________ Start to find ________________________________

    let quorumMembers = await GET_QUORUM_URLS_AND_PUBKEYS(true)
    
    //___________________Ask quorum members about reassignments. Grab this results, verify the proofs and build the temporary reassignment chains___________________



    for(let memberHandler of quorumMembers){

        // Make requests to /get_asp_and_approved_first_block. Returns => {currentAuthorityIndex,firstBlockOfCurrentAuthority,afpForFirstBlockByCurrentAuthority}. Send the current auth + prime pool

        let responseForTempReassignment = await fetch(memberHandler.url+'/get_data_for_temp_reassign',{agent:GET_HTTP_AGENT(memberHandler.url)}).then(r=>r.json()).catch(()=>false)

        if(responseForTempReassignment){

    
            /*
        
                The response from each of quorum member has the following structure:

                [0] - {err:'Some error text'} - ignore, do nothing

                [1] - Object with this structure

                {

                    primePool0:{currentAuthorityIndex,firstBlockByCurrentAuthority,afpForFirstBlockByCurrentAuthority},

                    primePool1:{currentAuthorityIndex,firstBlockByCurrentAuthority,afpForFirstBlockByCurrentAuthority},

                    ...

                    primePoolN:{currentAuthorityIndex,firstBlockByCurrentAuthority,afpForFirstBlockByCurrentAuthority}

                }


                -----------------------------------------------[Decomposition]-----------------------------------------------


                [0] currentAuthorityIndex - index of current authority for subchain X. To get the pubkey of subchain authority - take the QUORUM_THREAD.CHECKPOINT.REASSIGNMENT_CHAINS[<primePool>][currentAuthorityIndex]

                [1] firstBlockByCurrentAuthority - default block structure with ASP for all the previous pools in a row

                [2] afpForFirstBlockByCurrentAuthority - default AFP structure -> 


                    {
        
                        blockID:<string>,
                        blockHash:<string>,
                        aggregatedSignature:<string>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HASH+"#"+QT.CHECKPOINT.id
                        aggregatedPub:<string>,
                        afkVoters:[<string>,...]
        
                    }


                -----------------------------------------------[What to do next?]-----------------------------------------------
        
                Compare the <currentAuthorityIndex> with our local pointer tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePool].currentAuthority

                    In case our local version has bigger index - ignore

                    In case proposed version has bigger index it's a clear signal that some of reassignments occured and we need to update our local data

                    For this:

                        0) Verify that this block was approved by quorum majority(2/3N+1) by checking the <afpForFirstBlockByCurrentAuthority>


                    If all the verification steps is OK - add to some cache

                ---------------------------------[After the verification of all the responses?]---------------------------------

                Start to build the temporary reassignment chains

            */

            for(let [primePoolPubKey,reassignMetadata] of Object.entries(responseForTempReassignment)){

                if(typeof primePoolPubKey === 'string' && typeof reassignMetadata==='object'){
    
                    let {currentAuthorityIndex,firstBlockByCurrentAuthority,afpForFirstBlockByCurrentAuthority} = reassignMetadata
    
                    if(typeof currentAuthorityIndex === 'number' && typeof firstBlockByCurrentAuthority === 'object' && typeof afpForFirstBlockByCurrentAuthority==='object'){
                                    
                        let localPointer = tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePoolPubKey].currentAuthority
    
                        if(localPointer <= currentAuthorityIndex && firstBlockByCurrentAuthority.index === 0){
    
                            
                            // Verify the AFP for block
    
                        
                            let blockID = quorumThreadCheckpointIndex+':'+firstBlockByCurrentAuthority.creator+':'+firstBlockByCurrentAuthority.index
    
                            let blockHash = Block.genHash(firstBlockByCurrentAuthority)
    
                            let afpIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(blockID,blockHash,afpForFirstBlockByCurrentAuthority,quorumThreadCheckpointFullID,qtCheckpoint)
    
                            let shouldChangeThisSubchain = true
    


                            if(afpIsOk){
    
                                // Verify all the ASPs in block header
    
                                let {isOK,filteredReassignments} = await CHECK_ASP_CHAIN_VALIDITY(
                                
                                    primePoolPubKey, firstBlockByCurrentAuthority, reassignmentChains[primePoolPubKey], currentAuthorityIndex, quorumThreadCheckpointFullID, vtCheckpoint, false, true
                                
                                )
    
                                /*
                                
                                    tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePool] = {
    
                                        currentAuthority:-1, // -1 means that it's prime pool itself. Indexes 0,1,2...N are the pointers to reserve pools in VT.REASSIGNMENT_CHAINS
                    
                                        currentToVerify:<>

                                        reassignments:{} // poolPubKey => {index,hash}
    
                                    }
                                
                                
                                */
    
                                    
                                if(isOK){
    
                                            
                                    // Fill the tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePool]
    
                                    // let previousAuthorityIndexInReassignmentChain = currentAuthorityIndex-1
    
                                    // let previousAuthority = previousAuthorityIndexInReassignmentChain === -1 ? primePool : reassignmentChains[primePool][previousAuthorityIndexInReassignmentChain]
    
                                    // tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePool].reassignments[previousAuthority] = filteredReassignments[previousAuthority]
    
                                    // And do the same from currentAuthorityIndex to tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePool].currentAuthority
    

                                    let potentialReassignments = [filteredReassignments] // each element here is object like {pool:{index,hash}}
                               
                                    let limitPointer = tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePoolPubKey].currentAuthority
                               
                                    // Starts the reverse enumeration from proposed current authority index to our local pointer

                                    for(let position = currentAuthorityIndex-1 ; position >= limitPointer ; position--){
    
                                        let poolWithThisPosition = position === -1 ? primePoolPubKey : reassignmentChains[primePoolPubKey][position]

                                        // No sense to ask first block(index 0) for pool which was reassigned on index -1(no generated blocks in epoch)
                                        
                                        if(filteredReassignments[poolWithThisPosition].index !== -1){
    
                                            // This is a signal that pool has created at least 1 block, so we have to get it and update the reassignment stats
    
                                            let firstBlockInThisEpochByPool = await GET_BLOCK(quorumThreadCheckpointIndex,poolWithThisPosition,0)

                                            // Compare hashes to make sure it's really the first block by pool X in epoch Y

                                            if(firstBlockInThisEpochByPool && Block.genHash(firstBlockInThisEpochByPool) === filteredReassignments[poolWithThisPosition].firstBlockHash){
                                
                                                let resultForCurrentPool = position === -1 ? {isOK:true,filteredReassignments:{}} : await CHECK_ASP_CHAIN_VALIDITY(
                                                        
                                                    primePoolPubKey, firstBlockInThisEpochByPool, reassignmentChains[primePoolPubKey], position, quorumThreadCheckpointFullID, vtCheckpoint, false, true
                                                        
                                                )
                                
                                                if(resultForCurrentPool.isOK){
    
                                                    // If ok - fill the <potentialReassignments>
        
                                                    potentialReassignments.push(resultForCurrentPool.filteredReassignments)
    
                                                }else{
    
                                                    shouldChangeThisSubchain = false

                                                    break

                                                }

                                            }else{

                                                shouldChangeThisSubchain = false

                                                break

                                            }                                        

                                        }

                                    }
    
                                    if(shouldChangeThisSubchain){

                                        // Update the reassignment data

                                        let tempReassignmentChain = tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePoolPubKey].reassignments // poolPubKey => {index,hash}


                                        for(let reassignStats of potentialReassignments.reverse()){

                                            // potentialReassignments[i] = {primePool:{index,hash},pool0:{index,hash},poolN:{index,hash}}

                                            for(let [skippedPool,descriptor] of Object.entries(reassignStats)){

                                                if(!tempReassignmentChain[skippedPool]) tempReassignmentChain[skippedPool] = descriptor
                        
                                            }

                                        }

                                        // Finally, set the <currentAuthority> to the new pointer

                                        tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePoolPubKey].currentAuthority = currentAuthorityIndex

                                    }
    
                                }
    
                            }
    
                        }
            
                    }    
    
                }
    
            }

        }

    }


    
    setTimeout(TEMPORARY_REASSIGNMENTS_BUILDER,global.CONFIG.SYMBIOTE.TEMPORARY_REASSIGNMENTS_BUILDER_TIMEOUT)


},




RUN_SYMBIOTE=async()=>{

    await PREPARE_SYMBIOTE()


    //_________________________ RUN SEVERAL ASYNC THREADS _________________________

    //0.Start verification process - process blocks and find new checkpoints step-by-step
    START_VERIFICATION_THREAD()

    //1.Also, QUORUM_THREAD starts async, so we have own version of CHECKPOINT here. Process checkpoint-by-checkpoint to find out the latest one and join to current QUORUM(if you were choosen)
    START_QUORUM_THREAD_CHECKPOINT_TRACKER()

    //2.Share our blocks within quorum members and get the commitments / finalization proofs 
    SHARE_BLOCKS_AND_GET_PROOFS()

    //3.Track the hostchain and check if there are "NEXT-DAY" blocks so it's time to stop sharing commitments / finalization proofs and start propose checkpoints
    CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT()

    //4.Start checking the health of all the subchains
    SUBCHAINS_HEALTH_MONITORING()

    //5.Iterate over SKIP_HANDLERS to get <aggregatedSkipProof>s and approvements to move to the next reserve pools
    REASSIGN_PROCEDURE_MONITORING()

    //6.Function to build the TEMP_REASSIGNMENT_METADATA(temporary) for verifictation thread(VT) to continue verify blocks for subchains with no matter who is the current authority for subchain - prime pool or reserve pools
    TEMPORARY_REASSIGNMENTS_BUILDER()




    let promises = []

    //Check if bootstrap nodes is alive
    global.CONFIG.SYMBIOTE.BOOTSTRAP_NODES.forEach(endpoint=>

        promises.push(
                        
            fetch(endpoint+'/addpeer',{method:'POST',body:JSON.stringify([global.GENESIS.SYMBIOTE_ID,global.CONFIG.SYMBIOTE.MY_HOSTNAME])})
            
                .then(res=>res.text())
            
                .then(val=>LOG(val==='OK'?`Received pingback from \x1b[32;1m${endpoint}\x1b[36;1m. Node is \x1b[32;1malive`:`\x1b[36;1mAnswer from bootstrap \x1b[32;1m${endpoint}\x1b[36;1m => \x1b[34;1m${val}`,'I'))
            
                .catch(error=>LOG(`Bootstrap node \x1b[32;1m${endpoint}\x1b[31;1m send no response or some error occured \n${error}`,'F'))
                        
        )

    )

    await Promise.all(promises.splice(0))


    //______________________________________________________RUN BLOCKS GENERATION PROCESS____________________________________________________________


    //Start generate blocks
    !global.CONFIG.SYMBIOTE.STOP_WORK_ON_GENERATION_THREAD && setTimeout(()=>{
                
        global.STOP_GEN_BLOCKS_CLEAR_HANDLER = false

        BLOCKS_GENERATION_POLLING()
            
    },global.CONFIG.SYMBIOTE.GENERATION_THREAD_INIT_DELAY)


}