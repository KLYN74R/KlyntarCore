import {
    
    GET_VALIDATORS_URLS,GET_MAJORITY,BROADCAST,GET_RANDOM_BYTES_AS_HEX,CHECK_IF_THE_SAME_DAY,USE_TEMPORARY_DB,

    GET_QUORUM,GET_FROM_STATE_FOR_QUORUM_THREAD,IS_MY_VERSION_OLD,

    DECRYPT_KEYS,BLOCKLOG,BLS_SIGN_DATA,BLS_VERIFY,

} from './utils.js'

import {LOG,SYMBIOTE_ALIAS,PATH_RESOLVE,BLAKE3,GET_GMT_TIMESTAMP} from '../../KLY_Utils/utils.js'

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
let GET_EVENTS = () => SYMBIOTE_META.MEMPOOL.splice(0,CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.EVENTS_LIMIT_PER_BLOCK),

    GET_EVENTS_FOR_REASSIGNED_SUBCHAINS = () => [],

    GET_SPEC_EVENTS = qtPayload =>{

        if(!SYMBIOTE_META.TEMP.has(qtPayload)) return []

        let specialOperationsMempool = SYMBIOTE_META.TEMP.get(qtPayload).SPECIAL_OPERATIONS_MEMPOOL

        return Array.from(specialOperationsMempool).map(subArr=>subArr[1]) //{type,payload}

    },




GEN_BLOCKS_START_POLLING=async()=>{


    if(!SYSTEM_SIGNAL_ACCEPTED){

        await GENERATE_PHANTOM_BLOCKS_PORTION()    

        STOP_GEN_BLOCKS_CLEAR_HANDLER=setTimeout(GEN_BLOCKS_START_POLLING,CONFIG.SYMBIOTE.BLOCK_TIME)
        
        CONFIG.SYMBIOTE.STOP_GENERATE_BLOCKS
        &&
        clearTimeout(STOP_GEN_BLOCKS_CLEAR_HANDLER)

    }else{

        LOG(`Block generation for \x1b[32;1m${SYMBIOTE_ALIAS()}\x1b[36;1m was stopped`,'I',CONFIG.SYMBIOTE.SYMBIOTE_ID)

    }
    
},




DELETE_POOLS_WHICH_HAVE_LACK_OF_STAKING_POWER=async(validatorPubKey,fullCopyOfQuorumThreadWithNewCheckpoint)=>{

    //Try to get storage "POOL" of appropriate pool

    let poolStorage = await GET_FROM_STATE_FOR_QUORUM_THREAD(validatorPubKey+'(POOL)_STORAGE_POOL')


    poolStorage.lackOfTotalPower=true

    poolStorage.stopCheckpointID=fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.HEADER.ID
    
    poolStorage.storedMetadata=fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA[validatorPubKey]


    //Remove from VALIDATORS array(to prevent be elected to quorum) and metadata

    delete fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA[validatorPubKey]

},




EXECUTE_SPECIAL_OPERATIONS_IN_NEW_CHECKPOINT = async (atomicBatch,fullCopyOfQuorumThreadWithNewCheckpoint) => {

    
    //_______________________________Perform SPEC_OPERATIONS_____________________________

    let workflowOptionsTemplate = {...fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS}
    
    SYMBIOTE_META.QUORUM_THREAD_CACHE.set('WORKFLOW_OPTIONS',workflowOptionsTemplate)
    
    // Structure is <poolID> => true if pool should be deleted
    SYMBIOTE_META.QUORUM_THREAD_CACHE.set('SLASH_OBJECT',{})
    

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

    let toRemovePools = [], promises = [], qtSubchains = Object.keys(fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA)


    for(let validator of qtSubchains){

        let promise = GET_FROM_STATE_FOR_QUORUM_THREAD(validator+'(POOL)_STORAGE_POOL').then(poolStorage=>{

            if(poolStorage.totalPower<fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS.VALIDATOR_STAKE) toRemovePools.push(validator)

        })

        promises.push(promise)

    }

    await Promise.all(promises.splice(0))
    
    //Now in toRemovePools we have IDs of pools which should be deleted from VALIDATORS
    
    let deleteValidatorsPoolsPromises=[]
    
    for(let address of toRemovePools){
    
        deleteValidatorsPoolsPromises.push(DELETE_POOLS_WHICH_HAVE_LACK_OF_STAKING_POWER(address,fullCopyOfQuorumThreadWithNewCheckpoint))
    
    }


    await Promise.all(deleteValidatorsPoolsPromises.splice(0))


    //________________________________Remove rogue pools_________________________________

    
    let slashObject = await GET_FROM_STATE_FOR_QUORUM_THREAD('SLASH_OBJECT')
    
    let slashObjectKeys = Object.keys(slashObject)
        

    for(let poolIdentifier of slashObjectKeys){
    
        //___________slashObject has the structure like this <pool> => true___________
    
        // Delete from DB
        atomicBatch.del(poolIdentifier+'(POOL)_STORAGE_POOL')

        // Remove from subchains
        delete fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA[poolIdentifier]
    
        // Remove from cache
        SYMBIOTE_META.QUORUM_THREAD_CACHE.delete(poolIdentifier+'(POOL)_STORAGE_POOL')

    }


    //Update the WORKFLOW_OPTIONS
    fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS={...workflowOptionsTemplate}

    SYMBIOTE_META.QUORUM_THREAD_CACHE.delete('WORKFLOW_OPTIONS')

    SYMBIOTE_META.QUORUM_THREAD_CACHE.delete('SLASH_OBJECT')


    //After all ops - commit state and make changes to workflow

    SYMBIOTE_META.QUORUM_THREAD_CACHE.forEach((value,recordID)=>{

        atomicBatch.put(recordID,value)

    })


},




//Use it to find checkpoints on hostchains, perform them and join to QUORUM by finding the latest valid checkpoint
START_QUORUM_THREAD_CHECKPOINT_TRACKER=async()=>{


    //_________________________________FIND THE NEXT CHECKPOINT AND EXECUTE SPECIAL_OPERATIONS INSTANTLY_________________________________

    
    let possibleCheckpoint = await HOSTCHAIN.MONITOR.GET_VALID_CHECKPOINT('QUORUM_THREAD').catch(_=>false)


    if(possibleCheckpoint){

        // We need it for changes
        let fullCopyOfQuorumThreadWithNewCheckpoint = JSON.parse(JSON.stringify(SYMBIOTE_META.QUORUM_THREAD))

        // Set the new checkpoint
        fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT = possibleCheckpoint

        // Store original checkpoint locally
        await SYMBIOTE_META.CHECKPOINTS.put(possibleCheckpoint.HEADER.PAYLOAD_HASH,possibleCheckpoint)

        // All operations must be atomic
        let atomicBatch = SYMBIOTE_META.QUORUM_THREAD_METADATA.batch()

        // Get the FullID of old checkpoint
        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID


        // Execute special operations from new checkpoint using our copy of QT and atomic handler
        await EXECUTE_SPECIAL_OPERATIONS_IN_NEW_CHECKPOINT(atomicBatch,fullCopyOfQuorumThreadWithNewCheckpoint)


        LOG(`\u001b[38;5;154mSpecial operations were executed for checkpoint \u001b[38;5;93m${possibleCheckpoint.HEADER.ID} ### ${possibleCheckpoint.HEADER.PAYLOAD_HASH} (QT)\u001b[0m`,'S')

        // Mark as completed
        fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.COMPLETED = true

        // Create new quorum based on new SUBCHAINS_METADATA state
        fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.QUORUM = GET_QUORUM(fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA,fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS)

        // Commit changes        
        atomicBatch.put('QT',fullCopyOfQuorumThreadWithNewCheckpoint)

        await atomicBatch.write()
            

        // Update the block height to keep progress on hostchain
        global.SKIP_PROCEDURE_STAGE_1_BLOCK = possibleCheckpoint.FOUND_AT_BLOCK
        global.SKIP_PROCEDURE_STAGE_2_BLOCK = possibleCheckpoint.FOUND_AT_BLOCK
    
    
        let nextQuorumThreadID = possibleCheckpoint.HEADER.PAYLOAD_HASH+possibleCheckpoint.HEADER.ID
    
        // Create new temporary db for the next checkpoint
        let nextTempDB = level(process.env.CHAINDATA_PATH+`/${nextQuorumThreadID}`,{valueEncoding:'json'})

        // Create mappings & set for the next checkpoint
        let nextTemporaryObject={

            SPECIAL_OPERATIONS_MEMPOOL:new Map(),

            COMMITMENTS:new Map(), 
            FINALIZATION_PROOFS:new Map(),

            CHECKPOINT_MANAGER:new Map(),
            CHECKPOINT_MANAGER_SYNC_HELPER:new Map(),
 
            SKIP_PROCEDURE_STAGE_1:new Set(),
            SKIP_PROCEDURE_STAGE_2:new Map(),

            PROOFS_REQUESTS:new Map(),
            PROOFS_RESPONSES:new Map(),
    
            HEALTH_MONITORING:new Map(), 
      
            DATABASE:nextTempDB
            
        }

        SYMBIOTE_META.QUORUM_THREAD = fullCopyOfQuorumThreadWithNewCheckpoint

        LOG(`QUORUM_THREAD was updated => \x1b[34;1m${SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID} ### ${SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH}`,'S')

        // Get the new ROOTPUB and delete the old one
        SYMBIOTE_META.STATIC_STUFF_CACHE.set('QT_ROOTPUB'+nextQuorumThreadID,bls.aggregatePublicKeys(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM))
    
        SYMBIOTE_META.STATIC_STUFF_CACHE.delete('QT_ROOTPUB'+qtPayload)


        //_______________________Check the version required for the next checkpoint________________________


        if(IS_MY_VERSION_OLD('QUORUM_THREAD')){

            LOG(`New version detected on QUORUM_THREAD. Please, upgrade your node software`,'W')

            console.log('\n')
            console.log(fs.readFileSync(PATH_RESOLVE('images/events/update.txt')).toString())
        
            // Stop the node to update the software
            GRACEFUL_STOP()

        }


        // Close & delete the old temporary db 
        await SYMBIOTE_META.TEMP.get(qtPayload).DATABASE.close()
        
        fs.rm(process.env.CHAINDATA_PATH+`/${qtPayload}`,{recursive:true},()=>{})
        
        SYMBIOTE_META.TEMP.delete(qtPayload)


        //________________________________ If it's fresh checkpoint and we present there as a member of quorum - then continue the logic ________________________________


        let checkpointIsFresh = CHECK_IF_THE_SAME_DAY(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.TIMESTAMP,GET_GMT_TIMESTAMP())

        let iAmInTheQuorum = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.includes(CONFIG.SYMBIOTE.PUB)

        let validatorsMetadata = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA


        if(checkpointIsFresh && iAmInTheQuorum){

            // Fill the checkpoints manager with the latest data

            let currentCheckpointManager = nextTemporaryObject.CHECKPOINT_MANAGER

            let currentCheckpointSyncHelper = nextTemporaryObject.CHECKPOINT_MANAGER_SYNC_HELPER

            Object.keys(validatorsMetadata).forEach(
            
                poolPubKey => {

                    currentCheckpointManager.set(poolPubKey,validatorsMetadata[poolPubKey])

                    currentCheckpointSyncHelper.set(poolPubKey,validatorsMetadata[poolPubKey])

                }

            )

        }

        // Set next temporary object by ID
        SYMBIOTE_META.TEMP.set(nextQuorumThreadID,nextTemporaryObject)

        //__________________________ Also, check if we was "skipped" to send the awakening special operation to POST /special_operations __________________________

        if(validatorsMetadata[CONFIG.SYMBIOTE.PUB]?.IS_STOPPED) START_AWAKENING_PROCEDURE()


        //Continue to find checkpoints
        setTimeout(START_QUORUM_THREAD_CHECKPOINT_TRACKER,0)


    }else{

        // Wait for the new checkpoint will appear on hostchain

        setTimeout(START_QUORUM_THREAD_CHECKPOINT_TRACKER,CONFIG.SYMBIOTE.POLLING_TIMEOUT_TO_FIND_CHECKPOINT_FOR_QUORUM_THREAD)    


    }


},




