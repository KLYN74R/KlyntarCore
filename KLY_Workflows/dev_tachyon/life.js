import {
    
    DECRYPT_KEYS,BLOCKLOG,SIG,BLS_VERIFY,
    
    GET_QUORUM,GET_FROM_STATE_FOR_QUORUM_THREAD,
    
    GET_VALIDATORS_URLS,GET_MAJORITY,BROADCAST, GET_RANDOM_BYTES_AS_HEX, CHECK_IF_THE_SAME_DAY

} from './utils.js'

import {LOG,SYMBIOTE_ALIAS,PATH_RESOLVE,BLAKE3,IS_MY_VERSION_OLD} from '../../KLY_Utils/utils.js'

import {START_VERIFICATION_THREAD} from './verification.js'

import AdvancedCache from '../../KLY_Utils/structures/advancedcache.js'

import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import OPERATIONS_VERIFIERS from './operationsVerifiers.js'

import Block from './essences/block.js'

import UWS from 'uWebSockets.js'

import readline from 'readline'

import fetch from 'node-fetch'

import level from 'level'

import ora from 'ora'

import fs from 'fs'




//______________________________________________________________VARIABLES POOL___________________________________________________________________


//++++++++++++++++++++++++ Define general global object  ++++++++++++++++++++++++

//Open writestream in append mode
global.SYMBIOTE_LOGS_STREAM=fs.createWriteStream(process.env.LOGS_PATH+`/symbiote.log`),{flags:'a+'}

global.THREADS_STILL_WORKS={VERIFICATION:false,GENERATION:false}

global.SYSTEM_SIGNAL_ACCEPTED=false

//Your decrypted private key
global.PRIVATE_KEY=null

global.SIG_PROCESS={}





//*********************** SET HANDLERS ON USEFUL SIGNALS ************************



export let GRACEFUL_STOP=()=>{
    
    SYSTEM_SIGNAL_ACCEPTED=true

    console.log('\n')

    LOG('\x1b[31;1mKLYNTAR\x1b[36;1m stop has been initiated.Keep waiting...','I')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/termination.txt')).toString(),'W')
    
    //Probably stop logs on this step
    setInterval(async()=>{

        //Each subprocess in each symbiote must be stopped
        if(!THREADS_STILL_WORKS.GENERATION && !THREADS_STILL_WORKS.VERIFICATION || Object.values(SIG_PROCESS).every(x=>x)){

            console.log('\n')

            //Close logs streams
            await new Promise( resolve => SYMBIOTE_LOGS_STREAM.close( error => {

                LOG(`Logging was stopped for \x1b[32;1m${SYMBIOTE_ALIAS()}\x1b[36;1m ${error?'\n'+error:''}`,'I')

                resolve()
            
            }))

            LOG('Server stopped','I')

            global.UWS_DESC && UWS.us_listen_socket_close(UWS_DESC)

            LOG('Node was gracefully stopped','I')
                
            process.exit(0)

        }

    },200)

}




//Define listeners on typical signals to safely stop the node
process.on('SIGTERM',GRACEFUL_STOP)
process.on('SIGINT',GRACEFUL_STOP)
process.on('SIGHUP',GRACEFUL_STOP)


//************************ END SUB ************************









//________________________________________________________________INTERNAL_______________________________________________________________________


//TODO:Add more advanced logic(e.g. number of txs,ratings,etc.)
let GET_EVENTS = () => SYMBIOTE_META.MEMPOOL.splice(0,CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.EVENTS_LIMIT_PER_BLOCK),

    GET_SPEC_EVENTS = () => Array.from(SYMBIOTE_META.SPECIAL_OPERATIONS_MEMPOOL).map(subArr=>{

        return {type:subArr[1].type,payload:subArr[1].payload}

    }),




GEN_BLOCKS_START_POLLING=async()=>{


    if(!SYSTEM_SIGNAL_ACCEPTED){

        //With this we say to system:"Wait,we still processing the block"
        THREADS_STILL_WORKS.GENERATION=true

        await GENERATE_PHANTOM_BLOCKS_PORTION()    

        STOP_GEN_BLOCKS_CLEAR_HANDLER=setTimeout(GEN_BLOCKS_START_POLLING,CONFIG.SYMBIOTE.BLOCK_TIME)
        
        CONFIG.SYMBIOTE.STOP_GENERATE_BLOCKS
        &&
        clearTimeout(STOP_GEN_BLOCKS_CLEAR_HANDLER)

    }else{

        LOG(`Block generation for \x1b[32;1m${SYMBIOTE_ALIAS()}\x1b[36;1m was stopped`,'I',CONFIG.SYMBIOTE.SYMBIOTE_ID)

        SIG_PROCESS.GENERATE=true

    }

    //leave function
    THREADS_STILL_WORKS.GENERATION=false
    
},




DELETE_VALIDATOR_POOLS=async validatorPubKey=>{

    //Try to get storage "POOL" of appropriate pool

    let poolStorage = await GET_FROM_STATE_FOR_QUORUM_THREAD(validatorPubKey+'(POOL)_STORAGE_POOL')


    poolStorage.isStopped=true

    poolStorage.stopCheckpointID=SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    poolStorage.storedMetadata=SYMBIOTE_META.QUORUM_THREAD.VALIDATORS_METADATA[validatorPubKey]


    //Remove from VALIDATORS array(to prevent be elected to quorum) and metadata

    SYMBIOTE_META.QUORUM_THREAD.VALIDATORS.splice(SYMBIOTE_META.QUORUM_THREAD.VALIDATORS.indexOf(validatorPubKey),1)

    delete SYMBIOTE_META.QUORUM_THREAD.VALIDATORS_METADATA[validatorPubKey]

},




