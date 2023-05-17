import {
    
    GET_POOLS_URLS,GET_MAJORITY,BROADCAST,CHECK_IF_THE_SAME_DAY,USE_TEMPORARY_DB,

    GET_QUORUM,GET_FROM_STATE_FOR_QUORUM_THREAD,IS_MY_VERSION_OLD,

    DECRYPT_KEYS,BLOCKLOG,BLS_SIGN_DATA,HEAP_SORT,

} from './utils.js'

import {LOG,PATH_RESOLVE,BLAKE3,GET_GMT_TIMESTAMP} from '../../KLY_Utils/utils.js'

import AdvancedCache from '../../KLY_Utils/structures/advancedcache.js'

import SPECIAL_OPERATIONS_VERIFIERS from './operationsVerifiers.js'

import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import {START_VERIFICATION_THREAD} from './verification.js'

import {KLY_EVM} from '../../KLY_VMs/kly-evm/vm.js'

import Block from './essences/block.js'

import UWS from 'uWebSockets.js'

import readline from 'readline'

import fetch from 'node-fetch'

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
    
    SYSTEM_SIGNAL_ACCEPTED=true

    console.log('\n')

    LOG('\x1b[31;1mKLYNTAR\x1b[36;1m stop has been initiated.Keep waiting...','I')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/termination.txt')).toString(),'W')

    console.log('\n')

    LOG('Closing server connections...','I')

    global.UWS_DESC && UWS.us_listen_socket_close(UWS_DESC)

    LOG('Node was gracefully stopped','I')
        
    process.exit(0)

}




//Define listeners on typical signals to safely stop the node
process.on('SIGTERM',GRACEFUL_STOP)
process.on('SIGINT',GRACEFUL_STOP)
process.on('SIGHUP',GRACEFUL_STOP)


//************************ END SUB ************************









//________________________________________________________________INTERNAL_______________________________________________________________________


//TODO:Add more advanced logic(e.g. number of txs,ratings,etc.)
let GET_TRANSACTIONS = () => global.SYMBIOTE_META.MEMPOOL.splice(0,global.CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.TXS_LIMIT_PER_BLOCK),

    GET_TRANSACTIONS_FOR_REASSIGNED_SUBCHAINS = () => [],

    GET_SPECIAL_OPERATIONS = checkpointFullID =>{

        if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)) return []

        let specialOperationsMempool = global.SYMBIOTE_META.TEMP.get(checkpointFullID).SPECIAL_OPERATIONS_MEMPOOL

        return Array.from(specialOperationsMempool).map(subArr=>subArr[1]) //{type,payload}

    },




BLOCKS_GENERATION_POLLING=async()=>{


    if(!SYSTEM_SIGNAL_ACCEPTED){

        await GENERATE_BLOCKS_PORTION()    

        STOP_GEN_BLOCKS_CLEAR_HANDLER=setTimeout(BLOCKS_GENERATION_POLLING,global.CONFIG.SYMBIOTE.BLOCK_TIME)
        
        global.CONFIG.SYMBIOTE.STOP_GENERATE_BLOCKS
        &&
        clearTimeout(STOP_GEN_BLOCKS_CLEAR_HANDLER)

    }else{

        LOG(`Block generation for was stopped`,'I')

    }
    
},




SET_REASSIGNMENT_CHAINS = async checkpoint => {


    //__________________Based on POOLS_METADATA get the reassignments to instantly get the commitments / finalization proofs__________________


    let activeReservePoolsRelatedToSubchainAndStillNotUsed = new Map() // subchainID => [] - array of active reserve pools

    let stoppedSubchainsIDs = new Set()

    let futureReassignments = new Map()

    let nextTempDBBatch = nextTempDB.batch()


    for(let [poolPubKey,poolMetadata] of Object.entries(fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.POOLS_METADATA)){

        // Find main(not reserve) pools which were stopped
        if(!poolMetadata.IS_RESERVE && poolMetadata.IS_STOPPED){

            stoppedSubchainsIDs.add(poolPubKey)

        }
        else if(!poolMetadata.IS_STOPPED){

            // Otherwise - it's reserve pool
                    
            let poolStorage = await GET_FROM_STATE_FOR_QUORUM_THREAD(poolPubKey+`(POOL)_STORAGE_POOL`)

            if(poolStorage){

                let {reserveFor} = poolStorage

                if(!activeReservePoolsRelatedToSubchainAndStillNotUsed.has(reserveFor)) activeReservePoolsRelatedToSubchainAndStillNotUsed.set(reserveFor,[])

                activeReservePoolsRelatedToSubchainAndStillNotUsed.get(reserveFor).push(poolPubKey)
                    
            }

        }

    }


    /*
    
        After this cycle we have:

        [0] stoppedSubchainsIDs - Set(skippedSubchain1,skippedSubchain2,...)
        [1] activeReservePoolsRelatedToSubchainAndStillNotUsed - Map(subchainID=>[reservePool1,reservePool2,...reservePoolN])

    
    */

    let hashOfMetadataFromOldCheckpoint = BLAKE3(JSON.stringify(fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.POOLS_METADATA))

    
    for(let subchainPoolID of stoppedSubchainsIDs){
                    
        let nonce = 0

        let pseudoRandomHash = BLAKE3(hashOfMetadataFromOldCheckpoint+nonce) // since we need to find first reserve pool in a deterministic chain(among non-stopped reserve pools)

        let arrayOfActiveReservePoolsRelatedToThisSubchain = activeReservePoolsRelatedToSubchainAndStillNotUsed.get(subchainPoolID)

        let mapping=new Map()

        let arrayOfChallanges = arrayOfActiveReservePoolsRelatedToThisSubchain.map(validatorPubKey=>{

            let challenge = parseInt(BLAKE3(validatorPubKey+pseudoRandomHash),16)

            mapping.set(challenge,validatorPubKey)

            return challenge

        })


        let firstChallenge = HEAP_SORT(arrayOfChallanges)[0]

        let firstReservePoolInReassignmentChain = mapping.get(firstChallenge)
        
        if(firstReservePoolInReassignmentChain){

            let reassignmentTemplateForQT = {

                NONCE:1,
                
                SKIPPED_RESERVE:[],
                
                CURRENT:firstReservePoolInReassignmentChain

            }

            nextTempDBBatch.put('REASSIGN:'+subchainPoolID,reassignmentTemplateForQT)
            

            futureReassignments.set(subchainPoolID,reassignmentTemplateForQT)

            futureReassignments.set(firstReservePoolInReassignmentChain,subchainPoolID)

        }

    }


    await nextTempDBBatch.write()

    // Commit changes
    atomicBatch.put('QT',fullCopyOfQuorumThreadWithNewCheckpoint)

    await atomicBatch.write()
    
},




DELETE_POOLS_WHICH_HAVE_LACK_OF_STAKING_POWER=async(validatorPubKey,fullCopyOfQuorumThreadWithNewCheckpoint)=>{

    //Try to get storage "POOL" of appropriate pool

    let poolStorage = await GET_FROM_STATE_FOR_QUORUM_THREAD(validatorPubKey+'(POOL)_STORAGE_POOL')


    poolStorage.lackOfTotalPower=true

    poolStorage.stopCheckpointID=fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.HEADER.ID
    
    poolStorage.storedMetadata=fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.POOLS_METADATA[validatorPubKey]


    //Remove from POOLS array(to prevent be elected to quorum) and metadata

    delete fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.POOLS_METADATA[validatorPubKey]

},




EXECUTE_SPECIAL_OPERATIONS_IN_NEW_CHECKPOINT = async (atomicBatch,fullCopyOfQuorumThreadWithNewCheckpoint) => {

    
    //_______________________________Perform SPEC_OPERATIONS_____________________________

    let workflowOptionsTemplate = {...fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS}
    
    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set('WORKFLOW_OPTIONS',workflowOptionsTemplate)
    
    // Structure is <poolID> => true if pool should be deleted
    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set('SLASH_OBJECT',{})
    

    //But, initially, we should execute the SLASH_UNSTAKE operations because we need to prevent withdraw of stakes by rogue pool(s)/stakers
    for(let operation of fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.OPERATIONS){
     
        if(operation.type==='SLASH_UNSTAKE') await SPECIAL_OPERATIONS_VERIFIERS.SLASH_UNSTAKE(operation.payload,false,true)
    
    }

    //Here we have the filled(or empty) array of pools and delayed IDs to delete it from state

    for(let operation of fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.OPERATIONS){
        
        if(operation.type==='SLASH_UNSTAKE') continue
          /*
            
            Perform changes here before move to the next checkpoint
            
            OPERATION in checkpoint has the following structure
            {
                type:<TYPE> - type from './operationsVerifiers.js' to perform this operation
                payload:<PAYLOAD> - operation body. More detailed about structure & verification process here => ./operationsVerifiers.js
            }
            
        */
        await SPECIAL_OPERATIONS_VERIFIERS[operation.type](operation.payload,false,true,fullCopyOfQuorumThreadWithNewCheckpoint)
    
    }

    //_______________________Remove pools if lack of staking power_______________________

    let toRemovePools = [], promises = [], quorumThreadPools = Object.keys(fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.POOLS_METADATA)


    for(let validator of quorumThreadPools){

        let promise = GET_FROM_STATE_FOR_QUORUM_THREAD(validator+'(POOL)_STORAGE_POOL').then(poolStorage=>{

            if(poolStorage.totalPower<fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS.VALIDATOR_STAKE) toRemovePools.push(validator)

        })

        promises.push(promise)

    }

    await Promise.all(promises.splice(0))
    
    //Now in toRemovePools we have IDs of pools which should be deleted from POOLS
    
    let deletePoolsPromises=[]
    
    for(let address of toRemovePools){
    
        deletePoolsPromises.push(DELETE_POOLS_WHICH_HAVE_LACK_OF_STAKING_POWER(address,fullCopyOfQuorumThreadWithNewCheckpoint))
    
    }


    await Promise.all(deletePoolsPromises.splice(0))


    //________________________________Remove rogue pools_________________________________

    
    let slashObject = await GET_FROM_STATE_FOR_QUORUM_THREAD('SLASH_OBJECT')
    
    let slashObjectKeys = Object.keys(slashObject)
        

    for(let poolIdentifier of slashObjectKeys){
    
        //___________slashObject has the structure like this <pool> => true___________
    
        // Delete from DB
        atomicBatch.del(poolIdentifier+'(POOL)_STORAGE_POOL')

        // Remove from pools
        delete fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.POOLS_METADATA[poolIdentifier]
    
        // Remove from cache
        global.SYMBIOTE_META.QUORUM_THREAD_CACHE.delete(poolIdentifier+'(POOL)_STORAGE_POOL')

    }


    //Update the WORKFLOW_OPTIONS
    fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS={...workflowOptionsTemplate}

    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.delete('WORKFLOW_OPTIONS')

    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.delete('SLASH_OBJECT')


    //After all ops - commit state and make changes to workflow

    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.forEach((value,recordID)=>{

        atomicBatch.put(recordID,value)

    })


}




export let GET_VALID_CHECKPOINT = async threadID => {

    // Temporary stub
    return false

}