// Function for secured and a sequently update of CHECKPOINT_MANAGER and to prevent giving FINALIZATION_PROOFS when it's restricted. In general - function to avoid async problems
FINALIZATION_PROOFS_SYNCHRONIZER=async()=>{


    /* 
    
        [*] Here we update the values in DB and CHECKPOINT_MANAGER using values from CHECKPOINT_MANAGER_SYNC_HELPER
        
        [*] Also, take the finalization proof from PROOFS_REQUESTS, sign and push to PROOFS_RESPONSES

    */

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let currentTempObject = SYMBIOTE_META.TEMP.get(qtPayload)

    if(!currentTempObject){

        //Repeat this procedure after a while
        setTimeout(FINALIZATION_PROOFS_SYNCHRONIZER,1000)

        return

    }

    let currentCheckpointsManager = currentTempObject.CHECKPOINT_MANAGER // mapping( validatorID => {INDEX,HASH,(?)FINALIZATION_PROOF} )

    let currentCheckpointSyncHelper = currentTempObject.CHECKPOINT_MANAGER_SYNC_HELPER // mapping(subchainID=>{INDEX,HASH,FINALIZATION_PROOF})

    let currentFinalizationProofsRequests = currentTempObject.PROOFS_REQUESTS // mapping(blockID=>blockHash)

    let currentFinalizationProofsResponses = currentTempObject.PROOFS_RESPONSES // mapping(blockID=>SIG(blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+QT.CHECKPOINT.HEADER.ID))


    let currentSkipProcedureStage1Set = currentTempObject.SKIP_PROCEDURE_STAGE_1 // Set(subchainID)
   
    let currentSkipProcedureStage2Map = currentTempObject.SKIP_PROCEDURE_STAGE_2 // Map(subchain=>{INDEX,HASH})
   

    let currentCheckpointDB = currentTempObject.DATABASE // LevelDB instance


    let currentCheckpointSkipSpecialOperationsMempool = currentTempObject.SPECIAL_OPERATIONS_MEMPOOL // mapping(operationID=>{type,payload})


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


    // Here we should check if we still can generate proofs, so it's not time to generate checkpoint & SKIP_STAGE_2 proofs

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

            else if(keyValue[0].startsWith('SKIP_STAGE_2:')){

                // Generate signature for skip stage 2
                let {SUBCHAIN,INDEX,HASH} = keyValue[1]


                if(currentSkipProcedureStage1Set.has(SUBCHAIN)){

                    let signa = await BLS_SIGN_DATA(`SKIP_STAGE_2:${SUBCHAIN}:${INDEX}:${HASH}:${qtPayload}`)

                    currentFinalizationProofsResponses.set(keyValue[0],signa)
    
                    currentFinalizationProofsRequests.delete(keyValue[0])
    
                }

            }else{

                // Generate signature for finalization proofs

                let blockID = keyValue[0]
                
                let {hash,finalizationProof} = keyValue[1]
    
                let [subchain,index] = blockID.split(':')

                index=+index
    
                // We can't produce finalization proofs for subchains that are stopped
                if(currentSkipProcedureStage1Set.has(subchain)) continue

                // Put to responses
                currentFinalizationProofsResponses.set(blockID,await BLS_SIGN_DATA(blockID+hash+'FINALIZATION'+qtPayload))
    
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


    //____________________ GENERATE THE SKIP_PROCEDURE_STAGE_3 ____________________

    // Go through the data in currentSkipProcedureStage2Map and sign it. Put the signatures to PROOFS_RESPONSES

    for (let subchain of currentSkipProcedureStage2Map.keys()){

        let handler = currentSkipProcedureStage2Map.get(subchain)

        let sig = await BLS_SIGN_DATA(`SKIP_STAGE_3:${subchain}:${handler.INDEX}:${handler.HASH}:${qtPayload}`)

        //First of all - add to the mempool of special operations
        let operation = {

            type:'STOP_VALIDATOR',

            payload:{

                stop:true,
                subchain,
                index:handler.INDEX,
                hash:handler.HASH

            }

        }


        let operationID = BLAKE3(JSON.stringify(operation.payload))

        operation.id=operationID


          //Store to DB
          await USE_TEMPORARY_DB('put',currentCheckpointDB,'SPECIAL_OPERATION:'+subchain,operation).then(()=>{

            // Only after that we can add it to mempool and create stage_3 proof

            currentCheckpointSkipSpecialOperationsMempool.set(operationID,operation)

            currentFinalizationProofsResponses.set(`SKIP_STAGE_3:${subchain}`,sig)    

        }).catch(_=>{})

    
    }


    //Repeat this procedure permanently, but in sync mode
    setTimeout(FINALIZATION_PROOFS_SYNCHRONIZER,0)

},




SKIP_PROCEDURE_MONITORING_START=async()=>{

    let checkpointIsFresh = CHECK_IF_THE_SAME_DAY(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.TIMESTAMP,GET_GMT_TIMESTAMP())

    // No sense to find skip proofs if checkpoint is not fresh
    if(checkpointIsFresh){

        await HOSTCHAIN.MONITOR.GET_SKIP_PROCEDURE_STAGE_1_PROOFS().catch(_=>false)

        await HOSTCHAIN.MONITOR.GET_SKIP_PROCEDURE_STAGE_2_PROOFS().catch(_=>false)

    }

    setTimeout(SKIP_PROCEDURE_MONITORING_START,CONFIG.SYMBIOTE.SKIP_PROCEDURE_MONITORING)

},




// Once we've received 2/3N+1 signatures for checkpoint(HEADER,PAYLOAD) - we can start the next stage to get signatures to get another signature which will be valid for checkpoint
INITIATE_CHECKPOINT_STAGE_2_GRABBING=async(myCheckpoint,quorumMembersHandler)=>{

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let checkpointTemporaryDB = SYMBIOTE_META.TEMP.get(qtPayload).DATABASE

    if(!checkpointTemporaryDB) return


    myCheckpoint ||= await USE_TEMPORARY_DB('get',checkpointTemporaryDB,'CHECKPOINT').catch(_=>false)

    quorumMembersHandler ||= await GET_VALIDATORS_URLS(true)

    
    //_____________________ Go through the quorum and share our pre-signed object with checkpoint payload and issuer proof____________________

    /*
    
        We should send the following object to the POST /checkpoint_stage_2

        {
            CHECKPOINT_FINALIZATION_PROOF:{

                aggregatedPub:<2/3N+1 from QUORUM>,
                aggregatedSigna:<SIG(PAYLOAD_HASH)>,
                afkValidators:[]

            }

            ISSUER_PROOF:SIG(ISSUER+PAYLOAD_HASH)

            CHECKPOINT_PAYLOAD:{

                ISSUER:<BLS pubkey of checkpoint grabbing initiator>
            
                PREV_CHECKPOINT_PAYLOAD_HASH: SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,
            
                SUBCHAINS_METADATA: {
                
                    '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {INDEX,HASH,IS_STOPPED}

                    /..other data
            
                },
        
                OPERATIONS: GET_SPEC_EVENTS(),
                OTHER_SYMBIOTES: {}
    
            }

        }
    
    */


    // Structure is {CHECKPOINT_FINALIZATION_PROOF,ISSUER_PROOF,CHECKPOINT_PAYLOAD}
    let everythingAtOnce={
            
        CHECKPOINT_FINALIZATION_PROOF:{

            aggregatedPub:myCheckpoint.HEADER.QUORUM_AGGREGATED_SIGNERS_PUBKEY,
            aggregatedSignature:myCheckpoint.HEADER.QUORUM_AGGREGATED_SIGNATURE,
            afkValidators:myCheckpoint.HEADER.AFK_VALIDATORS

        },

        ISSUER_PROOF:await BLS_SIGN_DATA(CONFIG.SYMBIOTE.PUB+myCheckpoint.HEADER.PAYLOAD_HASH),

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

        myCheckpoint.HEADER.AFK_VALIDATORS=SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.filter(pubKey=>!otherAgreements.has(pubKey))


        //Store time tracker to DB
        await USE_TEMPORARY_DB('put',checkpointTemporaryDB,'CHECKPOINT_TIME_TRACKER',GET_GMT_TIMESTAMP()).catch(_=>false)

        //Send the header to hostchain
        await HOSTCHAIN.CONNECTOR.makeCheckpoint(myCheckpoint.HEADER).catch(error=>LOG(`Some error occured during the process of checkpoint commit => ${error}`))

                 
    }

},




CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT=async()=>{


    //__________________________ If we've runned the second stage - skip the code below __________________________

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let temporaryObject = SYMBIOTE_META.TEMP.get(qtPayload)

    if(!temporaryObject){

        setTimeout(CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT,3000)

        return

    }

    let quorumRootPub = SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload)

    let timestamp = await USE_TEMPORARY_DB('get',temporaryObject.DATABASE,`CHECKPOINT_TIME_TRACKER`).catch(_=>false)

    let myPotentialCheckpoint = await USE_TEMPORARY_DB('get',temporaryObject.DATABASE,`CHECKPOINT`).catch(_=>false)



    if(timestamp && timestamp + CONFIG.SYMBIOTE.TIME_TRACKER.COMMIT > GET_GMT_TIMESTAMP()){

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
            
            PREV_CHECKPOINT_PAYLOAD_HASH: SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,
            
            SUBCHAINS_METADATA: {
                
                '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {INDEX,HASH,IS_STOPPED}

                /..other data
            
            },
            OPERATIONS: GET_SPEC_EVENTS(),
            OTHER_SYMBIOTES: {}
        
        }

        To sign it => SIG(BLAKE3(JSON.stringify(<PROPOSED>)))
    
    */


    let canProposeCheckpoint = await HOSTCHAIN.MONITOR.CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT(),

        iAmInTheQuorum = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.includes(CONFIG.SYMBIOTE.PUB),

        checkpointIsFresh = CHECK_IF_THE_SAME_DAY(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.TIMESTAMP,GET_GMT_TIMESTAMP())



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

            ISSUER:CONFIG.SYMBIOTE.PUB,

            PREV_CHECKPOINT_PAYLOAD_HASH:SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,

            SUBCHAINS_METADATA:{},

            OPERATIONS:GET_SPEC_EVENTS(qtPayload),

            OTHER_SYMBIOTES:{} //don't need now

        }

        Object.keys(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA).forEach(
            
            poolPubKey => {

                let {INDEX,HASH} = temporaryObject.CHECKPOINT_MANAGER.get(poolPubKey) //{INDEX,HASH,(?)FINALIZATION_PROOF}

                let {IS_STOPPED} = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA[poolPubKey] //move the status from the current checkpoint. If "STOP_VALIDATOR" operations will exists in special operations array - than this status will be changed

                potentialCheckpointPayload.SUBCHAINS_METADATA[poolPubKey] = {INDEX,HASH,IS_STOPPED}

            }

        )


        let otherAgreements = new Map()


        //________________________________________ Exchange with other quorum members ________________________________________

        let quorumMembers = await GET_VALIDATORS_URLS(true)

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

                            let {aggregatedSignature,aggregatedPub,afkValidators} = updateOp.finalizationProof
    
                            let signaIsOk = await bls.singleVerify(updateOp.subchain+":"+updateOp.index+updateOp.hash+qtPayload,aggregatedPub,aggregatedSignature).catch(_=>false)
        
                            try{

                                let rootPubIsOK = quorumRootPub === bls.aggregatePublicKeys([aggregatedPub,...afkValidators])
        
        
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

                    ID:SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID+1,
        
                    PAYLOAD_HASH:checkpointPayloadHash,
        
                    QUORUM_AGGREGATED_SIGNERS_PUBKEY:bls.aggregatePublicKeys(pubKeys),
        
                    QUORUM_AGGREGATED_SIGNATURE:bls.aggregateSignatures(signatures),
        
                    AFK_VALIDATORS:SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.filter(pubKey=>!otherAgreements.has(pubKey))
        
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




RUN_FINALIZATION_PROOFS_GRABBING = async (qtPayload,blockID) => {


    let block = await SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>false)

    let blockHash = Block.genHash(block)

    if(!SYMBIOTE_META.TEMP.has(qtPayload)) return


    let {COMMITMENTS,FINALIZATION_PROOFS,DATABASE} = SYMBIOTE_META.TEMP.get(qtPayload)


    //Create the mapping to get the FINALIZATION_PROOFs from the quorum members. Inner mapping contains voterValidatorPubKey => his FINALIZATION_PROOF   
    
    FINALIZATION_PROOFS.set(blockID,new Map())

    let finalizationProofsMapping = FINALIZATION_PROOFS.get(blockID)

    let aggregatedCommitments = COMMITMENTS.get(blockID) //voterValidatorPubKey => his commitment 


    let optionsToSend = {method:'POST',body:JSON.stringify(aggregatedCommitments)},

        quorumMembers = await GET_VALIDATORS_URLS(true),

        majority = GET_MAJORITY('QUORUM_THREAD'),

        promises=[]


    if(finalizationProofsMapping.size<majority){

        //Descriptor is {url,pubKey}
        for(let descriptor of quorumMembers){

            // No sense to get the commitment if we already have
            if(finalizationProofsMapping.has(descriptor.pubKey)) continue
    
    
            let promise = fetch(descriptor.url+'/finalization',optionsToSend).then(r=>r.text()).then(async possibleFinalizationProof=>{
                
                let finalProofIsOk = await bls.singleVerify(blockID+blockHash+'FINALIZATION'+qtPayload,descriptor.pubKey,possibleFinalizationProof).catch(_=>false)
    
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
        // Also, increase the counter of SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER') to move to the next block and udpate the hash
    
        let signers = [...finalizationProofsMapping.keys()]

        let signatures = [...finalizationProofsMapping.values()]

        let afkValidators = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.filter(pubKey=>!signers.includes(pubKey))


        /*
        
        Aggregated version of FINALIZATION_PROOFs (it's SUPER_FINALIZATION_PROOF)
        
        {
        
            blockID:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

            blockHash:"0123456701234567012345670123456701234567012345670123456701234567",
        
            aggregatedPub:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP",

            aggregatedSigna:"kffamjvjEg4CMP8VsxTSfC/Gs3T/MgV1xHSbP5YXJI5eCINasivnw07f/lHmWdJjC4qsSrdxr+J8cItbWgbbqNaM+3W4HROq2ojiAhsNw6yCmSBXl73Yhgb44vl5Q8qD",

            afkValidators:[]

        }
    

        */

        let superFinalizationProof = {

            blockID,
            
            blockHash,
            
            aggregatedPub:bls.aggregatePublicKeys(signers),
            
            aggregatedSignature:bls.aggregateSignatures(signatures),
            
            afkValidators

        }

        //Share here
        BROADCAST('/super_finalization',superFinalizationProof)

        await USE_TEMPORARY_DB('put',DATABASE,'SFP:'+blockID,superFinalizationProof).catch(_=>false)

        // Repeat procedure for the next block and store the progress

        let appropriateDescriptor = SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

        await USE_TEMPORARY_DB('put',DATABASE,'BLOCK_SENDER_HANDLER',appropriateDescriptor).catch(_=>false)

        appropriateDescriptor.height++

    }

},




RUN_COMMITMENTS_GRABBING = async (qtPayload,blockID) => {


    let block = await SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>false)

    // Check for this block after a while
    if(!block) return


    let blockHash = Block.genHash(block)



    let optionsToSend = {method:'POST',body:JSON.stringify(block)},

        commitmentsMapping = SYMBIOTE_META.TEMP.get(qtPayload).COMMITMENTS,
        
        majority = GET_MAJORITY('QUORUM_THREAD'),

        quorumMembers = await GET_VALIDATORS_URLS(true),

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

                let commitmentIsOk = await bls.singleVerify(blockID+blockHash+qtPayload,descriptor.pubKey,possibleCommitment).catch(_=>false)
    
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

        let afkValidators = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.filter(pubKey=>!signers.includes(pubKey))


        /*
        
        Aggregated version of commitments

        {
        
            blockID:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

            blockHash:"0123456701234567012345670123456701234567012345670123456701234567",
        
            aggregatedPub:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP",

            aggregatedSigna:"kffamjvjEg4CMP8VsxTSfC/Gs3T/MgV1xHSbP5YXJI5eCINasivnw07f/lHmWdJjC4qsSrdxr+J8cItbWgbbqNaM+3W4HROq2ojiAhsNw6yCmSBXl73Yhgb44vl5Q8qD",

            afkValidators:[]

        }
    

        */

        let aggregatedCommitments = {

            blockID,
            
            blockHash,
            
            aggregatedPub:bls.aggregatePublicKeys(signers),
            
            aggregatedSignature:bls.aggregateSignatures(signatures),
            
            afkValidators

        }

        //Set the aggregated version of commitments to start to grab FINALIZATION_PROOFS
        commitmentsMapping.set(blockID,aggregatedCommitments)
    
        await RUN_FINALIZATION_PROOFS_GRABBING(qtPayload,blockID).catch(_=>{})

    }

},




SEND_BLOCKS_AND_GRAB_COMMITMENTS = async () => {


    // If we don't generate the blocks - skip this function
    if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA[CONFIG.SYMBIOTE.PUB]){

        setTimeout(SEND_BLOCKS_AND_GRAB_COMMITMENTS,3000)

        return

    }

    // Descriptor has the following structure - {checkpointID,height}
    let appropriateDescriptor = SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH + SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    if(!SYMBIOTE_META.TEMP.has(qtPayload)){

        setTimeout(SEND_BLOCKS_AND_GRAB_COMMITMENTS,3000)

        return

    }


    let {FINALIZATION_PROOFS,DATABASE} = SYMBIOTE_META.TEMP.get(qtPayload)


    if(!appropriateDescriptor || appropriateDescriptor.checkpointID !== SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID){

        //If we still works on the old checkpoint - continue
        //Otherwise,update the latest height/hash and send them to the new QUORUM
        appropriateDescriptor = await USE_TEMPORARY_DB('get',DATABASE,'BLOCK_SENDER_HANDLER').catch(_=>false)

        if(!appropriateDescriptor){

            let myLatestFinalizedHeight = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA[CONFIG.SYMBIOTE.PUB].INDEX+1

            appropriateDescriptor = {
    
                checkpointID:SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID,
    
                height:myLatestFinalizedHeight
    
            }
    
        }
        
        // And store new descriptor(till it will be old)
        SYMBIOTE_META.STATIC_STUFF_CACHE.set('BLOCK_SENDER_HANDLER',appropriateDescriptor)

    }


    let blockID = CONFIG.SYMBIOTE.PUB+':'+appropriateDescriptor.height


    if(FINALIZATION_PROOFS.has(blockID)){

        //This option means that we already started to share aggregated 2/3N+1 commitments and grab 2/3+1 FINALIZATION_PROOFS
        await RUN_FINALIZATION_PROOFS_GRABBING(qtPayload,blockID).catch(_=>{})

    }else{

        // This option means that we already started to share block and going to find 2/3N+1 commitments
        // Once we get it - aggregate it and start finalization proofs grabbing(previous option)

        await RUN_COMMITMENTS_GRABBING(qtPayload,blockID).catch(_=>{})

    }

    setTimeout(SEND_BLOCKS_AND_GRAB_COMMITMENTS,0)

},




