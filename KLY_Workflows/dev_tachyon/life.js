import {CHECK_IF_ALL_ASP_PRESENT,GET_BLOCK,START_VERIFICATION_THREAD,VERIFY_AGGREGATED_FINALIZATION_PROOF} from './verification.js'

import {
    
    GET_POOLS_URLS,GET_MAJORITY,BROADCAST,CHECK_IF_THE_SAME_DAY,USE_TEMPORARY_DB,

    GET_QUORUM,GET_FROM_STATE_FOR_QUORUM_THREAD,IS_MY_VERSION_OLD,

    DECRYPT_KEYS,BLOCKLOG,BLS_SIGN_DATA,HEAP_SORT,

} from './utils.js'

import {LOG,PATH_RESOLVE,BLAKE3,GET_GMT_TIMESTAMP} from '../../KLY_Utils/utils.js'

import AdvancedCache from '../../KLY_Utils/structures/advancedcache.js'

import SYSTEM_OPERATIONS_VERIFIERS from './systemOperationsVerifiers.js'

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









//________________________________________________________________INTERNAL_______________________________________________________________________


//TODO:Add more advanced logic(e.g. number of txs,ratings,etc.)
let GET_TRANSACTIONS = () => global.SYMBIOTE_META.MEMPOOL.splice(0,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.TXS_LIMIT_PER_BLOCK),


GET_SYSTEM_SYNC_OPERATIONS = checkpointFullID => {

    if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)) return []

    let specialOperationsMempool = global.SYMBIOTE_META.TEMP.get(checkpointFullID).SYSTEM_SYNC_OPERATIONS_MEMPOOL

    return specialOperationsMempool.splice(0,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.SYSTEM_SYNC_OPERATIONS_LIMIT_PER_BLOCK)

},




BLOCKS_GENERATION_POLLING=async()=>{

    if(!global.SYSTEM_SIGNAL_ACCEPTED){

        await GENERATE_BLOCKS_PORTION()    

        STOP_GEN_BLOCKS_CLEAR_HANDLER = setTimeout(BLOCKS_GENERATION_POLLING,global.CONFIG.SYMBIOTE.BLOCK_TIME)
        
        global.CONFIG.SYMBIOTE.STOP_WORK_ON_GENERATION_THREAD
        &&
        clearTimeout(STOP_GEN_BLOCKS_CLEAR_HANDLER)

    }else LOG(`Block generation was stopped`,'I')
    
},