//Use it to find checkpoints on hostchains, perform them and join to QUORUM by finding the latest valid checkpoint
let START_QUORUM_THREAD_CHECKPOINT_TRACKER=async()=>{


    //_________________________________FIND THE NEXT CHECKPOINT AND EXECUTE SPECIAL_OPERATIONS INSTANTLY_________________________________

    
    let possibleCheckpoint = await GET_VALID_CHECKPOINT('QUORUM_THREAD').catch(_=>false)


    if(possibleCheckpoint){

        // We need it for changes
        let fullCopyOfQuorumThreadWithNewCheckpoint = JSON.parse(JSON.stringify(global.SYMBIOTE_META.QUORUM_THREAD))

        // Set the new checkpoint
        fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT = possibleCheckpoint

        // Store original checkpoint locally
        await global.SYMBIOTE_META.CHECKPOINTS.put(possibleCheckpoint.HEADER.PAYLOAD_HASH,possibleCheckpoint)

        // All operations must be atomic
        let atomicBatch = global.SYMBIOTE_META.QUORUM_THREAD_METADATA.batch()

        // Get the FullID of old checkpoint
        let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID


        // Execute special operations from new checkpoint using our copy of QT and atomic handler
        await EXECUTE_SPECIAL_OPERATIONS_IN_NEW_CHECKPOINT(atomicBatch,fullCopyOfQuorumThreadWithNewCheckpoint)


        LOG(`\u001b[38;5;154mSpecial operations were executed for checkpoint \u001b[38;5;93m${possibleCheckpoint.HEADER.ID} ### ${possibleCheckpoint.HEADER.PAYLOAD_HASH} (QT)\u001b[0m`,'S')

        // Mark as completed
        fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.COMPLETED = true

        // Create new quorum based on new POOLS_METADATA state
        fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.QUORUM = GET_QUORUM(fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.POOLS_METADATA,fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS)

        
        
        let nextQuorumThreadID = possibleCheckpoint.HEADER.PAYLOAD_HASH+"#"+possibleCheckpoint.HEADER.ID
    
        // Create new temporary db for the next checkpoint
        let nextTempDB = level(process.env.CHAINDATA_PATH+`/${nextQuorumThreadID}`,{valueEncoding:'json'})



        
        //__________________Based on POOLS_METADATA get the reassignments to instantly get the commitments / finalization proofs__________________


        let activeReservePoolsRelatedToSubchainAndStillNotUsed = new Map() // subchainID => [] - array of active reserve pools

        let stoppedSubchainsIDs = new Set()

        let futureReassignments = new Map()

        let nextTempDBBatch = nextTempDB.batch()


        for(let [poolPubKey,poolMetadata] of Object.entries(fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.POOLS_METADATA)){

            // Find main(not reserve) pools which were stopped
            if(!poolMetadata.IS_RESERVE && poolMetadata.IS_STOPPED){

                stoppedSubchainsIDs.add(poolPubKey)
    
            }
            else if(!poolMetadata.IS_STOPPED){
    
                // Otherwise - it's reserve pool
                        
                let poolStorage = await GET_FROM_STATE_FOR_QUORUM_THREAD(poolPubKey+`(POOL)_STORAGE_POOL`)
    
                if(poolStorage){
    
                    let {reserveFor} = poolStorage
    
                    if(!activeReservePoolsRelatedToSubchainAndStillNotUsed.has(reserveFor)) activeReservePoolsRelatedToSubchainAndStillNotUsed.set(reserveFor,[])
    
                    activeReservePoolsRelatedToSubchainAndStillNotUsed.get(reserveFor).push(poolPubKey)
                        
                }
    
            }

        }


        /*
        
            After this cycle we have:

            [0] stoppedSubchainsIDs - Set(skippedSubchain1,skippedSubchain2,...)
            [1] activeReservePoolsRelatedToSubchainAndStillNotUsed - Map(subchainID=>[reservePool1,reservePool2,...reservePoolN])

        
        */

        let hashOfMetadataFromOldCheckpoint = BLAKE3(JSON.stringify(fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.POOLS_METADATA))

        
        for(let subchainPoolID of stoppedSubchainsIDs){
                        
            let nonce = 0

            let pseudoRandomHash = BLAKE3(hashOfMetadataFromOldCheckpoint+nonce) // since we need to find first reserve pool in a deterministic chain(among non-stopped reserve pools)

            let arrayOfActiveReservePoolsRelatedToThisSubchain = activeReservePoolsRelatedToSubchainAndStillNotUsed.get(subchainPoolID)

            let mapping=new Map()

            let arrayOfChallanges = arrayOfActiveReservePoolsRelatedToThisSubchain.map(validatorPubKey=>{

                let challenge = parseInt(BLAKE3(validatorPubKey+pseudoRandomHash),16)
    
                mapping.set(challenge,validatorPubKey)

                return challenge

            })
    

            let firstChallenge = HEAP_SORT(arrayOfChallanges)[0]
    
            let firstReservePoolInReassignmentChain = mapping.get(firstChallenge)
            
            if(firstReservePoolInReassignmentChain){

                let reassignmentTemplateForQT = {

                    NONCE:1,
                    
                    SKIPPED_RESERVE:[],
                    
                    CURRENT:firstReservePoolInReassignmentChain

                }

                nextTempDBBatch.put('REASSIGN:'+subchainPoolID,reassignmentTemplateForQT)
                

                futureReassignments.set(subchainPoolID,reassignmentTemplateForQT)

                futureReassignments.set(firstReservePoolInReassignmentChain,subchainPoolID)

            }

        }


        await nextTempDBBatch.write()

        // Commit changes
        atomicBatch.put('QT',fullCopyOfQuorumThreadWithNewCheckpoint)

        await atomicBatch.write()
    

        // Create mappings & set for the next checkpoint
        let nextTemporaryObject={

            SPECIAL_OPERATIONS_MEMPOOL:new Map(),

            COMMITMENTS:new Map(), 
            FINALIZATION_PROOFS:new Map(),

            CHECKPOINT_MANAGER:new Map(),
            CHECKPOINT_MANAGER_SYNC_HELPER:new Map(),
 
            SKIP_HANDLERS:new Map(), // {EXTENDED_FINALIZATION_PROOF,AGGREGATGED_SKIP_PROOF}

            PROOFS_REQUESTS:new Map(),
            PROOFS_RESPONSES:new Map(),
    
            REASSIGNMENTS:futureReassignments,

            HEALTH_MONITORING:new Map(),
      
            DATABASE:nextTempDB
            
        }

        global.SYMBIOTE_META.QUORUM_THREAD = fullCopyOfQuorumThreadWithNewCheckpoint

        LOG(`QUORUM_THREAD was updated => \x1b[34;1m${global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID} ### ${global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH}`,'S')

        // Get the new ROOTPUB and delete the old one
        global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('QT_ROOTPUB'+nextQuorumThreadID,bls.aggregatePublicKeys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM))
    
        global.SYMBIOTE_META.STATIC_STUFF_CACHE.delete('QT_ROOTPUB'+checkpointFullID)


        //_______________________Check the version required for the next checkpoint________________________


        if(IS_MY_VERSION_OLD('QUORUM_THREAD')){

            LOG(`New version detected on QUORUM_THREAD. Please, upgrade your node software`,'W')

            console.log('\n')
            console.log(fs.readFileSync(PATH_RESOLVE('images/events/update.txt')).toString())
        
            // Stop the node to update the software
            GRACEFUL_STOP()

        }


        // Close & delete the old temporary db 
        await global.SYMBIOTE_META.TEMP.get(checkpointFullID).DATABASE.close()
        
        fs.rm(process.env.CHAINDATA_PATH+`/${checkpointFullID}`,{recursive:true},()=>{})
        
        global.SYMBIOTE_META.TEMP.delete(checkpointFullID)


        //________________________________ If it's fresh checkpoint and we present there as a member of quorum - then continue the logic ________________________________


        let checkpointIsFresh = CHECK_IF_THE_SAME_DAY(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.TIMESTAMP,GET_GMT_TIMESTAMP())

        let iAmInTheQuorum = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.includes(global.CONFIG.SYMBIOTE.PUB)

        let poolsMetadata = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA


        if(checkpointIsFresh && iAmInTheQuorum){

            // Fill the checkpoints manager with the latest data

            let currentCheckpointManager = nextTemporaryObject.CHECKPOINT_MANAGER

            let currentCheckpointSyncHelper = nextTemporaryObject.CHECKPOINT_MANAGER_SYNC_HELPER

            Object.keys(poolsMetadata).forEach(
            
                poolPubKey => {

                    currentCheckpointManager.set(poolPubKey,poolsMetadata[poolPubKey])

                    currentCheckpointSyncHelper.set(poolPubKey,poolsMetadata[poolPubKey])

                }

            )

        }

        // Set next temporary object by ID
        global.SYMBIOTE_META.TEMP.set(nextQuorumThreadID,nextTemporaryObject)

        //__________________________ Also, check if we was "skipped" to send the awakening special operation to POST /special_operations __________________________

        if(poolsMetadata[global.CONFIG.SYMBIOTE.PUB]?.IS_STOPPED) START_AWAKENING_PROCEDURE()


        //Continue to find checkpoints
        setTimeout(START_QUORUM_THREAD_CHECKPOINT_TRACKER,0)


    }else{

        // Wait for the new checkpoint will appear on hostchain

        setTimeout(START_QUORUM_THREAD_CHECKPOINT_TRACKER,global.CONFIG.SYMBIOTE.POLLING_TIMEOUT_TO_FIND_CHECKPOINT_FOR_QUORUM_THREAD)    


    }


},



/**
 * @param {string} originSubchain BLS pubkey of subchain
 * @param {Object} poolsMetadataFromCheckpoint metadata of pool from checkpoint {INDEX,HASH,IS_RESERVE,IS_STOPPED}
 * @param {Object} reassignmentMetadata metadata like {NONCE,SKIPPED_RESERVE,CURRENT} related to some subchain
 */
GET_NEXT_RESERVE_POOL_IN_ROW=async(originSubchain,poolsMetadataFromCheckpoint,reassignmentMetadata)=>{

    let arrayOfActiveReservePools = []

    for(let [poolPubKey,poolMetadata] of Object.entries(poolsMetadataFromCheckpoint)){

        if(!poolMetadata.IS_RESERVE && !poolMetadata.IS_STOPPED){
                
            let candidatePoolStorage = await global.SYMBIOTE_META.STATE.get(BLAKE3(originSubchain+poolPubKey+`(POOL)_STORAGE_POOL`))
        
            if(candidatePoolStorage){
        
                let {reserveFor} = candidatePoolStorage

                if(originSubchain===reserveFor){

                    arrayOfActiveReservePools.push(originSubchain)

                }

            }

        }        

    }

    // Now based on hash of poolsMetadata in checkpoint and nonce - find the next reserve pool in deterministic reassignments chain

    // Since it's a chain - take a nonce

    let hashOfMetadataFromOldCheckpoint = BLAKE3(JSON.stringify(poolsMetadataFromCheckpoint))
    
    let pseudoRandomHash = BLAKE3(hashOfMetadataFromOldCheckpoint+reassignmentMetadata.NONCE)

    let mapping = new Map()

    let arrayOfChallanges = arrayOfActiveReservePools
    
        .filter(pubKey=>!reassignmentMetadata.SKIPPED_RESERVE.includes(pubKey))
        
        .map(validatorPubKey=>{

            let challenge = parseInt(BLAKE3(validatorPubKey+pseudoRandomHash),16)
    
            mapping.set(challenge,validatorPubKey)

            return challenge

        })
    

    let firstChallenge = HEAP_SORT(arrayOfChallanges)[0]
    
    return mapping.get(firstChallenge)

},