// This function is oriented on founded & valid SKIP_PROCEDURE_STAGE_1 proofs and starts SKIP_PROCEDURE_STAGE_2 - to grab appropriate proofs, aggregate and publish to hostchain to finally skip the subchain 
SKIP_PROCEDURE_STAGE_2=async()=>{

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let reverseThreshold = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.QUORUM_SIZE-GET_MAJORITY('QUORUM_THREAD')

    let qtRootPub=SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload)

    let temporaryObject = SYMBIOTE_META.TEMP.get(qtPayload)

    let validatorsURLsAndPubKeys = await GET_VALIDATORS_URLS(true)

    
    if(!temporaryObject) return


    for(let subchain of temporaryObject.SKIP_PROCEDURE_STAGE_1){

        let skipStage3Handler = await USE_TEMPORARY_DB('get',temporaryObject.DATABASE,'SKIP_STAGE_3:'+subchain).catch(_=>false)

        //No sense to do this procedure for subchain which is already skipped
        if(skipStage3Handler || temporaryObject.SKIP_PROCEDURE_STAGE_2.has(subchain)) continue


        //Also, no sense to perform this procedure for subchains which were recently skipped(by the second stage)
        let timestamp = await USE_TEMPORARY_DB('get',temporaryObject.DATABASE,'TIME_TRACKER_SKIP_STAGE_2_'+subchain).catch(_=>false)


        if(timestamp && timestamp + CONFIG.SYMBIOTE.TIME_TRACKER.SKIP_STAGE_2 > GET_GMT_TIMESTAMP()){
    
            continue
    
        }
        
        //Delete the time tracker
        await USE_TEMPORARY_DB('del',temporaryObject.DATABASE,'TIME_TRACKER_SKIP_STAGE_2_'+subchain).catch(_=>{})
        

        let localFinalizationHandler = temporaryObject.CHECKPOINT_MANAGER.get(subchain)

        let localFinalizationHandlerSyncHelper = temporaryObject.CHECKPOINT_MANAGER_SYNC_HELPER.get(subchain)
        
        /*
            
            Send this to POST /skip_procedure_stage_2

            {
                subchain:<ID>
                height:<block index of this subchain on which we're going to skip>
                hash:<block hash>
            }
            

        */

        let payload={
            
            subchain,
            height:localFinalizationHandler.INDEX,
            hash:localFinalizationHandler.HASH,
            finalizationProof:localFinalizationHandler.FINALIZATION_PROOF
        
        }

        let sendOptions={
        
            method:'POST',
            body:JSON.stringify(payload)
        
        }

            
        //_____________________ Now, go through the quorum members and try to get updates from them or get signatures for SKIP_PROCEDURE_PART_2 _____________________
        // We'll potentially need it in code below
        let signaturesForAggregation = [], pubKeysForAggregation = []
        
        
        for(let validatorHandler of validatorsURLsAndPubKeys){
        
            let answerFromValidator = await fetch(validatorHandler.url+'/skip_procedure_stage_2',sendOptions).then(r=>r.json()).catch(_=>'<>')
        
            /*
            
                Potential answer might be
            
                {status:'NOT_FOUND'}        OR          {status:'SKIP_STAGE_2',sig:SIG(`SKIP_STAGE_2:${subchain}:${INDEX}:${HASH}:${qtPayload}`)}     OR      {status:'UPDATE',data:{INDEX,HASH,FINALIZATION_PROOF}}
            
            */
        
            if(answerFromValidator.status==='UPDATE' && typeof answerFromValidator.data === 'object' && typeof answerFromValidator.data.FINALIZATION_PROOF === 'object'){
            
                // In this case it means that validator we've requested has higher version of subchain and a FINALIZATION_PROOF for it, so we just accept it if verification is ok and break the cycle
                let {INDEX,HASH} = answerFromValidator.data
            
                let {aggregatedPub,aggregatedSignature,afkValidators} = answerFromValidator.data.FINALIZATION_PROOF
            
                let data = subchain+':'+INDEX+HASH+qtPayload
            
                let finalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkValidators,qtRootPub,data,aggregatedSignature,reverseThreshold).catch(_=>false)
    
            
                if(finalizationProofIsOk && localFinalizationHandlerSyncHelper.INDEX < INDEX){
            
                    // Update the local version in CHECKPOINT_MANAGER
                    
                    localFinalizationHandlerSyncHelper.INDEX = INDEX
                    
                    localFinalizationHandlerSyncHelper.HASH = HASH
                    
                    localFinalizationHandlerSyncHelper.FINALIZATION_PROOF = {aggregatedPub,aggregatedSignature,afkValidators}
                    
                    // And break the cycle for this subchain-candidate
                    
                    break
    
                }
    
            }else if(answerFromValidator.status==='SKIP_STAGE_2' && await BLS_VERIFY(`SKIP_STAGE_2:${subchain}:${localFinalizationHandler.INDEX}:${localFinalizationHandler.HASH}:${qtPayload}`,answerFromValidator.sig,validatorHandler.pubKey).catch(_=>false)){

                // Grab the skip agreements to publish to hostchains

                signaturesForAggregation.push(answerFromValidator.sig)

                pubKeysForAggregation.push(validatorHandler.pubKey)

            }
    
        }


        //______________________ On this step, hense we haven't break, we have a skip agreements in arrays ______________________

        if(pubKeysForAggregation.length >= GET_MAJORITY('QUORUM_THREAD')){

            /*
                
                We can aggregate this agreements and publish to hostchain as a signal to skip the subchain and finish the SKIP_PROCEDURE_STAGE_2

                We need to build the following template

                {
                    subchain:'<pubkey of subchain that we're going to skip>,
                    index:<latest block index that majority have voted for, but we can't get the index+1 block, that's why-skip>
                    hash:<hash of appropriate block>
                
                    aggregatedPub:'7fJo5sUy3pQBaFrVGHyQA2Nqz2APpd7ZBzvoXSHWTid5CJcqskQuc428fkWqunDuDu',
                    aggregatedSigna:SIG(`SKIP_STAGE_2:<SUBCHAIN>:<INDEX>:<HASH>:<QT.CHECKPOINT.HEADER.PAYLOAD_HASH>:<QT.CHECKPOINT.HEADER.ID>`)
                    afk:[]
                }
    
            */

            let aggregatedSignature = bls.aggregateSignatures(signaturesForAggregation)
                
            let aggregatedPub = bls.aggregatePublicKeys(pubKeysForAggregation)

            let afkValidators = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.filter(pubKey=>!pubKeysForAggregation.includes(pubKey))


            let templateForSkipProcedureStage2 = {

                subchain,
                index:localFinalizationHandler.INDEX,
                hash:localFinalizationHandler.HASH,

                aggregatedPub,
                aggregatedSignature,
                afkValidators

            }

            //Add time tracker for event
      
            await USE_TEMPORARY_DB('put',temporaryObject.DATABASE,'TIME_TRACKER_SKIP_STAGE_2_'+subchain,GET_GMT_TIMESTAMP()).then(()=>

                //Send to hostchain proof for SKIP_PROCEDURE_STAGE_2
                HOSTCHAIN.CONNECTOR.skipProcedure(templateForSkipProcedureStage2)

            ).catch(error=>LOG(`Error occured during SKIP_PROCEDURE_STAGE_1 for subchain ${subchain} => ${error}`,'W'))
                
        }

        // Otherwise - do nothing and waiting for the next time

    }


},