//Use it to find checkpoints on hostchains, perform them and join to QUORUM by finding the latest valid checkpoint
START_QUORUM_THREAD_CHECKPOINT_TRACKER=async()=>{

    console.log('Finding new checkpoint for QUORUM_THREAD on symbiote')

    let possibleCheckpoint = await HOSTCHAIN.MONITOR.GET_VALID_CHECKPOINT('QUORUM_THREAD').catch(_=>false)


    //__________________________Initially, we perform all the async operations for SKIP_PROCEDURE_STAGE_1__________________________

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID
    
    let subchainsToSkip = SYMBIOTE_META.ASYNC_HELPER_FOR_SKIP_PROCEDURE_STAGE_1.get(qtPayload)

    for(let subchainID of subchainsToSkip.values()){

        await SYMBIOTE_META.COMMITMENTS_SKIP_AND_FINALIZATION.put('SKIP:'+subchainID,true).catch(_=>false)

        SYMBIOTE_META.SKIP_PROCEDURE_STAGE_1.add(subchainID)

    }


    if(possibleCheckpoint){


        //Perform SPEC_OPERATIONS


        //_____________________________To change it via operations___________________________

        let workflowOptionsTemplate = {...SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS}
            
        SYMBIOTE_META.QUORUM_THREAD_CACHE.set('WORKFLOW_OPTIONS',workflowOptionsTemplate)

        // Structure is <poolID> => true if pool should be deleted
        SYMBIOTE_META.STATE_CACHE.set('SLASH_OBJECT',{})

        //But, initially, we should execute the SLASH_UNSTAKE operations because we need to prevent withdraw of stakes by rogue pool(s)/stakers
        for(let operation of possibleCheckpoint.PAYLOAD.OPERATIONS){
         
            if(operation.type==='SLASH_UNSTAKE') await OPERATIONS_VERIFIERS.SLASH_UNSTAKE(operation.payload,false,true)

        }

        //Here we have the filled(or empty) array of pools and delayed IDs to delete it from state

        //____________________Go through the SPEC_OPERATIONS and perform__________________

        for(let operation of possibleCheckpoint.PAYLOAD.OPERATIONS){

            if(operation.type==='SLASH_UNSTAKE') continue

              /*
                
                Perform changes here before move to the next checkpoint
                
                OPERATION in checkpoint has the following structure

                {
                    type:<TYPE> - type from './operationsVerifiers.js' to perform this operation
                    payload:<PAYLOAD> - operation body. More detailed about structure & verification process here => ./operationsVerifiers.js
                }
                

            */

            await OPERATIONS_VERIFIERS[operation.type](operation.payload,false,true)

        }

        //_______________________Remove pools if lack of staking power_______________________

        let toRemovePools = [], promises = []

        for(let validator of SYMBIOTE_META.QUORUM_THREAD.VALIDATORS){

            let promise = GET_FROM_STATE_FOR_QUORUM_THREAD(validator+'(POOL)_STORAGE_POOL').then(poolStorage=>{

                if(poolStorage.totalPower<SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.VALIDATOR_STAKE) toRemovePools.push(validator)

            })

            promises.push(promise)

        }

        await Promise.all(promises.splice(0))

        //Now in toRemovePools we have IDs of pools which should be deleted from VALIDATORS

        let deleteValidatorsPoolsPromises=[]

        for(let address of toRemovePools){

            deleteValidatorsPoolsPromises.push(DELETE_VALIDATOR_POOLS(address))

        }

        await Promise.all(deleteValidatorsPoolsPromises.splice(0))


        //________________________________Remove rogue pools_________________________________

        // These operations must be atomic
        let atomicBatch = SYMBIOTE_META.QUORUM_THREAD_METADATA.batch()

        let slashObject = await GET_FROM_STATE_FOR_QUORUM_THREAD('SLASH_OBJECT'), slashObjectKeys = Object.keys(slashObject)
            
        for(let poolIdentifier of slashObjectKeys){

            //slashObject has the structure like this <pool> => <{delayedIds,pool}>
            atomicBatch.del(poolIdentifier+'(POOL)_STORAGE_POOL')
        
        }

        //After all ops - commit state and make changes to workflow

        SYMBIOTE_META.QUORUM_THREAD_CACHE.forEach((value,recordID)=>{

            atomicBatch.put(recordID,value)

        })

        //Updated WORKFLOW_OPTIONS
        SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS={...workflowOptionsTemplate}

        //CLear the map of SPECIAL_OPERATIONS
        SYMBIOTE_META.SPECIAL_OPERATIONS_MEMPOOL.clear()

        //Clear the QUORUM_THREAD_CACHE
        //TODO:Make more advanced logic
        SYMBIOTE_META.QUORUM_THREAD_CACHE.clear()

        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        //Clear our sets not to repeat the SKIP_PROCEDURE
        SYMBIOTE_META.SKIP_PROCEDURE_STAGE_1.clear()
        SYMBIOTE_META.SKIP_PROCEDURE_STAGE_2.clear()

        //Clear this mapping related to old checkpoint
        SYMBIOTE_META.ASYNC_HELPER_FOR_SKIP_PROCEDURE_STAGE_1.get(qtPayload)?.clear()

        //Update the block height to keep progress on hostchain

        global.SKIP_PROCEDURE_STAGE_1_BLOCK = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.FOUND_AT_BLOCK
        global.SKIP_PROCEDURE_STAGE_2_BLOCK = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.FOUND_AT_BLOCK


        //Set new checkpoint
        SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT = possibleCheckpoint
        
        //Create new quorum based on new VALIDATORS_METADATA state
        SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM = GET_QUORUM('QUORUM_THREAD')

        //Get the new ROOTPUB
        SYMBIOTE_META.STATIC_STUFF_CACHE.set('QT_ROOTPUB',bls.aggregatePublicKeys(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM))


        //_______________________________________Commit changes____________________________________________


        atomicBatch.put('QT',SYMBIOTE_META.QUORUM_THREAD)

        await atomicBatch.write()


        //___________________Clear databases with commitments & finalization proofs related to this ________________________

        await SYMBIOTE_META.COMMITMENTS_SKIP_AND_FINALIZATION.clear()

        //_______________________Check the version required for the next checkpoint________________________


        if(IS_MY_VERSION_OLD('QUORUM_THREAD')){

            // Stop the node to update the software
            GRACEFUL_STOP()

        }


        //________________________________ If it's fresh checkpoint and we present there as a member of quorum - then continue the logic ________________________________


        let checkpointIsFresh = CHECK_IF_THE_SAME_DAY(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.TIMESTAMP*1000,new Date().getTime())

        let iAmInTheQuorum = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.includes(CONFIG.SYMBIOTE.PUB)

        if(checkpointIsFresh && iAmInTheQuorum){

            // Fill the checkpoints manager with the latest data

            let validatorsMetadata = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.VALIDATORS_METADATA

            Object.keys(validatorsMetadata).forEach(
            
                poolPubKey => SYMBIOTE_META.CHECKPOINTS_MANAGER.set(poolPubKey,{INDEX:validatorsMetadata[poolPubKey].INDEX,HASH:validatorsMetadata[poolPubKey].HASH}) //{INDEX,HASH}
    
            )

            let nextCheckpointIdAlreadyGenerated = await SYMBIOTE_META.CHECKPOINTS.get(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID + 1).catch(_=>false)

            if(!nextCheckpointIdAlreadyGenerated){

                global.QUORUM_MEMBER_MODE=true

            }

        }

        //Continue to find checkpoints
        setTimeout(START_QUORUM_THREAD_CHECKPOINT_TRACKER,0)

    }else{

        // Wait for the new checkpoint will appear on hostchain

        console.log('================ QT ================')

        console.log(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD)
            
        console.log('================ VT ================')
    
        console.log(SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.PAYLOAD)
    
        setTimeout(START_QUORUM_THREAD_CHECKPOINT_TRACKER,CONFIG.SYMBIOTE.POLLING_TIMEOUT_TO_FIND_CHECKPOINT_FOR_QUORUM_THREAD)    

    }

},




SKIP_PROCEDURE_MONITORING_START=async()=>{

    let checkpointIsFresh = CHECK_IF_THE_SAME_DAY(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.TIMESTAMP*1000,new Date().getTime())


    // No sense to find skip proofs if checkpoint is not fresh
    if(checkpointIsFresh){

        await HOSTCHAIN.MONITOR.GET_SKIP_PROCEDURE_STAGE_1_PROOFS().catch(_=>false)

        await HOSTCHAIN.MONITOR.GET_SKIP_PROCEDURE_STAGE_2_PROOFS().catch(_=>false)
    
        //After monitoring - start SKIP_PROCEDURE_STAGE_2 if we've found proofs for SKIP_PROCEDURE_STAGE_1
    
        // After all, here we'll have     

    }

    setTimeout(SKIP_PROCEDURE_MONITORING_START,CONFIG.SYMBIOTE.SKIP_PROCEDURE_MONITORING)

},




CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT=async()=>{

    // Get the latest known block and check if it's next day. In this case - make QUORUM_MEMBER_MODE=false to prevent generating  COMMITMENTS / FINALIZATION_PROOFS and so on

    /*
    
        Here we generate the checkpoint and go through the other quorum members to get signatures of proposed checkpoint PAYLOAD

        Here is the structure we should build & distribute

        {
            
            PREV_CHECKPOINT_PAYLOAD_HASH: SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,
            
            VALIDATORS_METADATA: {
                
                '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {INDEX,HASH}

                /..other data
            
            },
            OPERATIONS: GET_SPEC_EVENTS(),
            OTHER_SYMBIOTES: {}
        
        }

        To sign it => SIG(BLAKE3(JSON.stringify(<PROPOSED>)))
    
    */


    let canProposeCheckpoint = await HOSTCHAIN.MONITOR.CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT(),

        iAmInTheQuorum = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.includes(CONFIG.SYMBIOTE.PUB)


    if(canProposeCheckpoint && iAmInTheQuorum){

        // Stop to generate commitments/finalization proofs
        global.QUORUM_MEMBER_MODE=false


        //____________________________________ Build the template of checkpoint's payload ____________________________________


        let potentialCheckpointPayload = {

            PREV_CHECKPOINT_PAYLOAD_HASH:SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,

            VALIDATORS_METADATA:{},

            OPERATIONS:GET_SPEC_EVENTS(),

            OTHER_SYMBIOTES:{} //don't need now

        }

        Object.keys(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.VALIDATORS_METADATA).forEach(
            
            poolPubKey => {

                let {INDEX,HASH} = SYMBIOTE_META.CHECKPOINTS_MANAGER.get(poolPubKey) //{INDEX,HASH,(?)FINALIZATION_PROOF}

                potentialCheckpointPayload.VALIDATORS_METADATA[poolPubKey] = {INDEX,HASH}

            }

        )


        let otherAgreements = new Map()


        //________________________________________ Exchange with other quorum members ________________________________________

        let quorumMembers = await GET_VALIDATORS_URLS('QUORUM_THREAD',true)

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

            let responsePromise = fetch(memberHandler.url+'/checkpoint',sendOptions).then(r=>r.json()).then(async response=>{
 
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



        for(let {pubKey,sig,metadataUpdate} of checkpointsPingBacks){

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

                let isSignaOk = await bls.singleVerify(checkpointPayloadHash,pubKey,sig)

                if(isSignaOk) otherAgreements.set(pubKey,sig)

            }else if(metadataUpdate.length!==0){

                // Update the data of CHECKPOINTS_MANAGER if quorum voted for appropriate block:hash:index

                for(let updateOp of metadataUpdate){

                    let subchainMetadata = SYMBIOTE_META.CHECKPOINTS_MANAGER.get(updateOp.subchain)

                    if(!subchainMetadata) continue

                    else{

                        if(updateOp.index>subchainMetadata.INDEX){

                            let {aggregatedSignature,aggregatedPub,afkValidators} = updateOp.finalizationProof

                            let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID
    
                            let signaIsOk = await bls.singleVerify(updateOp.subchain+":"+updateOp.index+updateOp.hash+qtPayload,aggregatedPub,aggregatedSignature)
        
                            let rootPubIsOK = SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB') === bls.aggregatePublicKeys([aggregatedPub,...afkValidators])
        
        
                            if(signaIsOk && rootPubIsOK){

                                let latestFinalized = {INDEX:updateOp.index,HASH:updateOp.index,FINALIZATION_PROOF:updateOp.finalizationProof}


                                await SYMBIOTE_META.COMMITMENTS_SKIP_AND_FINALIZATION.put(updateOp.subchain,latestFinalized).then(()=>{

                                    SYMBIOTE_META.CHECKPOINTS_MANAGER.set(updateOp.subchain,latestFinalized)

                                })

                                propositionsToUpdateMetadata++
        
                            }

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
        
                    AFK_VALIDATORS:SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.filter(pubKey=>otherAgreements.has(pubKey))
        
                },
                
                // Store & share among the rest of network
                PAYLOAD:potentialCheckpointPayload,        

            }


            //____________________________________ Share via POST /potential_checkpoint ____________________________________


            for(let memberHandler of quorumMembers){

                fetch(memberHandler.url+'/potential_checkpoint',newCheckpoint).catch(_=>false)
        
            }

        }else if(propositionsToUpdateMetadata===0){

            // Delete the special operations due to which the rest could not agree with our version of checkpoints
            //! NOTE - we can't delete operations of SKIP_PROCEDURE, so check the type of operation too

            for(let {excludeSpecOperations} of checkpointsPingBacks){

                for(let operationID of excludeSpecOperations){

                    let operationToDelete = SYMBIOTE_META.SPECIAL_OPERATIONS_MEMPOOL.get(operationID)

                    //We can't delete the 'STOP_VALIDATOR' operation
                    if(operationToDelete.type!=='STOP_VALIDATOR') SYMBIOTE_META.SPECIAL_OPERATIONS_MEMPOOL.delete(operationID)

                }

            }

        }

        //Clear everything and repeat the attempt(round) of checkpoint proposition - with updated values of subchains' metadata & without special operations

    }

    setTimeout(CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT,3000) //each 3 second - do monitoring

},




RUN_FINALIZATION_PROOFS_GRABBING = async blockID => {

    let block = await SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>false)

    let blockHash = Block.genHash(block)

    //Create the mapping to get the FINALIZATION_PROOFs from the quorum members
    
    SYMBIOTE_META.FINALIZATION_PROOFS.set(blockID,new Map()) // inner mapping contains voterValidatorPubKey => his FINALIZATION_PROOF

    let finalizationProofsMapping = SYMBIOTE_META.FINALIZATION_PROOFS.get(blockID)

    let aggregatedCommitments = SYMBIOTE_META.COMMITMENTS.get(blockID)

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID


    let optionsToSend = {method:'POST',body:JSON.stringify(aggregatedCommitments)},

        quorumMembers = await GET_VALIDATORS_URLS('QUORUM_THREAD',true),

        majority = GET_MAJORITY('QUORUM_THREAD'),

        promises=[]


    if(finalizationProofsMapping.size<majority){

        //Descriptor is {url,pubKey}
        for(let descriptor of quorumMembers){

            // No sense to get the commitment if we already have
            if(finalizationProofsMapping.has(descriptor.pubKey)) continue
    
    
            let promise = fetch(descriptor+'/finalization',optionsToSend).then(r=>r.text()).then(async possibleFinalizationProof=>{
    
                let finalProofIsOk = await bls.singleVerify(blockID+blockHash+'FINALIZATION'+qtPayload,descriptor.pubKey,possibleFinalizationProof).catch(_=>false)
    
                if(finalProofIsOk) finalizationProofsMapping.set(descriptor.pubKey,possibleFinalizationProof)
    
            })
    
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


        // Repeat procedure for the next block
        let appropriateDescriptor = SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

        appropriateDescriptor.height++

    }

},




RUN_COMMITMENTS_GRABBING = async blockID => {


    let block = await SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>false)

    // Check for this block after a while
    if(!block) setTimeout(SEND_BLOCKS_AND_GRAB_COMMITMENTS,2000)

    let blockHash = Block.genHash(block)



    let optionsToSend = {method:'POST',body:JSON.stringify(block)},

        quorumMembers = await GET_VALIDATORS_URLS('QUORUM_THREAD',true),

        majority = GET_MAJORITY('QUORUM_THREAD'),

        promises=[],

        commitments,

        qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID


    if(!SYMBIOTE_META.COMMITMENTS.has(blockID)){

        SYMBIOTE_META.COMMITMENTS.set(blockID,new Map()) // inner mapping contains voterValidatorPubKey => his commitment 

        commitments = SYMBIOTE_META.COMMITMENTS.get(blockID)

    }



    if(commitments.size<majority){

        //Descriptor is {url,pubKey}
        for(let descriptor of quorumMembers){

            // No sense to get the commitment if we already have
    
            if(commitments.has(descriptor.pubKey)) continue
    
            /*
            
            0. Share the block via POST /block and get the commitment as the answer
       
            1. After getting 2/3N+1 commitments, aggregate it and call POST /finalization to send the aggregated commitment to the quorum members and get the 
    
            2. Get the 2/3N+1 FINALIZATION_PROOFs, aggregate and call POST /super_finalization to share the SUPER_FINALIZATION_PROOFS over the symbiote
    
            */
    
            let promise = fetch(descriptor+'/block',optionsToSend).then(r=>r.text()).then(async possibleCommitment=>{
    
                let commitmentIsOk = await bls.singleVerify(blockID+blockHash+qtPayload,descriptor.pubKey,possibleCommitment).catch(_=>false)
    
                if(commitmentIsOk) commitments.set(descriptor.pubKey,possibleCommitment)
    
            })
    
            // To make sharing async
            promises.push(promise)
    
        }
    
        await Promise.all(promises)

    }


    //_______________________ It means that we now have enough commitments for appropriate block. Now we can start to generate FINALIZATION_PROOF _______________________

    // On this step we should go through the quorum members and share FINALIZATION_PROOF to get the SUPER_FINALIZATION_PROOFS(and this way - finalize the block)

    if(commitments.size>=majority){

        let signers = [...commitments.keys()]

        let signatures = [...commitments.values()]

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
        SYMBIOTE_META.COMMITMENTS.set(blockID,aggregatedCommitments)
    
        RUN_FINALIZATION_PROOFS_GRABBING(blockID)

    }

},




SEND_BLOCKS_AND_GRAB_COMMITMENTS = async () => {

    // Descriptor has the following structure - {checkpointID,height}
    let appropriateDescriptor = SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

    if(!appropriateDescriptor || appropriateDescriptor.checkpointID !== SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID){

        //If we still works on the old checkpoint - continue
        //Otherwise,update the latest height/hash and send them to the new QUORUM

        let myLatestFinalizedHeight = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.VALIDATORS_METADATA[CONFIG.SYMBIOTE.PUB].INDEX+1

        appropriateDescriptor = {

            checkpointID:SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID,

            height:myLatestFinalizedHeight

        }

        // And store new descriptor(till it will be old)
        SYMBIOTE_META.STATIC_STUFF_CACHE.set('BLOCK_SENDER_HANDLER',appropriateDescriptor)

        // Also, clear invalid caches

        SYMBIOTE_META.COMMITMENTS.clear()

        SYMBIOTE_META.FINALIZATION_PROOFS.clear()

    }


    let blockID = CONFIG.SYMBIOTE.PUB+':'+appropriateDescriptor.height


    if(SYMBIOTE_META.FINALIZATION_PROOFS.has(blockID)){

        //This option means that we already started to share aggregated 2/3N+1 commitments and grab 2/3+1 FINALIZATION_PROOFS
        RUN_FINALIZATION_PROOFS_GRABBING()

    }else{

        // This option means that we already started to share block and going to find 2/3N+1 commitments
        // Once we get it - aggregate it and start finalization proofs grabbing(previous option) 
        
        RUN_COMMITMENTS_GRABBING()

    }

    setTimeout(SEND_BLOCKS_AND_GRAB_COMMITMENTS,1000)

},




PROPOSE_TO_SKIP=async(validator,metaDataToFreeze)=>{

    // If we agree that validator is offline and we can't get the block - then SIG('SKIP:<CURRENT_CHECKPOINT_ID>:<CURRENT_QUORUM_THREAD_CHECKPOINT_HASH(hash of previous payload)>:<VALIDATOR>:<BLOCK_ID>')
    // If we receive the 2/3N+1 votes to skip - then we delete this validator from set and fix it
    
},




//Function to monitor the available block creators
SUBCHAINS_HEALTH_MONITORING=async()=>{

    if(SYMBIOTE_META.HEALTH_MONITORING.size===0){

        // Fill the HEALTH_MONITORING mapping with the latest known values
        // Structure is SubchainID => {LAST_SEEN,INDEX,HASH,SUPER_FINALIZATION_PROOF:{aggregatedPub,aggregatedSig,afkValidators}}

        let LAST_SEEN = new Date().getTime()

        for(let pubKey of SYMBIOTE_META.CHECKPOINTS_MANAGER.keys()){

            let {INDEX,HASH}=SYMBIOTE_META.CHECKPOINTS_MANAGER.get(pubKey)

            let baseBlockID = pubKey+":"+INDEX

            let SUPER_FINALIZATION_PROOF = await SYMBIOTE_META.SUPER_FINALIZATION_PROOFS_DB.get(baseBlockID).catch(_=>false)

            //Store to mapping
            SYMBIOTE_META.HEALTH_MONITORING.set(pubKey,{LAST_SEEN,INDEX,HASH,SUPER_FINALIZATION_PROOF})

        }

        setTimeout(SUBCHAINS_HEALTH_MONITORING,CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

    }


    if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.includes(CONFIG.SYMBIOTE.PUB)){

        //If we're not in quorum - no sense to do this procedure. Just repeat the same procedure later

        setTimeout(SUBCHAINS_HEALTH_MONITORING,CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

    }



    // Get the appropriate pubkey & url to check and validate the answer
    let subchainsURLAndPubKey = await GET_VALIDATORS_URLS(true)


    for(let handler of subchainsURLAndPubKey){

        let responsePromise = fetch(handler.url+'/health').then(r=>r.json()).then(r=>{

            r.pubKey = handler.pubKey

            return r

        }).catch(_=>false)

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

    let candidatesForAnotherCheck = [],
    
        reverseThreshold = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.QUORUM_SIZE-GET_MAJORITY('QUORUM_THREAD'),

        qtRootPub=SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB')



    for(let answer of healthCheckPingbacks){

        let {aggregatedPub,aggregatedSignature,afkValidators} = answer.superFinalizationProof

        let {latestFullyFinalizedHeight,latestHash,pubKey} = answer


        // Received {LAST_SEEN,INDEX,HASH,SUPER_FINALIZATION_PROOF}
        let localHealthHandler = SYMBIOTE_META.HEALTH_MONITORING.get(pubKey)

        // blockID+hash+'FINALIZATION'
        let data = pubKey+':'+latestFullyFinalizedHeight+latestHash+'FINALIZATION'

        let superFinalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkValidators,qtRootPub,data,aggregatedSignature,reverseThreshold)

        //If signature is ok and index is bigger than we have - update the LAST_SEEN time and set new height/hash/superFinalizationProof

        if(superFinalizationProofIsOk && localHealthHandler.INDEX < latestFullyFinalizedHeight){

            localHealthHandler.LAST_SEEN = new Date().getTime()

            localHealthHandler.INDEX = latestFullyFinalizedHeight

            localHealthHandler.HASH = latestHash

            localHealthHandler.SUPER_FINALIZATION_PROOF = {aggregatedPub,aggregatedSignature,afkValidators}

        }else candidatesForAnotherCheck.push(pubKey)
        
    }

    //______ ON THIS STEP - in <candidatesForAnotherCheck> we have subchains that required to be asked via other quorum members and probably start a SKIP_PROCEDURE_STAGE_1 _______

    // Create the random session seed to ask another quorum members

    let session = GET_RANDOM_BYTES_AS_HEX(32)

    let currentTime = new Date().getTime()

    let afkLimit = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.SUBCHAIN_AFK_LIMIT*1000


    let validatorsURLSandPubKeys = await GET_VALIDATORS_URLS(true)

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID


    for(let candidate of candidatesForAnotherCheck){

        //Check if LAST_SEEN is too old. If it's still ok - do nothing(assume that the /health request will be successful next time)

        let localHealthHandler = SYMBIOTE_META.HEALTH_MONITORING.get(candidate)
        
        if(currentTime-localHealthHandler.LAST_SEEN >= afkLimit){

            /*
            
            Send this to POST /skip_procedure_part_1

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
                
                sig:await SIG(session+candidate+localHealthHandler.INDEX+qtPayload)
            
            }

            let sendOptions={

                method:'POST',

                body:JSON.stringify(payload)

            }

            let skipAgreements=[] //Each object will be {pubkey,sig}
            
            //_____________________ Now, go through the quorum members and try to get updates from them or get signatures for SKIP_PROCEDURE_PART_1 _____________________


            for(let validatorHandler of validatorsURLSandPubKeys){

                let answerFromValidator = await fetch(validatorHandler.url+'/skip_procedure_part_1',sendOptions).then(r=>r.json()).catch(_=>'<>')

                /*
                
                    Potential answer might be
                
                    {status:'OK'}        OR          {status:'SKIP',sig:SIG('SKIP_STAGE_1'+session+requestedSubchain+initiator+qtPayload)}     OR      {status:'UPDATE',data:{INDEX,HASH,SUPER_FINALIZATION_PROOF}}
                
                */

                if(answerFromValidator.status==='UPDATE'){

                    // In this case it means that validator we've requested has higher version of subchain, so we just accept it(if SUPER_FINALIZATION_PROOF verification is ok) and break the cycle

                    let {INDEX,HASH} = answerFromValidator.data

                    let {aggregatedPub,aggregatedSignature,afkValidators} = answerFromValidator.data.SUPER_FINALIZATION_PROOF

                    let data = candidate+':'+INDEX+HASH+'FINALIZATION'+qtPayload

                    let superFinalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkValidators,qtRootPub,data,aggregatedSignature,reverseThreshold)

                    if(superFinalizationProofIsOk){

                        // Update the local version in HEALTH_MONITORING

                        localHealthHandler.LAST_SEEN = new Date().getTime()

                        localHealthHandler.INDEX = INDEX

                        localHealthHandler.HASH = HASH

                        localHealthHandler.SUPER_FINALIZATION_PROOF = {aggregatedPub,aggregatedSignature,afkValidators}


                        // And break the cycle for this subchain-candidate
                        break

                    }

                }else if(answerFromValidator.status==='SKIP' && await BLS_VERIFY('SKIP_STAGE_1'+session+candidate+CONFIG.SYMBIOTE.PUB+qtPayload,answerFromValidator.sig,validatorHandler.pubKey)){

                    // Grab the skip agreements to publish to hostchains
                    skipAgreements.push({sig:answerFromValidator.sig,pubKey:validatorHandler.pubKey})

                }

            }


            //______________________ On this step, hense we haven't break, we have a skip agreements in array ______________________

            if(skipAgreements.length>=GET_MAJORITY('QUORUM_THREAD')){

                // We can aggregate this agreements and publish to hostchain as a signal to start SKIP_PROCEDURE_STAGE_2

            }

            // Otherwise - do nothing

        }

    }


    setTimeout(SUBCHAINS_HEALTH_MONITORING,CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

},




FILL_THE_CHECKPOINTS_MANAGER_AND_SKIP_SET=async()=>{

    let validatorsMetadata = Object.keys(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.VALIDATORS_METADATA)

    for(let poolPubKey of validatorsMetadata){

        // If this value is related to the current checkpoint - set to manager, otherwise - take from the VALIDATORS_METADATA as a start point
        // Returned value is {INDEX,HASH,FINALIZATION_PROOF}

        let {INDEX,HASH,FINALIZATION_PROOF} = await SYMBIOTE_META.COMMITMENTS_SKIP_AND_FINALIZATION.get(poolPubKey).catch(_=>false) || SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.VALIDATORS_METADATA[poolPubKey]

        SYMBIOTE_META.CHECKPOINTS_MANAGER.set(poolPubKey,{INDEX,HASH,FINALIZATION_PROOF})


        //__________________________Also, check if SKIP_PROCEDURE proofs exists related to current checkpoint__________________________

        let skipProcedureProofs = await SYMBIOTE_META.COMMITMENTS_SKIP_AND_FINALIZATION.get('SKIP:'+poolPubKey).catch(_=>false)

        if(skipProcedureProofs) SYMBIOTE_META.SKIP_PROCEDURE_STAGE_1.add(poolPubKey)

    }

}




//! Deprecated

// REQUEST_FOR_BLOCKS=async()=>{

//     //Here we check if current QUORUM_THREAD.CHECKPOINT is fresh and if true - ask the blocks from the minimal height defined in checkpoint payload
    
//     let currentMetadata = SYMBIOTE_META.QUORUM_THREAD.CHECKPOIINT.PAYLOAD.VALIDATORS_METADATA

//     let quorumMembersURLS = await GET_QUORUM_MEMBERS_URLS('QUORUM_THREAD')

//     for(let url of)

// }



//________________________________________________________________EXTERNAL_______________________________________________________________________




export let GENERATE_PHANTOM_BLOCKS_PORTION = async() => {


    //Safe "if" branch to prevent unnecessary blocks generation
    if(!SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(CONFIG.SYMBIOTE.PUB)) return


    let myVerificationThreadStats = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[CONFIG.SYMBIOTE.PUB]



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


    phantomBlocksNumber++//DELETE after tests

    //If nothing to generate-then no sense to generate block,so return
    if(phantomBlocksNumber===0) return 


    LOG(`Number of phantoms to generate \x1b[32;1m${phantomBlocksNumber}`,'I')


    for(let i=0;i<phantomBlocksNumber;i++){


        let eventsArray=await GET_EVENTS(),
            
            blockCandidate=new Block(eventsArray),
                        
            hash=Block.genHash(blockCandidate)
    

        blockCandidate.sig=await SIG(hash)
            
        BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m generated ——│\x1b[36;1m`,'S',hash,48,'\x1b[32m',blockCandidate)


        SYMBIOTE_META.GENERATION_THREAD.PREV_HASH=hash
 
        SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX++
    
        let blockID=CONFIG.SYMBIOTE.PUB+':'+blockCandidate.index

        //Store block locally
        await SYMBIOTE_META.BLOCKS.put(blockID,blockCandidate)
           
    }

    //Update the GENERATION_THREAD after all
    await SYMBIOTE_META.STATE.put('GT',SYMBIOTE_META.GENERATION_THREAD)

},




LOAD_GENESIS=async()=>{

    let atomicBatch = SYMBIOTE_META.STATE.batch(),
    
        checkpointTimestamp


    //Load all the configs
    fs.readdirSync(process.env.GENESIS_PATH).forEach(file=>{

        let genesis=JSON.parse(fs.readFileSync(process.env.GENESIS_PATH+`/${file}`))
    
        Object.keys(genesis.STATE).forEach(
        
            addressOrContractID => {

                if(genesis.STATE[addressOrContractID].type==='contract'){

                    let contractMeta = {

                        type:"contract",
                        lang:genesis.STATE[addressOrContractID].lang,
                        balance:genesis.STATE[addressOrContractID].balance,
                        uno:genesis.STATE[addressOrContractID].uno,
                        storages:genesis.STATE[addressOrContractID].storages,
                        bytecode:genesis.STATE[addressOrContractID].bytecode
                    
                    } 

                    //Write metadata first
                    atomicBatch.put(addressOrContractID,contractMeta)

                    //Finally - write genesis storage of contract sharded by contractID_STORAGE_ID => {}(object)
                    for(let storageID of genesis.STATE[addressOrContractID].storages){

                        atomicBatch.put(addressOrContractID+'_STORAGE_'+storageID,genesis.STATE[addressOrContractID][storageID])

                    }

                } else atomicBatch.put(addressOrContractID,genesis.STATE[addressOrContractID]) //else - it's default account

            }
            
        )

        Object.keys(genesis.EVM).forEach(address=>{

            //Put KLY-EVM to KLY-EVM state db which will be used by Trie

        })

        checkpointTimestamp=genesis.CHECKPOINT_TIMESTAMP


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


        Object.keys(genesis.VALIDATORS).forEach(validatorPubKey=>{

            //Push to array of validators on VERIFICATION_THREAD
            SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.push(validatorPubKey)
    
            //Add metadata
            SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[validatorPubKey]={INDEX:-1,HASH:'Poyekhali!@Y.A.Gagarin'} // set the initial values
    
            //Create the appropriate storage for pre-set validators. We'll create the simplest variant - but validators will have ability to change it via txs during the chain work
            
            let contractMetadataTemplate = {
    
                type:"contract",
                lang:'spec/stakingPool',
                balance:0,
                uno:0,
                storages:['POOL'],
                bytecode:''
    
            }
    
            let onlyOnePossibleStorageForStakingContract=genesis.VALIDATORS[validatorPubKey]
            
            //Put metadata
            atomicBatch.put(validatorPubKey+'(POOL)',contractMetadataTemplate)
    
            //Put storage
            //NOTE: We just need a simple storage with ID="POOL"
            atomicBatch.put(validatorPubKey+'(POOL)_STORAGE_POOL',onlyOnePossibleStorageForStakingContract)
    
        })

    })


    await atomicBatch.write()


    //Node starts to verify blocks from the first validator in genesis, so sequency matter
    
    SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER={
        
        VALIDATOR:SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS[0],
        
        INDEX:-1,
        
        HASH:'Poyekhali!@Y.A.Gagarin'
    
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

            VALIDATORS_METADATA:{...SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA},

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

            VALIDATORS_METADATA:{...SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA},

            OPERATIONS:[],

            OTHER_SYMBIOTES:{}

        },

        TIMESTAMP:checkpointTimestamp,

        FOUND_AT_BLOCK:CONFIG.SYMBIOTE.MONITOR.MONITORING_START_FROM
    
    }

    //Inital values of VALIDATORS and VALIDATORS_METADATA on QUORUM_THREAD are the same as on VERIFICATION_THREAD

    SYMBIOTE_META.QUORUM_THREAD.VALIDATORS=[...SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS]

    SYMBIOTE_META.QUORUM_THREAD.VALIDATORS_METADATA={...SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA}


    // Set the rubicon to stop tracking spent txs from WAITING_ROOMs of pools' contracts. Value means the checkpoint id lower edge
    // If your stake/unstake tx was bellow this line - it might be burned. However, the line is set by QUORUM, so it should be safe
    SYMBIOTE_META.VERIFICATION_THREAD.RUBICON=-1
    
    SYMBIOTE_META.QUORUM_THREAD.RUBICON=-1


    //We get the quorum for VERIFICATION_THREAD based on own local copy of VALIDATORS_METADATA state
    SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.QUORUM = GET_QUORUM('VERIFICATION_THREAD')

    //...However, quorum for QUORUM_THREAD might be retrieved from VALIDATORS_METADATA of checkpoints. It's because both threads are async
    SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM = GET_QUORUM('QUORUM_THREAD')

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
        
        SPECIAL_OPERATIONS_MEMPOOL:new Map(), //to hold operations which should be included to checkpoints

        //Сreate mapping for account and it's state to optimize processes while we check blocks-not to read/write to db many times
        STATE_CACHE:new Map(), // ID => ACCOUNT_STATE

        QUORUM_THREAD_CACHE:new Map(), //ADDRESS => ACCOUNT_STATE


        //________________________ CACHES_FOR_MONITORS ________________________

        VERIFICATION_THREAD_EVENTS:[],

        QUORUM_THREAD_EVENTS:[],

        //________________________ AUXILIARY_MAPPINGS ________________________
        
        PEERS:[], //Peers to exchange data with

        STATIC_STUFF_CACHE:new Map(),

        //____________________ CONSENSUS RELATED MAPPINGS ____________________

        COMMITMENTS:new Map(), // the first level of "proofs". Commitments is just signatures by some validator from current quorum that validator accept some block X by ValidatorY with hash H

        FINALIZATION_PROOFS:new Map(), // aggregated proofs which proof that some validator has 2/3N+1 commitments for block PubX:Y with hash H. Key is blockID and value is FINALIZATION_PROOF object

        CHECKPOINTS_MANAGER:new Map(), // validatorID => {INDEX,HASH}. Used to start voting for checkpoints. Each pair is a special handler where key is pubkey of appropriate validator and value is the ( index <=> id ) which will be in checkpoint
    
        HEALTH_MONITORING:new Map(), //used to perform SKIP procedure when we need it and to track changes on subchains. SubchainID => {LAST_SEEN,HEIGHT,HASH,SUPER_FINALIZATION_PROOF:{aggregatedPub,aggregatedSig,afkValidators}}
    
        //____________________ SKIP_PROCEDURE related sets ____________________

        SKIP_PROCEDURE_STAGE_1:new Set(),   // here we'll add subchainIDs of subchains which we have found on hostchains during SKIP_PROCEDURE_STAGE_1(quorum agreement to skip some subchain on some height)

        ASYNC_HELPER_FOR_SKIP_PROCEDURE_STAGE_1:new Map(), //checkpointID => Set(). Contains subchainIDs that should be added to SKIP_PROCEDURE_STAGE_1 set and to local storage COMMITMENTS_SKIP_AND_FINALIZATION related to current checkpoint

        SKIP_PROCEDURE_STAGE_2:new Map(),   // here we'll add subchainIDs after we've voted to skip it. If subchain in this set - we can't generate commitments/finalization proofs for it in current checkpoint's session


    }



    
    //OnlyLinuxFans.Due to incapsulation level we need to create sub-level directory for each symbiote
    let pathes=[process.env.CHAINDATA_PATH,process.env.SNAPSHOTS_PATH]
    
    pathes.forEach(
        
        name => !fs.existsSync(`${name}`) && fs.mkdirSync(`${name}`)
        
    )


    
    

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

        'SUPER_FINALIZATION_PROOFS_DB', //Store aggregated proofs blockID => {aggregatedPub:<BLS quorum majority aggregated pubkey>,aggregatedSignature:<SIG(blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+QT.CHECKPOINT.HEADER.ID)>,afkValidators}

        'QUORUM_THREAD_METADATA', //QUORUM_THREAD itself and other stuff

        //_______________________________ Temporary _______________________________

        //* This storage will be cleared once we find next valid checkpoint during work on QUORUM_THREAD

        /*
        
            Use it to not to vote for another version of a specific block(prevents of producing several version of commitments to avoid forks)
            Use it to vote during SKIP_PROCEDURE to prove the other quorum members that the network have voted for higher subchain segment
            Depending on key it stores different values

            [+] If key is <SubchainID> => {INDEX,HASH,CHECKPOINT,FINALIZATION_PROOF} - we fill the CHECKPOINTS_MANAGER with this values
            [+] If key is <SubchainID:blockIndex> => SIG(blockID+hash+qtPayload) - this is the commitments for blocks which we've created on current checkpoint
            [+] If key is <SKIP:SubchainID> => true It's a pointer which we need to know that we shouldn't create commitments for this <SubchainID> at least in current checkpoint. We fill the SKIP_STAGE_1 set with this values

        */

        'COMMITMENTS_SKIP_AND_FINALIZATION', 

        //_______________________________ EVM storage _______________________________

        'KLY_EVM', //Contains state of EVM

        'KLY_EVM_META' //Contains metadata for KLY-EVM pseudochain (e.g. blocks, logs and so on)


    ].forEach(
        
        dbName => SYMBIOTE_META[dbName]=level(process.env.CHAINDATA_PATH+`/${dbName}`,{valueEncoding:'json'})
        
    )
    
    
    
    
    //____________________________________________Load stuff to db___________________________________________________


    Object.keys(CONFIG.SYMBIOTE.LOAD_STUFF).forEach(
        
        id => SYMBIOTE_META.STUFF.put(id,CONFIG.SYMBIOTE.LOAD_STUFF[id])
        
    )
   

    //...and separate dirs for state and metadata snapshots

    SYMBIOTE_META.SNAPSHOT=level(process.env.SNAPSHOTS_PATH,{valueEncoding:'json'})




    SYMBIOTE_META.GENERATION_THREAD = await SYMBIOTE_META.STATE.get('GT').catch(error=>
        
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


    if(nextIsPresent || !(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX===0 || SYMBIOTE_META.GENERATION_THREAD.PREV_HASH === BLAKE3( CONFIG.SYMBIOTE.PUB + JSON.stringify(previousBlock.time) + JSON.stringify(previousBlock.events) + CONFIG.SYMBIOTE.SYMBIOTE_ID + previousBlock.index + previousBlock.prevHash))){
        
        initSpinner?.stop()

        LOG(`Something wrong with a sequence of generation thread on \x1b[36;1m${SYMBIOTE_ALIAS()}`,'F')
            
        process.exit(107)

    }

    


    //________________Load metadata about symbiote-current hight,collaped height,height for export,etc.___________________




    SYMBIOTE_META.VERIFICATION_THREAD = await SYMBIOTE_META.STATE.get('VT').catch(error=>{

        if(error.notFound){

            //Default initial value
            return {
                            
                FINALIZED_POINTER:{VALIDATOR:'',INDEX:-1,HASH:''},//pointer to know where we should start to process further blocks
    
                VALIDATORS:[],//BLS pubkey0,pubkey1,pubkey2,...pubkeyN

                VALIDATORS_METADATA:{},//PUBKEY => {INDEX:'',HASH:''}
                
                CHECKPOINT:'genesis',

                SNAPSHOT_COUNTER:CONFIG.SYMBIOTE.SNAPSHOTS.RANGE
            
            }

        }else{

            LOG(`Some problem with loading metadata of verification thread\nSymbiote:${SYMBIOTE_ALIAS()}\nError:${error}`,'F')
            
            process.exit(105)

        }
        
    })


    if(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length===0) await LOAD_GENESIS()


    //_____________________________________Set some values to stuff cache___________________________________________

    SYMBIOTE_META.STUFF_CACHE=new AdvancedCache(CONFIG.SYMBIOTE.STUFF_CACHE_SIZE,SYMBIOTE_META.STUFF),

    //Because if we don't have quorum, we'll get it later after discovering checkpoints

    SYMBIOTE_META.STATIC_STUFF_CACHE.set('VT_ROOTPUB',bls.aggregatePublicKeys(SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.QUORUM))

    SYMBIOTE_META.STATIC_STUFF_CACHE.set('QT_ROOTPUB',bls.aggregatePublicKeys(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM))


    // Fill the CHECKPOINTS_MANAGER with the latest, locally stored data

    await FILL_THE_CHECKPOINTS_MANAGER_AND_SKIP_SET()




    //__________________________________Load modules to work with hostchains_________________________________________

    let ticker = CONFIG.SYMBIOTE.CONNECTOR.TICKER,
    
        packID = CONFIG.SYMBIOTE.MANIFEST.HOSTCHAINS[ticker].PACK


    //Depending on packID load appropriate module
    if(CONFIG.EVM.includes(ticker)){
        
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
            
            CONFIG.SYMBIOTE.BALANCE_VIEW?balance:'<disabled>'
        
        }   \x1b[36;1m[${CONFIG.SYMBIOTE.STOP_HOSTCHAIN?'\x1b[31;1mSTOP':'\x1b[32;1mPUSH'}\x1b[36;1m]`,'I')
    
    }


    //____________________________________________GENERAL SYMBIOTE INFO____________________________________________


    LOG(fs.readFileSync(PATH_RESOLVE('images/events/syminfo.txt')).toString(),'S')

    LOG(`Local VERIFICATION_THREAD state is \x1b[32;1m${SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.VALIDATOR} \u001b[38;5;168m}———{\x1b[32;1m ${SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.INDEX} \u001b[38;5;168m}———{\x1b[32;1m ${SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.HASH}`,'I')




    //Ask to approve current set of hostchains
    !CONFIG.PRELUDE.OPTIMISTIC
    &&        
    await new Promise(resolve=>
    
        readline.createInterface({input:process.stdin, output:process.stdout, terminal:false})
            
        .question(`\n ${`\u001b[38;5;${process.env.KLY_MODE==='main'?'23':'202'}m`}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${'\x1b[36;1m'}  Do you agree with the current set of hostchains? Enter \x1b[32;1mYES\x1b[36;1m to continue ———> \x1b[0m`,resolve)
                
    ).then(answer=>answer!=='YES'&& process.exit(108))

    
    SIG_PROCESS={VERIFY:false,GENERATE:false}//we should track events in both threads-as in verification,as in generation

},



/*

    Function to get approvements from other validators to make your validator instance active again

*/
START_AWAKENING_PROCEDURE=()=>{
    
    fetch(CONFIG.SYMBIOTE.AWAKE_HELPER_NODE+'/getquorum').then(r=>r.json()).then(async currentQuorum=>{

        LOG(`Received list of current validators.Preparing to \x1b[31;1m<ALIVE_VALIDATOR>\x1b[32;1m procedure`,'S')

        let promises=[]

        //0. Initially,try to get pubkey => node_ip binding 
        currentQuorum.forEach(
        
            pubkey => promises.push(SYMBIOTE_META.STUFF_CACHE.get(pubkey))
            
        )
    
        let pureUrls = await Promise.all(promises.splice(0)).then(array=>array.filter(Boolean).map(x=>x.payload.url))
        
        //We'll use it to aggreage it to single tx and store locally to allow you to share over the network to include it to one of the block 
        let pingBackMsgs = []

        //Send message to each validator to return our generation thread "back to the game"

        /*
    
            AwakeRequestMessage looks like this
     
            {
                "V":<Pubkey of validator>
                "S":<Signature of hash of his metadata from VALIDATORS_METADATA> e.g. SIG(BLAKE3(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[<PubKey>]))
            }

        */
       

        let myMetadataHash = BLAKE3(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[CONFIG.SYMBIOTE.PUB]))

        let awakeRequestMessage = {
            
            V:CONFIG.SYMBIOTE.PUB,

            S:await SIG(myMetadataHash)
        
        },

        answers=[]

        for(let url of pureUrls) {

            pingBackMsgs.push(fetch(url+'/awakerequest',{method:'POST',body:JSON.stringify(awakeRequestMessage)})
            
                .then(r=>r.json())
                
                .then(resp=>

                    /*
                    
                        Response is

                            {P:CONFIG.SYMBIOTE.PUB,S:<Validator signa SIG(myMetadataHash)>}

                        We collect this responses and aggregate to add to the blocks to return our validators thread to game

                    */

                    BLS_VERIFY(myMetadataHash,resp.S,resp.P).then(_=>answers.push(resp)).catch(_=>false)

                )

                .catch(error=>
                
                    LOG(`Validator ${url} send no data to <ALIVE>. Caused error \n${error}`,'W')

                )

            )

        }



        await Promise.all(pingBackMsgs.splice(0))

        answers = answers.filter(Boolean)


        //Here we have verified signatures from validators

        let majority = GET_MAJORITY('QUORUM_THREAD')


        //If we have majority votes - we can aggregate and share to "ressuect" our node
        if(answers.length>=majority){


            let pubkeys=[],

                nonDecoded=[],
            
                signatures=[],
                
                afkValidators=[]


            answers.forEach(descriptor=>{

                pubkeys.push(descriptor.P)

                nonDecoded.push(descriptor.P)

                signatures.push(new Uint8Array(Buffer.from(descriptor.S,'base64')))

            })


            currentQuorum.forEach(validator=>

                !nonDecoded.includes(validator)&&afkValidators.push(validator)

            )


            let aggregatedPub = bls.aggregatePublicKeys(pubkeys),

                aggregatedSignatures = bls.aggregateSignatures(signatures)


            //Make final verification
            if(await BLS_VERIFY(myMetadataHash,aggregatedSignatures,aggregatedPub)){

                LOG(`♛ Hooray!!! Going to share this TX to resurrect your node. Keep working :)`,'S')

                //Create AwakeMessage here

                let awakeMessage = {

                    T:'AWAKE',

                    V:CONFIG.SYMBIOTE.PUB, //AwakeMessage issuer(validator who want to activate his thread again)
                   
                    P:aggregatedPub, //Approver's aggregated BLS pubkey

                    S:aggregatedSignatures,

                    H:myMetadataHash,

                    A:afkValidators //AFK validators who hadn't vote. Need to agregate it to the ROOT_VALIDATORS_KEYS

                }


                //And share it

                fetch(CONFIG.SYMBIOTE.AWAKE_HELPER_NODE+'/vmessage',{

                    method:'POST',

                    body:JSON.stringify(awakeMessage)

                }).then(r=>r.text()).then(async response=>

                    response==='OK'
                    ?
                    LOG('Ok, validators received your \u001b[38;5;60m<AWAKE_MESSAGE>\x1b[32;1m, so soon your \x1b[31;1mGT\x1b[32;1m will be activated','S')
                    :
                    LOG(`Some error occured with sending \u001b[38;5;50m<AWAKE_MESSAGE>\u001b[38;5;3m - try to resend it manualy or change the endpoints(\u001b[38;5;167mAWAKE_HELPER_NODE\u001b[38;5;3m) to activate your \u001b[38;5;177mGT`,'W')

                ).catch(error=>

                    LOG(`Some error occured with sending \u001b[38;5;50m<AWAKE_MESSAGE>\u001b[38;5;3m - try to resend it manualy or change the endpoints(\u001b[38;5;167mAWAKE_HELPER_NODE\u001b[38;5;3m) to activate your \u001b[38;5;177mGT\n${error}`,'W')
                
                )


            }else LOG(`Aggregated verification failed. Try to activate your node manually`,'W')

        }

    }).catch(error=>LOG(`Can't get current validators set\n${error}`,'W'))

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


        // TODO: Move this function to the moment when we'll get the current QUORUM(via QUORUM_THREAD)
        // setTimeout(()=>

        //     SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(CONFIG.SYMBIOTE.PUB) && START_AWAKENING_PROCEDURE()

        // ,3000)


        //Run another thread to ask for blocks
        // UPD:We have decied to speed up this procedure during parallelism & plugins
        // GET_BLOCKS_FOR_FUTURE_WRAPPER()


    }

}