// Function for secured and a sequently update of CHECKPOINT_MANAGER and to prevent giving FINALIZATION_PROOFS when it's restricted. In general - function to avoid async problems
PROOFS_SYNCHRONIZER=async()=>{


    /* 
    
        [*] Here we update the values in DB and CHECKPOINT_MANAGER using values from CHECKPOINT_MANAGER_SYNC_HELPER
        
        [*] Also, take the finalization proof from PROOFS_REQUESTS, sign and push to PROOFS_RESPONSES

    */

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let currentCheckpointReassignmentChains = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.REASSIGNMENT_CHAINS // {mainPool:[<reservePool1>,<reservePool2>,...,<reservePoolN>]}


    let currentTempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    if(!currentTempObject){

        //Repeat this procedure after a while
        setTimeout(PROOFS_SYNCHRONIZER,1000)

        return

    }

    let currentCheckpointsManager = currentTempObject.CHECKPOINT_MANAGER // mapping( validatorID => {INDEX,HASH,(?)FINALIZATION_PROOF} )

    let currentCheckpointSyncHelper = currentTempObject.CHECKPOINT_MANAGER_SYNC_HELPER // mapping(subchainID=>{INDEX,HASH,FINALIZATION_PROOF:{aggregatedPub,aggregatedSigna,afkVoters}}})

    let currentFinalizationProofsRequests = currentTempObject.PROOFS_REQUESTS // mapping(blockID=>blockHash)

    let currentFinalizationProofsResponses = currentTempObject.PROOFS_RESPONSES // mapping(blockID=>SIG(blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+QT.CHECKPOINT.HEADER.ID))

    let currentSkipHandlersMapping = currentTempObject.SKIP_HANDLERS // Subchain_ID => {EXTENDED_FINALIZATION_PROOF:{INDEX,HASH,FINALIZATION_PROOF:{aggregatedPub,aggregatedSignature,afkVoters}},AGGREGATED_SKIP_PROOF:{same as FP structure, but aggregatedSigna = `SKIP:{subchain}:{index}:{hash}:{checkpointFullID}`}}
      
    let currentCheckpointDB = currentTempObject.DATABASE // LevelDB instance

    let currentCheckpointSkipSpecialOperationsMempool = currentTempObject.SPECIAL_OPERATIONS_MEMPOOL // mapping(operationID=>{type,payload})

    let reassignments = currentTempObject.SPECIAL_OPERATIONS_MEMPOOL


    //____________________ UPDATE THE CHECKPOINT_MANAGER ____________________


    for(let keyValue of currentCheckpointSyncHelper){

        let subchain = keyValue[0]
        
        let handlerWithMaximumHeight = keyValue[1] // {INDEX,HASH,FINALIZATION_PROOF}

        //Store to DB
        await USE_TEMPORARY_DB('put',currentCheckpointDB,subchain,handlerWithMaximumHeight).then(()=>{

            // And only after db - update the finalization height for CHECKPOINT_MANAGER
            currentCheckpointsManager.set(subchain,handlerWithMaximumHeight)

        }).catch(_=>{})

        // currentCheckpointSyncHelper.delete(subchain)

    }


    // Here we should check if we still can generate proofs, so it's not time to generate checkpoint & skip proofs

    if(currentFinalizationProofsRequests.get('NEXT_CHECKPOINT')){


        //Store to DB
        await USE_TEMPORARY_DB('put',currentCheckpointDB,'NEXT_CHECKPOINT',true).then(()=>{

            // On this step, we have the latest info about finalization_proofs
            currentFinalizationProofsResponses.set('READY_FOR_CHECKPOINT',true)

        }).catch(_=>{})


    }else {


        //____________________ GENERATE THE FINALIZATION_PROOFS ____________________

        // Now, check the requests, delete and add to responses
        for(let keyValue of currentFinalizationProofsRequests){

            if(keyValue[0]==='NEXT_CHECKPOINT') continue

            else if (keyValue[0].startsWith('REASSIGN:')){

                let mainPool = keyValue[1]

                // Add the reassignment
                    
                let mainPoolSubchainID = reassignments.get(mainPool)

                let reassignmentMetadata = reassignments.get(mainPool) // {CURRENT_RESERVE_POOL:<number>} - pointer to current reserve pool in array (QT/VT).CHECKPOINT.REASSIGNMENT_CHAINS[<mainPool>]

                if(!reassignmentMetadata){

                    // Create new handler

                    reassignmentMetadata = {CURRENT_RESERVE_POOL:-1}

                }

                let nextIndex = reassignmentMetadata.CURRENT_RESERVE_POOL+1

                let nextReservePool = currentCheckpointReassignmentChains[nextIndex]


                await USE_TEMPORARY_DB('put',currentCheckpointDB,'REASSIGN:'+mainPool,{CURRENT_RESERVE_POOL:nextIndex}).then(async()=>{
    
                    // And only after successful store we can move to the next pool

                    reassignmentMetadata.CURRENT_RESERVE_POOL++
                    
                    reassignments.set(mainPool,reassignmentMetadata)

                    reassignments.set(nextReservePool,mainPoolSubchainID)


                }).catch(_=>false)


            }else if (keyValue[0].startsWith('CREATE_SKIP_HANDLER:')){

                let subchain = keyValue[1]

                // This prevents creating FINALIZATION_PROOFS for subchain and initiate the skip procedure

                let futureSkipHandler = {

                    EXTENDED_FINALIZATION_PROOF:JSON.parse(JSON.stringify(currentCheckpointSyncHelper.get(subchain))), // {INDEX,HASH,FINALIZATION_PROOF}

                    AGGREGATED_SKIP_PROOF:null // for future - when we get the 2/3N+1 skip proofs from POST /get_skip_proof - aggregate and use to insert in blocks of reserve pool and so on

                }

                currentSkipHandlersMapping.set(subchain,futureSkipHandler)

                // Clear the request
                currentFinalizationProofsRequests.delete(keyValue[0])


            }else{

                // Generate signature for finalization proofs

                let blockID = keyValue[0]
                
                let {hash,finalizationProof} = keyValue[1]
    
                let [subchain,index] = blockID.split(':')

                index=+index
    
                // We can't produce finalization proofs for subchains that are stopped
                if(currentSkipHandlersMapping.has(subchain)) continue

                // Put to responses
                currentFinalizationProofsResponses.set(blockID,await BLS_SIGN_DATA(blockID+hash+'FINALIZATION'+checkpointFullID))
    
                currentFinalizationProofsRequests.delete(blockID)

                // Delete the response for the previous block from responses
                // currentFinalizationProofsResponses.delete(subchain+':'+(index-1))


                //Update the CHECKPOINTS_MANAGER
                
                let subchainState = currentCheckpointSyncHelper.get(subchain)

                if(subchainState && subchainState.INDEX<index){

                    subchainState.INDEX=index
                    
                    subchainState.HASH=hash
                    
                    subchainState.FINALIZATION_PROOF=finalizationProof

                    currentCheckpointSyncHelper.set(subchain,subchainState)

                }

            }

        }

    }


    //Repeat this procedure permanently, but in sync mode
    setTimeout(PROOFS_SYNCHRONIZER,0)

},




MAKE_CHECKPOINT = async checkpointHeader => {



},




// Once we've received 2/3N+1 signatures for checkpoint(HEADER,PAYLOAD) - we can start the next stage to get signatures to get another signature which will be valid for checkpoint
INITIATE_CHECKPOINT_STAGE_2_GRABBING=async(myCheckpoint,quorumMembersHandler)=>{

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let checkpointTemporaryDB = global.SYMBIOTE_META.TEMP.get(checkpointFullID).DATABASE

    if(!checkpointTemporaryDB) return


    myCheckpoint ||= await USE_TEMPORARY_DB('get',checkpointTemporaryDB,'CHECKPOINT').catch(_=>false)

    quorumMembersHandler ||= await GET_POOLS_URLS(true)

    
    //_____________________ Go through the quorum and share our pre-signed object with checkpoint payload and issuer proof____________________

    /*
    
        We should send the following object to the POST /checkpoint_stage_2

        {
            CHECKPOINT_FINALIZATION_PROOF:{

                aggregatedPub:<2/3N+1 from QUORUM>,
                aggregatedSigna:<SIG(PAYLOAD_HASH)>,
                afkVoters:[]

            }

            ISSUER_PROOF:SIG(ISSUER+PAYLOAD_HASH)

            CHECKPOINT_PAYLOAD:{

                ISSUER:<BLS pubkey of checkpoint grabbing initiator>
            
                PREV_CHECKPOINT_PAYLOAD_HASH: global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,
            
                POOLS_METADATA: {
                
                    '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {INDEX,HASH,IS_STOPPED,IS_RESERVE}

                    /..other data
            
                },
        
                OPERATIONS: GET_SPECIAL_OPERATIONS(),
                OTHER_SYMBIOTES: {}
    
            }

        }
    
    */


    // Structure is {CHECKPOINT_FINALIZATION_PROOF,ISSUER_PROOF,CHECKPOINT_PAYLOAD}
    let everythingAtOnce={
            
        CHECKPOINT_FINALIZATION_PROOF:{

            aggregatedPub:myCheckpoint.HEADER.QUORUM_AGGREGATED_SIGNERS_PUBKEY,
            aggregatedSignature:myCheckpoint.HEADER.QUORUM_AGGREGATED_SIGNATURE,
            afkVoters:myCheckpoint.HEADER.AFK_VOTERS

        },

        ISSUER_PROOF:await BLS_SIGN_DATA(global.CONFIG.SYMBIOTE.PUB+myCheckpoint.HEADER.PAYLOAD_HASH),

        CHECKPOINT_PAYLOAD:myCheckpoint.PAYLOAD

    }



    let sendOptions={
        
        method:'POST',
        
        body:JSON.stringify(everythingAtOnce)

    }

    let promises=[]


    //memberHandler is {pubKey,url}
    for(let memberHandler of quorumMembersHandler){

        let responsePromise = fetch(memberHandler.url+'/checkpoint_stage_2',sendOptions).then(r=>r.json()).then(async response=>{
 
            response.pubKey = memberHandler.pubKey

            return response

        }).catch(_=>false)


        promises.push(responsePromise)

    }


    //Run promises
    let checkpointsPingBacks = (await Promise.all(promises)).filter(Boolean)
    
    let otherAgreements = new Map()
  
    
    for(let obj of checkpointsPingBacks){

        if(typeof obj !== 'object') continue

        let {pubKey,sig} = obj

        if(sig){

            let isSignaOk = await bls.singleVerify('STAGE_2'+myCheckpoint.HEADER.PAYLOAD_HASH,pubKey,sig).catch(_=>false)

            if(isSignaOk) otherAgreements.set(pubKey,sig)

        }

    }


    //______________________ Finally, once we have 2/3N+1 signatures - aggregate it, modify checkpoint header and publish to hostchain ______________________


    if(otherAgreements.size>=GET_MAJORITY('QUORUM_THREAD')){

        // Hooray - we can create checkpoint and publish to hostchain & share among other members

        let signatures=[], pubKeys=[]

        otherAgreements.forEach((signa,pubKey)=>{

            signatures.push(signa)

            pubKeys.push(pubKey)

        })


        // Modify the checkpoint header

        myCheckpoint.HEADER.QUORUM_AGGREGATED_SIGNERS_PUBKEY=bls.aggregatePublicKeys(pubKeys)

        myCheckpoint.HEADER.QUORUM_AGGREGATED_SIGNATURE=bls.aggregateSignatures(signatures)

        myCheckpoint.HEADER.AFK_VOTERS=global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.filter(pubKey=>!otherAgreements.has(pubKey))


        //Store time tracker to DB
        await USE_TEMPORARY_DB('put',checkpointTemporaryDB,'CHECKPOINT_TIME_TRACKER',GET_GMT_TIMESTAMP()).catch(_=>false)

        //Send the header to hostchain
        await MAKE_CHECKPOINT(myCheckpoint.HEADER).catch(error=>LOG(`Some error occured during the process of checkpoint commit => ${error}`))

                 
    }

},




CAN_PROPOSE_CHECKPOINT=async()=>{

    // Stub
    return false

},




CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT=async()=>{


    //__________________________ If we've runned the second stage - skip the code below __________________________

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let temporaryObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

    if(!temporaryObject){

        setTimeout(CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT,3000)

        return

    }

    let quorumRootPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)

    let timestamp = await USE_TEMPORARY_DB('get',temporaryObject.DATABASE,`CHECKPOINT_TIME_TRACKER`).catch(_=>false)

    let myPotentialCheckpoint = await USE_TEMPORARY_DB('get',temporaryObject.DATABASE,`CHECKPOINT`).catch(_=>false)



    if(timestamp && timestamp + global.CONFIG.SYMBIOTE.TIME_TRACKER.COMMIT > GET_GMT_TIMESTAMP()){

        setTimeout(CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT,3000) //each 3 seconds - do monitoring

        return

    }


    //Delete the time tracker
    await USE_TEMPORARY_DB('del',temporaryObject.DATABASE,`CHECKPOINT_TIME_TRACKER`).catch(_=>false)
 

    if(myPotentialCheckpoint){
        
        await INITIATE_CHECKPOINT_STAGE_2_GRABBING(myPotentialCheckpoint).catch(_=>{})

        setTimeout(CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT,3000) //each 3 seconds - do monitoring

        return

    }

    // Get the latest known block and check if it's next day. In this case - make currentFinalizationProofsRequests.set('NEXT_CHECKPOINT',true) to prevent generating  COMMITMENTS / FINALIZATION_PROOFS and so on

    /*
    
        Here we generate the checkpoint and go through the other quorum members to get signatures of proposed checkpoint PAYLOAD

        Here is the structure we should build & distribute

        {
            
            PREV_CHECKPOINT_PAYLOAD_HASH: global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,
            
            POOLS_METADATA: {
                
                '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {INDEX,HASH,IS_STOPPED,IS_RESERVE}

                /..other data
            
            },
            OPERATIONS: GET_SPECIAL_OPERATIONS(),
            OTHER_SYMBIOTES: {}
        
        }

        To sign it => SIG(BLAKE3(JSON.stringify(<PROPOSED>)))
    
    */


    let canProposeCheckpoint = await CAN_PROPOSE_CHECKPOINT(),

        iAmInTheQuorum = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.includes(global.CONFIG.SYMBIOTE.PUB),

        checkpointIsFresh = CHECK_IF_THE_SAME_DAY(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.TIMESTAMP,GET_GMT_TIMESTAMP())



    if(canProposeCheckpoint && iAmInTheQuorum && !checkpointIsFresh){


        // Stop to generate commitments/finalization proofs
        temporaryObject.PROOFS_REQUESTS.set('NEXT_CHECKPOINT',true)


        // Check the safety
        if(!temporaryObject.PROOFS_RESPONSES.get('READY_FOR_CHECKPOINT')){

            setTimeout(CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT,3000)

            return

        }

        //____________________________________ Build the template of checkpoint's payload ____________________________________


        let potentialCheckpointPayload = {

            ISSUER:global.CONFIG.SYMBIOTE.PUB,

            PREV_CHECKPOINT_PAYLOAD_HASH:global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,

            POOLS_METADATA:{},

            OPERATIONS:GET_SPECIAL_OPERATIONS(checkpointFullID),

            OTHER_SYMBIOTES:{} //don't need now

        }

        Object.keys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA).forEach(
            
            poolPubKey => {

                let {INDEX,HASH} = temporaryObject.CHECKPOINT_MANAGER.get(poolPubKey) //{INDEX,HASH,(?)FINALIZATION_PROOF}

                let {IS_STOPPED,IS_RESERVE} = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA[poolPubKey] //move the status from the current checkpoint. If "STOP_VALIDATOR" operations will exists in special operations array - than this status will be changed

                potentialCheckpointPayload.POOLS_METADATA[poolPubKey] = {INDEX,HASH,IS_STOPPED,IS_RESERVE}

            }

        )


        let otherAgreements = new Map()


        //________________________________________ Exchange with other quorum members ________________________________________

        let quorumMembers = await GET_POOLS_URLS(true)

        let payloadInJSON = JSON.stringify(potentialCheckpointPayload)

        let promises=[]

        let sendOptions={

            method:'POST',

            body:payloadInJSON

        }


        /*
        
            First of all, we do the HEIGHT_UPDATE operations and repeat grabbing checkpoints.
            We execute the DEL_SPEC_OP transactions only in case if no valid <HEIGHT_UPDATE> operations were received during round.
        
        */
        for(let memberHandler of quorumMembers){

            let responsePromise = fetch(memberHandler.url+'/checkpoint_stage_1',sendOptions).then(r=>r.json()).then(async response=>{
 
                response.pubKey = memberHandler.pubKey

                return response

            }).catch(_=>false)


            promises.push(responsePromise)

        }

        //Run promises
        let checkpointsPingBacks = (await Promise.all(promises)).filter(Boolean)


        /*
        
            First of all, we do the HEIGHT_UPDATE operations and repeat grabbing checkpoints.
            We execute the DEL_SPEC_OP transactions only in case if no valid <HEIGHT_UPDATE> operations were received during round.
        
        */

        // QUORUM members should sign the hash of payload related to the next checkpoint
        let checkpointPayloadHash = BLAKE3(payloadInJSON)
        
        let propositionsToUpdateMetadata=0



        for(let obj of checkpointsPingBacks){

            
            if(typeof obj !== 'object') continue


            let {pubKey,sig,metadataUpdate} = obj

            /*
            
                checkpointPingback has the following structure

                {
                    pubKey  - we add it after answer
                    
                    ? sig:<> - if exists - then validator agree with the proposed checkpoint
                        
                    ? excludeSpecOperations:[] - array of ids of operation we should exclude from checkpoint proposition to get the agreement from validator

                    ? metadataUpdate:{} - array of updated hash:index where index > than our local version, so we check the inner FINALIZATION_PROOF and if OK - update the local CHECKPOINT_MANAGER to propose next checkpoint with the nex height

                }
            
            */

            if(sig){

                let isSignaOk = await bls.singleVerify(checkpointPayloadHash,pubKey,sig).catch(_=>false)

                if(isSignaOk) otherAgreements.set(pubKey,sig)

            }else if(metadataUpdate && metadataUpdate.length!==0){

                // Update the data of CHECKPOINT_MANAGER_SYNC_HELPER if quorum voted for appropriate block:hash:index

                let currentSyncHelper = temporaryObject.CHECKPOINT_MANAGER_SYNC_HELPER // mapping(subchainID=>{INDEX,HASH,FINALIZATION_PROOF})


                for(let updateOp of metadataUpdate){

                    // Get the data about the current subchain
                    let subchainMetadata = currentSyncHelper.get(updateOp.subchain)

                    if(!subchainMetadata) continue

                    else{

                        // If we received proof about bigger height on this subchain
                        if(updateOp.index>subchainMetadata.INDEX && typeof updateOp.finalizationProof === 'string'){

                            let {aggregatedSignature,aggregatedPub,afkVoters} = updateOp.finalizationProof
    
                            let signaIsOk = await bls.singleVerify(updateOp.subchain+":"+updateOp.index+updateOp.hash+checkpointFullID,aggregatedPub,aggregatedSignature).catch(_=>false)
        
                            try{

                                let rootPubIsOK = quorumRootPub === bls.aggregatePublicKeys([aggregatedPub,...afkVoters])
        
        
                                if(signaIsOk && rootPubIsOK){

                                    let latestFinalized = {INDEX:updateOp.index,HASH:updateOp.hash,FINALIZATION_PROOF:updateOp.finalizationProof}

                                    // Send to synchronizer to update the local stats

                                    currentSyncHelper.set(updateOp.subchain,latestFinalized)

                                    propositionsToUpdateMetadata++
        
                                }


                            }catch(_){}

                        }

                    }

                }

            }

        }

        /*
        
        ___________________________ WHAT NEXT ? ___________________________
        
        On this step, sooner or later, the propositionsToUpdateMetadata will be equal to 0 - because in case the QUORUM majority is honest,
        there were no SUPER_FINALIZATION_PROOF for another height/hash

        On this step - we start to exclude the special operations from our proposition to get the wished 2/3N+1 signatures of checkpoint proposition

        But, initialy we check if 2/3N+1 agreements we have. If no and no propositions to update metadata - then it's problem with the special operations, so we should exclude some of them
        
        */

        if(otherAgreements.size>=GET_MAJORITY('QUORUM_THREAD')){

            // Hooray - we can create checkpoint and publish to hostchain & share among other members

            let signatures=[], pubKeys=[]

            otherAgreements.forEach((signa,pubKey)=>{

                signatures.push(signa)

                pubKeys.push(pubKey)

            })


            let newCheckpoint = {

                // Publish header to hostchain & share among the rest of network
                HEADER:{

                    ID:global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID+1,
        
                    PAYLOAD_HASH:checkpointPayloadHash,
        
                    QUORUM_AGGREGATED_SIGNERS_PUBKEY:bls.aggregatePublicKeys(pubKeys),
        
                    QUORUM_AGGREGATED_SIGNATURE:bls.aggregateSignatures(signatures),
        
                    AFK_VOTERS:global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.filter(pubKey=>!otherAgreements.has(pubKey))
        
                },
                
                // Store & share among the rest of network
                PAYLOAD:potentialCheckpointPayload,        

            }

            await USE_TEMPORARY_DB('put',temporaryObject.DATABASE,`CHECKPOINT`,newCheckpoint).catch(_=>false)

            //___________________________ Run the second stage - share via POST /checkpoint_stage_2 ____________________________________

            await INITIATE_CHECKPOINT_STAGE_2_GRABBING(newCheckpoint,quorumMembers).catch(_=>{})


        }else if(propositionsToUpdateMetadata===0){

            // Delete the special operations due to which the rest could not agree with our version of checkpoints
            //! NOTE - we can't delete operations of SKIP_PROCEDURE, so check the type of operation too

            for(let {excludeSpecOperations} of checkpointsPingBacks){

                if(excludeSpecOperations && excludeSpecOperations.length!==0){
                    
                    for(let operationID of excludeSpecOperations){

                        let operationToDelete = temporaryObject.SPECIAL_OPERATIONS_MEMPOOL.get(operationID)
    
                        //We can't delete the 'STOP_VALIDATOR' operation
                        if(operationToDelete.type!=='STOP_VALIDATOR') temporaryObject.SPECIAL_OPERATIONS_MEMPOOL.delete(operationID)
    
                    }

                }

            }

        }

        //Clear everything and repeat the attempt(round) of checkpoint proposition - with updated values of subchains' metadata & without special operations

    }

    setTimeout(CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT,3000) //each 3 seconds - do monitoring

},