//Function to monitor the available block creators
SUBCHAINS_HEALTH_MONITORING=async()=>{

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

    if(!tempObject){

        setTimeout(SUBCHAINS_HEALTH_MONITORING,CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return

    }

    let reverseThreshold = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.QUORUM_SIZE-GET_MAJORITY('QUORUM_THREAD')

    let qtRootPub = SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload)

    let proofsRequests = tempObject.PROOFS_REQUESTS

    let skipStage1Set = tempObject.SKIP_PROCEDURE_STAGE_1

    let isCheckpointStillFresh = CHECK_IF_THE_SAME_DAY(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.TIMESTAMP,GET_GMT_TIMESTAMP())



    if(tempObject.HEALTH_MONITORING.size===0){

        // Fill the HEALTH_MONITORING mapping with the latest known values
        // Structure is SubchainID => {LAST_SEEN,INDEX,HASH,SUPER_FINALIZATION_PROOF:{aggregatedPub,aggregatedSig,afkValidators}}

        let LAST_SEEN = GET_GMT_TIMESTAMP()

        for(let pubKey of tempObject.CHECKPOINT_MANAGER.keys()){

            let {INDEX,HASH}=tempObject.CHECKPOINT_MANAGER.get(pubKey)

            let baseBlockID = pubKey+":"+INDEX

            let SUPER_FINALIZATION_PROOF = await USE_TEMPORARY_DB('get',tempObject.DATABASE,'SFP:'+baseBlockID).catch(_=>false)
            
        
            //Store to mapping
            tempObject.HEALTH_MONITORING.set(pubKey,{LAST_SEEN,INDEX,HASH,SUPER_FINALIZATION_PROOF})

        }

        setTimeout(SUBCHAINS_HEALTH_MONITORING,CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return

    }



    // If we're not in quorum or checkpoint is outdated - don't start health monitoring
    if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.includes(CONFIG.SYMBIOTE.PUB) || proofsRequests.has('NEXT_CHECKPOINT') || !isCheckpointStillFresh){

        //If we're not in quorum - no sense to do this procedure. Just repeat the same procedure later

        setTimeout(SUBCHAINS_HEALTH_MONITORING,CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return

    }



    // Get the appropriate pubkey & url to check and validate the answer
    let subchainsURLAndPubKey = await GET_VALIDATORS_URLS(true)

    let proofsPromises = []

    let candidatesForAnotherCheck = []


    
    for(let handler of subchainsURLAndPubKey){
        
        let metadataOfCurrentSubchain = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA[handler.pubKey]


        //No sense to get the health of pool which has been stopped or SKIP_PROCEDURE_STAGE_1 was initiated
        if(metadataOfCurrentSubchain.IS_STOPPED || skipStage1Set.has(handler.pubKey)) continue


        let responsePromise = fetch(handler.url+'/health').then(r=>r.json()).then(r=>{

            r.pubKey = handler.pubKey

            return r

        }).catch(_=>{candidatesForAnotherCheck.push(handler.pubKey)})

        proofsPromises.push(responsePromise)

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
            
                aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+QT.CHECKPOINT.HEADER.ID
                aggregatedPub:<>,
                afkValidators
        
            }
      
        }
    
    */



    for(let answer of healthCheckPingbacks){


        if(typeof answer !== 'object' || typeof answer.superFinalizationProof !== 'object'){

            candidatesForAnotherCheck.push(answer.pubKey)

            continue
        }

        let {aggregatedPub,aggregatedSignature,afkValidators} = answer.superFinalizationProof

        let {latestFullyFinalizedHeight,latestHash,pubKey} = answer


        // Received {LAST_SEEN,INDEX,HASH,SUPER_FINALIZATION_PROOF}
        let localHealthHandler = tempObject.HEALTH_MONITORING.get(pubKey)

        // blockID+hash+'FINALIZATION'+qtPayload
        let data = pubKey+':'+latestFullyFinalizedHeight+latestHash+'FINALIZATION'+qtPayload

        let superFinalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkValidators,qtRootPub,data,aggregatedSignature,reverseThreshold).catch(_=>false)

        //If signature is ok and index is bigger than we have - update the LAST_SEEN time and set new height/hash/superFinalizationProof

        if(superFinalizationProofIsOk && localHealthHandler.INDEX < latestFullyFinalizedHeight){

            localHealthHandler.LAST_SEEN = GET_GMT_TIMESTAMP()

            localHealthHandler.INDEX = latestFullyFinalizedHeight

            localHealthHandler.HASH = latestHash

            localHealthHandler.SUPER_FINALIZATION_PROOF = {aggregatedPub,aggregatedSignature,afkValidators}

        }else candidatesForAnotherCheck.push(pubKey)
        
    }

    //______ ON THIS STEP - in <candidatesForAnotherCheck> we have subchains that required to be asked via other quorum members and probably start a SKIP_PROCEDURE_STAGE_1 _______

    // Create the random session seed to ask another quorum members

    let session = GET_RANDOM_BYTES_AS_HEX(32)

    let currentTime = GET_GMT_TIMESTAMP()

    let afkLimit = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.SUBCHAIN_AFK_LIMIT

    let checkpointTemporaryDB = SYMBIOTE_META.TEMP.get(qtPayload).DATABASE


    if(!checkpointTemporaryDB){

        setTimeout(SUBCHAINS_HEALTH_MONITORING,CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return
    }


    let validatorsURLSandPubKeys = await GET_VALIDATORS_URLS(true)


    for(let candidate of candidatesForAnotherCheck){

        let timestamp = await USE_TEMPORARY_DB('get',checkpointTemporaryDB,'TIME_TRACKER_SKIP_STAGE_1_'+candidate).catch(_=>false)

        if(timestamp && timestamp + CONFIG.SYMBIOTE.TIME_TRACKER.SKIP_STAGE_1 > GET_GMT_TIMESTAMP()){
    
            continue
    
        }
        
        //Delete the time tracker
        await USE_TEMPORARY_DB('del',checkpointTemporaryDB,'TIME_TRACKER_SKIP_STAGE_1_'+candidate).catch(_=>{})
    

        //Check if LAST_SEEN is too old. If it's still ok - do nothing(assume that the /health request will be successful next time)

        let localHealthHandler = tempObject.HEALTH_MONITORING.get(candidate)


        if(currentTime-localHealthHandler.LAST_SEEN >= afkLimit){

            /*
            
                Send this to POST /skip_procedure_stage_1

                {
                
                    session:<32-bytes random hex session ID>,
                    initiator:<BLS pubkey of quorum member who initiated skip procedure>,
                    requestedSubchain:<BLS pubkey of subchain that initiator wants to get latest info about>,
                    height:<block height of subchain on which initiator stopped>
                    sig:SIG(session+requestedSubchain+height+qtPayload)
    
                }
            
            */

            let payload={
                
                session,
                
                initiator:CONFIG.SYMBIOTE.PUB,
                
                requestedSubchain:candidate,

                height:localHealthHandler.INDEX,
                
                sig:await BLS_SIGN_DATA(session+candidate+localHealthHandler.INDEX+qtPayload)
            
            }

            let sendOptions={

                method:'POST',

                body:JSON.stringify(payload)

            }

            
            //_____________________ Now, go through the quorum members and try to get updates from them or get signatures for SKIP_PROCEDURE_PART_1 _____________________

            // We'll potentially need it in code below
            let signaturesForAggregation = [], pubKeysForAggregation = []



            for(let validatorHandler of validatorsURLSandPubKeys){

                let answerFromValidator = await fetch(validatorHandler.url+'/skip_procedure_stage_1',sendOptions).then(r=>r.json()).catch(_=>'<>')

                /*
                
                    Potential answer might be
                
                    {status:'OK'}        OR          {status:'SKIP',sig:SIG('SKIP_STAGE_1'+session+requestedSubchain+initiator+qtPayload)}     OR      {status:'UPDATE',data:{INDEX,HASH,SUPER_FINALIZATION_PROOF}}
                
                */

                if(answerFromValidator.status==='UPDATE' && typeof answerFromValidator.data === 'object' && typeof answerFromValidator.data.SUPER_FINALIZATION_PROOF === 'object'){

                    // In this case it means that validator we've requested has higher version of subchain, so we just accept it(if SUPER_FINALIZATION_PROOF verification is ok) and break the cycle

                    let {INDEX,HASH} = answerFromValidator.data

                    let {aggregatedPub,aggregatedSignature,afkValidators} = answerFromValidator.data.SUPER_FINALIZATION_PROOF

                    let data = candidate+':'+INDEX+HASH+'FINALIZATION'+qtPayload

                    let superFinalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkValidators,qtRootPub,data,aggregatedSignature,reverseThreshold).catch(_=>false)


                    if(superFinalizationProofIsOk && localHealthHandler.INDEX < INDEX){

                        // Update the local version in HEALTH_MONITORING

                        localHealthHandler.LAST_SEEN = GET_GMT_TIMESTAMP()

                        localHealthHandler.INDEX = INDEX

                        localHealthHandler.HASH = HASH

                        localHealthHandler.SUPER_FINALIZATION_PROOF = {aggregatedPub,aggregatedSignature,afkValidators}


                        // And break the cycle for this subchain-candidate
                        break

                    }

                }else if(answerFromValidator.status==='SKIP' && await BLS_VERIFY('SKIP_STAGE_1'+session+candidate+CONFIG.SYMBIOTE.PUB+qtPayload,answerFromValidator.sig,validatorHandler.pubKey).catch(_=>false)){

                    // Grab the skip agreements to publish to hostchains

                    signaturesForAggregation.push(answerFromValidator.sig)

                    pubKeysForAggregation.push(validatorHandler.pubKey)

                }

            }


            //______________________ On this step, hense we haven't break, we have a skip agreements in arrays ______________________

            if(pubKeysForAggregation.length >= GET_MAJORITY('QUORUM_THREAD')){

                /*
                
                    We can aggregate this agreements and publish to hostchain as a signal to start SKIP_PROCEDURE_STAGE_2

                    We need to build the following template

                    {
                        session:'0123456701234567012345670123456701234567012345670123456701234567',
                        subchain:'7dNmJLXWf2UUDK5S5KdTKWMoGaG3teqSgGz5oGN3q33eRP1erTZB6QaV8ifJvmoV3X',
            
                        sig:<signature by initiator to proof that "YES,I've grabbed this agreements and we(the quorum majority) is really want to exclude this subchain from verification process". SIG(session+session)>
                        initiator:<Your pubkey to verify this signature>

                        aggregatedPub:'7fJo5sUy3pQBaFrVGHyQA2Nqz2APpd7ZBzvoXSHWTid5CJcqskQuc428fkWqunDuDu',
                        aggregatedSigna:SIG('SKIP_STAGE_1'+session+requestedSubchain+initiator),
                        afk:[<array of afk from quorum>]
                    }

                */

                let aggregatedSignature = bls.aggregateSignatures(signaturesForAggregation)
                
                let aggregatedPub = bls.aggregatePublicKeys(pubKeysForAggregation)

                let afkValidators = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.filter(pubKey=>!pubKeysForAggregation.includes(pubKey))


                let templateForSkipProcedureStage1 = {

                    session,
                    subchain:candidate,
                
                    sig:await BLS_SIGN_DATA(session+session),
                    initiator:CONFIG.SYMBIOTE.PUB,
                    
                    aggregatedPub,
                    aggregatedSignature,
                    afkValidators

                }



                //Add time tracker for event
                await USE_TEMPORARY_DB('put',checkpointTemporaryDB,'TIME_TRACKER_SKIP_STAGE_1_'+candidate,GET_GMT_TIMESTAMP()).then(()=>

                    //Send to hostchain
                    HOSTCHAIN.CONNECTOR.skipProcedure(templateForSkipProcedureStage1)

                ).catch(error=>LOG(`Error occured during SKIP_PROCEDURE_STAGE_1 for subchain ${candidate} => ${error}`,'W'))

                
            }

            // Otherwise - do nothing

        }


    }


    setTimeout(SUBCHAINS_HEALTH_MONITORING,CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

    SKIP_PROCEDURE_STAGE_2().catch(_=>{})

},