SET_REASSIGNMENT_CHAINS = async checkpoint => {


    checkpoint.reassignmentChains={}


    //__________________Based on POOLS_METADATA get the reassignments to instantly get the commitments / finalization proofs__________________


    let reservePoolsRelatedToSubchainAndStillNotUsed = new Map() // subchainID => [] - array of reserve pools

    let primePoolsPubKeys = new Set()


    for(let [poolPubKey,poolMetadata] of Object.entries(checkpoint.payload.poolsMetadata)){

        if(!poolMetadata.isReserve){

            // Find prime(not reserve) pools
            
            primePoolsPubKeys.add(poolPubKey)

            // Create the empty array for prime pool

            reservePoolsRelatedToSubchainAndStillNotUsed.set(poolPubKey,[])

        }
        else{

            // Otherwise - it's reserve pool
                    
            let poolStorage = await GET_FROM_STATE_FOR_QUORUM_THREAD(poolPubKey+`(POOL)_STORAGE_POOL`)

            if(poolStorage){

                let {reserveFor} = poolStorage

                if(!reservePoolsRelatedToSubchainAndStillNotUsed.has(reserveFor)) reservePoolsRelatedToSubchainAndStillNotUsed.set(reserveFor,[])

                reservePoolsRelatedToSubchainAndStillNotUsed.get(reserveFor).push(poolPubKey)
                    
            }

        }

    }


    /*
    
        After this cycle we have:

        [0] primePoolsIDs - Set(primePool0,primePool1,...)
        [1] reservePoolsRelatedToSubchainAndStillNotUsed - Map(primePoolPubKey=>[reservePool1,reservePool2,...reservePoolN])

    
    */

    let hashOfMetadataFromOldCheckpoint = BLAKE3(JSON.stringify(checkpoint.payload.poolsMetadata))

    
    //___________________________________________________ Now, build the reassignment chains ___________________________________________________
    
    for(let primePoolID of primePoolsPubKeys){


        let arrayOfReservePoolsRelatedToThisSubchain = reservePoolsRelatedToSubchainAndStillNotUsed.get(primePoolID)

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
    
},




DELETE_POOLS_WHICH_HAVE_LACK_OF_STAKING_POWER = async (validatorPubKey,fullCopyOfQuorumThreadWithNewCheckpoint) => {

    //Try to get storage "POOL" of appropriate pool

    let poolStorage = await GET_FROM_STATE_FOR_QUORUM_THREAD(validatorPubKey+'(POOL)_STORAGE_POOL')


    poolStorage.lackOfTotalPower=true

    poolStorage.stopCheckpointID=fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.header.id
    
    poolStorage.storedMetadata=fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.payload.poolsMetadata[validatorPubKey]


    //Remove from POOLS array(to prevent be elected to quorum) and metadata

    delete fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.payload.poolsMetadata[validatorPubKey]

},




EXECUTE_SYSTEM_SYNC_OPERATIONS_IN_NEW_CHECKPOINT = async (atomicBatch,fullCopyOfQuorumThreadWithNewCheckpoint) => {

    
    //_______________________________Perform SPEC_OPERATIONS_____________________________

    let workflowOptionsTemplate = {...fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS}
    
    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set('WORKFLOW_OPTIONS',workflowOptionsTemplate)
    
    // Structure is <poolID> => true if pool should be deleted
    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set('SLASH_OBJECT',{})
    

    //But, initially, we should execute the SLASH_UNSTAKE operations because we need to prevent withdraw of stakes by rogue pool(s)/stakers
    for(let operation of fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.payload.operations){
     
        if(operation.type==='SLASH_UNSTAKE') await SYSTEM_OPERATIONS_VERIFIERS.SLASH_UNSTAKE(operation.payload,false,true)
    
    }

    //Here we have the filled(or empty) array of pools and delayed IDs to delete it from state

    for(let operation of fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.payload.operations){
        
        if(operation.type==='SLASH_UNSTAKE') continue
          /*
            
            Perform changes here before move to the next checkpoint
            
            OPERATION in checkpoint has the following structure
            {
                type:<TYPE> - type from './systemOperationsVerifiers.js' to perform this operation
                payload:<PAYLOAD> - operation body. More detailed about structure & verification process here => ./systemOperationsVerifiers.js
            }
            
        */
        await SYSTEM_OPERATIONS_VERIFIERS[operation.type](operation.payload,false,true,fullCopyOfQuorumThreadWithNewCheckpoint)
    
    }

    //_______________________Remove pools if lack of staking power_______________________

    let toRemovePools = [], promises = [], quorumThreadPools = Object.keys(fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.payload.poolsMetadata)


    for(let validator of quorumThreadPools){

        let promise = GET_FROM_STATE_FOR_QUORUM_THREAD(validator+'(POOL)_STORAGE_POOL').then(poolStorage=>{

            if(poolStorage.totalPower < fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS.VALIDATOR_STAKE) toRemovePools.push(validator)

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
        delete fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.payload.poolsMetadata[poolIdentifier]
    
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

    console.log('DEBUG: Calling <GET_VALID_CHECKPOINT>')

    // Temporary stub
    return false

}




//Use it to find checkpoints on hostchains, perform them and join to QUORUM by finding the latest valid checkpoint
let START_QUORUM_THREAD_CHECKPOINT_TRACKER=async()=>{


    //_________________________FIND THE NEXT CHECKPOINT AND EXECUTE SYNC SYSTEM OPERATIONS INSTANTLY_____________________________

    
    let possibleCheckpoint = await GET_VALID_CHECKPOINT('QUORUM_THREAD').catch(_=>false)


    if(possibleCheckpoint){

        // We need it for changes
        let fullCopyOfQuorumThreadWithNewCheckpoint = JSON.parse(JSON.stringify(global.SYMBIOTE_META.QUORUM_THREAD))

        // Set the new checkpoint
        fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT = possibleCheckpoint

        // Store original checkpoint locally
        await global.SYMBIOTE_META.CHECKPOINTS.put(possibleCheckpoint.header.payloadHash,possibleCheckpoint)

        // All operations must be atomic
        let atomicBatch = global.SYMBIOTE_META.QUORUM_THREAD_METADATA.batch()

        // Get the FullID of old checkpoint
        let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id


        // Execute system sync operations from new checkpoint using our copy of QT and atomic handler
        await EXECUTE_SYSTEM_SYNC_OPERATIONS_IN_NEW_CHECKPOINT(atomicBatch,fullCopyOfQuorumThreadWithNewCheckpoint)


        // After execution - create the reassignment chains
        await SET_REASSIGNMENT_CHAINS(possibleCheckpoint)


        LOG(`\u001b[38;5;154mSystem sync operations were executed for checkpoint \u001b[38;5;93m${possibleCheckpoint.header.id} ### ${possibleCheckpoint.header.payloadHash} (QT)\u001b[0m`,'S')

        // Mark as completed
        fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.completed = true

        // Create new quorum based on new POOLS_METADATA state
        fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.quorum = GET_QUORUM(fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.payload.poolsMetadata,fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS)

        
        
        let nextQuorumThreadID = possibleCheckpoint.header.payloadHash+"#"+possibleCheckpoint.header.id
    
        // Create new temporary db for the next checkpoint
        let nextTempDB = level(process.env.CHAINDATA_PATH+`/${nextQuorumThreadID}`,{valueEncoding:'json'})


        let nextTempDBBatch = nextTempDB.batch()


        await nextTempDBBatch.write()

        // Commit changes
        atomicBatch.put('QT',fullCopyOfQuorumThreadWithNewCheckpoint)

        await atomicBatch.write()
    

        // Create mappings & set for the next checkpoint
        let nextTemporaryObject={

            COMMITMENTS:new Map(), 
            FINALIZATION_PROOFS:new Map(),

            CHECKPOINT_MANAGER:new Map(),
            CHECKPOINT_MANAGER_SYNC_HELPER:new Map(),

            SYSTEM_SYNC_OPERATIONS_MEMPOOL:[],
 
            SKIP_HANDLERS:new Map(), // {wasReassigned:boolean,extendedAggregatedCommitments,aggregatedSkipProof}

            PROOFS_REQUESTS:new Map(),
            PROOFS_RESPONSES:new Map(),
    
            REASSIGNMENTS:new Map(),

            HEALTH_MONITORING:new Map(),
      
            DATABASE:nextTempDB
            
        }

        global.SYMBIOTE_META.QUORUM_THREAD = fullCopyOfQuorumThreadWithNewCheckpoint

        LOG(`QUORUM_THREAD was updated => \x1b[34;1m${global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id} ### ${global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash}`,'S')

        // Get the new ROOTPUB and delete the old one
        global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('QT_ROOTPUB'+nextQuorumThreadID,bls.aggregatePublicKeys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum))
    
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


        let checkpointIsFresh = CHECK_IF_THE_SAME_DAY(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.timestamp,GET_GMT_TIMESTAMP())

        let iAmInTheQuorum = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.includes(global.CONFIG.SYMBIOTE.PUB)

        let poolsMetadata = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata


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


        //Continue to find checkpoints
        setImmediate(START_QUORUM_THREAD_CHECKPOINT_TRACKER)


    }else{

        // Wait for the new checkpoint will appear on hostchain

        setTimeout(START_QUORUM_THREAD_CHECKPOINT_TRACKER,global.CONFIG.SYMBIOTE.POLLING_TIMEOUT_TO_FIND_CHECKPOINT_FOR_QUORUM_THREAD)    


    }


},




// Function for secured and a sequently update of CHECKPOINT_MANAGER and to prevent giving FINALIZATION_PROOFS when it's restricted. In general - function to avoid async problems
PROOFS_SYNCHRONIZER=async()=>{


    /* 
    
        [*] Here we update the values in DB and CHECKPOINT_MANAGER using values from CHECKPOINT_MANAGER_SYNC_HELPER
        
        [*] Also, take the finalization proof from PROOFS_REQUESTS, sign and push to PROOFS_RESPONSES

    */

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let currentCheckpointReassignmentChains = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.reassignmentChains // {primePool:[<reservePool1>,<reservePool2>,...,<reservePoolN>]}


    let currentTempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    if(!currentTempObject){

        //Repeat this procedure after a while
        setTimeout(PROOFS_SYNCHRONIZER,1000)

        return

    }

    let currentCheckpointsManager = currentTempObject.CHECKPOINT_MANAGER // mapping( poolPubKey => {index,hash,(?)aggregatedCommitments} )

    let currentCheckpointSyncHelper = currentTempObject.CHECKPOINT_MANAGER_SYNC_HELPER // mapping(poolPubKey => {index,hash,aggregatedCommitments:{aggregatedPub,aggregatedSigna,afkVoters}}})


    let currentFinalizationProofsRequests = currentTempObject.PROOFS_REQUESTS // mapping(blockID=>blockHash)

    let currentFinalizationProofsResponses = currentTempObject.PROOFS_RESPONSES // mapping(blockID=>SIG(blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+QT.CHECKPOINT.HEADER.ID))


    let currentSkipHandlersMapping = currentTempObject.SKIP_HANDLERS // poolPubKey => {wasReassigned:boolean,extendedAggregatedCommitments:{index,hash,aggregatedCommitments:{aggregatedPub,aggregatedSignature,afkVoters}},aggregatedSkipProof:{same as FP structure, but aggregatedSigna = `SKIP:{poolPubKey}:{index}:{hash}:{checkpointFullID}`}}
      
    let currentCheckpointDB = currentTempObject.DATABASE // LevelDB instance

    let reassignments = currentTempObject.REASSIGNMENTS


    //____________________ UPDATE THE CHECKPOINT_MANAGER ____________________


    for(let keyValue of currentCheckpointSyncHelper){

        let poolPubKey = keyValue[0]
        
        let handlerWithMaximumHeight = keyValue[1] // {index,hash,aggregatedCommitments}

        //Store to DB
        await USE_TEMPORARY_DB('put',currentCheckpointDB,poolPubKey,handlerWithMaximumHeight).then(()=>{

            // And only after db - update the finalization height for CHECKPOINT_MANAGER
            currentCheckpointsManager.set(poolPubKey,handlerWithMaximumHeight)

        }).catch(_=>{})

        // currentCheckpointSyncHelper.delete(poolPubKey)

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

                let primePoolPubKey = keyValue[1]

                let currentSubchainAuthority


                // Add the reassignment

                let reassignmentMetadata = reassignments.get(primePoolPubKey) // {currentReservePool:<number>} - pointer to current reserve pool in array (QT/VT).CHECKPOINT.reassignmentChains[<primePool>]


                if(!reassignmentMetadata){

                    // Create new handler

                    reassignmentMetadata = {currentReservePool:-1}

                    currentSubchainAuthority = primePoolPubKey

                }else currentSubchainAuthority = currentCheckpointReassignmentChains[primePoolPubKey][reassignmentMetadata.currentReservePool]


                let nextIndex = reassignmentMetadata.currentReservePool+1

                let nextReservePool = currentCheckpointReassignmentChains[primePoolPubKey][nextIndex] // array currentCheckpointReassignmentChains[primePoolID] might be empty if the prime pool doesn't have reserve pools


                // We need to mark wasReassigned pool that was authority for this subchain

                let skipHandlerOfAuthority = JSON.parse(JSON.stringify(currentSkipHandlersMapping.get(currentSubchainAuthority))) // {wasReassigned,extendedAggregatedCommitments,aggregatedSkipProof}

                skipHandlerOfAuthority.wasReassigned = true


                // Use atomic operation here to write reassignment data + updated skip handler

                let keysToAtomicWrite = [

                    'REASSIGN:'+primePoolPubKey,
                    
                    'SKIP_HANDLER:'+currentSubchainAuthority

                ]

                let valuesToAtomicWrite = [

                    {currentReservePool:nextIndex},

                    skipHandlerOfAuthority

                ]

                await USE_TEMPORARY_DB('atomicPut',currentCheckpointDB,keysToAtomicWrite,valuesToAtomicWrite).then(()=>{
    
                    // And only after successful store we can move to the next pool

                    // Delete the reassignment in case skipped authority was reserve pool

                    if(currentSubchainAuthority !== primePoolPubKey) reassignments.delete(currentSubchainAuthority)
                    
                    currentSkipHandlersMapping.get(currentSubchainAuthority).wasReassigned = true

                    
                    reassignmentMetadata.currentReservePool++
    

                    // Set new values - handler for prime pool and pointer to prime pool for reserve pool

                    reassignments.set(primePoolPubKey,reassignmentMetadata)

                    reassignments.set(nextReservePool,primePoolPubKey)

                    // Delete the request
                    currentFinalizationProofsRequests.delete(keyValue[0])


                }).catch(_=>false)


            }else if (keyValue[0].startsWith('CREATE_SKIP_HANDLER:')){

                let poolPubKey = keyValue[1]

                // This prevents creating FINALIZATION_PROOFS for pool and initiate the reassignment procedure

                let futureSkipHandler = {

                    wasReassigned:false, // will be true after we get the 2/3N+1 approvement of having <aggregatedSkipProof> from other quorum members

                    extendedAggregatedCommitments:JSON.parse(JSON.stringify(currentCheckpointSyncHelper.get(poolPubKey))), // {index,hash,aggregatedCommitments}

                    aggregatedSkipProof:null // for future - when we get the 2/3N+1 skip proofs from POST /get_skip_proof - aggregate and use to insert in blocks of reserve pool and so on

                }

                await USE_TEMPORARY_DB('put',currentCheckpointDB,'SKIP_HANDLER:'+poolPubKey,futureSkipHandler).then(()=>{

                    currentSkipHandlersMapping.set(poolPubKey,futureSkipHandler)

                    // Delete the request
                    currentFinalizationProofsRequests.delete(keyValue[0])
    

                }).catch(_=>false)


            }else{

                // Generate signature for finalization proofs

                let blockID = keyValue[0]
                
                let {hash,aggregatedCommitments} = keyValue[1]
    
                let [poolPubKey,index] = blockID.split(':')

                index=+index
    
                // We can't produce finalization proofs for pools that are stopped
                if(currentSkipHandlersMapping.has(poolPubKey)) continue

                //Update the CHECKPOINTS_MANAGER
                
                let poolState = currentCheckpointSyncHelper.get(poolPubKey)

                if(poolState && poolState.index<index){

                    poolState.index=index
                    
                    poolState.hash=hash
                    
                    poolState.aggregatedCommitments=aggregatedCommitments

                    currentCheckpointSyncHelper.set(poolPubKey,poolState)

                }


                // Put to responses
                currentFinalizationProofsResponses.set(blockID,await BLS_SIGN_DATA(blockID+hash+'FINALIZATION'+checkpointFullID))
    
                currentFinalizationProofsRequests.delete(blockID)

                // Delete the response for the previous block from responses
                // currentFinalizationProofsResponses.delete(poolPubKey+':'+(index-1))

            }

        }

    }


    //Repeat this procedure permanently, but in sync mode
    setImmediate(PROOFS_SYNCHRONIZER)

},




MAKE_CHECKPOINT = async checkpointHeader => {



},




// Once we've received 2/3N+1 signatures for checkpoint(HEADER,PAYLOAD) - we can start the next stage to get signatures to get another signature which will be valid for checkpoint
INITIATE_CHECKPOINT_STAGE_2_GRABBING=async(myCheckpoint,quorumMembersHandler)=>{

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let checkpointTemporaryDB = global.SYMBIOTE_META.TEMP.get(checkpointFullID).DATABASE

    if(!checkpointTemporaryDB) return


    myCheckpoint ||= await USE_TEMPORARY_DB('get',checkpointTemporaryDB,'CHECKPOINT').catch(_=>false)

    quorumMembersHandler ||= await GET_POOLS_URLS(true)

    
    //_____________________ Go through the quorum and share our pre-signed object with checkpoint payload and issuer proof____________________

    /*
    
        We should send the following object to the POST /checkpoint_stage_2

        {
            checkpointFinalizationProof:{

                aggregatedPub:<2/3N+1 from QUORUM>,
                aggregatedSigna:<SIG(PAYLOAD_HASH)>,
                afkVoters:[]

            }

            issuerProof:SIG(issuer+payloadHash)

            checkpointPayload:{

                issuer:<BLS pubkey of checkpoint grabbing initiator>
            
                prevCheckpointPayloadHash: global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash,
            
                poolsMetadata: {
                
                    '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {index,hash,isReserve}

                    /..other data
            
                },
        
                operations: GET_SPECIAL_OPERATIONS(),
                otherSymbiotes: {}
    
            }

        }
    
    */


    let everythingAtOnce={
            
        checkpointFinalizationProof:{

            aggregatedPub:myCheckpoint.header.quorumAggregatedSignersPubKey,
            aggregatedSignature:myCheckpoint.header.quorumAggregatedSignature,
            afkVoters:myCheckpoint.header.afkVoters

        },

        issuerProof:await BLS_SIGN_DATA(global.CONFIG.SYMBIOTE.PUB+myCheckpoint.header.payloadHash),

        checkpointPayload:myCheckpoint.payload

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

            let isSignaOk = await bls.singleVerify('STAGE_2'+myCheckpoint.header.payloadHash,pubKey,sig).catch(_=>false)

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

        myCheckpoint.header.quorumAggregatedSignersPubKey=bls.aggregatePublicKeys(pubKeys)

        myCheckpoint.header.quorumAggregatedSignature=bls.aggregateSignatures(signatures)

        myCheckpoint.header.afkVoters=global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.filter(pubKey=>!otherAgreements.has(pubKey))


        //Store time tracker to DB
        await USE_TEMPORARY_DB('put',checkpointTemporaryDB,'CHECKPOINT_TIME_TRACKER',GET_GMT_TIMESTAMP()).catch(_=>false)

        //Send the header to hostchain
        await MAKE_CHECKPOINT(myCheckpoint.header).catch(error=>LOG(`Some error occured during the process of checkpoint commit => ${error}`))

                 
    }

},




CAN_PROPOSE_CHECKPOINT=async()=>{

    console.log('DEBUG: Calling <CALL_PROPOSE_CHECKPOINT>')

    // Stub
    return false

},




CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT=async()=>{


    //__________________________ If we've runned the second stage - skip the code below __________________________

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

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
            
            prevCheckpointPayloadHash: global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash,
            
            poolsMetadata: {
                
                '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {index,hash,isReserve}

                /..other data
            
            },
            operations: GET_SPECIAL_OPERATIONS(),
            otherSymbiotes: {}
        
        }

        To sign it => SIG(BLAKE3(JSON.stringify(<PROPOSED>)))
    
    */


    let canProposeCheckpoint = await CAN_PROPOSE_CHECKPOINT(),

        iAmInTheQuorum = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.includes(global.CONFIG.SYMBIOTE.PUB),

        checkpointIsFresh = CHECK_IF_THE_SAME_DAY(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.timestamp,GET_GMT_TIMESTAMP())



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

            issuer:global.CONFIG.SYMBIOTE.PUB,

            prevCheckpointPayloadHash:global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash,

            poolsMetadata:{},

            operations:[],

            otherSymbiotes:{} //don't need now

        }

        Object.keys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata).forEach(
            
            poolPubKey => {

                let {index,hash} = temporaryObject.CHECKPOINT_MANAGER.get(poolPubKey) //{index,hash,(?)aggregatedCommitments}

                let {isReserve} = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata[poolPubKey]

                potentialCheckpointPayload.poolsMetadata[poolPubKey] = {index,hash,isReserve}

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

                let currentSyncHelper = temporaryObject.CHECKPOINT_MANAGER_SYNC_HELPER // mapping(poolPubKey=>{index,hash,aggregatedCommitments})


                for(let updateOp of metadataUpdate){

                    // Get the data about the current pool
                    let poolMetadata = currentSyncHelper.get(updateOp.poolPubKey)

                    if(!poolMetadata) continue

                    else{

                        // If we received proof about bigger height on this pool
                        if(updateOp.index > poolMetadata.index && typeof updateOp.aggregatedCommitments === 'object'){

                            let {aggregatedSignature,aggregatedPub,afkVoters} = updateOp.aggregatedCommitments
    
                            let signaIsOk = await bls.singleVerify(updateOp.poolPubKey+":"+updateOp.index+updateOp.hash+checkpointFullID,aggregatedPub,aggregatedSignature).catch(_=>false)
        
                            try{

                                let rootPubIsOK = quorumRootPub === bls.aggregatePublicKeys([aggregatedPub,...afkVoters])
        
        
                                if(signaIsOk && rootPubIsOK){

                                    let latestFinalized = {index:updateOp.index,hash:updateOp.hash,aggregatedCommitments:updateOp.aggregatedCommitments}

                                    // Send to synchronizer to update the local stats

                                    currentSyncHelper.set(updateOp.poolPubKey,latestFinalized)

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
        there were no AGGREGATED_FINALIZATION_PROOF for another height/hash

        On this step - we start to exclude the system sync operations from our proposition to get the wished 2/3N+1 signatures of checkpoint proposition

        But, initialy we check if 2/3N+1 agreements we have. If no and no propositions to update metadata - then it's problem with the system sync operations, so we should exclude some of them
        
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
                header:{

                    id:global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id+1,
        
                    payloadHash:checkpointPayloadHash,
        
                    quorumAggregatedSignersPubKey:bls.aggregatePublicKeys(pubKeys),
        
                    quorumAggregatedSignature:bls.aggregateSignatures(signatures),
        
                    afkVoters:global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.filter(pubKey=>!otherAgreements.has(pubKey))
        
                },
                
                // Store & share among the rest of network
                payload:potentialCheckpointPayload,        

            }

            await USE_TEMPORARY_DB('put',temporaryObject.DATABASE,`CHECKPOINT`,newCheckpoint).catch(_=>false)

            //___________________________ Run the second stage - share via POST /checkpoint_stage_2 ____________________________________

            await INITIATE_CHECKPOINT_STAGE_2_GRABBING(newCheckpoint,quorumMembers).catch(_=>{})


        }else if(propositionsToUpdateMetadata===0){

            // Delete the system sync operations due to which the rest could not agree with our version of checkpoints
            //! NOTE - we can't delete operations of SKIP_PROCEDURE, so check the type of operation too

            for(let {excludeSpecOperations} of checkpointsPingBacks){

                if(excludeSpecOperations && excludeSpecOperations.length!==0){

                }

            }

        }

        //Clear everything and repeat the attempt(round) of checkpoint proposition - with updated values of pools' metadata & without system sync operations

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
    
    
            let promise = fetch(descriptor.url+'/finalization',optionsToSend).then(r=>r.json()).then(async possibleFinalizationProof=>{
                
                let finalProofIsOk = await bls.singleVerify(blockID+blockHash+'FINALIZATION'+checkpointFullID,descriptor.pubKey,possibleFinalizationProof.fp).catch(_=>false)
    
                if(finalProofIsOk) finalizationProofsMapping.set(descriptor.pubKey,possibleFinalizationProof.fp)
    
            
            }).catch(_=>false)
    

            // To make sharing async
            promises.push(promise)
    
        }
    
        await Promise.all(promises)

    }




    //_______________________ It means that we now have enough FINALIZATION_PROOFs for appropriate block. Now we can start to generate AGGREGATED_FINALIZATION_PROOF _______________________


    if(finalizationProofsMapping.size>=majority){

        // In this case , aggregate FINALIZATION_PROOFs to get the AGGREGATED_FINALIZATION_PROOF and share over the network
        // Also, increase the counter of global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER') to move to the next block and udpate the hash
    
        let signers = [...finalizationProofsMapping.keys()]

        let signatures = [...finalizationProofsMapping.values()]

        let afkVoters = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.filter(pubKey=>!signers.includes(pubKey))


        /*
        
        Aggregated version of FINALIZATION_PROOFs (it's AGGREGATED_FINALIZATION_PROOF)
        
        {
        
            blockID:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

            blockHash:"0123456701234567012345670123456701234567012345670123456701234567",
        
            aggregatedPub:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP",

            aggregatedSigna:"kffamjvjEg4CMP8VsxTSfC/Gs3T/MgV1xHSbP5YXJI5eCINasivnw07f/lHmWdJjC4qsSrdxr+J8cItbWgbbqNaM+3W4HROq2ojiAhsNw6yCmSBXl73Yhgb44vl5Q8qD",

            afkVoters:[]

        }
    

        */

        let aggregatedFinalizationProof = {

            blockID,
            
            blockHash,
            
            aggregatedPub:bls.aggregatePublicKeys(signers),
            
            aggregatedSignature:bls.aggregateSignatures(signatures),
            
            afkVoters

        }

        //Share here
        BROADCAST('/aggregated_finalization_proof',aggregatedFinalizationProof)

        await USE_TEMPORARY_DB('put',DATABASE,'AFP:'+blockID,aggregatedFinalizationProof).catch(_=>false)

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
    
            2. Get the 2/3N+1 FINALIZATION_PROOFs, aggregate and call POST /aggregated_finalization_proof to share the AGGREGATED_FINALIZATION_PROOFS over the symbiote
    
            */

    
            let promise = fetch(descriptor.url+'/block',optionsToSend).then(r=>r.json()).then(async possibleCommitment=>{

                let commitmentIsOk = await bls.singleVerify(blockID+blockHash+checkpointFullID,descriptor.pubKey,possibleCommitment.commitment).catch(_=>false)
    
                if(commitmentIsOk) commitmentsForCurrentBlock.set(descriptor.pubKey,possibleCommitment.commitment)

            }).catch(_=>{})
    
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
    if(!global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata[global.CONFIG.SYMBIOTE.PUB]){

        setTimeout(SEND_BLOCKS_AND_GRAB_COMMITMENTS,3000)

        return

    }

    // Descriptor has the following structure - {checkpointID,height}
    let appropriateDescriptor = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash + "#" + global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)){

        setTimeout(SEND_BLOCKS_AND_GRAB_COMMITMENTS,3000)

        return

    }


    let {FINALIZATION_PROOFS,DATABASE} = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    if(!appropriateDescriptor || appropriateDescriptor.checkpointID !== global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id){

        //If we still works on the old checkpoint - continue
        //Otherwise,update the latest height/hash and send them to the new QUORUM
        appropriateDescriptor = await USE_TEMPORARY_DB('get',DATABASE,'BLOCK_SENDER_HANDLER').catch(_=>false)

        if(!appropriateDescriptor){

            let myLatestFinalizedHeight = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata[global.CONFIG.SYMBIOTE.PUB].index+1

            appropriateDescriptor = {
    
                checkpointID:global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id,
    
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

    setImmediate(SEND_BLOCKS_AND_GRAB_COMMITMENTS)

},




//Iterate over SKIP_HANDLERS to get <aggregatedSkipProof>s and approvements to move to the next reserve pools
REASSIGN_PROCEDURE_MONITORING=async()=>{

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

    if(!tempObject){

        setTimeout(REASSIGN_PROCEDURE_MONITORING,3000)

        return

    }

    let isCheckpointStillFresh = CHECK_IF_THE_SAME_DAY(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.timestamp,GET_GMT_TIMESTAMP())

    if(!isCheckpointStillFresh){

        setTimeout(REASSIGN_PROCEDURE_MONITORING,3000)

        return

    }


    let majority = GET_MAJORITY('QUORUM_THREAD')

    let currentQuorum = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum

    let reverseThreshold = currentQuorum.length-majority

    let qtRootPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)


    let currentCheckpointDB = tempObject.DATABASE

    let currentProofsRequests = tempObject.PROOFS_REQUESTS

    let skipHandlers = tempObject.SKIP_HANDLERS

    let reassignments = tempObject.REASSIGNMENTS
    
    // Get the appropriate pubkey & url to check and validate the answer
    let poolsURLsAndPubKeys = await GET_POOLS_URLS(true)



    for(let [poolWithSkipHandler,skipHandler] of skipHandlers){

        // If pool was marked as AFK:true in skip handler - do nothing
        if(skipHandler.wasReassigned) continue
        
        if(!skipHandler.aggregatedSkipProof){


            // Otherwise, send <extendedAggregatedCommitments> in SKIP_HANDLER to => POST /get_skip_proof

            let responsePromises = []

            let sendOptions = {
                
                method:'POST',

                body:JSON.stringify({

                    poolPubKey:poolWithSkipHandler,

                    extendedAggregatedCommitments:skipHandler.extendedAggregatedCommitments

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

            [1] In case quroum member also has this pool in SKIP_HANDLER - this is the signal that it also stopped creating finalization proofs for a given pool

                If its local version of <extendedAggregatedCommitments> in skip handler has lower index than in FP that we send - the response format is:

                
                    {
                        type:'OK',
                        sig: BLS_SIG('SKIP:<poolPubKey>:<index>:<hash>:<checkpointFullID>')
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


            let dataThatShouldBeSigned = `SKIP:${poolWithSkipHandler}:${index}:${hash}:${checkpointFullID}`

            for(let result of results){

                if(result.type === 'OK' && typeof result.sig === 'string'){

                    let signatureIsOk = await bls.singleVerify(dataThatShouldBeSigned,result.pubKey,result.sig).catch(_=>false)

                    if(signatureIsOk){

                        pubkeysWhoAgreeToSkip.push(result.pubKey)

                        signaturesToSkip.push(result.sig)

                    }

                    if(pubkeysWhoAgreeToSkip.length >= majority) break // if we get 2/3N+1 signatures to skip - we already have ability to create <aggregatedSkipProof>


                }else if(result.type === 'UPDATE' && typeof result.extendedAggregatedCommitments === 'object'){


                    let {index,hash,aggregatedCommitments} = result.extendedAggregatedCommitments


                    if(aggregatedCommitments){

                        let {aggregatedPub,aggregatedSignature,afkVoters} = aggregatedCommitments
            
                        let dataThatShouldBeSigned = poolWithSkipHandler+':'+index+hash+checkpointFullID
                        
                        let aggregatedCommitmentsIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,qtRootPub,dataThatShouldBeSigned,aggregatedSignature,reverseThreshold).catch(_=>false)
            

                        //If signature is ok and index is bigger than we have - update the <extendedAggregatedCommitments> in our local skip handler
            
                        if(aggregatedCommitmentsIsOk && skipHandler.extendedAggregatedCommitments.index < index){
            
                            
                            skipHandler.extendedAggregatedCommitments.index = index

                            skipHandler.extendedAggregatedCommitments.hash = hash

                            skipHandler.extendedAggregatedCommitments.aggregatedCommitments = {aggregatedPub,aggregatedSignature,afkVoters}
            

                            // Store the updated version of skip handler

                            await USE_TEMPORARY_DB('put',currentCheckpointDB,'SKIP_HANDLER:'+poolWithSkipHandler,skipHandler).catch(_=>{})

                            // If our local version had lower index - break the cycle and try again with updated value

                            break

                        }

                    }
                
                }

            }


            //____________________If we get 2/3+1 of votes - aggregate, get the ASP(<aggregatedSkipProof>), add to local skip handler and start to grab approvements____________________

            if(pubkeysWhoAgreeToSkip.length >= majority){

                skipHandler.aggregatedSkipProof = {

                    index:skipHandler.extendedAggregatedCommitments.index,

                    hash:skipHandler.extendedAggregatedCommitments.hash,

                    skipProof:{

                        aggregatedPub:bls.aggregatePublicKeys(pubkeysWhoAgreeToSkip),

                        aggregatedSignature:bls.aggregateSignatures(signaturesToSkip),

                        afkVoters:currentQuorum.filter(pubKey=>!pubkeysWhoAgreeToSkip.includes(pubKey))
                        
                    }

                }

                await USE_TEMPORARY_DB('put',currentCheckpointDB,'SKIP_HANDLER:'+poolWithSkipHandler,skipHandler).catch(_=>{})                


            }

        }


        if(skipHandler.aggregatedSkipProof && !currentProofsRequests.has('REASSIGN:'+poolWithSkipHandler)){
    
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

                    poolPubKey:poolWithSkipHandler,
                    
                    session
                    
                })

            }

            let proofsPromises=[]


            for(let poolUrlWithPubkey of poolsURLsAndPubKeys){

                let responsePromise = fetch(poolUrlWithPubkey.url+'/get_reassignment_ready_status',dataToSend).then(r=>r.json()).then(response=>{
    
                    response.pubKey = poolUrlWithPubkey.pubKey
        
                    return response
        
                }).catch(_=>false)
        
                proofsPromises.push(responsePromise)
        
            }

            let results = (await Promise.all(proofsPromises)).filter(Boolean)

            let dataThatShouldBeSigned = `REASSIGNMENT:${poolWithSkipHandler}:${session}:${checkpointFullID}`

            let numberWhoAgreeToDoReassignment = 0

            
            //___________________Now analyze the results___________________


            for(let result of results){

                if(result.type === 'OK' && typeof result.sig === 'string'){

                    let signatureIsOk = await bls.singleVerify(dataThatShouldBeSigned,result.pubKey,result.sig).catch(_=>false)

                    if(signatureIsOk) numberWhoAgreeToDoReassignment++

                    if(numberWhoAgreeToDoReassignment >= majority) break // if we get 2/3N+1 approvements - no sense to continue

                }
            
            }

            if(numberWhoAgreeToDoReassignment >= majority){

                // Now, create the request for reassignment

                let possibleNothingOrPointerToPrimePool = reassignments.get(poolWithSkipHandler)
                

                if(possibleNothingOrPointerToPrimePool){

                    // In case typeof is string - it's reserve pool which points to prime pool, so we should put appropriate request

                    currentProofsRequests.set('REASSIGN:'+poolWithSkipHandler,possibleNothingOrPointerToPrimePool)                        

                }else{

                    // In case currentStateInReassignments is nothing(undefined,null,etc.) - it's prime pool without any reassignments

                    currentProofsRequests.set('REASSIGN:'+poolWithSkipHandler,poolWithSkipHandler)

                }


            }
      
        }

    }


    // Start again
    setImmediate(REASSIGN_PROCEDURE_MONITORING)

    
},




//Function to monitor the available block creators
SUBCHAINS_HEALTH_MONITORING=async()=>{

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

    if(!tempObject){

        setTimeout(SUBCHAINS_HEALTH_MONITORING,global.CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return

    }


    let majority = GET_MAJORITY('QUORUM_THREAD')

    let reverseThreshold = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.length-majority

    let qtRootPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)

    let proofsRequests = tempObject.PROOFS_REQUESTS

    let skipHandlers = tempObject.SKIP_HANDLERS

    let reassignments = tempObject.REASSIGNMENTS

    let isCheckpointStillFresh = CHECK_IF_THE_SAME_DAY(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.timestamp,GET_GMT_TIMESTAMP())



    if(tempObject.HEALTH_MONITORING.size===0){

        // Fill the HEALTH_MONITORING mapping with the latest known values
        // Structure is poolPubKey => {lastSeen,index,hash,aggregatedFinalizationProof:{aggregatedPub,aggregatedSig,afkVoters}}

        let lastSeen = GET_GMT_TIMESTAMP()

        for(let poolPubKey of tempObject.CHECKPOINT_MANAGER.keys()){

            let {index,hash}=tempObject.CHECKPOINT_MANAGER.get(poolPubKey)

            let baseBlockID = poolPubKey+":"+index

            let aggregatedFinalizationProof = await USE_TEMPORARY_DB('get',tempObject.DATABASE,'AFP:'+baseBlockID).catch(_=>false)
            
        
            //Store to mapping
            tempObject.HEALTH_MONITORING.set(poolPubKey,{lastSeen,index,hash,aggregatedFinalizationProof})

        }

        setTimeout(SUBCHAINS_HEALTH_MONITORING,global.CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return

    }


    // If you're not in quorum or checkpoint is outdated - don't start health monitoring
    if(!global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.includes(global.CONFIG.SYMBIOTE.PUB) || proofsRequests.has('NEXT_CHECKPOINT') || !isCheckpointStillFresh){

        setTimeout(SUBCHAINS_HEALTH_MONITORING,global.CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return

    }



    // Get the appropriate pubkey & url to check and validate the answer
    let poolsURLsAndPubKeys = await GET_POOLS_URLS(true)

    let proofsPromises = []

    let candidatesForAnotherCheck = []


    
    for(let handler of poolsURLsAndPubKeys){
        
        let metadataOfCurrentPool = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata[handler.pubKey]

        /*
        
        We should monitor the health only for:

        [0] Pools that are not in SKIP_HANDLERS
        [1] Reserve pools that are currently work for prime pool

        */

        let poolIsInSkipHandlers = skipHandlers.has(handler.pubKey) || proofsRequests.has('CREATE_SKIP_HANDLER:'+handler.pubKey)

        let poolIsInReassignment = metadataOfCurrentPool.isReserve && typeof reassignments.get(handler.pubKey) === 'string'

        let isItPrimePool = !metadataOfCurrentPool.isReserve


        if(!poolIsInSkipHandlers && (isItPrimePool || poolIsInReassignment)){

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
        
            index, // height of block that we already finalized. Also, below you can see the AGGREGATED_FINALIZATION_PROOF. We need it as a quick proof that majority have voted for this segment of subchain
            
            hash:<>,

            pubKey,

            aggregatedFinalizationProof:{
            
                aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+QT.CHECKPOINT.HEADER.ID
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

        let {index,hash,pubKey} = answer


        // Received {lastSeen,index,hash,aggregatedFinalizationProof}
        let localHealthHandler = tempObject.HEALTH_MONITORING.get(pubKey)

        // blockID+hash+'FINALIZATION'+checkpointFullID
        let data = pubKey+':'+index+hash+'FINALIZATION'+checkpointFullID

        let aggregatedFinalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,qtRootPub,data,aggregatedSignature,reverseThreshold).catch(_=>false)

        //If signature is ok and index is bigger than we have - update the <lastSeen> time and set new height/hash/aggregatedFinalizationProof

        if(aggregatedFinalizationProofIsOk && localHealthHandler.index < index){

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

        let localHealthHandler = tempObject.HEALTH_MONITORING.get(candidate) // {lastSeen,aggregatedFinalizationProof}

        if(currentTime-localHealthHandler.lastSeen >= afkLimit){

            let updateWasFound = false
            
            //_____________________ Now, go through the quorum members and try to get updates from them_____________________

            for(let validatorHandler of poolsURLsAndPubKeys){

                let afpOfPoolXFromAnotherQuorumMember = await fetch(validatorHandler.url+'/get_health_of_another_pool/'+candidate).then(r=>r.json()).catch(_=>false)

                if(afpOfPoolXFromAnotherQuorumMember){

                    // Verify and if ok - break the cycle

                    let {index,hash,aggregatedFinalizationProof} = afpOfPoolXFromAnotherQuorumMember

                    if(aggregatedFinalizationProof){

                        let {aggregatedPub,aggregatedSignature,afkVoters} = aggregatedFinalizationProof

                        // blockID+hash+'FINALIZATION'+quorumThreadCheckpointFullID
                        let data = candidate+':'+index+hash+'FINALIZATION'+checkpointFullID
    
                        let aggregatedFinalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,qtRootPub,data,aggregatedSignature,reverseThreshold).catch(_=>false)
    
                        //If signature is ok and index is bigger than we have - update the <lastSeen> time and set new aggregatedFinalizationProof
    
                        if(aggregatedFinalizationProofIsOk && localHealthHandler.index < index){
    
                            localHealthHandler.lastSeen = currentTime

                            localHealthHandler.index = index

                            localHealthHandler.hash = hash
    
                            localHealthHandler.aggregatedFinalizationProof = {aggregatedPub,aggregatedSignature,afkVoters}
    
                            updateWasFound = true

                            break // No more sense to find updates

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

                candidateIsLatestInReassignmentChain = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.reassignmentChains[primePoolPointer].length === 0

            }else{

                primePoolPointer = candidate

                // In case it's string - then this string is a pubkey of prime pool
                if(typeof reassignmentHandlerOrPointerToPrimePool === 'string'){
    
                    primePoolPointer = reassignmentHandlerOrPointerToPrimePool
    
                    // If candidate is not a prime pool - get the handler for prime pool to get the .currentReservePool property
                    reassignmentHandlerOrPointerToPrimePool = reassignments.get(reassignmentHandlerOrPointerToPrimePool)
    
                }

                // No sense to skip the latest pool in chain. Because in this case nobody won't have ability to continue work on subchain
                candidateIsLatestInReassignmentChain = reassignmentHandlerOrPointerToPrimePool.currentReservePool === (global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.reassignmentChains[primePoolPointer].length-1)

            }

            
            if(!(updateWasFound || candidateIsLatestInReassignmentChain)){

                // If no updates - add the request to create SKIP_HANDLER via a sync and secured way

                proofsRequests.set('CREATE_SKIP_HANDLER:'+candidate,candidate)
                
            }

        }

    }

    console.log('DEBUG: Health monitoring is ', tempObject.HEALTH_MONITORING)


    setTimeout(SUBCHAINS_HEALTH_MONITORING,global.CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)


},




RESTORE_STATE=async()=>{

    
    let poolsMetadata = Object.keys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata)

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)
    


    for(let poolPubKey of poolsMetadata){

        // If this value is related to the current checkpoint - set to manager, otherwise - take from the POOLS_METADATA as a start point
        // Returned value is {index,hash,(?)aggregatedCommitments}

        let {index,hash,aggregatedCommitments} = await tempObject.DATABASE.get(poolPubKey).catch(_=>false) || global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata[poolPubKey]

        
        tempObject.CHECKPOINT_MANAGER.set(poolPubKey,{index,hash,aggregatedCommitments})
        
        tempObject.CHECKPOINT_MANAGER_SYNC_HELPER.set(poolPubKey,{index,hash,aggregatedCommitments})


        //______________________________ Try to find SKIP_HANDLER for pool ______________________________


        let skipHandler = await tempObject.DATABASE.get('SKIP_HANDLER:'+poolPubKey).catch(_=>false) // {wasReassigned:boolean,extendedAggregatedCommitments,aggregatedSkipProof}

        if(skipHandler) tempObject.SKIP_HANDLERS.set(poolPubKey,skipHandler)


        //___________________________________ Check for reassignments _______________________________________

        
        if(!poolsMetadata.isReserve){

            let reassignmentMetadata = await tempObject.DATABASE.get('REASSIGN:'+poolPubKey).catch(_=>false) // {currentReservePool:<pointer to current reserve pool in (QT/VT).CHECKPOINT.reassignmentChains[<primePool>]>}

            if(reassignmentMetadata){

                tempObject.REASSIGNMENTS.set(poolPubKey,reassignmentMetadata)

                // Using pointer - find the appropriate reserve pool

                let reservePool = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.reassignmentChains[poolPubKey][reassignmentMetadata.currentReservePool]

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
    if(!global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata[global.CONFIG.SYMBIOTE.PUB]) return
    
    let qtCheckpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(qtCheckpointFullID)



    if(!tempObject) return


    let myDataInReassignments = tempObject.REASSIGNMENTS.get(global.CONFIG.SYMBIOTE.PUB)


    if(typeof myDataInReassignments === 'object') return


    // Check if <checkpointFullID> is the same in QT and in GT
    
    if(global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId !== qtCheckpointFullID){

        
        global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId = qtCheckpointFullID


        // And nullish the index & hash to the ranges of checkpoint

        let myMetadataFromCheckpoint = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata[global.CONFIG.SYMBIOTE.PUB]

        global.SYMBIOTE_META.GENERATION_THREAD.prevHash = myMetadataFromCheckpoint.hash
 
        global.SYMBIOTE_META.GENERATION_THREAD.nextIndex = myMetadataFromCheckpoint.index + 1

    
    }


    let extraData = {}

    
    // If we are even not in reserve - return

    if(typeof myDataInReassignments === 'string'){

        // Do it only for the first block in epoch

        if(global.SYMBIOTE_META.GENERATION_THREAD.nextIndex === global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata[global.CONFIG.SYMBIOTE.PUB].index+1){

            // Build the template to insert to the extraData of block. Structure is {primePool:ASP,reservePool0:ASP,...,reservePoolN:ASP}
        
            let myPrimePool = global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY

            let reassignmentArrayOfMyPrimePool = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.reassignmentChains[myPrimePool]
    
            let myIndexInReassignmentChain = reassignmentArrayOfMyPrimePool.indexOf(global.CONFIG.SYMBIOTE.PUB)
    

            // Get all previous pools - from zero to <my_position>
            let allPreviousPools = reassignmentArrayOfMyPrimePool.slice(0,myIndexInReassignmentChain)


            //_____________________ Fill the extraData.reassignments _____________________

            extraData.reassignments = {}

            // 0.Add the ASP for prime pool

            if(tempObject.SKIP_HANDLERS.has(myPrimePool)){

                extraData.reassignments[myPrimePool] = tempObject.SKIP_HANDLERS.get(myPrimePool).aggregatedSkipProof

            }

            // 1.And for all the previous reserve pools from position 0 to (<YOUR_POSITION>-1)

            for(let reservePool of allPreviousPools){

                if(tempObject.SKIP_HANDLERS.has(reservePool)){

                    extraData.reassignments[reservePool] = tempObject.SKIP_HANDLERS.get(reservePool).aggregatedSkipProof

                }

            }


        }


    }else if(global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY) return
    
    
    /*

    _________________________________________GENERATE PORTION OF BLOCKS___________________________________________
    
    Here we check how many transactions(events) we have locally and generate as many blocks as it's possible
    
    */

    let numberOfBlocksToGenerate=Math.ceil(global.SYMBIOTE_META.MEMPOOL.length/global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.TXS_LIMIT_PER_BLOCK)


    // Add the system sync operations to block extra data

    extraData.systemSyncOperations = GET_SYSTEM_SYNC_OPERATIONS(global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId)
    
    // Add the extra data to block

    extraData.rest = {...global.CONFIG.SYMBIOTE.EXTRA_DATA_TO_BLOCK}


    //DEBUG
    numberOfBlocksToGenerate++

    //If nothing to generate-then no sense to generate block,so return
    if(numberOfBlocksToGenerate===0) return 


    LOG(`Number of blocks to generate \x1b[32;1m${numberOfBlocksToGenerate}`,'I')

    let atomicBatch = global.SYMBIOTE_META.BLOCKS.batch()

    for(let i=0;i<numberOfBlocksToGenerate;i++){


        let blockCandidate=new Block(GET_TRANSACTIONS(),extraData,global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId)
                        
        let hash=Block.genHash(blockCandidate)


        blockCandidate.sig=await BLS_SIGN_DATA(hash)
            
        BLOCKLOG(`New block generated`,hash,blockCandidate)


        global.SYMBIOTE_META.GENERATION_THREAD.prevHash = hash
 
        global.SYMBIOTE_META.GENERATION_THREAD.nextIndex++
    
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

        
    checkpointTimestamp = global.GENESIS.CHECKPOINT_TIMESTAMP

    let primePools = new Set(Object.keys(global.GENESIS.POOLS))


    for(let [poolPubKey,poolContractStorage] of Object.entries(global.GENESIS.POOLS)){

        let {isReserve} = poolContractStorage

        startPool = poolPubKey

        //Add metadata related to this pool
        global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[poolPubKey]={
            
            index:-1,
            
            hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

            isReserve
        
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
        
        let idToAdd = poolPubKey+':'+poolPubKey

        if(isReserve){

            idToAdd = poolContractStorage.reserveFor+':'+poolPubKey

        }

        //Put metadata
        atomicBatch.put(idToAdd+'(POOL)',contractMetadataTemplate)

        //Put storage
        //NOTE: We just need a simple storage with ID="POOL"
        atomicBatch.put(idToAdd+'(POOL)_STORAGE_POOL',poolContractStorage)


        // Put the pointer to know the subchain which store the pool's data(metadata+storages)
        // Pools' contract metadata & storage are in own subchain. Also, reserve pools also here as you see below
        if(isReserve) atomicBatch.put(poolPubKey+'(POOL)_POINTER',poolContractStorage.reserveFor)
        
        else atomicBatch.put(poolPubKey+'(POOL)_POINTER',poolPubKey)


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


        let templateForQt = {

            totalPower:poolContractStorage.totalPower,
            lackOfTotalPower:false,
            stopCheckpointID:-1,
            storedMetadata:{},
            isReserve
        
        }

        
        if(isReserve) templateForQt.reserveFor = poolContractStorage.reserveFor

        else global.SYMBIOTE_META.VERIFICATION_THREAD.SID_TRACKER[poolPubKey] = 0


        quorumThreadAtomicBatch.put(poolPubKey+'(POOL)_STORAGE_POOL',templateForQt)

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

        header:{

            id:-1,

            payloadHash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

            quorumAggregatedSignersPubKey:'',

            quorumAggregatedSignature:'',

            afkVoters:[]

        },
        
        payload:{

            prevCheckpointPayloadHash:'',

            poolsMetadata:JSON.parse(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA)),

            operations:[],

            otherSymbiotes:{}

        },

        timestamp:checkpointTimestamp,

        completed:true
    
    }


    //Make template, but anyway - we'll find checkpoints on hostchains
    global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT={

        header:{

            id:-1,

            payloadHash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

            quorumAggregatedSignersPubKey:'',

            quorumAggregatedSignature:'',

            afkVoters:[]

        },
        
        payload:{
            
            prevCheckpointPayloadHash:'',

            poolsMetadata:JSON.parse(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA)),

            operations:[],

            otherSymbiotes:{}

        },

        timestamp:checkpointTimestamp,
        
        completed:true
    
    }


    // Set the rubicon to stop tracking spent txs from WAITING_ROOMs of pools' contracts. Value means the checkpoint id lower edge
    // If your stake/unstake tx was below this line - it might be burned. However, the line is set by QUORUM, so it should be safe
    global.SYMBIOTE_META.VERIFICATION_THREAD.RUBICON = -1
    
    global.SYMBIOTE_META.QUORUM_THREAD.RUBICON = -1


    //We get the quorum for VERIFICATION_THREAD based on own local copy of POOLS_METADATA state
    global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.quorum = GET_QUORUM(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA,global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS)

    //...However, quorum for QUORUM_THREAD might be retrieved from POOLS_METADATA of checkpoints. It's because both threads are async
    global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum = GET_QUORUM(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS)


    //Finally, build the reassignment chains for current checkpoint in QT and VT

    await SET_REASSIGNMENT_CHAINS(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT)

    await SET_REASSIGNMENT_CHAINS(global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT)

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
    
        'BLOCKS', //For blocks. BlockID => block
    
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
            
            checkpointFullId:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde',
            
            prevHash:`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`, // Genesis hash
            
            nextIndex:0 // So the first block will be with index 0
        
        }
        :
        (LOG(`Some problem with loading metadata of generation thread\nError:${error}`,'F'),process.exit(106))
                        
    )


    //Load from db or return empty object
    global.SYMBIOTE_META.QUORUM_THREAD = await global.SYMBIOTE_META.QUORUM_THREAD_METADATA.get('QT').catch(_=>({}))
        


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

    global.SYMBIOTE_META.STUFF_CACHE=new AdvancedCache(global.CONFIG.SYMBIOTE.STUFF_CACHE_SIZE,global.SYMBIOTE_META.STUFF)


    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let vtCheckpointFullID = global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.header.id


    //Because if we don't have quorum, we'll get it later after discovering checkpoints

    global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('VT_ROOTPUB'+vtCheckpointFullID,bls.aggregatePublicKeys(global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.quorum))

    global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('QT_ROOTPUB'+checkpointFullID,bls.aggregatePublicKeys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum))


    //_________________________________Add the temporary data of current QT__________________________________________
    
    let quorumTemporaryDB = level(process.env.CHAINDATA_PATH+`/${checkpointFullID}`,{valueEncoding:'json'})

    global.SYMBIOTE_META.TEMP.set(checkpointFullID,{

        COMMITMENTS:new Map(), // blockID => BLS_SIG(blockID+hash).     The first level of "proofs". Commitments is just signatures by some validator from current quorum that "validator accept some block X by ValidatorY with hash H"

        FINALIZATION_PROOFS:new Map(), // blockID => SIG(blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+QT.CHECKPOINT.HEADER.ID).    Aggregated proofs which proof that some validator has 2/3N+1 commitments for block PubX:Y with hash H. Key is blockID and value is FINALIZATION_PROOF object

    
        CHECKPOINT_MANAGER:new Map(), // mapping( validatorID => {index,hash} ). Used to start voting for checkpoints.      Each pair is a special handler where key is a pubkey of appropriate validator and value is the ( index <=> id ) which will be in checkpoint
    
        CHECKPOINT_MANAGER_SYNC_HELPER:new Map(), // map(poolPubKey=>Set({index,hash,aggregatedCommitments})) here will be added propositions to update the aggregated commitments for pool which will be checked in sync mode

        SYSTEM_SYNC_OPERATIONS_MEMPOOL:[],
        
        PROOFS_REQUESTS:new Map(), // mapping(blockID=>FINALIZATION_PROOF_REQUEST)

        PROOFS_RESPONSES:new Map(), // mapping(blockID=>FINALIZATION_PROOF)


        HEALTH_MONITORING:new Map(), // used to perform SKIP procedure when we need it and to track changes on subchains. poolPubKey => {lastSeen,index,hash,aggregatedFinalizationProof:{aggregatedPub,aggregatedSig,afkVoters}}

        SKIP_HANDLERS:new Map(), // {wasReassigned:boolean,extendedAggregatedCommitments,aggregatedSkipProof}

        REASSIGNMENTS:new Map(), // PrimePool => {currentReservePool:<number>} | ReservePool => PrimePool


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

    let quorumThreadCheckpointFullID = qtCheckpoint.header.payloadHash+"#"+qtCheckpoint.header.id

    let tempObject = global.SYMBIOTE_META.TEMP.has(quorumThreadCheckpointFullID)

    if(!tempObject){

        setTimeout(TEMPORARY_REASSIGNMENTS_BUILDER,global.CONFIG.SYMBIOTE.TEMPORARY_REASSIGNMENTS_BUILDER_TIMEOUT)

        return

    }


    let verificationThread = global.SYMBIOTE_META.VERIFICATION_THREAD

    
    let tempReassignmentOnVerificationThread = verificationThread.TEMP_REASSIGNMENTS

    let reassignmentChains = verificationThread.CHECKPOINT.reassignmentChains

    let poolsMetadataFromVtCheckpoint = verificationThread.CHECKPOINT.payload.poolsMetadata
    


    if(!tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID]){

        tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID]={} // create empty template

        // Fill with data from here. Structure: primePool => [reservePool0,reservePool1,...,reservePoolN]

        for(let primePoolPubKey of Object.keys(reassignmentChains)){
            
            tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePoolPubKey] = {

                currentAuthority:-1, // -1 means that it's prime pool itself. Indexes 0,1,2...N are the pointers to reserve pools in VT.REASSIGNMENT_CHAINS
                
                currentToVerify:-1, // to start the verification in START_VERIFICATION_THREAD from prime pool(-1 index) and continue with reserve pools(0,1,2,...N)

                reassignments:{} // poolPubKey => {index,hash}

            }

        }

    }

    //________________________________ Start to find ________________________________

    let quorumMembers = await GET_POOLS_URLS(true)
    
    //___________________Ask quorum members about reassignments. Grab this results, verify the proofs and build the temporary reassignment chains___________________



    for(let memberHandler of quorumMembers){

        // Make requests to /get_asp_and_approved_first_block. Returns => {currentReservePoolIndex,firstBlockOfCurrentAuthority,afpForFirstBlockByCurrentAuthority}. Send the current auth + prime pool

        let responseForTempReassignment = await fetch(memberHandler.url+'/get_data_for_temp_reassign').then(r=>r.json()).catch(_=>false)

        if(responseForTempReassignment){

    
            /*
        
                The response from each of quorum member has the following structure:

                [0] - {err:'Some error text'} - ignore, do nothing

                [1] - Object with this structure

                {

                    primePool0:{currentReservePoolIndex,firstBlockByCurrentAuthority,afpForFirstBlockByCurrentAuthority},

                    primePool1:{currentReservePoolIndex,firstBlockByCurrentAuthority,afpForFirstBlockByCurrentAuthority},

                    ...

                    primePoolN:{currentReservePoolIndex,firstBlockByCurrentAuthority,afpForFirstBlockByCurrentAuthority}

                }


                -----------------------------------------------[Decomposition]-----------------------------------------------


                [0] currentReservePoolIndex - index of current authority for subchain X. To get the pubkey of subchain authority - take the QUORUM_THREAD.CHECKPOINT.REASSIGNMENT_CHAINS[<primePool>][currentReservePoolIndex]

                [1] firstBlockByCurrentAuthority - default block structure with ASP for all the previous pools in a row

                [2] afpForFirstBlockByCurrentAuthority - default AFP structure -> 


                    {
        
                        blockID:<string>,
                        blockHash:<string>,
                        aggregatedSignature:<string>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+QT.CHECKPOINT.HEADER.ID
                        aggregatedPub:<string>,
                        afkVoters:[<string>,...]
        
                    }


                -----------------------------------------------[What to do next?]-----------------------------------------------
        
                Compare the <currentReservePoolIndex> with our local pointer tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePool].currentAuthority

                    In case our local version has bigger index - ignore

                    In case proposed version has bigger index it's a clear signal that some of reassignments occured and we need to update our local data

                    For this:

                        0) Verify the first block in this epoch(checkpoint) by current autority - make sure block.extraData contains all ASPs for previous reserve pools(+ for prime pool) in a row

                        1) Verify that this block was approved by quorum majority(2/3N+1) by checking the <afpForFirstBlockByCurrentAuthority>


                    If all the verification steps is OK - add to some cache

                -----------------------------------------------[After the verification of all the responses?]-----------------------------------------------

                Start to build the temporary reassignment chains

            */

            for(let [primePoolPubKey,reassignMetadata] of Object.entries(responseForTempReassignment)){

                if(typeof primePoolPubKey === 'string' && typeof reassignMetadata==='object'){
    
                    let {currentReservePoolIndex,firstBlockByCurrentAuthority,afpForFirstBlockByCurrentAuthority} = reassignMetadata
    
                    if(typeof currentReservePoolIndex === 'number' && typeof firstBlockByCurrentAuthority === 'object' && typeof afpForFirstBlockByCurrentAuthority==='object'){
            
                        
                        let localPointer = tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePoolPubKey].currentAuthority
    
                        let firstBlockIndexInNewCheckpoint = poolsMetadataFromVtCheckpoint[firstBlockByCurrentAuthority.creator].index+1

    
                        if(localPointer <= currentReservePoolIndex && firstBlockIndexInNewCheckpoint === firstBlockByCurrentAuthority.index){
    
                            
                            // Verify the AFP for block
    
                        
                            let blockID = firstBlockByCurrentAuthority.creator+':'+firstBlockByCurrentAuthority.index
    
                            let blockHash = Block.genHash(firstBlockByCurrentAuthority)
    
                            let afpIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(blockID,blockHash,afpForFirstBlockByCurrentAuthority,quorumThreadCheckpointFullID,qtCheckpoint)
    
                            let shouldChangeThisSubchain = true
    


                            if(afpIsOk.verify){
    
                                // Verify all the ASPs in block header
    
                                let {isOK,filteredReassignments,arrayOfPoolsWithZeroProgress} = await CHECK_IF_ALL_ASP_PRESENT(
                                
                                    primePoolPubKey, firstBlockByCurrentAuthority, reassignmentChains[primePoolPubKey], currentReservePoolIndex, quorumThreadCheckpointFullID, poolsMetadataFromVtCheckpoint
                                
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
    
                                    // let previousAuthorityIndexInReassignmentChain = currentReservePoolIndex-1
    
                                    // let previousAuthority = previousAuthorityIndexInReassignmentChain === -1 ? primePool : reassignmentChains[primePool][previousAuthorityIndexInReassignmentChain]
    
                                    // tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePool].reassignments[previousAuthority] = filteredReassignments[previousAuthority]
    
                                    // And do the same from currentReservePoolIndex to tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePool].currentAuthority
    

                                    let potentialReassignments = [filteredReassignments] // each element here is object like {pool:{index,hash}}
                               
                                    let limitPointer = tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePoolPubKey].currentAuthority
                               


                                    for(let position = currentReservePoolIndex-1 ; position >= limitPointer ; position--){
    
                                        let poolWithThisPosition = position === -1 ? primePoolPubKey : reassignmentChains[primePoolPubKey][position]

                                        if(!arrayOfPoolsWithZeroProgress.includes(poolWithThisPosition)){
    
                                            let latestBlockInPreviousCheckpointByThisPool = poolsMetadataFromVtCheckpoint[poolWithThisPosition].index
    
                                            // This is a signal that pool has created at least 1 block, so we have to get it and update the reassignment stats
    
                                            // Here ask the first block by this pool in this epoch, verify the SFP and continue
    
                                            let firstBlockInThisEpochByPool = await GET_BLOCK(poolWithThisPosition,latestBlockInPreviousCheckpointByThisPool+1)

                                            // In this block we should have ASP for all the previous reservePools + primePool
                                
                                            let resultForCurrentPool = position === -1 ? {isOK:true,filteredReassignments:{},arrayOfPoolsWithZeroProgress:[]} : await CHECK_IF_ALL_ASP_PRESENT(
                                                        
                                                primePoolPubKey, firstBlockInThisEpochByPool, reassignmentChains[primePoolPubKey], position, quorumThreadCheckpointFullID, poolsMetadataFromVtCheckpoint
                                                        
                                            )
                                
                                            if(resultForCurrentPool.isOK){
    
                                                // If ok - fill the <potentialReassignments>
    
                                                if(resultForCurrentPool.arrayOfPoolsWithZeroProgress.length) arrayOfPoolsWithZeroProgress = arrayOfPoolsWithZeroProgress.concat(resultForCurrentPool.arrayOfPoolsWithZeroProgress)
    
                                                potentialReassignments.push(resultForCurrentPool.filteredReassignments)
    
                                            }else{
    
                                                shouldChangeThisSubchain = false

                                                break
    
                                            }
                                            

                                        } else continue
    
                                    }
    
                                    if(shouldChangeThisSubchain){

                                        // Update the reassignment data

                                        let tempReassignmentChain = tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePoolPubKey].reassignments // poolPubKey => {index,hash}


                                        for(let reassignStats of potentialReassignments.reverse()){

                                            // potentialReassignments[i] = {primePool:{index,hash},pool0:{index,hash},poolN:{index,hash}}

                                            for(let [skippedPool,descriptor] of Object.entries(reassignStats)){

                                                if(!tempReassignmentChain[skippedPool]) tempReassignmentChain[skippedPool]=descriptor
                        
                                            }

                                        }

                                        // Finally, set the <currentAuthority> to the new pointer

                                        tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePoolPubKey].currentAuthority = currentReservePoolIndex

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
    SEND_BLOCKS_AND_GRAB_COMMITMENTS()

    //3.Track the hostchain and check if there are "NEXT-DAY" blocks so it's time to stop sharing commitments / finalization proofs and start propose checkpoints
    CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT()

    //4.Start checking the health of all the subchains
    SUBCHAINS_HEALTH_MONITORING()

    //5.Iterate over SKIP_HANDLERS to get <aggregatedSkipProof>s and approvements to move to the next reserve pools
    REASSIGN_PROCEDURE_MONITORING()

    //6.Run function to work with finalization stuff and avoid async problems
    PROOFS_SYNCHRONIZER()

    //7.Function to build the TEMP_REASSIGNMENT_METADATA(temporary) for verifictation thread(VT) to continue verify blocks for subchains with no matter who is the current authority for subchain - prime pool or reserve pools
    TEMPORARY_REASSIGNMENTS_BUILDER()




    let promises=[]

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
                
        global.STOP_GEN_BLOCKS_CLEAR_HANDLER=false

        BLOCKS_GENERATION_POLLING()
            
    },global.CONFIG.SYMBIOTE.GENERATION_THREAD_INIT_DELAY)


}