RUN_FINALIZATION_PROOFS_GRABBING = async (checkpointFullID,blockID) => {


    let block = await global.SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>false)

    let blockHash = Block.genHash(block)

    if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)) return


    let {COMMITMENTS,FINALIZATION_PROOFS,DATABASE} = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    //Create the mapping to get the FINALIZATION_PROOFs from the quorum members. Inner mapping contains voterValidatorPubKey => his FINALIZATION_PROOF   
    
    FINALIZATION_PROOFS.set(blockID,new Map())

    let finalizationProofsMapping = FINALIZATION_PROOFS.get(blockID)

    let aggregatedCommitments = COMMITMENTS.get(blockID) //voterValidatorPubKey => his commitment 


    let optionsToSend = {method:'POST',body:JSON.stringify(aggregatedCommitments)},

        quorumMembers = await GET_POOLS_URLS(true),

        majority = GET_MAJORITY('QUORUM_THREAD'),

        promises=[]


    if(finalizationProofsMapping.size<majority){

        //Descriptor is {url,pubKey}
        for(let descriptor of quorumMembers){

            // No sense to get the commitment if we already have
            if(finalizationProofsMapping.has(descriptor.pubKey)) continue
    
    
            let promise = fetch(descriptor.url+'/finalization',optionsToSend).then(r=>r.text()).then(async possibleFinalizationProof=>{
                
                let finalProofIsOk = await bls.singleVerify(blockID+blockHash+'FINALIZATION'+checkpointFullID,descriptor.pubKey,possibleFinalizationProof).catch(_=>false)
    
                if(finalProofIsOk) finalizationProofsMapping.set(descriptor.pubKey,possibleFinalizationProof)
    
            
            }).catch(_=>false)
    

            // To make sharing async
            promises.push(promise)
    
        }
    
        await Promise.all(promises)

    }




    //_______________________ It means that we now have enough FINALIZATION_PROOFs for appropriate block. Now we can start to generate SUPER_FINALIZATION_PROOF _______________________


    if(finalizationProofsMapping.size>=majority){

        // In this case , aggregate FINALIZATION_PROOFs to get the SUPER_FINALIZATION_PROOF and share over the network
        // Also, increase the counter of global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER') to move to the next block and udpate the hash
    
        let signers = [...finalizationProofsMapping.keys()]

        let signatures = [...finalizationProofsMapping.values()]

        let afkVoters = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.filter(pubKey=>!signers.includes(pubKey))


        /*
        
        Aggregated version of FINALIZATION_PROOFs (it's SUPER_FINALIZATION_PROOF)
        
        {
        
            blockID:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

            blockHash:"0123456701234567012345670123456701234567012345670123456701234567",
        
            aggregatedPub:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP",

            aggregatedSigna:"kffamjvjEg4CMP8VsxTSfC/Gs3T/MgV1xHSbP5YXJI5eCINasivnw07f/lHmWdJjC4qsSrdxr+J8cItbWgbbqNaM+3W4HROq2ojiAhsNw6yCmSBXl73Yhgb44vl5Q8qD",

            afkVoters:[]

        }
    

        */

        let superFinalizationProof = {

            blockID,
            
            blockHash,
            
            aggregatedPub:bls.aggregatePublicKeys(signers),
            
            aggregatedSignature:bls.aggregateSignatures(signatures),
            
            afkVoters

        }

        //Share here
        BROADCAST('/super_finalization',superFinalizationProof)

        await USE_TEMPORARY_DB('put',DATABASE,'SFP:'+blockID,superFinalizationProof).catch(_=>false)

        // Repeat procedure for the next block and store the progress

        let appropriateDescriptor = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

        await USE_TEMPORARY_DB('put',DATABASE,'BLOCK_SENDER_HANDLER',appropriateDescriptor).catch(_=>false)

        appropriateDescriptor.height++

    }

},




RUN_COMMITMENTS_GRABBING = async (checkpointFullID,blockID) => {


    let block = await global.SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>false)

    // Check for this block after a while
    if(!block) return


    let blockHash = Block.genHash(block)



    let optionsToSend = {method:'POST',body:JSON.stringify(block)},

        commitmentsMapping = global.SYMBIOTE_META.TEMP.get(checkpointFullID).COMMITMENTS,
        
        majority = GET_MAJORITY('QUORUM_THREAD'),

        quorumMembers = await GET_POOLS_URLS(true),

        promises=[],

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
    
            2. Get the 2/3N+1 FINALIZATION_PROOFs, aggregate and call POST /super_finalization to share the SUPER_FINALIZATION_PROOFS over the symbiote
    
            */

    
            let promise = fetch(descriptor.url+'/block',optionsToSend).then(r=>r.text()).then(async possibleCommitment=>{

                let commitmentIsOk = await bls.singleVerify(blockID+blockHash+checkpointFullID,descriptor.pubKey,possibleCommitment).catch(_=>false)
    
                if(commitmentIsOk) commitmentsForCurrentBlock.set(descriptor.pubKey,possibleCommitment)

            }).catch(_=>{})
    
            // To make sharing async
            promises.push(promise)
    
        }
    
        await Promise.all(promises)

    }


    //_______________________ It means that we now have enough commitments for appropriate block. Now we can start to generate FINALIZATION_PROOF _______________________

    // On this step we should go through the quorum members and share FINALIZATION_PROOF to get the SUPER_FINALIZATION_PROOFS(and this way - finalize the block)
    
    if(commitmentsForCurrentBlock.size>=majority){

        let signers = [...commitmentsForCurrentBlock.keys()]

        let signatures = [...commitmentsForCurrentBlock.values()]

        let afkVoters = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.filter(pubKey=>!signers.includes(pubKey))


        /*
        
        Aggregated version of commitments

        {
        
            blockID:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

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
    
        await RUN_FINALIZATION_PROOFS_GRABBING(checkpointFullID,blockID).catch(_=>{})

    }

},




SEND_BLOCKS_AND_GRAB_COMMITMENTS = async () => {


    // If we don't generate the blocks - skip this function
    if(!global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA[global.CONFIG.SYMBIOTE.PUB]){

        setTimeout(SEND_BLOCKS_AND_GRAB_COMMITMENTS,3000)

        return

    }

    // Descriptor has the following structure - {checkpointID,height}
    let appropriateDescriptor = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH + "#" + global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)){

        setTimeout(SEND_BLOCKS_AND_GRAB_COMMITMENTS,3000)

        return

    }


    let {FINALIZATION_PROOFS,DATABASE} = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    if(!appropriateDescriptor || appropriateDescriptor.checkpointID !== global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID){

        //If we still works on the old checkpoint - continue
        //Otherwise,update the latest height/hash and send them to the new QUORUM
        appropriateDescriptor = await USE_TEMPORARY_DB('get',DATABASE,'BLOCK_SENDER_HANDLER').catch(_=>false)

        if(!appropriateDescriptor){

            let myLatestFinalizedHeight = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA[global.CONFIG.SYMBIOTE.PUB].INDEX+1

            appropriateDescriptor = {
    
                checkpointID:global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID,
    
                height:myLatestFinalizedHeight
    
            }
    
        }
        
        // And store new descriptor(till it will be old)
        global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('BLOCK_SENDER_HANDLER',appropriateDescriptor)

    }


    let blockID = global.CONFIG.SYMBIOTE.PUB+':'+appropriateDescriptor.height


    if(FINALIZATION_PROOFS.has(blockID)){

        //This option means that we already started to share aggregated 2/3N+1 commitments and grab 2/3+1 FINALIZATION_PROOFS
        await RUN_FINALIZATION_PROOFS_GRABBING(checkpointFullID,blockID).catch(_=>{})

    }else{

        // This option means that we already started to share block and going to find 2/3N+1 commitments
        // Once we get it - aggregate it and start finalization proofs grabbing(previous option)

        await RUN_COMMITMENTS_GRABBING(checkpointFullID,blockID).catch(_=>{})

    }

    setTimeout(SEND_BLOCKS_AND_GRAB_COMMITMENTS,0)

},




//Iterate over SKIP_HANDLERS to get AGGREGATED_SKIP_PROOFs and approvements to move to the next reserve pools
SKIP_PROCEDURE_MONITORING=async()=>{

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

    if(!tempObject){

        setTimeout(SKIP_PROCEDURE_MONITORING,3000)

        return

    }

    let isCheckpointStillFresh = CHECK_IF_THE_SAME_DAY(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.TIMESTAMP,GET_GMT_TIMESTAMP())

    if(!isCheckpointStillFresh){

        setTimeout(SKIP_PROCEDURE_MONITORING,3000)

        return

    }


    let majority = GET_MAJORITY('QUORUM_THREAD')

    let currentQuorum = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM

    let reverseThreshold = global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.QUORUM_SIZE - majority

    let qtRootPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)

    let currentCheckpointDB = tempObject.DATABASE

    let skipHandlers = tempObject.SKIP_HANDLERS

    let reassignments = tempObject.REASSIGNMENTS
    
    // Get the appropriate pubkey & url to check and validate the answer
    let poolsURLsAndPubKeys = await GET_POOLS_URLS(true)

    

    for(let [poolWithSkipHandler,skipHandler] of skipHandlers){
    
        
        if(!skipHandler.AGGREGATED_SKIP_PROOF){

            // Otherwise, send EXTENDED_FINALIZATION_PROOF in SKIP_HANDLER to => POST /get_skip_proof

            let responsePromises = []

            let sendOptions = {
                
                method:'POST',

                body:JSON.stringify({

                    subchain:poolWithSkipHandler,

                    extendedFinalizationProof:skipHandler.EXTENDED_FINALIZATION_PROOF

                })

            }

            for(let poolUrlWithPubkey of poolsURLsAndPubKeys){

                let responsePromise = fetch(poolUrlWithPubkey.url+'/get_skip_proof',sendOptions).then(r=>r.json()).then(response=>{
    
                    response.pubKey = poolUrlWithPubkey.pubKey
        
                    return response
        
                }).catch(_=>false)
        
                responsePromises.push(responsePromise)
        
            }


            let results = (await Promise.all(responsePromises)).filter(Boolean)
   

            /*
            1
            ___________________________ Now analyze the responses ___________________________

            [1] In case quroum member also has this subchain in SKIP_HANDLER - this is the signal that it also stopped creating finalization proofs for a given subchain

                If its local version of EXTENDED_FINALIZATION_PROOF in skip handler has lower index than in FP that we send - the response format is:

                
                    {
                        type:'OK',
                        sig: BLS_SIG('SKIP:<subchain>:<index>:<hash>:<checkpointFullID>')
                    }

                    We should just verify this signature and add to local list for further aggregation
                    And this quorum member update his own local version of FP to have FP with bigger index


            [2] In case quorum member has bigger index of FP in its local skip handler - it sends us 'UPDATE' message with EXTENDED_FINALZATION_PROOF where:

                HIS_EXTENDED_FINALIZATION_PROOF.INDEX > OUR_LOCAL_EXTENDED_FINALIZATION_PROOF.INDEX

                Again - we should verify the signature, update local version of FP in our skip handler and repeat the grabbing procedure

                The response format in this case is:

                    {
                        type:'UPDATE',
                        
                        EXTENDED_FINALIZATION_PROOF:{
                            
                            INDEX,
                            HASH,
                            FINALIZATION_PROOF:{aggregatedPub,aggregatedSignature,afkVoters}
                        }
                        
                    }

            */


            let pubkeysWhoAgreeToSkip = [], signaturesToSkip = []

            let {INDEX,HASH} = skipHandler.EXTENDED_FINALIZATION_PROOF


            let dataThatShouldBeSigned = `SKIP:${poolWithSkipHandler}:${INDEX}:${HASH}:${checkpointFullID}`

            for(let result of results){

                if(result.type === 'OK' && typeof result.sig === 'string'){

                    let signatureIsOk = await bls.singleVerify(dataThatShouldBeSigned,result.pubKey,result.sig).catch(_=>false)

                    if(signatureIsOk){

                        pubkeysWhoAgreeToSkip.push(result.pubKey)

                        signaturesToSkip.push(result.sig)

                    }

                    if(pubkeysWhoAgreeToSkip.length >= majority) break // if we get 2/3N+1 signatures to skip - we already have ability to create AGGREGATED_SKIP_PROOF


                }else if(result.type === 'UPDATE' && typeof result.EXTENDED_FINALIZATION_PROOF === 'object'){


                    let {INDEX,HASH,FINALIZATION_PROOF} = result.EXTENDED_FINALIZATION_PROOF


                    if(FINALIZATION_PROOF){

                        let {aggregatedPub,aggregatedSignature,afkVoters} = FINALIZATION_PROOF
            
                        let dataThatShouldBeSigned = poolWithSkipHandler+':'+INDEX+HASH+'FINALIZATION'+checkpointFullID
                        
                        let finalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,qtRootPub,dataThatShouldBeSigned,aggregatedSignature,reverseThreshold).catch(_=>false)
            

                        //If signature is ok and index is bigger than we have - update the EXTENDED_FINALIZATION_PROOF in our local skip handler
            
                        if(finalizationProofIsOk && skipHandler.EXTENDED_FINALIZATION_PROOF.INDEX < INDEX){
            
                            
                            skipHandler.EXTENDED_FINALIZATION_PROOF.INDEX = INDEX

                            skipHandler.EXTENDED_FINALIZATION_PROOF.HASH = HASH

                            skipHandler.EXTENDED_FINALIZATION_PROOF.FINALIZATION_PROOF = {aggregatedPub,aggregatedSignature,afkVoters}
            

                            // Store the updated version of skip handler

                            await USE_TEMPORARY_DB('put',currentCheckpointDB,poolWithSkipHandler,skipHandler).catch(_=>{})

                            // If our local version had lower index - break the cycle and try again with updated value

                            break

                        }

                    }
                
                }

            }


            //____________________If we get 2/3+1 of votes - aggregate, get the ASP(AGGREGATED_SKIP_PROOF), add to local skip handler and start to grab approvements____________________

            if(pubkeysWhoAgreeToSkip.length >= majority){

                skipHandler.AGGREGATED_SKIP_PROOF = {

                    INDEX:skipHandler.EXTENDED_FINALIZATION_PROOF.INDEX,

                    HASH:skipHandler.EXTENDED_FINALIZATION_PROOF.HASH,

                    SKIP_PROOF:{

                        aggregatedPub:bls.aggregatePublicKeys(pubkeysWhoAgreeToSkip),

                        aggregatedSignature:bls.aggregateSignatures(signaturesToSkip),

                        afkVoters:currentQuorum.filter(pubKey=>!pubkeysWhoAgreeToSkip.has(pubKey))
                        
                    }

                }

                await USE_TEMPORARY_DB('put',currentCheckpointDB,poolWithSkipHandler,skipHandler).catch(_=>{})                


            }

            

            if(skipHandler.AGGREGATED_SKIP_PROOF){

                // If ASP already exists - ask for 2/3N+1 => GET /get_reassignment_ready_status/:SUBCHAIN
    
                for(let poolUrlWithPubkey of poolsURLsAndPubKeys){
    
                    let responsePromise = fetch(poolUrlWithPubkey.url+'/get_reassignment_ready_status/'+poolWithSkipHandler).then(r=>r.json()).then(response=>{
        
                        response.pubKey = poolUrlWithPubkey.pubKey
            
                        return response
            
                    }).catch(_=>{candidatesForAnotherCheck.push(poolUrlWithPubkey.pubKey)})
            
                    proofsPromises.push(responsePromise)
            
                }
        
    
            }
                

        }


    }


    // Start again
    setTimeout(SKIP_PROCEDURE_MONITORING,0)

    
},




