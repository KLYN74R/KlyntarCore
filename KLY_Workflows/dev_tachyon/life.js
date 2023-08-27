import {CHECK_IF_ALL_ASP_PRESENT,GET_BLOCK,START_VERIFICATION_THREAD,VERIFY_AGGREGATED_FINALIZATION_PROOF} from './verification.js'

import {
    
    GET_POOLS_URLS,GET_MAJORITY,BROADCAST,CHECK_IF_CHECKPOINT_STILL_FRESH,USE_TEMPORARY_DB,

    DECRYPT_KEYS,BLOCKLOG,BLS_SIGN_DATA,HEAP_SORT,GET_ALL_KNOWN_PEERS,

    GET_QUORUM,GET_FROM_STATE_FOR_QUORUM_THREAD,IS_MY_VERSION_OLD

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


    for(let [poolPubKey,poolMetadata] of Object.entries(checkpoint.poolsMetadata)){

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

    let hashOfMetadataFromOldCheckpoint = BLAKE3(JSON.stringify(checkpoint.poolsMetadata))

    
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




DELETE_POOLS_WITH_LACK_OF_STAKING_POWER = async (validatorPubKey,fullCopyOfQuorumThreadWithNewCheckpoint) => {

    //Try to get storage "POOL" of appropriate pool

    let poolStorage = await GET_FROM_STATE_FOR_QUORUM_THREAD(validatorPubKey+'(POOL)_STORAGE_POOL')


    poolStorage.lackOfTotalPower = true

    poolStorage.stopCheckpointID = fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.id


    //Remove from POOLS array(to prevent be elected to quorum) and metadata

    delete fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.poolsMetadata[validatorPubKey]

},




EXECUTE_SYSTEM_SYNC_OPERATIONS_IN_NEW_CHECKPOINT = async (atomicBatch,fullCopyOfQuorumThreadWithNewCheckpoint) => {

    
    //_______________________________Perform SPEC_OPERATIONS_____________________________

    let workflowOptionsTemplate = {...fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS}
    
    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set('WORKFLOW_OPTIONS',workflowOptionsTemplate)
    
    // Structure is <poolID> => true if pool should be deleted
    global.SYMBIOTE_META.QUORUM_THREAD_CACHE.set('SLASH_OBJECT',{})
    

    //But, initially, we should execute the SLASH_UNSTAKE operations because we need to prevent withdraw of stakes by rogue pool(s)/stakers
    for(let operation of fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.operations){
     
        if(operation.type==='SLASH_UNSTAKE') await SYSTEM_OPERATIONS_VERIFIERS.SLASH_UNSTAKE(operation.payload,false,true)
    
    }

    //Here we have the filled(or empty) array of pools and delayed IDs to delete it from state

    for(let operation of fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.operations){
        
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

    let toRemovePools = [], promises = [], quorumThreadPools = Object.keys(fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.poolsMetadata)


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
    
        deletePoolsPromises.push(DELETE_POOLS_WITH_LACK_OF_STAKING_POWER(address,fullCopyOfQuorumThreadWithNewCheckpoint))
    
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
        delete fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.poolsMetadata[poolIdentifier]
    
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




//Use it to find checkpoints on hostchains, perform them and join to QUORUM by finding the latest valid checkpoint
let START_QUORUM_THREAD_CHECKPOINT_TRACKER=async()=>{


    //_________________________FIND THE NEXT CHECKPOINT AND EXECUTE SYNC SYSTEM OPERATIONS INSTANTLY_____________________________

    /*
    

        1. Check if new epoch must be started(new day by default)
    
        2. Find first X blocks in epoch per each subchain(1 block by default). This value is defined in global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.SYSTEM_SYNC_OPERATIONS_LIMIT_PER_BLOCK

            To do it, follow the steps bellow:
                
                1) Check the await global.SYMBIOTE_META.EPOCH_DATA.put('FIRST_BLOCK_ASSUMPTION:'+subchainID,pureObj).catch(_=>false)    
                
                start the naive mode(cyclic) and perform a GET /first_block_assumptions requests to the quorum members

                We'll receive the object like this:


                {

                }
                
                
                get blocks & AFPs for it. In case of reassignments we still can easily get the first X blocks thanks to proofs in ASPs(aggregated skip proofs)

                Because it contains {index,hash} we can extract required number of blocks and finish grabbing


        3. Extract SYSTEM_SYNC_OPERATIONS from block headers and run it in a sync mode

        4. Increment value of checkpoint index(checkpoint.id) and recount new hash(checkpoint.hash)
    
        5. Prepare new object in TEMP(checkpointFullID) and set new version of checkpoint on QT
    
    
    */
    
    let possibleCheckpoint = false


    if(possibleCheckpoint){

        // We need it for changes
        let fullCopyOfQuorumThreadWithNewCheckpoint = JSON.parse(JSON.stringify(global.SYMBIOTE_META.QUORUM_THREAD))

        // Set the new checkpoint
        fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT = possibleCheckpoint

        // Store original checkpoint locally
        await global.SYMBIOTE_META.EPOCH_DATA.put(possibleCheckpoint.hash,possibleCheckpoint)

        // All operations must be atomic
        let atomicBatch = global.SYMBIOTE_META.QUORUM_THREAD_METADATA.batch()

        // Get the FullID of old checkpoint
        let oldCheckpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.id


        // Execute system sync operations from new checkpoint using our copy of QT and atomic handler
        await EXECUTE_SYSTEM_SYNC_OPERATIONS_IN_NEW_CHECKPOINT(atomicBatch,fullCopyOfQuorumThreadWithNewCheckpoint)


        // After execution - create the reassignment chains
        await SET_REASSIGNMENT_CHAINS(possibleCheckpoint)


        LOG(`\u001b[38;5;154mSystem sync operations were executed for checkpoint \u001b[38;5;93m${possibleCheckpoint.id} ### ${possibleCheckpoint.hash} (QT)\u001b[0m`,'S')

        // Mark as completed
        fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.completed = true

        // Create new quorum based on new POOLS_METADATA state
        fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.quorum = GET_QUORUM(fullCopyOfQuorumThreadWithNewCheckpoint.CHECKPOINT.poolsMetadata,fullCopyOfQuorumThreadWithNewCheckpoint.WORKFLOW_OPTIONS)

        
        
        let nextQuorumThreadID = possibleCheckpoint.hash+"#"+possibleCheckpoint.id
    
        // Create new temporary db for the next checkpoint
        let nextTempDB = level(process.env.CHAINDATA_PATH+`/${nextQuorumThreadID}`,{valueEncoding:'json'})


        let nextTempDBBatch = nextTempDB.batch()


        await nextTempDBBatch.write()

        // Commit changes
        atomicBatch.put('QT',fullCopyOfQuorumThreadWithNewCheckpoint)

        await atomicBatch.write()
    

        // Create mappings & set for the next checkpoint
        let nextTemporaryObject = {

            COMMITMENTS:new Map(), 
            FINALIZATION_PROOFS:new Map(),

            CHECKPOINT_MANAGER:new Map(),
            CHECKPOINT_MANAGER_SYNC_HELPER:new Map(),

            SYSTEM_SYNC_OPERATIONS_MEMPOOL:[],
 
            SKIP_HANDLERS:new Map(), // {wasReassigned:boolean,extendedAggregatedCommitments,aggregatedSkipProof}

            SYNCHRONIZER:new Map(),
            
            REASSIGNMENTS:new Map(),

            HEALTH_MONITORING:new Map(),
      
            DATABASE:nextTempDB
            
        }

        global.SYMBIOTE_META.QUORUM_THREAD = fullCopyOfQuorumThreadWithNewCheckpoint

        LOG(`QUORUM_THREAD was updated => \x1b[34;1m${global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.id} ### ${global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash}`,'S')

        // Get the new ROOTPUB and delete the old one
        global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('QT_ROOTPUB'+nextQuorumThreadID,bls.aggregatePublicKeys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum))
    
        global.SYMBIOTE_META.STATIC_STUFF_CACHE.delete('QT_ROOTPUB'+oldCheckpointFullID)


        //_______________________Check the version required for the next checkpoint________________________


        if(IS_MY_VERSION_OLD('QUORUM_THREAD')){

            LOG(`New version detected on QUORUM_THREAD. Please, upgrade your node software`,'W')

            console.log('\n')
            console.log(fs.readFileSync(PATH_RESOLVE('images/events/update.txt')).toString())
        
            // Stop the node to update the software
            GRACEFUL_STOP()

        }


        // Close & delete the old temporary db 
        await global.SYMBIOTE_META.TEMP.get(oldCheckpointFullID).DATABASE.close()
        
        fs.rm(process.env.CHAINDATA_PATH+`/${oldCheckpointFullID}`,{recursive:true},()=>{})
        
        global.SYMBIOTE_META.TEMP.delete(oldCheckpointFullID)


        //________________________________ If it's fresh checkpoint and we present there as a member of quorum - then continue the logic ________________________________


        let iAmInTheQuorum = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.includes(global.CONFIG.SYMBIOTE.PUB)

        let poolsMetadata = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.poolsMetadata


        if(CHECK_IF_CHECKPOINT_STILL_FRESH(global.SYMBIOTE_META.QUORUM_THREAD) && iAmInTheQuorum){

            // Fill the checkpoints manager with the latest data

            let currentCheckpointManager = nextTemporaryObject.CHECKPOINT_MANAGER

            let currentCheckpointSyncHelper = nextTemporaryObject.CHECKPOINT_MANAGER_SYNC_HELPER

            Object.keys(poolsMetadata).forEach(
            
                poolPubKey => {

                    let nullishTemplate = {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',isReserve:poolsMetadata[poolPubKey].isReserve}

                    currentCheckpointManager.set(poolPubKey,nullishTemplate)

                    currentCheckpointSyncHelper.set(poolPubKey,nullishTemplate)

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





CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT=async()=>{

    let qtCheckpoint = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT

    let checkpointFullID = qtCheckpoint.hash+"#"+qtCheckpoint.id

    let reassignmentChains = qtCheckpoint.reassignmentChains // primePoolPubKey => [reservePool0,reservePool1,...,reservePoolN]

    let temporaryObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    if(!temporaryObject){

        setTimeout(CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT,3000)

        return

    }


    let quorumRootPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID),
    
        iAmInTheQuorum = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.includes(global.CONFIG.SYMBIOTE.PUB)



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

                5) If validator agree with all the propositions - it generate signatures for all the subchain to paste this short proof to the fist block in the next epoch(to section block.extraData.aggregatedEpochFinalizationProof)

                6) If we get 2/3N+1 agreements for ALL the subchains - aggregate it and store locally. This called AGGREGATED_EPOCH_FINALIZATION_PROOF (AEFP)

                    The structure is


                    {
                        
                        lastAuthority:<index of BLS pubkey of some pool in subchain's reassignment chain>,
                        lastIndex:<index of his block in previous epoch>,
                        lastHash:<hash of this block>,

                        proof:{

                            aggregatedPub:<BLS aggregated pubkey of signers>,
                            aggregatedSignature: SIG('EPOCH_DONE'+lastAuth+lastIndex+lastHash+checkpointFullId)
                            afkVoters:[] - array of BLS pubkeys who haven't voted

                        }
                    
                    }

                7) Then, we can share these proofs by route GET /aggregated_epoch_finalization_proof/:EPOCH_ID/:SUBCHAIN_ID

                8) Prime pool and other reserve pools on each subchain can query network for this proofs to set to
                
                    block.extraData.aggregatedEpochFinalizationProof to know where to start VERIFICATION_THREAD in a new epoch                
                

            */
         
            checkpointProposition[primePoolPubKey] = {

                currentAuthority:indexOfAuthority,

                finalizationProof:temporaryObject.CHECKPOINT_MANAGER.get(pubKeyOfAuthority) || {index:-1,hash:'0123456701234567012345670123456701234567012345670123456701234567'}

            }

            
        }

        
        //____________________________________ Send the checkpoint proposition ____________________________________


        let optionsToSend = {method:'POST',body:JSON.stringify(checkpointProposition),agent:global.FETCH_HTTP_AGENT}
        
        let quorumMembers = await GET_POOLS_URLS(true)


        //Descriptor is {url,pubKey}
        for(let descriptor of quorumMembers){

            // No sense to get the commitment if we already have
            
            await fetch(descriptor.url+'/checkpoint_proposition',optionsToSend).then(r=>r.json()).then(async possibleAgreements => {

                /*
                
                    possibleAgreements structure is:
                    
                    
                        {
                            subchainA:{
                                
                                status:'UPGRADE'|'OK',

                                -------------------------------[In case 'OK']-------------------------------

                                sig: SIG('EPOCH_DONE'+lastAuth+lastIndex+lastHash+checkpointFullId)
                        
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

                    for(let [primePoolPubKey,metadata] of checkpointProposition){

                        let agreementsForThisSubchain = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('CHECKPOINT_PROPOSITION' + checkpointFullID).get(primePoolPubKey) // signer => signature                        

                        let response = possibleAgreements[primePoolPubKey]

                        if(response){

                            if(response.status==='OK'){

                                // Verify EPOCH_FINALIZATION_PROOF signature and store to mapping

                                let dataThatShouldBeSigned = 'EPOCH_DONE'+metadata.currentAuthority+metadata.finalizationProof.index+metadata.finalizationProof.hash+checkpointFullID

                                let isOk = await bls.singleVerify(dataThatShouldBeSigned,descriptor.pubKey,response.sig).catch(_=>false)

                                if(isOk) agreementsForThisSubchain.set(descriptor.pubKey,response.sig)

                            }else if(response.status==='UPGRADE'){

                                // Verify finalization proof and add to upgradesForNextIterations

                                let {index,hash,aggregatedCommitments} = response.finalizationProof
                            
                                let {aggregatedPub,aggregatedSignature,afkVoters} = aggregatedCommitments
                            
                                let pubKeyOfProposedAuthority = reassignmentChains[primePoolPubKey][response.currentAuthority]

                                let dataThatShouldBeSigned = `${qtCheckpoint.id}:${pubKeyOfProposedAuthority}:${index}`+hash+checkpointFullID // typical commitment signature blockID+hash+checkpointFullID
                            
                                let reverseThreshold = qtCheckpoint.quorum.length - majority
                            
                                let isOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,quorumRootPub,dataThatShouldBeSigned,aggregatedSignature,reverseThreshold).catch(_=>false)
                            
                            
                                if(isOk){
                            
                                    // Update the REASSIGNMENTS

                                    temporaryObject.REASSIGNMENTS.set(primePoolPubKey) = {currentAuthority:response.currentAuthority}
                                    
                                    // Update CHECKPOINT_MANAGER

                                    temporaryObject.CHECKPOINT_MANAGER.set(pubKeyOfProposedAuthority) = {index,hash,aggregatedCommitments:{aggregatedPub,aggregatedSignature,afkVoters}}                                    
                            
                                    // Clear the mapping with signatures because it becomes invalid

                                    agreementsForThisSubchain.clear()

                                }

                            }

                        }

                    }

                }
                
            }).catch(_=>{})
            
            
        }
            
    
        // Iterate over upgrades and set new values for finalization proofs

        for(let [primePoolPubKey,metadata] of checkpointProposition){

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

                    proof:{

                        aggregatedPub:bls.aggregatePublicKeys(signers),
                    
                        aggregatedSignature:bls.aggregateSignatures(signatures),
                        
                        afkVoters
            
                    }
                    
                }

                await global.SYMBIOTE_META.EPOCH_DATA.put(`AEFP:${qtCheckpoint.id}:${primePoolPubKey}`,aggregatedEpochFinalizationProof).catch(_=>{})

            }

        }

    }

    setTimeout(CHECK_IF_ITS_TIME_TO_PROPOSE_CHECKPOINT,3000) // each 3 seconds - do monitoring

},




RUN_FINALIZATION_PROOFS_GRABBING = async (checkpoint,blockID) => {


    let block = await global.SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>false)

    let blockHash = Block.genHash(block)

    let checkpointFullID = checkpoint.hash + "#" + checkpoint.id



    if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)) return


    let {COMMITMENTS,FINALIZATION_PROOFS,DATABASE} = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    //Create the mapping to get the FINALIZATION_PROOFs from the quorum members. Inner mapping contains voterValidatorPubKey => his FINALIZATION_PROOF   
    
    FINALIZATION_PROOFS.set(blockID,new Map())

    let finalizationProofsMapping = FINALIZATION_PROOFS.get(blockID)

    let aggregatedCommitments = COMMITMENTS.get(blockID) //voterValidatorPubKey => his commitment 


    let optionsToSend = {method:'POST',body:JSON.stringify(aggregatedCommitments),agent:global.FETCH_HTTP_AGENT},

        quorumMembers = await GET_POOLS_URLS(true),

        majority = GET_MAJORITY(checkpoint),

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
        await global.SYMBIOTE_META.EPOCH_DATA.put('AFP:'+blockID,aggregatedFinalizationProof).catch(_=>false)


        // Repeat procedure for the next block and store the progress
        let appropriateDescriptor = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

        await USE_TEMPORARY_DB('put',DATABASE,'BLOCK_SENDER_HANDLER',appropriateDescriptor).catch(_=>false)

        appropriateDescriptor.height++

    }

},




RUN_COMMITMENTS_GRABBING = async (checkpoint,blockID) => {


    let block = await global.SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>false)

    // Check for this block after a while
    if(!block) return


    let blockHash = Block.genHash(block)

    let checkpointFullID = checkpoint.hash + "#" + checkpoint.id


    let optionsToSend = {method:'POST',body:JSON.stringify(block),agent:global.FETCH_HTTP_AGENT},

        commitmentsMapping = global.SYMBIOTE_META.TEMP.get(checkpointFullID).COMMITMENTS,

        tempDatabase = global.SYMBIOTE_META.TEMP.get(checkpointFullID).DATABASE,    
        
        majority = GET_MAJORITY(checkpoint),

        quorumMembers = await GET_POOLS_URLS(true),

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

        //In case we get the aggregated commitments for the first block in epoch X - store it. We'll need it to paste to ASP or AEFP to know the first block in epoch

        await USE_TEMPORARY_DB('put',tempDatabase,'AC_OF_MY_FIRST_BLOCK',aggregatedCommitments).catch(_=>false)

        await RUN_FINALIZATION_PROOFS_GRABBING(checkpoint,blockID).catch(_=>{})

    }

},




SEND_BLOCKS_AND_GRAB_COMMITMENTS = async () => {

    let qtCheckpoint = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT


    // If we don't generate the blocks - skip this function
    if(!qtCheckpoint.poolsMetadata[global.CONFIG.SYMBIOTE.PUB]){

        setTimeout(SEND_BLOCKS_AND_GRAB_COMMITMENTS,3000)

        return

    }

    
    let checkpointFullID = qtCheckpoint.hash + "#" + qtCheckpoint.id


    if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)){

        setTimeout(SEND_BLOCKS_AND_GRAB_COMMITMENTS,3000)

        return

    }

    // Descriptor has the following structure - {checkpointID,height}
    let appropriateDescriptor = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

    let {FINALIZATION_PROOFS,DATABASE} = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    if(!appropriateDescriptor || appropriateDescriptor.checkpointID !== qtCheckpoint.id){

        //If we still works on the old checkpoint - continue
        //Otherwise,update the latest height/hash and send them to the new QUORUM
        appropriateDescriptor = await USE_TEMPORARY_DB('get',DATABASE,'BLOCK_SENDER_HANDLER').catch(_=>false)

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
        await RUN_FINALIZATION_PROOFS_GRABBING(qtCheckpoint,blockID).catch(_=>{})

    }else{

        // This option means that we already started to share block and going to find 2/3N+1 commitments
        // Once we get it - aggregate it and start finalization proofs grabbing(previous option)

        await RUN_COMMITMENTS_GRABBING(qtCheckpoint,blockID).catch(_=>{})

    }

    setImmediate(SEND_BLOCKS_AND_GRAB_COMMITMENTS)

},




//Iterate over SKIP_HANDLERS to get <aggregatedSkipProof>s and approvements to move to the next reserve pools
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

                }),

                agent:global.FETCH_HTTP_AGENT

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
                        
                        let aggregatedCommitmentsIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID),dataThatShouldBeSigned,aggregatedSignature,checkpoint.quorum.length-majority).catch(_=>false)
            

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

                        afkVoters:checkpoint.quorum.filter(pubKey=>!pubkeysWhoAgreeToSkip.includes(pubKey))
                        
                    }

                }

                await USE_TEMPORARY_DB('put',currentCheckpointDB,'SKIP_HANDLER:'+poolWithSkipHandler,skipHandler).catch(_=>{})                


            }

        }


        if(skipHandler.aggregatedSkipProof){
    
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
                    
                }),

                agent:global.FETCH_HTTP_AGENT

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



                //_____________________________________Now, create the request for reassignment_____________________________________
                
                // In case typeof is string - it's reserve pool which points to prime pool, so we should put appropriate request
                // In case currentStateInReassignments is nothing(undefined,null,etc.) - it's prime pool without any reassignments

                let primePoolPubKey = reassignments.get(poolWithSkipHandler) || poolWithSkipHandler

                let currentSubchainAuthority


                // Add the reassignment

                let reassignmentMetadata = reassignments.get(primePoolPubKey) // {currentAuthority:<number>} - pointer to current reserve pool in array (QT/VT).CHECKPOINT.reassignmentChains[<primePool>]


                if(!reassignmentMetadata){

                    // Create new handler

                    reassignmentMetadata = {currentAuthority:-1}

                    currentSubchainAuthority = primePoolPubKey

                }else currentSubchainAuthority = checkpoint.reassignmentChains[primePoolPubKey][reassignmentMetadata.currentAuthority] // {primePool:[<reservePool1>,<reservePool2>,...,<reservePoolN>]}


                let nextIndex = reassignmentMetadata.currentAuthority + 1

                let nextReservePool = checkpoint.reassignmentChains[primePoolPubKey][nextIndex] // array checkpoint.reassignmentChains[primePoolID] might be empty if the prime pool doesn't have reserve pools


                // We need to mark wasReassigned pool that was authority for this subchain

                let skipHandlerOfAuthority = JSON.parse(JSON.stringify(skipHandlers.get(currentSubchainAuthority))) // {wasReassigned,extendedAggregatedCommitments,aggregatedSkipProof}

                skipHandlerOfAuthority.wasReassigned = true


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
                    
                    skipHandlers.get(currentSubchainAuthority).wasReassigned = true

                    
                    reassignmentMetadata.currentAuthority++
    

                    // Set new values - handler for prime pool and pointer to prime pool for reserve pool

                    reassignments.set(primePoolPubKey,reassignmentMetadata)

                    reassignments.set(nextReservePool,primePoolPubKey)


                }).catch(_=>false)

            }
      
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
    if(!checkpoint.quorum.includes(global.CONFIG.SYMBIOTE.PUB) || synchronizer.has('TIME_TO_NEW_EPOCH') || !CHECK_IF_CHECKPOINT_STILL_FRESH(checkpoint)){

        setTimeout(SUBCHAINS_HEALTH_MONITORING,global.CONFIG.SYMBIOTE.TACHYON_HEALTH_MONITORING_TIMEOUT)

        return

    }



    // Get the appropriate pubkey & url to check and validate the answer
    let poolsURLsAndPubKeys = await GET_POOLS_URLS(true)

    let proofsPromises = []

    let candidatesForAnotherCheck = []

    let reassignments = tempObject.REASSIGNMENTS
    
    let reverseThreshold = checkpoint.quorum.length-GET_MAJORITY(checkpoint)

    let qtRootPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)


    
    for(let handler of poolsURLsAndPubKeys){
        
        let metadataOfCurrentPool = checkpoint.poolsMetadata[handler.pubKey]

        /*
        
        We should monitor the health only for:

        [0] Pools that are not in SKIP_HANDLERS
        [1] Reserve pools that are currently work for prime pool

        */

        let poolIsInReassignment = metadataOfCurrentPool.isReserve && typeof reassignments.get(handler.pubKey) === 'string'

        let isItPrimePool = !metadataOfCurrentPool.isReserve


        if(!tempObject.SKIP_HANDLERS.has(handler.pubKey) && (isItPrimePool || poolIsInReassignment)){

            let createRequest = synchronizer.get('CREATE_SKIP_HANDLER:'+handler.pubKey)

            if(createRequest && synchronizer.get('NO_FP_NOW:'+handler.pubKey)){

                // This prevents creating FINALIZATION_PROOFS for pool and initiate the reassignment procedure

                let futureSkipHandler = {

                    wasReassigned:false, // will be true after we get the 2/3N+1 approvement of having <aggregatedSkipProof> from other quorum members

                    extendedAggregatedCommitments:JSON.parse(JSON.stringify(tempObject.CHECKPOINT_MANAGER.get(handler.pubKey))), // {index,hash,aggregatedCommitments}

                    aggregatedSkipProof:null // for future - when we get the 2/3N+1 skip proofs from POST /get_skip_proof - aggregate and use to insert in blocks of reserve pool and so on

                }

                await USE_TEMPORARY_DB('put',tempObject.DATABASE,'SKIP_HANDLER:'+handler.pubKey,futureSkipHandler).then(()=>{

                    tempObject.SKIP_HANDLERS.set(handler.pubKey,futureSkipHandler)

                    // Delete the request
                    synchronizer.delete('CREATE_SKIP_HANDLER:'+handler.pubKey)

                    // Clear the NO_FP_NOW protection
                    synchronizer.delete('NO_FP_NOW:'+handler.pubKey)


                }).catch(_=>false)

            }else if(!createRequest){

                let responsePromise = fetch(handler.url+'/health',{agent:global.FETCH_HTTP_AGENT}).then(r=>r.json()).then(response=>{

                    response.pubKey = handler.pubKey
        
                    return response
        
                }).catch(_=>{candidatesForAnotherCheck.push(handler.pubKey)})
        
                proofsPromises.push(responsePromise)    

            }

        }

    }

    //Run promises
    let healthCheckPingbacks = (await Promise.all(proofsPromises)).filter(Boolean)


    /*
    
        Each object in healthCheckPingbacks array has the following structure
        
        {

            pubKey,

            afpForFirstBlock:{

                blockID,
            
                blockHash,

                aggregatedPub:bls.aggregatePublicKeys(signers),
            
                aggregatedSignature:bls.aggregateSignatures(signatures),
            
                afkVoters

            }
        
            currentHealth:{

                index, // height of block that we already finalized. Also, below you can see the AGGREGATED_FINALIZATION_PROOF. We need it as a quick proof that majority have voted for this segment of subchain
            
                hash:<>,

                aggregatedFinalizationProof:{
            
                    aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HASH+"#"+QT.CHECKPOINT.id
                    aggregatedPub:<>,
                    afkVoters
        
                }
      
            }

        }
    
    */



    for(let answer of healthCheckPingbacks){


        if(typeof answer !== 'object' || typeof answer.afpForFirstBlock !== 'object' || typeof answer.currentHealth !== 'object' || typeof answer.currentHealth.aggregatedFinalizationProof !== 'object'){

            candidatesForAnotherCheck.push(answer.pubKey)

            continue
        }

        let {aggregatedPub,aggregatedSignature,afkVoters} = answer.currentHealth.aggregatedFinalizationProof

        let {index,hash} = answer.currentHealth

        let pubKey = answer.pubKey


        // Received {lastSeen,index,hash,aggregatedFinalizationProof}
        let localHealthHandler = tempObject.HEALTH_MONITORING.get(pubKey)

        if(!localHealthHandler){

            localHealthHandler = {

                afpForFirstBlock:{},

                currentHealth:{index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'}

            }

            tempObject.HEALTH_MONITORING.set(pubKey,localHealthHandler)            

        }


        //__________________________________Verify the AFP proof_________________________________________________

        
        let data = checkpoint.id+':'+pubKey+':'+index+hash+'FINALIZATION'+checkpointFullID

        let aggregatedFinalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,qtRootPub,data,aggregatedSignature,reverseThreshold).catch(_=>false)


        //_____Verify the AFP for the first block in case we still don't have assumptions for subchain_____

        let afpForFirstBlockSignatureIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(answer.afpForFirstBlock,checkpoint,global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID))

        let subchainID = checkpoint.poolsMetadata[pubKey].isReserve ? reassignments.get(pubKey) : pubKey

        let assumptionForFirstBlockExists = await global.SYMBIOTE_META.EPOCH_DATA.get('FIRST_BLOCK_ASSUMPTION:'+subchainID).catch(_=>false)

        let afpForFirstBlockIsOk = assumptionForFirstBlockExists || afpForFirstBlockSignatureIsOk


        // If signature is ok and index is bigger than we have - update the <lastSeen> time and set new height/hash/aggregatedFinalizationProof

        if(aggregatedFinalizationProofIsOk && afpForFirstBlockIsOk && (localHealthHandler.index < index || localHealthHandler.index === -1)){

            localHealthHandler.currentHealth.lastSeen = GET_GMT_TIMESTAMP()

            localHealthHandler.currentHealth.index = index

            localHealthHandler.currentHealth.hash = hash

            localHealthHandler.currentHealth.aggregatedFinalizationProof = {aggregatedPub,aggregatedSignature,afkVoters}


            if(!assumptionForFirstBlockExists && afpForFirstBlockSignatureIsOk){

                // This branch in case when we haven't had assumption, so store it

                let pureObj = {
                    
                    blockID:answer.afpForFirstBlock.blockID,
                    blockHash:answer.afpForFirstBlock.blockHash,
                    aggregatedPub:answer.afpForFirstBlock.aggregatedPub,
                    aggregatedSignature:answer.afpForFirstBlock.aggregatedSignature,
                    afkVoters:answer.afpForFirstBlock.afkVoters
                
                }

                await global.SYMBIOTE_META.EPOCH_DATA.put('FIRST_BLOCK_ASSUMPTION:'+subchainID,pureObj).catch(_=>false)

                localHealthHandler.afpForFirstBlock = pureObj

            }else candidatesForAnotherCheck.push(pubKey)


        }else candidatesForAnotherCheck.push(pubKey)
        
    }

    //______ ON THIS STEP - in <candidatesForAnotherCheck> we have pools that required to be asked via other quorum members and probably start a skip procedure _______


    let currentTime = GET_GMT_TIMESTAMP()

    let afkLimit = global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.SUBCHAIN_AFK_LIMIT


    
    for(let candidate of candidatesForAnotherCheck){

        let localHealthHandler = tempObject.HEALTH_MONITORING.get(candidate) // {currentHealth:{lastSeen,index,hash,aggregatedFinalizationProof},afpForFirstBlock}

        if(currentTime-localHealthHandler.currentHealth.lastSeen >= afkLimit){

            let updateWasFound = false
            
            //_____________________ Now, go through the quorum members and try to get updates from them_____________________

            for(let validatorHandler of poolsURLsAndPubKeys){

                let answer = await fetch(validatorHandler.url+'/get_health_of_another_pool/'+candidate,{agent:global.FETCH_HTTP_AGENT}).then(r=>r.json()).catch(_=>false)

                if(typeof answer.afpOfPoolXFromAnotherQuorumMember === 'object' && typeof answer.currentHealth === 'object' && typeof answer.afpForFirstBlock){

                    // Verify and if ok - break the cycle

                    let {index,hash,aggregatedFinalizationProof} = answer.currentHealth

                    if(aggregatedFinalizationProof){

                        let {aggregatedPub,aggregatedSignature,afkVoters} = aggregatedFinalizationProof

                        let data = checkpoint.id+":"+candidate+':'+index+hash+'FINALIZATION'+checkpointFullID
    
                        let aggregatedFinalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,qtRootPub,data,aggregatedSignature,reverseThreshold).catch(_=>false)
    
                        
                        //_____Verify the AFP for the first block in case we still don't have assumptions for subchain_____

                        let afpForFirstBlockSignatureIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(answer.afpForFirstBlock,checkpoint,global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID))

                        let subchainID = checkpoint.poolsMetadata[pubKey].isReserve ? reassignments.get(pubKey) : pubKey
                
                        let assumptionForFirstBlockExists = await global.SYMBIOTE_META.EPOCH_DATA.get('FIRST_BLOCK_ASSUMPTION:'+subchainID).catch(_=>false)
                
                        let afpForFirstBlockIsOk = assumptionForFirstBlockExists || afpForFirstBlockSignatureIsOk

                        //If signature is ok and index is bigger than we have - update the <lastSeen> time and set new aggregatedFinalizationProof
    
                        if(aggregatedFinalizationProofIsOk && afpForFirstBlockIsOk && (localHealthHandler.currentHealth.index < index || localHealthHandler.currentHealth.index === -1)){
    
                            localHealthHandler.currentHealth.lastSeen = currentTime

                            localHealthHandler.currentHealth.index = index

                            localHealthHandler.currentHealth.hash = hash
    
                            localHealthHandler.currentHealth.aggregatedFinalizationProof = {aggregatedPub,aggregatedSignature,afkVoters}
    

                            if(!assumptionForFirstBlockExists && afpForFirstBlockSignatureIsOk){

                                // This branch in case when we haven't had assumption, so store it
                
                                let pureObj = {
                                    
                                    blockID:answer.afpForFirstBlock.blockID,
                                    blockHash:answer.afpForFirstBlock.blockHash,
                                    aggregatedPub:answer.afpForFirstBlock.aggregatedPub,
                                    aggregatedSignature:answer.afpForFirstBlock.aggregatedSignature,
                                    afkVoters:answer.afpForFirstBlock.afkVoters
                                
                                }
                
                                await global.SYMBIOTE_META.EPOCH_DATA.put('FIRST_BLOCK_ASSUMPTION:'+subchainID,pureObj).catch(_=>false)
                
                                localHealthHandler.afpForFirstBlock = pureObj
                

                                // No more sense to find updates


                                updateWasFound = true

                                break
    
                            }
                
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

    
    let poolsMetadata = Object.keys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.poolsMetadata)

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)
    


    for(let poolPubKey of poolsMetadata){

        // If this value is related to the current checkpoint - set to manager, otherwise - take from the POOLS_METADATA as a start point
        // Returned value is {index,hash,(?)aggregatedCommitments}

        let {index,hash,aggregatedCommitments} = await tempObject.DATABASE.get(poolPubKey).catch(_=>false) || global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.poolsMetadata[poolPubKey]

        
        tempObject.CHECKPOINT_MANAGER.set(poolPubKey,{index,hash,aggregatedCommitments})
        
        tempObject.CHECKPOINT_MANAGER_SYNC_HELPER.set(poolPubKey,{index,hash,aggregatedCommitments})


        //______________________________ Try to find SKIP_HANDLER for pool ______________________________


        let skipHandler = await tempObject.DATABASE.get('SKIP_HANDLER:'+poolPubKey).catch(_=>false) // {wasReassigned:boolean,extendedAggregatedCommitments,aggregatedSkipProof}

        if(skipHandler) tempObject.SKIP_HANDLERS.set(poolPubKey,skipHandler)


        //___________________________________ Check for reassignments _______________________________________

        // *only for prime pools
        
        if(!poolsMetadata.isReserve){

            let reassignmentMetadata = await tempObject.DATABASE.get('REASSIGN:'+poolPubKey).catch(_=>false) // {currentAuthority:<pointer to current reserve pool in (QT/VT).CHECKPOINT.reassignmentChains[<primePool>]>}

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

    let itsTimeForTheNextCheckpoint = await tempObject.DATABASE.get('TIME_TO_NEW_EPOCH').catch(_=>false)

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

    let allKnownNodes = [global.CONFIG.SYMBIOTE.GET_PREVIOUS_EPOCH_AGGREGATED_FINALIZATION_PROOF_URL,...await GET_POOLS_URLS(),...GET_ALL_KNOWN_PEERS()]

    let subchainID = global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY || global.CONFIG.SYMBIOTE.PUB


    for(let nodeEndpoint of allKnownNodes){

        let finalURL = `${nodeEndpoint}/aggregated_epoch_finalization_proof/${global.SYMBIOTE_META.GENERATION_THREAD.checkpointIndex}/${subchainID}`

        let itsProbablyAggregatedEpochFinalizationProof = await fetch(finalURL,{agent:global.FETCH_HTTP_AGENT}).then(r=>r.json()).catch(_=>false)

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

    //Safe "if" branch to prevent unnecessary blocks generation
    if(!checkpoint.poolsMetadata[global.CONFIG.SYMBIOTE.PUB]) return
    
    let qtCheckpointFullID = checkpoint.hash+"#"+checkpoint.id

    let checkpointIndex = checkpoint.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(qtCheckpointFullID)



    if(!tempObject) return


    let myDataInReassignments = tempObject.REASSIGNMENTS.get(global.CONFIG.SYMBIOTE.PUB)


    if(typeof myDataInReassignments === 'object') return


    let extraData = {}

    // Check if <checkpointFullID> is the same in QT and in GT
    
    if(global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId !== qtCheckpointFullID){

        // If new epoch - add the aggregated proof of previous epoch finalization

        extraData.previousAggregatedEpochFinalizationProof = await GET_PREVIOUS_AGGREGATED_EPOCH_FINALIZATION_PROOF()

        // If we can't find a proof - try to do it later
        
        if(!extraData.previousAggregatedEpochFinalizationProof) return

            

        // Update the index & hash of epoch

        global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId = qtCheckpointFullID

        global.SYMBIOTE_META.GENERATION_THREAD.checkpointIndex = checkpointIndex

        // Recount new values

        global.SYMBIOTE_META.GENERATION_THREAD.quorum = checkpoint.quorum

        global.SYMBIOTE_META.GENERATION_THREAD.quorumAggregatedPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtCheckpointFullID)

        global.SYMBIOTE_META.GENERATION_THREAD.majority = GET_MAJORITY(checkpoint)


        // And nullish the index & hash in generation thread for new epoch

        global.SYMBIOTE_META.GENERATION_THREAD.prevHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde'
 
        global.SYMBIOTE_META.GENERATION_THREAD.nextIndex = 0
    
    }

    
    // If we are even not in reserve - return

    if(typeof myDataInReassignments === 'string'){

        // Do it only for the first block in epoch(with index 0)

        if(global.SYMBIOTE_META.GENERATION_THREAD.nextIndex === 0){

            // Build the template to insert to the extraData of block. Structure is {primePool:ASP,reservePool0:ASP,...,reservePoolN:ASP}
        
            let myPrimePool = global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY

            let reassignmentArrayOfMyPrimePool = checkpoint.reassignmentChains[myPrimePool]
    
            let myIndexInReassignmentChain = reassignmentArrayOfMyPrimePool.indexOf(global.CONFIG.SYMBIOTE.PUB)
    

            // Get all previous pools - from zero to <my_position>
            let allPreviousPools = reassignmentArrayOfMyPrimePool.slice(0,myIndexInReassignmentChain)


            //_____________________ Fill the extraData.reassignments _____________________

            extraData.reassignments = {}

            // If we can't find all the ASPs (from primePool to you) - skip this iteration to try again later

            // 0.Add the ASP for prime pool

            if(tempObject.SKIP_HANDLERS.has(myPrimePool)){

                extraData.reassignments[myPrimePool] = tempObject.SKIP_HANDLERS.get(myPrimePool).aggregatedSkipProof

            }else return

            // 1.And for all the previous reserve pools from position 0 to (<YOUR_POSITION>-1)

            for(let reservePool of allPreviousPools){

                if(tempObject.SKIP_HANDLERS.has(reservePool)){

                    extraData.reassignments[reservePool] = tempObject.SKIP_HANDLERS.get(reservePool).aggregatedSkipProof

                }else return

            }

        }


    }else if(global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY) return
    
    
    // In case it's the second block in epoch(with index = 1,coz numeration starts from 0) - add the aggregated commitments to header

    if(global.SYMBIOTE_META.GENERATION_THREAD.nextIndex === 1){

        let aggregatedCommitmentsForFirstBlock = await USE_TEMPORARY_DB('get',tempObject.DATABASE,'AC_OF_MY_FIRST_BLOCK').catch(_=>false)

        if(aggregatedCommitmentsForFirstBlock) extraData.aggregatedCommitmentsForFirstBlock = aggregatedCommitmentsForFirstBlock

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
            
        BLOCKLOG(`New block generated`,hash,blockCandidate)


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

                proof:{

                    aggregatedPub:<BLS aggregated pubkey of signers>,
                    aggregatedSignature: SIG('EPOCH_DONE'+lastAuth+lastIndex+lastHash+checkpointFullId)
                    afkVoters:[] - array of BLS pubkeys who haven't voted

                }
            }

            We need to verify that majority have voted for such solution

           For this:

                0) reverseThreshold = global.SYMBIOTE_META.GENERATION_THREAD.quorum.length-global.SYMBIOTE_META.GENERATION_THREAD.majority
                1) await bls.verifyThresholdSignature(aggregatedPub,afkVoters,quorumRootPub,dataThatShouldBeSigned,aggregatedSignature,reverseThreshold).catch(_=>false)

        */

        let {aggregatedPub,aggregatedSignature,afkVoters} = itsProbablyAggregatedEpochFinalizationProof.proof

        let reverseThreshold = quorum.length - majority

        let {lastAuthority,lastIndex,lastHash} = itsProbablyAggregatedEpochFinalizationProof

        let dataThatShouldBeSigned = 'EPOCH_DONE'+lastAuthority+lastIndex+lastHash+checkpointFullID

        let proofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,rootPub,dataThatShouldBeSigned,aggregatedSignature,reverseThreshold).catch(_=>false)

        if(proofIsOk){

            return {
            
                lastAuthority,lastIndex,lastHash,
        
                proof:{aggregatedPub,aggregatedSignature,afkVoters}

            }

        }

    }


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

        id:-1,

        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        poolsMetadata:JSON.parse(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA)),
        
        timestamp:checkpointTimestamp,

        operations:[],

        completed:true
    
    }


    //Make template, but anyway - we'll find checkpoints on hostchains
    global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT={

        id:-1,

        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        poolsMetadata:JSON.parse(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA)),

        timestamp:checkpointTimestamp,
        
        operations:[],

        completed:true
    
    }


    // Set the rubicon to stop tracking spent txs from WAITING_ROOMs of pools' contracts. Value means the checkpoint id lower edge
    // If your stake/unstake tx was below this line - it might be burned. However, the line is set by QUORUM, so it should be safe
    global.SYMBIOTE_META.VERIFICATION_THREAD.RUBICON = -1
    
    global.SYMBIOTE_META.QUORUM_THREAD.RUBICON = -1


    //We get the quorum for VERIFICATION_THREAD based on own local copy of POOLS_METADATA state
    global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.quorum = GET_QUORUM(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA,global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS)

    //...However, quorum for QUORUM_THREAD might be retrieved from POOLS_METADATA of checkpoints. It's because both threads are async
    global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum = GET_QUORUM(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.poolsMetadata,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS)


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
    
        'BLOCKS', // For blocks. BlockID => block
    
        'STUFF', // Some data like combinations of pools for aggregated BLS pubkey, endpoint <-> pubkey bindings and so on. Available stuff URL_PUBKEY_BIND | VALIDATORS_PUBKEY_COMBINATIONS | BLOCK_HASHES | .etc

        'STATE', // Contains state of accounts, contracts, services, metadata and so on. The main database like NTDS.dit

        'EPOCH_DATA', // Contains epoch data - AEFPs, FBIEPs, AFPs, etc.

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
            
            checkpointFullId:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde#-1',
            
            prevHash:`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`, // "null" hash
            
            nextIndex:0 // so the first block will be with index 0
        
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

    global.SYMBIOTE_META.STUFF_CACHE = new AdvancedCache(global.CONFIG.SYMBIOTE.STUFF_CACHE_SIZE,global.SYMBIOTE_META.STUFF)


    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.id

    let vtCheckpointFullID = global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.hash+"#"+global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id


    //Because if we don't have quorum, we'll get it later after discovering checkpoints

    global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('VT_ROOTPUB'+vtCheckpointFullID,bls.aggregatePublicKeys(global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.quorum))

    global.SYMBIOTE_META.STATIC_STUFF_CACHE.set('QT_ROOTPUB'+checkpointFullID,bls.aggregatePublicKeys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum))


    if(global.SYMBIOTE_META.GENERATION_THREAD.checkpointFullId === checkpointFullID && !global.SYMBIOTE_META.GENERATION_THREAD.quorum){

        global.SYMBIOTE_META.GENERATION_THREAD.quorum = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum

        global.SYMBIOTE_META.GENERATION_THREAD.quorumAggregatedPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)

        global.SYMBIOTE_META.GENERATION_THREAD.majority = GET_MAJORITY(checkpoint)

    }

    //_________________________________Add the temporary data of current QT__________________________________________
    
    let quorumTemporaryDB = level(process.env.CHAINDATA_PATH+`/${checkpointFullID}`,{valueEncoding:'json'})

    global.SYMBIOTE_META.TEMP.set(checkpointFullID,{

        COMMITMENTS:new Map(), // blockID => BLS_SIG(blockID+hash).     The first level of "proofs". Commitments is just signatures by some validator from current quorum that "validator accept some block X by ValidatorY with hash H"

        FINALIZATION_PROOFS:new Map(), // blockID => SIG(blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HASH+"#"+QT.CHECKPOINT.id).    Aggregated proofs which proof that some validator has 2/3N+1 commitments for block PubX:Y with hash H. Key is blockID and value is FINALIZATION_PROOF object

    
        CHECKPOINT_MANAGER:new Map(), // mapping( validatorID => {index,hash} ). Used to start voting for checkpoints.      Each pair is a special handler where key is a pubkey of appropriate validator and value is the ( index <=> id ) which will be in checkpoint
    
        CHECKPOINT_MANAGER_SYNC_HELPER:new Map(), // map(poolPubKey=>Set({index,hash,aggregatedCommitments})) here will be added propositions to update the aggregated commitments for pool which will be checked in sync mode

        SYSTEM_SYNC_OPERATIONS_MEMPOOL:[],
        
        SYNCHRONIZER:new Map(),

        HEALTH_MONITORING:new Map(), // used to perform SKIP procedure when we need it and to track changes on subchains. poolPubKey => {lastSeen,index,hash,aggregatedFinalizationProof:{aggregatedPub,aggregatedSig,afkVoters}}

        SKIP_HANDLERS:new Map(), // {wasReassigned:boolean,extendedAggregatedCommitments,aggregatedSkipProof}

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

        // Make requests to /get_asp_and_approved_first_block. Returns => {currentAuthorityIndex,firstBlockOfCurrentAuthority,afpForFirstBlockByCurrentAuthority}. Send the current auth + prime pool

        let responseForTempReassignment = await fetch(memberHandler.url+'/get_data_for_temp_reassign',{agent:global.FETCH_HTTP_AGENT}).then(r=>r.json()).catch(_=>false)

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
    


                            if(afpIsOk.verify){
    
                                // Verify all the ASPs in block header
    
                                let {isOK,filteredReassignments,arrayOfPoolsWithZeroProgress} = await CHECK_IF_ALL_ASP_PRESENT(
                                
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
                               


                                    for(let position = currentAuthorityIndex-1 ; position >= limitPointer ; position--){
    
                                        let poolWithThisPosition = position === -1 ? primePoolPubKey : reassignmentChains[primePoolPubKey][position]

                                        if(!arrayOfPoolsWithZeroProgress.includes(poolWithThisPosition)){
    
                                            // This is a signal that pool has created at least 1 block, so we have to get it and update the reassignment stats
    
                                            // Here ask the first block by this pool in this epoch, verify the SFP and continue
    
                                            let firstBlockInThisEpochByPool = await GET_BLOCK(quorumThreadCheckpointIndex,poolWithThisPosition,0)

                                            // In this block we should have ASP for all the previous reservePools + primePool
                                
                                            let resultForCurrentPool = position === -1 ? {isOK:true,filteredReassignments:{},arrayOfPoolsWithZeroProgress:[]} : await CHECK_IF_ALL_ASP_PRESENT(
                                                        
                                                primePoolPubKey, firstBlockInThisEpochByPool, reassignmentChains[primePoolPubKey], position, quorumThreadCheckpointFullID, vtCheckpoint, false, true
                                                        
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
    SEND_BLOCKS_AND_GRAB_COMMITMENTS()

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