RESTORE_STATE=async()=>{

    let validatorsMetadata = Object.keys(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA)

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

    
    for(let poolPubKey of validatorsMetadata){

        // If this value is related to the current checkpoint - set to manager, otherwise - take from the SUBCHAINS_METADATA as a start point
        // Returned value is {INDEX,HASH,(?)FINALIZATION_PROOF}

        let {INDEX,HASH,FINALIZATION_PROOF} = await tempObject.DATABASE.get(poolPubKey).catch(_=>false) || SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA[poolPubKey]

        
        tempObject.CHECKPOINT_MANAGER.set(poolPubKey,{INDEX,HASH,FINALIZATION_PROOF})
        
        tempObject.CHECKPOINT_MANAGER_SYNC_HELPER.set(poolPubKey,{INDEX,HASH,FINALIZATION_PROOF})


        //______________________________ SKIP_PROCEDURE functionality ______________________________

        let skipStage1Proof = await tempObject.DATABASE.get('SKIP_STAGE_1:'+poolPubKey).catch(_=>false) // true / false

        let skipStage2Proof = await tempObject.DATABASE.get('SKIP_STAGE_2:'+poolPubKey).catch(_=>false) // {INDEX,HASH} / false

        
        if(skipStage1Proof) tempObject.SKIP_PROCEDURE_STAGE_1.add(poolPubKey)
        
        if(skipStage2Proof) tempObject.SKIP_PROCEDURE_STAGE_2.set(poolPubKey,skipStage2Proof)


        let skipOperationRelatedToThisPool = await tempObject.DATABASE.get('SPECIAL_OPERATION:'+poolPubKey).catch(_=>false)

        if(skipOperationRelatedToThisPool){

            //Store to mempool of special operations
            
            tempObject.SPECIAL_OPERATIONS_MEMPOOL.set(skipOperationRelatedToThisPool.id,skipOperationRelatedToThisPool)

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




export let GENERATE_PHANTOM_BLOCKS_PORTION = async() => {


    //Safe "if" branch to prevent unnecessary blocks generation
    if(!SYMBIOTE_META.VERIFICATION_THREAD.SUBCHAINS_METADATA[CONFIG.SYMBIOTE.PUB]) return


    let myVerificationThreadStats = SYMBIOTE_META.VERIFICATION_THREAD.SUBCHAINS_METADATA[CONFIG.SYMBIOTE.PUB]



    //!Here check the difference between VT and GT(VT_GT_NORMAL_DIFFERENCE)
    //Set VT_GT_NORMAL_DIFFERENCE to 0 if you don't need any limits

    if(CONFIG.SYMBIOTE.VT_GT_NORMAL_DIFFERENCE && myVerificationThreadStats.INDEX+CONFIG.SYMBIOTE.VT_GT_NORMAL_DIFFERENCE < SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX){

        LOG(`Block generation skipped because GT is faster than VT. Increase \u001b[38;5;157m<VT_GT_NORMAL_DIFFERENCE>\x1b[36;1m if you need`,'I',CONFIG.SYMBIOTE.SYMBIOTE_ID)

        return

    }
    
    
    /*

    _________________________________________GENERATE PORTION OF BLOCKS___________________________________________
    
    Here we check how many transactions(events) we have locally and generate as many blocks as it's possible
    
    */


    let phantomBlocksNumber=Math.ceil(SYMBIOTE_META.MEMPOOL.length/CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.EVENTS_LIMIT_PER_BLOCK)

    //DEBUG
    phantomBlocksNumber++

    //If nothing to generate-then no sense to generate block,so return
    if(phantomBlocksNumber===0) return 


    LOG(`Number of phantoms to generate \x1b[32;1m${phantomBlocksNumber}`,'I')

    let atomicBatch = SYMBIOTE_META.BLOCKS.batch()

    for(let i=0;i<phantomBlocksNumber;i++){


        let blockCandidate=new Block(GET_EVENTS(),GET_EVENTS_FOR_REASSIGNED_SUBCHAINS()),
                        
            hash=Block.genHash(blockCandidate)
    

        blockCandidate.sig=await BLS_SIGN_DATA(hash)
            
        BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m generated —│\x1b[36;1m`,'S',hash,48,'\x1b[32m',blockCandidate)


        SYMBIOTE_META.GENERATION_THREAD.PREV_HASH=hash
 
        SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX++
    
        let blockID=CONFIG.SYMBIOTE.PUB+':'+blockCandidate.index

        //Store block locally
        atomicBatch.put(blockID,blockCandidate)
           
    }

    //Update the GENERATION_THREAD after all
    atomicBatch.put('GT',SYMBIOTE_META.GENERATION_THREAD)

    await atomicBatch.write()

},




LOAD_GENESIS=async()=>{


    let atomicBatch = SYMBIOTE_META.STATE.batch(),

        quorumThreadAtomicBatch = SYMBIOTE_META.QUORUM_THREAD_METADATA.batch(),
    
        checkpointTimestamp,

        startPool = ''




    //__________________________________ Load all the configs __________________________________

    let filesOfGenesis = fs.readdirSync(process.env.GENESIS_PATH)


    for(let filePath of filesOfGenesis){

        let genesis=JSON.parse(fs.readFileSync(process.env.GENESIS_PATH+`/${filePath}`))

        
        checkpointTimestamp=genesis.CHECKPOINT_TIMESTAMP

        let authorities = new Set(Object.keys(genesis.VALIDATORS))


        for(let [subchainAuthority,validatorContractStorage] of Object.entries(genesis.VALIDATORS)){

            startPool=subchainAuthority

            //Add metadata related to this pool
            SYMBIOTE_META.VERIFICATION_THREAD.SUBCHAINS_METADATA[subchainAuthority]={
                
                INDEX:-1,
                
                HASH:'Poyekhali!@Y.A.Gagarin',
                
                IS_STOPPED:false
            
            }

            //Create the appropriate storage for pre-set validators. We'll create the simplest variant - but validators will have ability to change it via txs during the chain work
            
            let contractMetadataTemplate = {
    
                type:"contract",
                lang:'spec/stakingPool',
                balance:0,
                uno:0,
                storages:['POOL'],
                bytecode:''
    
            }
            
            //Put metadata
            atomicBatch.put(BLAKE3(subchainAuthority+subchainAuthority+'(POOL)'),contractMetadataTemplate)
    
            //Put storage
            //NOTE: We just need a simple storage with ID="POOL"
            atomicBatch.put(BLAKE3(subchainAuthority+subchainAuthority+'(POOL)_STORAGE_POOL'),validatorContractStorage)

            // Put the pointer to know the subchain which store the pool's data(metadata+storages)
            atomicBatch.put(subchainAuthority+'(POOL)_POINTER',subchainAuthority)


            // Add the account for fees for each authority
            authorities.forEach(anotherValidatorPubKey=>{

                if(anotherValidatorPubKey!==subchainAuthority){

                    atomicBatch.put(BLAKE3(subchainAuthority+anotherValidatorPubKey+'_FEES'),{reward:0})

                }

            })


            let templateForQt = {

                totalPower:validatorContractStorage.totalPower,
                lackOfTotalPower:false,
                stopCheckpointID:-1,
                storedMetadata:{}
            
            }

            quorumThreadAtomicBatch.put(subchainAuthority+'(POOL)_STORAGE_POOL',templateForQt)

            //____________________ Create a separate KLY-EVM for this subchain ____________________

            let EVM = new KLY_EVM(process.env.CHAINDATA_PATH+`/KLY_EVM_PER_SUBCHAIN/${subchainAuthority}`)

            await EVM.startEVM()

            //________________________ Fill the state of given KLY-EVM ________________________

            let evmStateForThisSubchain = genesis.EVM[subchainAuthority]

            if(evmStateForThisSubchain){

                let evmKeys = Object.keys(evmStateForThisSubchain)

                for(let evmKey of evmKeys) {
        
                    let {isContract,balance,nonce,code,storage} = evmStateForThisSubchain[evmKey]
        
                    //Put KLY-EVM to KLY-EVM state db which will be used by Trie
        
                    if(isContract){
        
                        await EVM.putContract(evmKey,balance,nonce,code,storage)
        
                    }else{

                        await EVM.putAccount(evmKey,balance,nonce)

                    }
        
                }
    
            }


            // KLY_EVM minimal suitcase - stateRoot, index of next block, parent hash and(zeroes) and timestamp(based on timestamp of checkpoint from genesis)

            SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_METADATA[subchainAuthority]={
                
                STATE_ROOT:await EVM.getStateRoot(),
        
                NEXT_BLOCK_INDEX:Web3.utils.toHex(BigInt(0).toString()),
        
                PARENT_HASH:'0000000000000000000000000000000000000000000000000000000000000000',
                
                TIMESTAMP:Math.floor(checkpointTimestamp/1000)
            
            }

            SYMBIOTE_META.KLY_EVM_PER_SUBCHAIN.set(subchainAuthority,EVM)
            
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

        You can't continue to work if QUORUM and major part of VALIDATORS decided to vote for major update.
        
        However, if workflow_version has differences in minor or patch values - you can continue to work


        KLYNTAR threads holds only MAJOR version(VERIFICATION_THREAD and QUORUM_THREAD) because only this matter

        */

        //We update this during the verification process(in VERIFICATION_THREAD). Once we find the VERSION_UPDATE in checkpoint - update it !
        SYMBIOTE_META.VERIFICATION_THREAD.VERSION=genesis.VERSION

        //We update this during the work on QUORUM_THREAD. But initially, QUORUM_THREAD has the same version as VT
        SYMBIOTE_META.QUORUM_THREAD.VERSION=genesis.VERSION

        //Also, set the WORKFLOW_OPTIONS that will be changed during the threads' work

        SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS={...CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS}

        SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS={...CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS}

    }

    
    await atomicBatch.write()

    await quorumThreadAtomicBatch.write()


    //Node starts to verify blocks from the first validator in genesis, so sequency matter
    
    SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER={
        
        SUBCHAIN:startPool,
        
        INDEX:-1,
        
        HASH:'Poyekhali!@Y.A.Gagarin',

        RID:0
    
    }
    

    SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT={

        RANGE_START_BLOCK:CONFIG.SYMBIOTE.MONITOR.MONITORING_START_FROM,

        RANGE_FINISH_BLOCK:CONFIG.SYMBIOTE.MONITOR.MONITORING_START_FROM,

        RANGE_POINTER:0,

        HEADER:{

            ID:-1,

            PAYLOAD_HASH:'',

            QUORUM_AGGREGATED_SIGNERS_PUBKEY:'',

            QUORUM_AGGREGATED_SIGNATURE:'',

            AFK_VALIDATORS:[]

        },
        
        PAYLOAD:{

            PREV_CHECKPOINT_PAYLOAD_HASH:'',

            SUBCHAINS_METADATA:JSON.parse(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.SUBCHAINS_METADATA)),

            OPERATIONS:[],

            OTHER_SYMBIOTES:{}

        },

        TIMESTAMP:checkpointTimestamp,

        COMPLETED:true
    
    }


    //Make template, but anyway - we'll find checkpoints on hostchains
    SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT={

        RANGE_START_BLOCK:CONFIG.SYMBIOTE.MONITOR.MONITORING_START_FROM,

        RANGE_FINISH_BLOCK:CONFIG.SYMBIOTE.MONITOR.MONITORING_START_FROM,

        RANGE_POINTER:0,

        HEADER:{

            ID:-1,

            PAYLOAD_HASH:'',

            QUORUM_AGGREGATED_SIGNERS_PUBKEY:'',

            QUORUM_AGGREGATED_SIGNATURE:'',

            AFK_VALIDATORS:[]

        },
        
        PAYLOAD:{

            PREV_CHECKPOINT_PAYLOAD_HASH:'',

            SUBCHAINS_METADATA:JSON.parse(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.SUBCHAINS_METADATA)),

            OPERATIONS:[],

            OTHER_SYMBIOTES:{}

        },

        TIMESTAMP:checkpointTimestamp,

        FOUND_AT_BLOCK:CONFIG.SYMBIOTE.MONITOR.MONITORING_START_FROM,

        TX:'genesis',
        
        COMPLETED:true
    
    }


    // Set the rubicon to stop tracking spent txs from WAITING_ROOMs of pools' contracts. Value means the checkpoint id lower edge
    // If your stake/unstake tx was below this line - it might be burned. However, the line is set by QUORUM, so it should be safe
    SYMBIOTE_META.VERIFICATION_THREAD.RUBICON=-1
    
    SYMBIOTE_META.QUORUM_THREAD.RUBICON=-1


    //We get the quorum for VERIFICATION_THREAD based on own local copy of SUBCHAINS_METADATA state
    SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.QUORUM = GET_QUORUM(SYMBIOTE_META.VERIFICATION_THREAD.SUBCHAINS_METADATA,SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS)

    //...However, quorum for QUORUM_THREAD might be retrieved from SUBCHAINS_METADATA of checkpoints. It's because both threads are async
    SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM = GET_QUORUM(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA,SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS)


},




PREPARE_SYMBIOTE=async()=>{

    //Loading spinner
    let initSpinner

    if(!CONFIG.PRELUDE.NO_SPINNERS){

        initSpinner = ora({
        
            color:'red',
        
            prefixText:`\u001b[38;5;${process.env.KLY_MODE==='main'?'23':'202'}m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})  \x1b[36;1mPreparing symbiote \x1b[32;1m${SYMBIOTE_ALIAS()}\x1b[0m`
        
        }).start()

    }


    //____________________________________________Prepare structures_________________________________________________


    //Contains default set of properties for major part of potential use-cases on symbiote
    global.SYMBIOTE_META={

        VERSION:+(fs.readFileSync(PATH_RESOLVE('KLY_Workflows/dev_tachyon/version.txt')).toString()),
        
        MEMPOOL:[], //to hold onchain events here(contract calls,txs,delegations and so on)

        //Сreate mapping for account and it's state to optimize processes while we check blocks-not to read/write to db many times
        STATE_CACHE:new Map(), // ID => ACCOUNT_STATE

        QUORUM_THREAD_CACHE:new Map(), // ADDRESS => ACCOUNT_STATE


        //________________________ AUXILIARY_MAPPINGS ________________________
        
        PEERS:[], // Peers to exchange data with

        STATIC_STUFF_CACHE:new Map(),

        KLY_EVM_PER_SUBCHAIN:new Map(), // subchainID => EVM

        //____________________ CONSENSUS RELATED MAPPINGS ____________________

        TEMP:new Map() // checkpointID => {COMMITMENTS,FINALIZATION_PROOFS,CHECKPOINT_MANAGER,SYNC_HELPER,PROOFS,HEALTH_MONITORING,SKIP,DATABASE,SPECIAL_OPERATIONS_MEMPOOL}
            
    
    }



    !fs.existsSync(process.env.CHAINDATA_PATH) && fs.mkdirSync(process.env.CHAINDATA_PATH)
    
    

    //___________________________Load functionality to verify/filter/transform events_______________________________


    //Importnat and must be the same for symbiote at appropriate chunks of time
    await import(`./verifiers.js`).then(mod=>
    
        SYMBIOTE_META.VERIFIERS=mod.VERIFIERS
        
    )

    //Might be individual for each node
    SYMBIOTE_META.FILTERS=(await import(`./filters.js`)).default;


    //______________________________________Prepare databases and storages___________________________________________

    


    //Create subdirs due to rational solutions
    [
    
        'BLOCKS', //For blocks. BlockID => block
        
        'HOSTCHAIN_DATA', //To store metadata from hostchains(proofs,refs,contract results and so on)
    
        'STUFF', //Some data like combinations of validators for aggregated BLS pubkey, endpoint <-> pubkey bindings and so on. Available stuff URL_PUBKEY_BIND | VALIDATORS_PUBKEY_COMBINATIONS | BLOCK_HASHES | .etc

        'STATE', //Contains state of accounts, contracts, services, metadata and so on. The main database like NTDS.dit

        'CHECKPOINTS', //Contains object like CHECKPOINT_ID => {HEADER,PAYLOAD}

        'QUORUM_THREAD_METADATA', //QUORUM_THREAD itself and other stuff

        //_______________________________ EVM storage _______________________________

        //'KLY_EVM' Contains state of EVM

        //'KLY_EVM_METADATA' Contains metadata for KLY-EVM pseudochain (e.g. blocks, logs and so on)


    ].forEach(
        
        dbName => SYMBIOTE_META[dbName]=level(process.env.CHAINDATA_PATH+`/${dbName}`,{valueEncoding:'json'})
        
    )
    
    
    
    
    //____________________________________________Load stuff to db___________________________________________________


    Object.keys(CONFIG.SYMBIOTE.LOAD_STUFF).forEach(
        
        id => SYMBIOTE_META.STUFF.put(id,CONFIG.SYMBIOTE.LOAD_STUFF[id])
        
    )


    SYMBIOTE_META.GENERATION_THREAD = await SYMBIOTE_META.BLOCKS.get('GT').catch(error=>
        
        error.notFound
        ?
        {
            PREV_HASH:`Poyekhali!@Y.A.Gagarin`,//Genesis hash
            NEXT_INDEX:0//So the first block will be with index 0
        }
        :
        (LOG(`Some problem with loading metadata of generation thread\nSymbiote:${SYMBIOTE_ALIAS()}\nError:${error}`,'F'),process.exit(106))
                        
    )


    //Load from db or return empty object
    SYMBIOTE_META.QUORUM_THREAD = await SYMBIOTE_META.QUORUM_THREAD_METADATA.get('QT').catch(_=>({}))
        

    let nextIsPresent = await SYMBIOTE_META.BLOCKS.get(CONFIG.SYMBIOTE.PUB+":"+SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX).catch(_=>false),//OK is in case of absence of next block

        previousBlock=await SYMBIOTE_META.BLOCKS.get(CONFIG.SYMBIOTE.PUB+":"+(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX-1)).catch(_=>false)//but current block should present at least locally


    if(nextIsPresent || !(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX===0 || SYMBIOTE_META.GENERATION_THREAD.PREV_HASH === BLAKE3( CONFIG.SYMBIOTE.PUB + JSON.stringify(previousBlock.time) + JSON.stringify(previousBlock.events) + JSON.stringify(previousBlock.reassignments) + JSON.stringify(block.reassignProof) + CONFIG.SYMBIOTE.SYMBIOTE_ID + previousBlock.index + previousBlock.prevHash))){
        
        initSpinner?.stop()

        LOG(`Something wrong with a sequence of generation thread on \x1b[36;1m${SYMBIOTE_ALIAS()}`,'F')
            
        process.exit(107)

    }

    


    //________________Load metadata about symbiote-current hight,collaped height,height for export,etc.___________________




    SYMBIOTE_META.VERIFICATION_THREAD = await SYMBIOTE_META.STATE.get('VT').catch(error=>{

        if(error.notFound){

            //Default initial value
            return {
            
                FINALIZED_POINTER:{SUBCHAIN:'',INDEX:-1,HASH:'',RID:0}, // pointer to know where we should start to process further blocks

                SUBCHAINS_METADATA:{}, // PUBKEY => {INDEX:'',HASH:'',IS_STOPPED:boolean}

                REASSIGNMENTS:{}, // SUBCHAIN_ID => NEW_TEMPORARY_AUTHORITY
                
                TO_FINISH:{}, // SUBCHAIN_ID => {AUTHORITY1:HEIGHT_X,AUTHORITY2:HEIGHT_Y,...}

                KLY_EVM_METADATA:{}, // PUBKEY => {STATE_ROOT,NEXT_BLOCK_INDEX,PARENT_HASH,TIMESTAMP}

                CHECKPOINT:'genesis'
 
            }

        }else{

            LOG(`Some problem with loading metadata of verification thread\nSymbiote:${SYMBIOTE_ALIAS()}\nError:${error}`,'F')
            
            process.exit(105)

        }
        
    })




    if(SYMBIOTE_META.VERIFICATION_THREAD.VERSION===undefined){

        await LOAD_GENESIS()


        //______________________________________Commit the state of VT and QT___________________________________________

        await SYMBIOTE_META.STATE.put('VT',SYMBIOTE_META.VERIFICATION_THREAD)

        await SYMBIOTE_META.QUORUM_THREAD_METADATA.put('QT',SYMBIOTE_META.QUORUM_THREAD)

    }


    //_____________________________________ Set the EVM metadata for each subchain______________________________________

    for(let subchainID of Object.keys(SYMBIOTE_META.VERIFICATION_THREAD.SUBCHAINS_METADATA)){

        let {STATE_ROOT,NEXT_BLOCK_INDEX,PARENT_HASH,TIMESTAMP} = SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_METADATA[subchainID]

        let evm = SYMBIOTE_META.KLY_EVM_PER_SUBCHAIN.get(subchainID)


        if(!evm){

            let EVM = new KLY_EVM(process.env.CHAINDATA_PATH+`/KLY_EVM_PER_SUBCHAIN/${subchainID}`)

            await EVM.startEVM()

            SYMBIOTE_META.KLY_EVM_PER_SUBCHAIN.set(subchainID,EVM)

            evm=EVM

        }

        await evm.setStateRoot(STATE_ROOT)
    
        // Set the block parameters
        await evm.setCurrentBlockParams(BigInt(NEXT_BLOCK_INDEX),TIMESTAMP,PARENT_HASH)


        // Add the global EVM for sandbox execution via API
        global.KLY_EVM = evm

    }


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

    SYMBIOTE_META.STUFF_CACHE=new AdvancedCache(CONFIG.SYMBIOTE.STUFF_CACHE_SIZE,SYMBIOTE_META.STUFF)


    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID


    //Because if we don't have quorum, we'll get it later after discovering checkpoints

    SYMBIOTE_META.STATIC_STUFF_CACHE.set('VT_ROOTPUB',bls.aggregatePublicKeys(SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.QUORUM))

    SYMBIOTE_META.STATIC_STUFF_CACHE.set('QT_ROOTPUB'+qtPayload,bls.aggregatePublicKeys(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM))


    //_________________________________Add the temporary data of current QT__________________________________________
    
    let quorumTemporaryDB = level(process.env.CHAINDATA_PATH+`/${qtPayload}`,{valueEncoding:'json'})

    SYMBIOTE_META.TEMP.set(qtPayload,{

        SPECIAL_OPERATIONS_MEMPOOL:new Map(), //to hold operations which should be included to checkpoints

        COMMITMENTS:new Map(), // the first level of "proofs". Commitments is just signatures by some validator from current quorum that validator accept some block X by ValidatorY with hash H

        FINALIZATION_PROOFS:new Map(), // aggregated proofs which proof that some validator has 2/3N+1 commitments for block PubX:Y with hash H. Key is blockID and value is FINALIZATION_PROOF object

    
        CHECKPOINT_MANAGER:new Map(), // mapping( validatorID => {INDEX,HASH} ). Used to start voting for checkpoints. Each pair is a special handler where key is a pubkey of appropriate validator and value is the ( index <=> id ) which will be in checkpoint
    
        CHECKPOINT_MANAGER_SYNC_HELPER:new Map(), // map(subchainID=>Set({INDEX,HASH,FINALIZATION_PROOF})) here will be added propositions to update the finalization proof for subchain which will be checked in sync mode

        PROOFS_REQUESTS:new Map(), // mapping(blockID=>FINALIZATION_PROOF_REQUEST)

        PROOFS_RESPONSES:new Map(), // mapping(blockID=>FINALIZATION_PROOF)


        HEALTH_MONITORING:new Map(), //used to perform SKIP procedure when we need it and to track changes on subchains. SubchainID => {LAST_SEEN,HEIGHT,HASH,SUPER_FINALIZATION_PROOF:{aggregatedPub,aggregatedSig,afkValidators}}


        SKIP_PROCEDURE_STAGE_1:new Set(), // set(subchainID)

        SKIP_PROCEDURE_STAGE_2:new Map(), // mapping(subchainID=>{INDEX,HASH})

        //____________________ Mapping which contains temporary databases for   ____________________

        DATABASE:quorumTemporaryDB // DB with potential checkpoints, timetrackers, finalization proofs, skip procedure and so on    

    })


    // Fill the CHECKPOINT_MANAGER with the latest, locally stored data

    await RESTORE_STATE()


    //__________________________________Load modules to work with hostchains_________________________________________

    let ticker = CONFIG.SYMBIOTE.CONNECTOR.TICKER
    
    let packID = CONFIG.SYMBIOTE.MANIFEST.HOSTCHAINS[ticker].PACK


    //Depending on packID load appropriate module
    if(CONFIG.EVM_CHAINS.includes(ticker)){
        
        let EvmHostChainConnector = (await import(`../../KLY_Hostchains/${packID}/connectors/evm.js`)).default
        
        //Set connector
        HOSTCHAIN.CONNECTOR=new EvmHostChainConnector(ticker)

        //Set monitor
        HOSTCHAIN.MONITOR=(await import(`../../KLY_Hostchains/${packID}/monitors/evm.js`)).default
        

    }else {

        //Also, set connector
        HOSTCHAIN.CONNECTOR=(await import(`../../KLY_Hostchains/${packID}/connectors/${ticker}.js`)).default

        //Also, set monitor
        HOSTCHAIN.MONITOR=(await import(`../../KLY_Hostchains/${packID}/monitors/${ticker}.js`)).default

    }


    //___________________Decrypt all private keys(for KLYNTAR and hostchains) to memory of process___________________

    


    await DECRYPT_KEYS(initSpinner).then(()=>
    
        //Print just first few bytes of keys to view that they were decrypted well.Looks like checksum
        LOG(`Private key on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m was decrypted successfully`,'S')        
    
    ).catch(error=>{
    
        LOG(`Keys decryption failed.Please,check your password carefully.In the worst case-use your decrypted keys from safezone and repeat procedure of encryption via CLI\n${error}`,'F')
 
        process.exit(107)

    })



    //___________________________________________Load data from hostchain___________________________________________


        
    if(CONFIG.SYMBIOTE.BALANCE_VIEW){

        let ticker = CONFIG.SYMBIOTE.CONNECTOR.TICKER
        
        let spinner = ora({
       
            color:'red',
       
            prefixText:`\u001b[38;5;23m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]  \x1b[36;1mGetting balance for \x1b[32;1m${ticker}\x1b[36;1m - keep waiting\x1b[0m`
       
        }).start()

        let balance = await HOSTCHAIN.CONNECTOR.getBalance()
        
        spinner.stop()
        
        LOG(`Balance on hostchain \x1b[32;1m${
        
            ticker
        
        }\x1b[36;1m is \x1b[32;1m${
            
            CONFIG.SYMBIOTE.BALANCE_VIEW ? balance : '<disabled>'
        
        }   \x1b[36;1m[${CONFIG.SYMBIOTE.STOP_HOSTCHAIN?'\x1b[31;1mSTOP':'\x1b[32;1mPUSH'}\x1b[36;1m]`,'I')
    
    }


    //____________________________________________GENERAL SYMBIOTE INFO____________________________________________


    //Ask to approve current set of hostchains
    !CONFIG.PRELUDE.OPTIMISTIC
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
    

    let quorumMembersURLs = await GET_VALIDATORS_URLS()

    let {INDEX,HASH} = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA[CONFIG.SYMBIOTE.PUB]

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let myPayload = {
    
        stop:false,
        subchain:CONFIG.SYMBIOTE.PUB,
        index:INDEX,
        hash:HASH,
        sig:await BLS_SIGN_DATA(false+CONFIG.SYMBIOTE.PUB+INDEX+HASH+qtPayload)
    
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

    if(!CONFIG.SYMBIOTE.STOP_WORK){

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

        //5.Start checking SKIP_PROCEDURE proofs(for stages 1 and 2)
        SKIP_PROCEDURE_MONITORING_START()

        //6.Run function to work with finalization stuff and avoid async problems
        FINALIZATION_PROOFS_SYNCHRONIZER()

        let promises=[]

        //Check if bootstrap nodes is alive
        CONFIG.SYMBIOTE.BOOTSTRAP_NODES.forEach(endpoint=>

            promises.push(
                        
                fetch(endpoint+'/addpeer',{method:'POST',body:JSON.stringify([CONFIG.SYMBIOTE.SYMBIOTE_ID,CONFIG.SYMBIOTE.MY_HOSTNAME])})
            
                    .then(res=>res.text())
            
                    .then(val=>LOG(val==='OK'?`Received pingback from \x1b[32;1m${endpoint}\x1b[36;1m. Node is \x1b[32;1malive`:`\x1b[36;1mAnswer from bootstrap \x1b[32;1m${endpoint}\x1b[36;1m => \x1b[34;1m${val}`,'I'))
            
                    .catch(error=>LOG(`Bootstrap node \x1b[32;1m${endpoint}\x1b[31;1m send no response or some error occured \n${error}`,'F'))
                        
            )

        )

        await Promise.all(promises.splice(0))


        //______________________________________________________RUN BLOCKS GENERATION PROCESS____________________________________________________________


        //Start generate blocks
        !CONFIG.SYMBIOTE.STOP_GENERATE_BLOCKS && setTimeout(()=>{
                
            global.STOP_GEN_BLOCKS_CLEAR_HANDLER=false
                
            GEN_BLOCKS_START_POLLING()
            
        },CONFIG.SYMBIOTE.BLOCK_GENERATION_INIT_DELAY)


    }

}