//Function to monitor the available block creators
SUBCHAINS_HEALTH_MONITORING=async()=>{

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

    if(!tempObject){

        setTimeout(SUBCHAINS_HEALTH_MONITORING,global.CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return

    }

    let reverseThreshold = global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.QUORUM_SIZE-GET_MAJORITY('QUORUM_THREAD')

    let qtRootPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)

    let proofsRequests = tempObject.PROOFS_REQUESTS

    let skipHandlers = tempObject.SKIP_HANDLERS

    let reassignments = tempObject.REASSIGNMENTS

    let isCheckpointStillFresh = CHECK_IF_THE_SAME_DAY(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.TIMESTAMP,GET_GMT_TIMESTAMP())



    if(tempObject.HEALTH_MONITORING.size===0){

        // Fill the HEALTH_MONITORING mapping with the latest known values
        // Structure is SubchainID => {LAST_SEEN,INDEX,HASH,SUPER_FINALIZATION_PROOF:{aggregatedPub,aggregatedSig,afkVoters}}

        let LAST_SEEN = GET_GMT_TIMESTAMP()

        for(let pubKey of tempObject.CHECKPOINT_MANAGER.keys()){

            let {INDEX,HASH}=tempObject.CHECKPOINT_MANAGER.get(pubKey)

            let baseBlockID = pubKey+":"+INDEX

            let SUPER_FINALIZATION_PROOF = await USE_TEMPORARY_DB('get',tempObject.DATABASE,'SFP:'+baseBlockID).catch(_=>false)
            
        
            //Store to mapping
            tempObject.HEALTH_MONITORING.set(pubKey,{LAST_SEEN,INDEX,HASH,SUPER_FINALIZATION_PROOF})

        }

        setTimeout(SUBCHAINS_HEALTH_MONITORING,global.CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return

    }



    // If you're not in quorum or checkpoint is outdated - don't start health monitoring
    if(!global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.includes(global.CONFIG.SYMBIOTE.PUB) || proofsRequests.has('NEXT_CHECKPOINT') || !isCheckpointStillFresh){

        setTimeout(SUBCHAINS_HEALTH_MONITORING,global.CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return

    }



    // Get the appropriate pubkey & url to check and validate the answer
    let poolsURLsAndPubKeys = await GET_POOLS_URLS(true)

    let proofsPromises = []

    let candidatesForAnotherCheck = []


    
    for(let handler of poolsURLsAndPubKeys){
        
        let metadataOfCurrentPool = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA[handler.pubKey]

        /*
        
        We should monitor the health only for:

        [0] Pools that are not in SKIP_HANDLERS
        [1] Reserve pools that are currently work for main pool

        */

        let poolIsInSkipHandlers = skipHandlers.has(handler.pubKey)

        let poolIsInReassignment = metadataOfCurrentPool.IS_RESERVE && typeof reassignments.get(handler.pubKey) === 'string'

        let poolIsMain = !metadataOfCurrentPool.IS_RESERVE


        if(!poolIsInSkipHandlers && (poolIsMain || poolIsInReassignment)){

            let responsePromise = fetch(handler.url+'/health').then(r=>r.json()).then(response=>{

                response.pubKey = handler.pubKey
    
                return response
    
            }).catch(_=>{candidatesForAnotherCheck.push(handler.pubKey)})
    
            proofsPromises.push(responsePromise)
    
        }


    }

    //Run promises
    let healthCheckPingbacks = (await Promise.all(proofsPromises)).filter(Boolean)


    /*
    
        Each object in healthCheckPingbacks array has the following structure
        
        {
        
            latestFullyFinalizedHeight, // height of block that we already finalized. Also, below you can see the SUPER_FINALIZATION_PROOF. We need it as a quick proof that majority have voted for this segment of subchain
            
            latestHash:<>,

            pubKey,

            superFinalizationProof:{
            
                aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+QT.CHECKPOINT.HEADER.ID
                aggregatedPub:<>,
                afkVoters
        
            }
      
        }
    
    */



    for(let answer of healthCheckPingbacks){


        if(typeof answer !== 'object' || typeof answer.superFinalizationProof !== 'object'){

            candidatesForAnotherCheck.push(answer.pubKey)

            continue
        }

        let {aggregatedPub,aggregatedSignature,afkVoters} = answer.superFinalizationProof

        let {latestFullyFinalizedHeight,latestHash,pubKey} = answer


        // Received {LAST_SEEN,INDEX,HASH,SUPER_FINALIZATION_PROOF}
        let localHealthHandler = tempObject.HEALTH_MONITORING.get(pubKey)

        // blockID+hash+'FINALIZATION'+checkpointFullID
        let data = pubKey+':'+latestFullyFinalizedHeight+latestHash+'FINALIZATION'+checkpointFullID

        let superFinalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,qtRootPub,data,aggregatedSignature,reverseThreshold).catch(_=>false)

        //If signature is ok and index is bigger than we have - update the LAST_SEEN time and set new height/hash/superFinalizationProof

        if(superFinalizationProofIsOk && localHealthHandler.INDEX < latestFullyFinalizedHeight){

            localHealthHandler.LAST_SEEN = GET_GMT_TIMESTAMP()

            localHealthHandler.INDEX = latestFullyFinalizedHeight

            localHealthHandler.HASH = latestHash

            localHealthHandler.SUPER_FINALIZATION_PROOF = {aggregatedPub,aggregatedSignature,afkVoters}

        }else candidatesForAnotherCheck.push(pubKey)
        
    }

    //______ ON THIS STEP - in <candidatesForAnotherCheck> we have subchains that required to be asked via other quorum members and probably start a skip procedure _______


    let currentTime = GET_GMT_TIMESTAMP()

    let afkLimit = global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.SUBCHAIN_AFK_LIMIT


    
    for(let candidate of candidatesForAnotherCheck){

        let localHealthHandler = tempObject.HEALTH_MONITORING.get(candidate) // {LAST_SEEN,SUPER_FINALIZATION_PROOF}

        if(currentTime-localHealthHandler.LAST_SEEN >= afkLimit){

            let updateWasFound = false
            
            //_____________________ Now, go through the quorum members and try to get updates from them_____________________

            for(let validatorHandler of poolsURLSandPubKeys){

                let sfpOfPoolXFromAnotherQuorumMember = await fetch(validatorHandler.url+'/get_health_of_another_pool/'+candidate).then(r=>r.json()).catch(_=>false)

                if(sfpOfPoolXFromAnotherQuorumMember){

                    // Verify and if ok - break the cycle

                    let {INDEX,HASH,SUPER_FINALIZATION_PROOF} = sfpOfPoolXFromAnotherQuorumMember

                    if(SUPER_FINALIZATION_PROOF){

                        let {aggregatedPub,aggregatedSignature,afkVoters} = SUPER_FINALIZATION_PROOF

                        // blockID+hash+'FINALIZATION'+quorumThreadCheckpointFullID
                        let data = candidate+':'+INDEX+HASH+'FINALIZATION'+checkpointFullID
    
                        let superFinalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,qtRootPub,data,aggregatedSignature,reverseThreshold).catch(_=>false)
    
                        //If signature is ok and index is bigger than we have - update the LAST_SEEN time and set new superFinalizationProof
    
                        if(superFinalizationProofIsOk && localHealthHandler.INDEX < INDEX){
    
                            localHealthHandler.LAST_SEEN = currentTime

                            localHealthHandler.INDEX = INDEX

                            localHealthHandler.HASH = HASH
    
                            localHealthHandler.SUPER_FINALIZATION_PROOF = {aggregatedPub,aggregatedSignature,afkVoters}
    
                            updateWasFound = true

                            break // No more sense to find updates

                        }
                    
                    }

                }

            }


            if(!updateWasFound){

                // If no updates - add the request to create SKIP_HANDLER via a sync and secured way

                proofsRequests.set('CREATE_SKIP_HANDLER:'+candidate,candidate)
                
            }

        }

    }


    setTimeout(SUBCHAINS_HEALTH_MONITORING,global.CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)


},




RESTORE_STATE=async()=>{

    
    let poolsMetadata = Object.keys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA)

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)
    


    for(let poolPubKey of poolsMetadata){

        // If this value is related to the current checkpoint - set to manager, otherwise - take from the POOLS_METADATA as a start point
        // Returned value is {INDEX,HASH,(?)FINALIZATION_PROOF}

        let {INDEX,HASH,FINALIZATION_PROOF} = await tempObject.DATABASE.get(poolPubKey).catch(_=>false) || global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA[poolPubKey]

        
        tempObject.CHECKPOINT_MANAGER.set(poolPubKey,{INDEX,HASH,FINALIZATION_PROOF})
        
        tempObject.CHECKPOINT_MANAGER_SYNC_HELPER.set(poolPubKey,{INDEX,HASH,FINALIZATION_PROOF})


        //______________________________ Try to find SKIP_HANDLER for subchain ______________________________

        let skipHandler = await tempObject.DATABASE.get('SKIP_HANDLER:'+poolPubKey).catch(_=>false) // {FINALIZATION_PROOF,AGGREGATGED_SKIP_PROOF}

        if(skipHandler) tempObject.SKIP_HANDLERS.set(poolPubKey,skipHandler)



        let skipOperationRelatedToThisPool = await tempObject.DATABASE.get('SKIP_SPECIAL_OPERATION:'+poolPubKey).catch(_=>false)

        if(skipOperationRelatedToThisPool){

            //Store to mempool of special operations
            
            tempObject.SPECIAL_OPERATIONS_MEMPOOL.set(skipOperationRelatedToThisPool.id,skipOperationRelatedToThisPool)

        }

        //____________________________ Check for reassignments ____________________________

        if(!poolsMetadata.IS_RESERVE){

            let reassignmentMetadata = await tempObject.DATABASE.get('REASSIGN:'+poolPubKey).catch(_=>false) // {CURRENT_RESERVE_POOL:<pointer to current reserve pool in (QT/VT).CHECKPOINT.REASSIGNMENT_CHAINS[<mainPool>]>}

            if(reassignmentMetadata){

                tempObject.REASSIGNMENTS.set(poolPubKey,reassignmentMetadata)

                // Using pointer - find the appropriate reserve pool

                let reservePool = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.REASSIGNMENT_CHAINS[poolPubKey][reassignmentMetadata.CURRENT_RESERVE_POOL]

                tempObject.REASSIGNMENTS.set(reservePool,poolPubKey)                


            }

        }

    }

    // Finally, once we've started the "next checkpoint generation" process - restore it

    let itsTimeForTheNextCheckpoint = await tempObject.DATABASE.get('NEXT_CHECKPOINT').catch(_=>false)

    if(itsTimeForTheNextCheckpoint) {

        tempObject.PROOFS_REQUESTS.set('NEXT_CHECKPOINT',true)

        tempObject.PROOFS_RESPONSES.set('READY_FOR_CHECKPOINT',true)

    }


}




//________________________________________________________________EXTERNAL_______________________________________________________________________




export let GENERATE_BLOCKS_PORTION = async() => {


    //Safe "if" branch to prevent unnecessary blocks generation
    if(!global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA[global.CONFIG.SYMBIOTE.PUB]) return

    // If we are reserve - return
    if(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA[global.CONFIG.SYMBIOTE.PUB]?.IS_RESERVE) return


    let myVerificationThreadStats = global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[global.CONFIG.SYMBIOTE.PUB]



    //!Here check the difference between VT and GT(VT_GT_NORMAL_DIFFERENCE)
    //Set VT_GT_NORMAL_DIFFERENCE to 0 if you don't need any limits

    if(global.CONFIG.SYMBIOTE.VT_GT_NORMAL_DIFFERENCE && myVerificationThreadStats.INDEX+global.CONFIG.SYMBIOTE.VT_GT_NORMAL_DIFFERENCE < global.SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX){

        LOG(`Block generation skipped because GT is faster than VT. Increase \u001b[38;5;157m<VT_GT_NORMAL_DIFFERENCE>\x1b[36;1m if you need`,'I',global.CONFIG.SYMBIOTE.SYMBIOTE_ID)

        return

    }
    
    
    /*

    _________________________________________GENERATE PORTION OF BLOCKS___________________________________________
    
    Here we check how many transactions(events) we have locally and generate as many blocks as it's possible
    
    */


    let numberOfBlocksToGenerate=Math.ceil(global.SYMBIOTE_META.MEMPOOL.length/global.CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.TXS_LIMIT_PER_BLOCK)

    //DEBUG
    numberOfBlocksToGenerate++

    //If nothing to generate-then no sense to generate block,so return
    if(numberOfBlocksToGenerate===0) return 


    LOG(`Number of blocks to generate \x1b[32;1m${numberOfBlocksToGenerate}`,'I')

    let atomicBatch = global.SYMBIOTE_META.BLOCKS.batch()

    for(let i=0;i<numberOfBlocksToGenerate;i++){


        let blockCandidate=new Block(GET_TRANSACTIONS(),GET_TRANSACTIONS_FOR_REASSIGNED_SUBCHAINS())
                        
        let hash=Block.genHash(blockCandidate)
    

        blockCandidate.sig=await BLS_SIGN_DATA(hash)
            
        BLOCKLOG(`New block generated`,hash,blockCandidate)


        global.SYMBIOTE_META.GENERATION_THREAD.PREV_HASH=hash
 
        global.SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX++
    
        let blockID=global.CONFIG.SYMBIOTE.PUB+':'+blockCandidate.index

        //Store block locally
        atomicBatch.put(blockID,blockCandidate)
           
    }

    //Update the GENERATION_THREAD after all
    atomicBatch.put('GT',global.SYMBIOTE_META.GENERATION_THREAD)

    await atomicBatch.write()

},




LOAD_GENESIS=async()=>{


    let atomicBatch = global.SYMBIOTE_META.STATE.batch(),

        quorumThreadAtomicBatch = global.SYMBIOTE_META.QUORUM_THREAD_METADATA.batch(),
    
        checkpointTimestamp,

        startPool = ''




    //__________________________________ Load all the configs __________________________________

    
    let filesOfGenesis = fs.readdirSync(process.env.GENESIS_PATH)


    for(let filePath of filesOfGenesis){

        let genesis=JSON.parse(fs.readFileSync(process.env.GENESIS_PATH+`/${filePath}`))

        
        checkpointTimestamp=genesis.CHECKPOINT_TIMESTAMP

        let authorities = new Set(Object.keys(genesis.POOLS))


        for(let [poolPubKey,poolContractStorage] of Object.entries(genesis.POOLS)){

            let {isReserve} = poolContractStorage

            startPool=poolPubKey

            //Add metadata related to this pool
            global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[poolPubKey]={
                
                INDEX:-1,
                
                HASH:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
                
                IS_STOPPED:false,

                IS_RESERVE:isReserve
            
            }

            //Create the appropriate storage for pre-set pools. We'll create the simplest variant - but pools will have ability to change it via txs during the chain work
            
            let contractMetadataTemplate = {
    
                type:"contract",
                lang:'spec/stakingPool',
                balance:0,
                uno:0,
                storages:['POOL'],
                bytecode:''
    
            }
            
            let idToAdd = poolPubKey+poolPubKey

            if(isReserve){

                idToAdd = poolContractStorage.reserveFor+poolPubKey

            }

            //Put metadata
            atomicBatch.put(BLAKE3(idToAdd+'(POOL)'),contractMetadataTemplate)
    
            //Put storage
            //NOTE: We just need a simple storage with ID="POOL"
            atomicBatch.put(BLAKE3(idToAdd+'(POOL)_STORAGE_POOL'),poolContractStorage)

            // Put the pointer to know the subchain which store the pool's data(metadata+storages)
            
            if(isReserve) atomicBatch.put(poolPubKey+'(POOL)_POINTER',poolContractStorage.reserveFor)
            
            else atomicBatch.put(poolPubKey+'(POOL)_POINTER',poolPubKey)


            // Add the account for fees for each authority
            authorities.forEach(anotherValidatorPubKey=>{

                if(anotherValidatorPubKey!==poolPubKey){

                    atomicBatch.put(BLAKE3(poolPubKey+anotherValidatorPubKey+'_FEES'),{reward:0})

                }

            })


            let templateForQt = {

                totalPower:poolContractStorage.totalPower,
                lackOfTotalPower:false,
                stopCheckpointID:-1,
                storedMetadata:{},
                isReserve
            
            }

            
            if(isReserve) templateForQt.reserveFor = poolContractStorage.reserveFor

            else global.SYMBIOTE_META.VERIFICATION_THREAD.RID_TRACKER[poolPubKey]=0


            quorumThreadAtomicBatch.put(poolPubKey+'(POOL)_STORAGE_POOL',templateForQt)

            //________________________ Fill the state of KLY-EVM ________________________
    
            if(!isReserve){

                let evmStateForThisSubchain = genesis.EVM[poolPubKey]

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
                        atomicBatch.put('SUB:'+caseIgnoreAccountAddress,poolPubKey)
        
                    }
    
                }    

            }
    
        }


        //_______________________ Now add the data to state _______________________
    
        // * Each account / contract must have <subchain> property to assign it to appropriate shard(subchain)

        Object.keys(genesis.STATE).forEach(
        
            addressOrContractID => {

                if(genesis.STATE[addressOrContractID].type==='contract'){

                    let {lang,balance,uno,storages,bytecode,subchain} = genesis.STATE[addressOrContractID]

                    let contractMeta = {

                        type:"contract",
                        lang,
                        balance,
                        uno,
                        storages,
                        bytecode
                    
                    } 

                    //Write metadata first
                    atomicBatch.put(BLAKE3(subchain+addressOrContractID),contractMeta)

                    //Finally - write genesis storage of contract sharded by contractID_STORAGE_ID => {}(object)
                    for(let storageID of genesis.STATE[addressOrContractID].storages){

                        atomicBatch.put(BLAKE3(subchain+addressOrContractID+'_STORAGE_'+storageID),genesis.STATE[addressOrContractID][storageID])

                    }

                } else {

                    let subchainID = genesis.STATE[addressOrContractID].subchain

                    delete genesis.STATE[addressOrContractID].subchain

                    atomicBatch.put(BLAKE3(subchainID+addressOrContractID),genesis.STATE[addressOrContractID]) //else - it's default account

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
        global.SYMBIOTE_META.VERIFICATION_THREAD.VERSION=genesis.VERSION

        //We update this during the work on QUORUM_THREAD. But initially, QUORUM_THREAD has the same version as VT
        global.SYMBIOTE_META.QUORUM_THREAD.VERSION=genesis.VERSION

        //Also, set the WORKFLOW_OPTIONS that will be changed during the threads' work

        global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS={...global.CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS}

        global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS={...global.CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS}

    }

    
    await atomicBatch.write()

    await quorumThreadAtomicBatch.write()


    //Node starts to verify blocks from the first validator in genesis, so sequency matter
    
    global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER={
        
        SUBCHAIN:startPool,
        
        INDEX:-1,
        
        HASH:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        GRID:0
    
    }
    
    global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_METADATA = {

        STATE_ROOT:await KLY_EVM.getStateRoot(),

        NEXT_BLOCK_INDEX:Web3.utils.toHex(BigInt(0).toString()),

        PARENT_HASH:'0000000000000000000000000000000000000000000000000000000000000000',

        TIMESTAMP:Math.floor(checkpointTimestamp/1000)

    }

    global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT={

        HEADER:{

            ID:-1,

            PAYLOAD_HASH:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

            QUORUM_AGGREGATED_SIGNERS_PUBKEY:'',

            QUORUM_AGGREGATED_SIGNATURE:'',

            AFK_VOTERS:[]

        },
        
        PAYLOAD:{

            PREV_CHECKPOINT_PAYLOAD_HASH:'',

            POOLS_METADATA:JSON.parse(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA)),

            OPERATIONS:[],

            OTHER_SYMBIOTES:{}

        },

        TIMESTAMP:checkpointTimestamp,

        COMPLETED:true
    
    }


    //Make template, but anyway - we'll find checkpoints on hostchains
    global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT={

        HEADER:{

            ID:-1,

            PAYLOAD_HASH:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

            QUORUM_AGGREGATED_SIGNERS_PUBKEY:'',

            QUORUM_AGGREGATED_SIGNATURE:'',

            AFK_VOTERS:[]

        },
        
        PAYLOAD:{
            
            PREV_CHECKPOINT_PAYLOAD_HASH:'',

            POOLS_METADATA:JSON.parse(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA)),

            OPERATIONS:[],

            OTHER_SYMBIOTES:{}

        },

        TIMESTAMP:checkpointTimestamp,
        
        COMPLETED:true
    
    }


    // Set the rubicon to stop tracking spent txs from WAITING_ROOMs of pools' contracts. Value means the checkpoint id lower edge
    // If your stake/unstake tx was below this line - it might be burned. However, the line is set by QUORUM, so it should be safe
    global.SYMBIOTE_META.VERIFICATION_THREAD.RUBICON=-1
    
    global.SYMBIOTE_META.QUORUM_THREAD.RUBICON=-1


    //We get the quorum for VERIFICATION_THREAD based on own local copy of POOLS_METADATA state
    global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.QUORUM = GET_QUORUM(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA,global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS)

    //...However, quorum for QUORUM_THREAD might be retrieved from POOLS_METADATA of checkpoints. It's because both threads are async
    global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM = GET_QUORUM(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS)


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

        TEMP:new Map() // checkpointID => {COMMITMENTS,FINALIZATION_PROOFS,CHECKPOINT_MANAGER,SYNC_HELPER,PROOFS,HEALTH_MONITORING,SKIP,DATABASE,SPECIAL_OPERATIONS_MEMPOOL}

    
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
    
        'BLOCKS', //For blocks. BlockID => block
        
        'HOSTCHAIN_DATA', //To store metadata from hostchains(proofs,refs,contract results and so on)
    
        'STUFF', //Some data like combinations of pools for aggregated BLS pubkey, endpoint <-> pubkey bindings and so on. Available stuff URL_PUBKEY_BIND | VALIDATORS_PUBKEY_COMBINATIONS | BLOCK_HASHES | .etc

        'STATE', //Contains state of accounts, contracts, services, metadata and so on. The main database like NTDS.dit

        'CHECKPOINTS', //Contains object like CHECKPOINT_ID => {HEADER,PAYLOAD}

        'QUORUM_THREAD_METADATA', //QUORUM_THREAD itself and other stuff

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
            PREV_HASH:`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`,//Genesis hash
            NEXT_INDEX:0//So the first block will be with index 0
        }
        :
        (LOG(`Some problem with loading metadata of generation thread\nError:${error}`,'F'),process.exit(106))
                        
    )


    //Load from db or return empty object
    global.SYMBIOTE_META.QUORUM_THREAD = await global.SYMBIOTE_META.QUORUM_THREAD_METADATA.get('QT').catch(_=>({}))
        

    let nextIsPresent = await global.SYMBIOTE_META.BLOCKS.get(global.CONFIG.SYMBIOTE.PUB+":"+global.SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX).catch(_=>false),//OK is in case of absence of next block

        previousBlock=await global.SYMBIOTE_META.BLOCKS.get(global.CONFIG.SYMBIOTE.PUB+":"+(global.SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX-1)).catch(_=>false)//but current block should present at least locally


    if(nextIsPresent || !(global.SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX===0 || global.SYMBIOTE_META.GENERATION_THREAD.PREV_HASH === BLAKE3( global.CONFIG.SYMBIOTE.PUB + JSON.stringify(previousBlock.time) + JSON.stringify(previousBlock.transactions) + global.CONFIG.SYMBIOTE.SYMBIOTE_ID + previousBlock.index + previousBlock.prevHash))){
        
        initSpinner?.stop()

        LOG(`Something wrong with a sequence of generation thread on`,'F')
            
        process.exit(107)

    }

    


    //________________Load metadata about symbiote-current hight,collaped height,height for export,etc.___________________




    global.SYMBIOTE_META.VERIFICATION_THREAD = await global.SYMBIOTE_META.STATE.get('VT').catch(error=>{

        if(error.notFound){

            //Default initial value
            return {
            
                FINALIZED_POINTER:{SUBCHAIN:'',INDEX:-1,HASH:'',GRID:0}, // pointer to know where we should start to process further blocks

                POOLS_METADATA:{}, // PUBKEY => {INDEX:'',HASH:'',IS_STOPPED:boolean}
 
                KLY_EVM_METADATA:{}, // {STATE_ROOT,NEXT_BLOCK_INDEX,PARENT_HASH,TIMESTAMP}

                RID_TRACKER:{}, // SUBCHAIN => INDEX

                REASSIGNMENTS:{}, // STOPPED_POOL_ID => [<ASSIGNED_POOL_0,<ASSIGNED_POOL_1,...<ASSIGNED_POOL_N>]

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


    let {STATE_ROOT,NEXT_BLOCK_INDEX,PARENT_HASH,TIMESTAMP} = global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_METADATA


    await KLY_EVM.setStateRoot(STATE_ROOT)

    // Set the block parameters

    KLY_EVM.setCurrentBlockParams(BigInt(NEXT_BLOCK_INDEX),TIMESTAMP,PARENT_HASH)

    global.CURRENT_SUBCHAIN_EVM_CONTEXT = global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.SUBCHAIN
    



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

    global.SYMBIOTE_META.STUFF_CACHE=new AdvancedCache(global.CONFIG.SYMBIOTE.STUFF_CACHE_SIZE,global.SYMBIOTE_META.STUFF)


    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID


    //Because if we don't have quorum, we'll get it later after discovering checkpoints

    global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('VT_ROOTPUB',bls.aggregatePublicKeys(global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.QUORUM))

    global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('QT_ROOTPUB'+checkpointFullID,bls.aggregatePublicKeys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM))


    //_________________________________Add the temporary data of current QT__________________________________________
    
    let quorumTemporaryDB = level(process.env.CHAINDATA_PATH+`/${checkpointFullID}`,{valueEncoding:'json'})

    global.SYMBIOTE_META.TEMP.set(checkpointFullID,{

        SPECIAL_OPERATIONS_MEMPOOL:new Map(), // to hold operations which should be included to checkpoints

        COMMITMENTS:new Map(), // the first level of "proofs". Commitments is just signatures by some validator from current quorum that validator accept some block X by ValidatorY with hash H

        FINALIZATION_PROOFS:new Map(), // aggregated proofs which proof that some validator has 2/3N+1 commitments for block PubX:Y with hash H. Key is blockID and value is FINALIZATION_PROOF object

    
        CHECKPOINT_MANAGER:new Map(), // mapping( validatorID => {INDEX,HASH} ). Used to start voting for checkpoints. Each pair is a special handler where key is a pubkey of appropriate validator and value is the ( index <=> id ) which will be in checkpoint
    
        CHECKPOINT_MANAGER_SYNC_HELPER:new Map(), // map(subchainID=>Set({INDEX,HASH,FINALIZATION_PROOF})) here will be added propositions to update the finalization proof for subchain which will be checked in sync mode

        PROOFS_REQUESTS:new Map(), // mapping(blockID=>FINALIZATION_PROOF_REQUEST)

        PROOFS_RESPONSES:new Map(), // mapping(blockID=>FINALIZATION_PROOF)


        HEALTH_MONITORING:new Map(), // used to perform SKIP procedure when we need it and to track changes on subchains. SubchainID => {LAST_SEEN,HEIGHT,HASH,SUPER_FINALIZATION_PROOF:{aggregatedPub,aggregatedSig,afkVoters}}

        SKIP_HANDLERS:new Map(), // {EXTENDED_FINALIZATION_PROOF,AGGREGATGED_SKIP_PROOF}

        REASSIGNMENTS:new Map(), // {CURRENT_RESERVE_POOL:<number>}

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
                
    ).then(answer=>answer!=='YES'&& process.exit(108))

},




/*

    Function to get approvements from other validators to make your validator instance active again

*/
START_AWAKENING_PROCEDURE=async()=>{
    

    let quorumMembersURLs = await GET_POOLS_URLS()

    let {INDEX,HASH} = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA[global.CONFIG.SYMBIOTE.PUB]

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let myPayload = {
    
        stop:false,
        subchain:global.CONFIG.SYMBIOTE.PUB,
        index:INDEX,
        hash:HASH,
        sig:await BLS_SIGN_DATA(false+global.CONFIG.SYMBIOTE.PUB+INDEX+HASH+checkpointFullID)
    
    }

    let sendOptions = {

        method: 'POST',
        body: JSON.stringify(myPayload)

    }

    let promises = [], numberOfOkStatus = 0

    for(let url of quorumMembersURLs){

        let promise = fetch(url+'/special_operations',sendOptions).then(r=>r.text()).then(resp=>resp==='OK' && numberOfOkStatus++).catch(_=>{})

        promises.push(promise)

    }

    let majority = GET_MAJORITY('QUORUM_THREAD')

    if(numberOfOkStatus >= majority){

        LOG('Ok, majority received your \u001b[38;5;60m<AWAKE_MESSAGE>\x1b[32;1m, so soon your \x1b[31;1msubchain\x1b[32;1m will be activated','S')

    }else LOG(`Some error occured with sending \u001b[38;5;50m<AWAKE_MESSAGE>\u001b[38;5;3m - probably, less than majority agree with it`,'W')

},




RUN_SYMBIOTE=async()=>{

    await PREPARE_SYMBIOTE()

    if(!global.CONFIG.SYMBIOTE.STOP_WORK){

        //_________________________ RUN SEVERAL ASYNC THREADS _________________________

        //0.Start verification process - process blocks and find new checkpoints step-by-step
        START_VERIFICATION_THREAD()

        //1.Also, QUORUM_THREAD starts async, so we have own version of CHECKPOINT here. Process checkpoint-by-checkpoint to find out the latest one and join to current QUORUM(if you were choosen)
        START_QUORUM_THREAD_CHECKPOINT_TRACKER()

        //2.Share our blocks within quorum members and get the commitments / finalization proofs 
        SEND_BLOCKS_AND_GRAB_COMMITMENTS()

        //3.Track the hostchain and check if there are "NEXT-DAY" blocks so it's time to stop sharing commitments / finalization proofs and start propose checkpoints
        CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT()

        //4.Start checking the health of all the subchains
        SUBCHAINS_HEALTH_MONITORING()

        //5.Iterate over SKIP_HANDLERS to get AGGREGATED_SKIP_PROOFs and approvements to move to the next reserve pools
        SKIP_PROCEDURE_MONITORING()

        //6.Run function to work with finalization stuff and avoid async problems
        PROOFS_SYNCHRONIZER()

        let promises=[]

        //Check if bootstrap nodes is alive
        global.CONFIG.SYMBIOTE.BOOTSTRAP_NODES.forEach(endpoint=>

            promises.push(
                        
                fetch(endpoint+'/addpeer',{method:'POST',body:JSON.stringify([global.CONFIG.SYMBIOTE.SYMBIOTE_ID,global.CONFIG.SYMBIOTE.MY_HOSTNAME])})
            
                    .then(res=>res.text())
            
                    .then(val=>LOG(val==='OK'?`Received pingback from \x1b[32;1m${endpoint}\x1b[36;1m. Node is \x1b[32;1malive`:`\x1b[36;1mAnswer from bootstrap \x1b[32;1m${endpoint}\x1b[36;1m => \x1b[34;1m${val}`,'I'))
            
                    .catch(error=>LOG(`Bootstrap node \x1b[32;1m${endpoint}\x1b[31;1m send no response or some error occured \n${error}`,'F'))
                        
            )

        )

        await Promise.all(promises.splice(0))


        //______________________________________________________RUN BLOCKS GENERATION PROCESS____________________________________________________________


        //Start generate blocks
        !global.CONFIG.SYMBIOTE.STOP_GENERATE_BLOCKS && setTimeout(()=>{
                
            global.STOP_GEN_BLOCKS_CLEAR_HANDLER=false

                
            BLOCKS_GENERATION_POLLING()
            
        },global.CONFIG.SYMBIOTE.BLOCK_GENERATION_INIT_DELAY)


    }

}