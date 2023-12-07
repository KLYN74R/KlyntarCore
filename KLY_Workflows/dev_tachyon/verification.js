import {
    
    GET_QUORUM_URLS_AND_PUBKEYS,GET_ALL_KNOWN_PEERS,GET_MAJORITY,IS_MY_VERSION_OLD,EPOCH_STILL_FRESH,

    GET_ACCOUNT_ON_SYMBIOTE,GET_FROM_STATE,GET_HTTP_AGENT,VT_STATS_LOG

} from './utils.js'


import EPOCH_EDGE_OPERATIONS_VERIFIERS from './epochEdgeOperationsVerifiers.js'

import {LOG,BLAKE3,ED25519_VERIFY} from '../../KLY_Utils/utils.js'

import {KLY_EVM} from '../../KLY_VirtualMachines/kly_evm/vm.js'

import {GRACEFUL_STOP} from './life.js'

import Block from './essences/block.js'

import fetch from 'node-fetch'

import WS from 'websocket'

import Web3 from 'web3'




//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let




GET_BLOCK = async (epochIndex,blockCreator,index) => {

    let blockID = epochIndex+':'+blockCreator+':'+index

    // Try to find block locally

    let block = await global.SYMBIOTE_META.BLOCKS.get(blockID).catch(()=>null)

    if(!block){

        // First of all - try to find by pre-set URL

        block = await fetch(global.CONFIG.SYMBIOTE.GET_BLOCKS_URL+`/block/`+blockID,{agent:GET_HTTP_AGENT(global.CONFIG.SYMBIOTE.GET_BLOCKS_URL)}).then(r=>r.json()).then(block=>{
                
            if(typeof block.extraData==='object' && typeof block.prevHash==='string' && typeof block.epoch==='string' && typeof block.sig==='string' && block.index === index && block.creator === blockCreator && Array.isArray(block.transactions)){

                global.SYMBIOTE_META.BLOCKS.put(blockID,block)
    
                return block
    
            } 
    
        }).catch(()=>null)

        
        if(!block){

            // Finally - request blocks from quorum members

            // Combine all nodes we know about and try to find block there
            
            let allKnownNodes = [...await GET_QUORUM_URLS_AND_PUBKEYS(),...GET_ALL_KNOWN_PEERS()]
    
            for(let host of allKnownNodes){

                if(host===global.CONFIG.SYMBIOTE.MY_HOSTNAME) continue
                
                let itsProbablyBlock = await fetch(host+`/block/`+blockID,{agent:GET_HTTP_AGENT(host)}).then(r=>r.json()).catch(()=>null)
                
                if(itsProbablyBlock){

                    let overviewIsOk =

                        typeof itsProbablyBlock.extraData==='object'
                        &&
                        typeof itsProbablyBlock.prevHash==='string'
                        &&
                        typeof itsProbablyBlock.epoch==='string'
                        &&
                        typeof itsProbablyBlock.sig==='string'
                        &&
                        itsProbablyBlock.index===index
                        &&
                        itsProbablyBlock.creator===blockCreator
                        &&
                        Array.isArray(itsProbablyBlock.transactions)
                

                    if(overviewIsOk){

                        global.SYMBIOTE_META.BLOCKS.put(blockID,itsProbablyBlock).catch(()=>{})
    
                        return itsProbablyBlock
    
                    }
    
                }
    
            }

        }

    }

    return block

},




VERIFY_AGGREGATED_FINALIZATION_PROOF = async (itsProbablyAggregatedFinalizationProof,epochHandler) => {

    // Make the initial overview
    let generalAndTypeCheck =   itsProbablyAggregatedFinalizationProof
                                    &&
                                    typeof itsProbablyAggregatedFinalizationProof.prevBlockHash === 'string'
                                    &&
                                    typeof itsProbablyAggregatedFinalizationProof.blockID === 'string'
                                    &&
                                    typeof itsProbablyAggregatedFinalizationProof.blockHash === 'string'
                                    &&
                                    typeof itsProbablyAggregatedFinalizationProof.proofs === 'object'


    if(generalAndTypeCheck){

        let epochFullID = epochHandler.hash+"#"+epochHandler.id

        let {prevBlockHash,blockID,blockHash,proofs} = itsProbablyAggregatedFinalizationProof

        let dataThatShouldBeSigned = prevBlockHash+blockID+blockHash+epochFullID

        let majority = GET_MAJORITY(epochHandler)


        let promises = []

        let okSignatures = 0

        let unique = new Set()


        for(let [signerPubKey,signa] of Object.entries(proofs)){

            promises.push(ED25519_VERIFY(dataThatShouldBeSigned,signa,signerPubKey).then(isOK => {

                if(isOK && epochHandler.quorum.includes(signerPubKey) && !unique.has(signerPubKey)){

                    unique.add(signerPubKey)

                    okSignatures++

                }

            }))

        }

        await Promise.all(promises)

        return okSignatures >= majority


    }

},




GET_VERIFIED_AGGREGATED_FINALIZATION_PROOF_BY_BLOCK_ID = async (blockID,epochHandler) => {

    let localVersionOfAfp = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+blockID).catch(()=>null)

    if(!localVersionOfAfp){

        // Go through known hosts and find AGGREGATED_FINALIZATION_PROOF. Call GET /aggregated_finalization_proof route
    
        let setOfUrls = [global.CONFIG.SYMBIOTE.GET_AGGREGATED_FINALIZATION_PROOF_URL,...await GET_QUORUM_URLS_AND_PUBKEYS(false,epochHandler),...GET_ALL_KNOWN_PEERS()]

        for(let endpoint of setOfUrls){

            let itsProbablyAggregatedFinalizationProof = await fetch(endpoint+'/aggregated_finalization_proof/'+blockID,{agent:GET_HTTP_AGENT(endpoint)}).then(r=>r.json()).catch(()=>null)

            if(itsProbablyAggregatedFinalizationProof){

                let isOK = await VERIFY_AGGREGATED_FINALIZATION_PROOF(itsProbablyAggregatedFinalizationProof,epochHandler)

                if(isOK){

                    let {prevBlockHash,blockID,blockHash,proofs} = itsProbablyAggregatedFinalizationProof

                    return {prevBlockHash,blockID,blockHash,proofs}

                }

            }

        }

    }else return localVersionOfAfp

},




WAIT_SOME_TIME = async() =>

    new Promise(resolve=>

        setTimeout(()=>resolve(),global.CONFIG.SYMBIOTE.WAIT_IF_CANT_FIND_AEFP)

    )
,




DELETE_POOLS_WITH_LACK_OF_STAKING_POWER = async ({poolHashID,poolPubKey}) => {

    //Try to get storage "POOL" of appropriate pool

    let poolStorage = await GET_FROM_STATE(poolHashID)

    poolStorage.lackOfTotalPower = true

    poolStorage.stopEpochID = global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH.id

    delete global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[poolPubKey]

},




CHECK_AGGREGATED_LEADER_ROTATION_PROOF_VALIDITY = async (pubKeyOfSomePreviousLeader,aggregatedLeaderRotationProof,epochFullID,epochHandler) => {

    /*

    Check the <agregatedLeaderRotationProof>(ALRP) signed by majority(2/3N+1) and aggregated
    
    ALRP structure is:
    
    {

        firstBlockHash,

        skipIndex,

        skipHash,

        proofs:{

            quorumMemberPubKey0:hisEd25519Signa,
            ...
            quorumMemberPubKeyN:hisEd25519Signa

        }

    }

        Check the signed string: `LEADER_ROTATION_PROOF:${reassignedPoolPubKey}:${firstBlockHash}:${skipIndex}:${skipHash}:${epochFullID}`

        Also, if skipIndex === 0 - it's signal that firstBlockHash = skipHash

        If skipIndex === -1 - skipHash and firstBlockHash will be default - '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

    */

    
    if(typeof aggregatedLeaderRotationProof === 'object'){    

        // Check the proofs
    
        let {firstBlockHash,skipIndex,skipHash,proofs} = aggregatedLeaderRotationProof

        let majority = GET_MAJORITY(epochHandler)

        let dataThatShouldBeSigned = `LEADER_ROTATION_PROOF:${pubKeyOfSomePreviousLeader}:${firstBlockHash}:${skipIndex}:${skipHash}:${epochFullID}`

        let promises = []
    
        let okSignatures = 0

        let unique = new Set()
    
    
        for(let [signerPubKey,signa] of Object.entries(proofs)){
    
            promises.push(ED25519_VERIFY(dataThatShouldBeSigned,signa,signerPubKey).then(isOK => {

                if(isOK && epochHandler.quorum.includes(signerPubKey) && !unique.has(signerPubKey)){

                    unique.add(signerPubKey)

                    okSignatures++

                }

            }))
    
        }
    
        await Promise.all(promises)

        return okSignatures >= majority

    }

},




CHECK_ALRP_CHAIN_VALIDITY = async (primePoolPubKey,firstBlockInThisEpochByPool,leadersSequence,position,epochFullID,oldEpochHandler,dontCheckSignature) => {

    /*
    
        Here we need to check the integrity of chain of proofs to make sure that we can get the obvious variant of a valid chain to verify

        We need to check if <firstBlockInThisEpochByPool.extraData.aggregatedLeadersRotationProofs> contains all the ALRPs(aggregated leader rotation proofs)
        
            for pools from <position>(index of current pool in <leadersSequence>) to the first pool with non-zero ALRP

        
        So, we simply start the reverse enumeration in <leadersSequence> from <position> to the beginning of <leadersSequence> and extract the ALRPs

        Once we met the ALRP with index not equal to -1 (>=0) - we can stop enumeration and return true
    
    */


    let reassignmentsRef = firstBlockInThisEpochByPool.extraData?.aggregatedLeadersRotationProofs

    let filteredReassignments = {}


    if(typeof reassignmentsRef === 'object'){


        let arrayForIteration = leadersSequence.slice(0,position).reverse() // take all the pools till position of current pool and reverse it because in optimistic case we just need to find the closest pool to us with non-zero ALRP 

        let arrayIndexer = 0

        let wasBreakedEarly = false


        for(let poolPubKey of arrayForIteration){

            let alrpForThisPool = reassignmentsRef[poolPubKey]
    
            if(typeof alrpForThisPool === 'object'){

                let signaIsOk = dontCheckSignature || await CHECK_AGGREGATED_LEADER_ROTATION_PROOF_VALIDITY(poolPubKey,alrpForThisPool,epochFullID,oldEpochHandler)

                if(signaIsOk){

                    filteredReassignments[poolPubKey] = {
                        
                        index:alrpForThisPool.skipIndex,
                        
                        hash:alrpForThisPool.skipHash,
                        
                        firstBlockHash:alrpForThisPool.firstBlockHash
                    
                    }

                    arrayIndexer++

                    if(alrpForThisPool.skipIndex>=0){

                        wasBreakedEarly = true

                        break

                    }

                }else return {isOK:false}

            } else return {isOK:false}
    
        }

        if(arrayIndexer === position && !wasBreakedEarly){

            // In case we've iterated over the whole range - check the ALRP for prime pool

            let alrpForPrimePool = reassignmentsRef[primePoolPubKey]

            let signaIsOk = dontCheckSignature || await CHECK_AGGREGATED_LEADER_ROTATION_PROOF_VALIDITY(primePoolPubKey,alrpForPrimePool,epochFullID,oldEpochHandler)

            if(signaIsOk){

                filteredReassignments[primePoolPubKey] = {
                    
                    index:alrpForPrimePool.skipIndex,
                    
                    hash:alrpForPrimePool.skipHash,
                    
                    firstBlockHash:alrpForPrimePool.firstBlockHash
                
                }

            }else return {isOK:false}

        }
    

    } else return {isOK:false}


    return {isOK:true,filteredReassignments}

},




BUILD_REASSIGNMENT_METADATA_FOR_SHARDS = async (vtEpochHandler,primePoolPubKey,aefp) => {


        /*
    
    VT.REASSIGNMENT_METADATA has the following structure

        KEY = <Ed25519 pubkey of prime pool>
    
        VALUE = {

            primePool:{index,hash},
            reservePool0:{index,hash},
            reservePool1:{index,hash},
            
            ...

            reservePoolN:{index,hash}

        }

        
        We should finish to verify blocks upto height in prime pool and reserve pools

        ________________________________Let's use this algorithm________________________________

        0) Once we get the new valid AEFP, use the REASSIGNMENT_CHAINS built for this epoch(from global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH)

        1) Using global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT[<primePool>] in reverse order to find the first block in this epoch(checkpoint) and do filtration. The valid points will be those pools which includes the <leaderRotationProof> for all the previous reserve pools

        2) Once we get it, run the second cycle for another filtration - now we should ignore pointers in pools which was reassigned on the first block of this epoch

        3) Using this values - we can build the reasssignment metadata to finish verification process on epoch and move to a new one

            _________________________________For example:_________________________________
            
            Imagine that prime pool <MAIN_POOL_A> has 5 reserve pools: [Reserve0,Reserve1,Reserve2,Reserve3,Reserve4]

            The pools metadata from epoch shows us that previous epoch finished on these heights for pools:
            
                For prime pool => INDEX:1337 HASH:adcd...

                For reserve pools:

                    [Reserve0]: INDEX:1245 HASH:0012...

                    [Reserve1]: INDEX:1003 HASH:2363...
                    
                    [Reserve2]: INDEX:1000 HASH:fa56...

                    [Reserve3]: INDEX:2003 HASH:ad79...

                    [Reserve4]: INDEX:1566 HASH:ce77...


            (1) We run the initial cycle in reverse order to find the <leaderRotationProof>

                Each next pool in a row must have ALRP for all the previous pools.

                For example, imagine the following situation:
                    
                    🙂[Reserve0]: [ALRP for prime pool]           <==== in header of block 1246(1245+1 - first block in new epoch)

                    🙂[Reserve1]: [ALRP for prime pool,ALRP for reserve pool 0]       <==== in header of block 1004(1003+1 - first block in new epoch)
                    
                    🙂[Reserve2]: [ALRP for prime pool,ALRP for reserve pool 0,ALRP for reserve pool 1]         <==== in header of block 1001(1000+1 - first block in new epoch)

                    🙂[Reserve3]: [ALRP for prime pool,ALRP for reserve pool 0,ALRP for reserve pool 1,ALRP for reserve pool 2]      <==== in header of block 2004(2003+1 - first block in new epoch)

                    🙂[Reserve4]: [ALRP for prime pool,ALRP for reserve pool 0,ALRP for reserve pool 1,ALRP for reserve pool 2,ALRP for reserve pool 3]       <==== in header of block 1567(1566+1 - first block in new epoch)


                It was situation when all the reserve pools are fair players(non malicious). However, some of reserve pools will be byzantine(offline or in ignore mode), so

                we should cope with such a situation. That's why in the first iteration we should go through the pools in reverse order, get only those who have ALRP for all the previous pools

                For example, in situation with malicious players:
                    
                    🙂[Reserve0]: [ALRP for prime pool]

                    😈[Reserve1]: []    - nothing because AFK(offline/ignore)
                    
                    🙂[Reserve2]: [ALRP for prime pool,ALRP for reserve pool 0,ALRP for reserve pool 1]

                    😈[Reserve3]: [ALRP for prime pool,ALRP for reserve pool 2]        - no ALRP for ReservePool0  and ReservePool1

                    🙂[Reserve4]: [ALRP for prime pool,ALRP for reserve pool 0,ALRP for reserve pool 1,ALRP for reserve pool 2,ALRP for reserve pool 3]
                

                In this case we'll find that reserve pools 0,2,4 is OK because have ALRPs for ALL the previous pools(including prime pool)

            (2) Then, we should check if all of them weren't reassigned on their first block in epoch:
                
                    For this, if we've found that pools 0,2,4 are valid, check if:

                        0) Pool 4 doesn't have ALRP for ReservePool2 on block 1000. If so, then ReservePool2 is also invalid and should be excluded
                        0) Pool 2 doesn't have ALRP for ReservePool0 on block 1245. If so, then ReservePool0 is also invalid and should be excluded
                    
                    After this final filtration, take the first ALRP in valid pools and based on this - finish the verification to checkpoint's range.

                    In our case, imagine that Pool2 was reassigned on block 1000 and we have a ALRP proof in header of block 1567(first block by ReservePool4 in this epoch)

                    That's why, take ALRP for primePool from ReservePool0 and ALRPs for reserve pools 0,1,2,3 from pool4


            ___________________________________________This is how it works___________________________________________

    */

    /*
                
        Reminder - the structure of AEFP must be:

        {

            shard:primePoolPubKey,

            lastLeader,
                        
            lastIndex,
                    
            lastHash,

            firstBlockHash,

            proof:{

                aggregatedPub,
                
                aggregatedSignature,
                            
                afkVoters
                            
            }
                
        }

                        
    */


    let emptyTemplate = {}

    let vtEpochIndex = vtEpochHandler.id

    let oldLeadersSequenceForShard = vtEpochHandler.leadersSequence[primePoolPubKey]

    if(!global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA) global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA = {}

    let filtratratedReassignment = new Map() // poolID => {reassignedPool:ALRP,reassignedPool0:ALRP,...reassignedPoolX:ALRP}
        

    // Start the cycle in reverse order from <aefp.lastLeader> to prime pool

    let lastLeaderPoolPubKey = oldLeadersSequenceForShard[aefp.lastLeader] || primePoolPubKey

    emptyTemplate[lastLeaderPoolPubKey] = {
        
        index:aefp.lastIndex,
        
        hash:aefp.lastHash

    }

    for(let position = aefp.lastLeader; position >= 0; position--){

        let poolPubKey = oldLeadersSequenceForShard[position]

        // Get the first block of this epoch from VERIFICATION_STATS_PER_POOL

        let firstBlockInThisEpochByPool = await GET_BLOCK(vtEpochIndex,poolPubKey,0)

        if(!firstBlockInThisEpochByPool) return

        // In this block we should have ALRPs for all the previous reservePool + primePool

        let {isOK,filteredReassignments} = await CHECK_ALRP_CHAIN_VALIDITY(
            
            primePoolPubKey,firstBlockInThisEpochByPool,oldLeadersSequenceForShard,position,null,null,true)

        if(isOK){

            filtratratedReassignment.set(poolPubKey,filteredReassignments) // filteredReassignments = {reassignedPrimePool:{index,hash},reassignedReservePool0:{index,hash},...reassignedReservePoolX:{index,hash}}

        }


    }

    // In direct way - use the filtratratedReassignment to build the REASSIGNMENT_METADATA[primePoolID] based on ALRP

    for(let reservePool of oldLeadersSequenceForShard){

        if(filtratratedReassignment.has(reservePool)){

            let metadataForReassignment = filtratratedReassignment.get(reservePool)

            for(let [reassignedPoolPubKey,alrpData] of Object.entries(metadataForReassignment)){

                if(!emptyTemplate[reassignedPoolPubKey]) emptyTemplate[reassignedPoolPubKey] = alrpData

            }

        }

    }

    global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA[primePoolPubKey] = emptyTemplate


        /*
        
        
        After execution of this function we have:

        [0] global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.leadersSequence with structure:
        
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





SET_UP_NEW_EPOCH_FOR_VERIFICATION_THREAD = async vtEpochHandler => {
 

    let vtEpochFullID = vtEpochHandler.hash+"#"+vtEpochHandler.id

    // Stuff related for next epoch

    let nextEpochHash = await global.SYMBIOTE_META.EPOCH_DATA.get(`NEXT_EPOCH_HASH:${vtEpochFullID}`).catch(()=>false)

    let nextEpochQuorum = await global.SYMBIOTE_META.EPOCH_DATA.get(`NEXT_EPOCH_QUORUM:${vtEpochFullID}`).catch(()=>false)

    let nextEpochLeadersSequences = await global.SYMBIOTE_META.EPOCH_DATA.get(`NEXT_EPOCH_LS:${vtEpochFullID}`).catch(()=>false)


    // Get the epoch edge operations that we need to execute

    let epochEdgeOperations = await global.SYMBIOTE_META.EPOCH_DATA.get(`EEO:${vtEpochFullID}`).catch(()=>null)

    
    if(nextEpochHash && nextEpochQuorum && nextEpochLeadersSequences && epochEdgeOperations){

        // Copy the current workflow options(i.e. network params like epoch duration, required stake for validators,etc.)

        let workflowOptionsTemplate = {...global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS}

        // We add this copy to cache to make changes and update the global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS after the execution of all epoch edge operation

        global.SYMBIOTE_META.STATE_CACHE.set('WORKFLOW_OPTIONS',workflowOptionsTemplate)


        // Create the array of delayed unstaking transactions
        // Since the unstaking require some time(due to security reasons - we must create checkpoints first) - put these txs to array and execute after X epoch
        // X = global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS.UNSTAKING_PERIOD (set it via genesis & change via epoch edge operations)

        global.SYMBIOTE_META.STATE_CACHE.set('UNSTAKING_OPERATIONS',[])
    

        // Create the object to perform slashing. Structure <pool> => <{delayedIds,pool}>

        global.SYMBIOTE_META.STATE_CACHE.set('SLASH_OBJECT',{})


        //____________________________________ START TO EXECUTE EPOCH EDGE OPERATIONS ____________________________________

        /*

            0. First of all - run slashing operations to punish the unfair players
        
            This helps us to prevent attacks when adversary stake must be slashed but instead of this unstaking tx runs. In case of success - adversary save his stake

            For example, if in <epochEdgeOperations> array we have:

                epochEdgeOperations[0] = <unstaking tx by adversary to save own stake>

                epochEdgeOperations[1] = <slashing operation>

            If we run these operations one-by-one(in for cycle) - we bump with a serius bug

            --------------------------------------------------------
            |                                                      |
            |   [SOLUTION]: We must run slashing operations FIRST  |
            |                                                      |
            --------------------------------------------------------

        */

        for(let epochEdgeOperation of epochEdgeOperations){
            
            if(epochEdgeOperation.type==='SLASH_UNSTAKE') await EPOCH_EDGE_OPERATIONS_VERIFIERS.SLASH_UNSTAKE(epochEdgeOperation.payload) // pass isFromRoute=undefined to make changes to state

        }

        // [Milestone]: Here we have the filled(or empty) object which store the data about pools and delayed IDs to delete it from state (in global.SYMBIOTE_META.STATE_CACHE['SLASH_OBJECT']


        //________________________________ NOW RUN THE REST OF EPOCH EDGE OPERATIONS ______________________________________

        for(let epochEdgeOperation of epochEdgeOperations){
        
            // Skip the previously executed SLASH_UNSTAKE operations

            if(epochEdgeOperation.type==='SLASH_UNSTAKE') continue


            /*
            
                Perform changes here before move to the next checkpoint
            
                Operation in checkpoint has the following structure

                {
                    type:<TYPE> - type from './epochEdgeOperationsVerifiers.js' to perform this operation
                    payload:<PAYLOAD> - operation body. More detailed about structure & verification process here => ./epochEdgeOperationsVerifiers.js
                }
            

            */

            await EPOCH_EDGE_OPERATIONS_VERIFIERS[epochEdgeOperation.type](epochEdgeOperation.payload) //pass isFromRoute=undefined to make changes to state
    
        }


        //_______________________Remove pools if lack of staking power_______________________


        let poolsToBeRemoved = [], poolsArray = Object.keys(global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL)


        for(let poolPubKey of poolsArray){
    
            let poolOrigin = await GET_FROM_STATE(poolPubKey+'(POOL)_POINTER')
    
            let poolHashID = poolOrigin+':'+poolPubKey+'(POOL)_STORAGE_POOL'
    
            let poolStorage = await GET_FROM_STATE(poolHashID)
    
            if(poolStorage.totalPower<global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS.VALIDATOR_STAKE) poolsToBeRemoved.push({poolHashID,poolPubKey})
    
        }
    
        
        //_____Now in <toRemovePools> we have IDs of pools which should be deleted from POOLS____


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

            // Delete pointer
            atomicBatch.del(poolIdentifier+'(POOL)_POINTER')


            // Remove from pools tracking
            delete global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[poolIdentifier]

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

                for(let txidIndex of toDeleteArray) delayedArray.splice(txidIndex,1) // remove single tx

            }

        }


        //______________Perform earlier delayed operations & add new operations______________

        let delayedTableOfIds = await GET_FROM_STATE('DELAYED_TABLE_OF_IDS')

        // If it's first checkpoints - add this array
        if(!delayedTableOfIds) delayedTableOfIds=[]
    

        let currentEpochIndex = global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH.id

        let idsToDelete = []

            

        for(let i=0, lengthOfTable = delayedTableOfIds.length ; i < lengthOfTable ; i++){

            // Here we get the arrays of delayed operations from state and perform those, which is old enough compared to WORKFLOW_OPTIONS.UNSTAKING_PERIOD

            if(delayedTableOfIds[i] + global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS.UNSTAKING_PERIOD < currentEpochIndex){

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

                        // Return back staked KLY / UNO to the state of user's account
                        if(delayedTx.units==='kly') account.balance += delayedTx.amount

                        else account.uno += delayedTx.amount
                    
                    }


                    // Remove ID (delayedID) from delayed table of IDs because we already used it
                    idsToDelete.push(i)

                }

            }

        }


        // Remove "spent" ids

        for(let id of idsToDelete) delayedTableOfIds.splice(id,1)


        // Also, add the array of delayed operations from THIS checkpoint if it's not empty

        let currentArrayOfDelayedOperations = await GET_FROM_STATE('UNSTAKING_OPERATIONS')
        
        if(currentArrayOfDelayedOperations.length !== 0){

            delayedTableOfIds.push(currentEpochIndex)

            global.SYMBIOTE_META.STATE_CACHE.set('DEL_OPER_'+currentEpochIndex,currentArrayOfDelayedOperations)

        }


        // Set the DELAYED_TABLE_OF_IDS to DB

        global.SYMBIOTE_META.STATE_CACHE.set('DELAYED_TABLE_OF_IDS',delayedTableOfIds)

    
    
        // Delete the temporary from cache
    
        global.SYMBIOTE_META.STATE_CACHE.delete('UNSTAKING_OPERATIONS')
    
        global.SYMBIOTE_META.STATE_CACHE.delete('SLASH_OBJECT')


        //_______________________Commit changes after operations here________________________

        // Update the WORKFLOW_OPTIONS
        global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS = {...workflowOptionsTemplate}

        global.SYMBIOTE_META.STATE_CACHE.delete('WORKFLOW_OPTIONS')

    
        // Update the quorum for next epoch
        global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH.quorum = nextEpochQuorum

        // Change reassignment chains
        global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH.leadersSequence = nextEpochLeadersSequences

        
        // Update the array of prime pools and reset the pools metadata for next epoch(to start with default -1 index and hash 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef)

        let newPrimePoolsArray = []

        for(let [poolPubKey,poolMetadata] of Object.entries(global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL)){

            if(!poolMetadata.isReserve) {

                newPrimePoolsArray.push(poolPubKey)

                global.SYMBIOTE_META.VERIFICATION_THREAD.VT_FINALIZATION_STATS[poolPubKey] = {

                    currentLeaderOnShard:-1,

                    index:-1,
                    
                    hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

                }

            }

            global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[poolPubKey] = {
                
                index:-1,
                
                hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

                isReserve:poolMetadata.isReserve
            
            }

            // Close connection in case we have
            
            let tunnelHandler = global.SYMBIOTE_META.STUFF_CACHE.get('TUNNEL:'+poolPubKey)

            if(tunnelHandler) tunnelHandler.connection.close()

        }

        global.SYMBIOTE_META.STATE_CACHE.set('PRIME_POOLS',newPrimePoolsArray)


        // Finally - delete the AEFP reassignment metadata
        delete global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA

        // Delete the useless temporary reassignments from previous epoch
        delete global.SYMBIOTE_META.VERIFICATION_THREAD.TEMP_REASSIGNMENTS[vtEpochFullID]


        LOG(`\u001b[38;5;154mEpoch edge operations were executed for epoch \u001b[38;5;93m${global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH.id} ### ${global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH.hash} (VT)\u001b[0m`,'S')


        // Finally - set the new index, hash and timestamp for next epoch

        global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH.id = vtEpochHandler.id+1

        global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH.hash = nextEpochHash

        global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH.timestamp += global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS.EPOCH_TIME


        // Commit the changes of state using atomic batch
        global.SYMBIOTE_META.STATE_CACHE.forEach(
            
            (value,recordID) => atomicBatch.put(recordID,value)
            
        )

        atomicBatch.put('VT',global.SYMBIOTE_META.VERIFICATION_THREAD)

        await atomicBatch.write()


        // Now we can delete useless data from EPOCH_DATA db

        await global.SYMBIOTE_META.EPOCH_DATA.del(`NEXT_EPOCH_HASH:${vtEpochFullID}`).catch(()=>{})

        await global.SYMBIOTE_META.EPOCH_DATA.del(`NEXT_EPOCH_QUORUM:${vtEpochFullID}`).catch(()=>{})

        await global.SYMBIOTE_META.EPOCH_DATA.del(`NEXT_EPOCH_LS:${vtEpochFullID}`).catch(()=>{})



        LOG(`Epoch on verification thread was updated => \x1b[34;1m${global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH.hash}#${global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH.id}`,'S')
        

        //_______________________Check the version required for the next checkpoint________________________

        if(IS_MY_VERSION_OLD('VERIFICATION_THREAD')){

            LOG(`New version detected on VERIFICATION_THREAD. Please, upgrade your node software`,'W')
        
            // Stop the node to update the software
            GRACEFUL_STOP()
        
        }

    }

},




TRY_TO_CHANGE_EPOCH_FOR_SHARD = async vtEpochHandler => {

    /* 
            
        Start to build the global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA
            
        For this we need 5 things:

            1) Epoch edge operations for current epoch - we take it from await global.SYMBIOTE_META.EPOCH_DATA.put(`EEO:${oldEpochFullID}`).catch(()=>false)

                This is the array that we need to execute later in sync mode

            2) Next epoch hash - await global.SYMBIOTE_META.EPOCH_DATA.put(`NEXT_EPOCH_HASH:${oldEpochFullID}`).catch(()=>false)

            3) Next epoch quorum - await global.SYMBIOTE_META.EPOCH_DATA.put(`NEXT_EPOCH_QUORUM:${oldEpochFullID}`).catch(()=>false)

            4) Reassignment chains for new epoch - await global.SYMBIOTE_META.EPOCH_DATA.put(`NEXT_EPOCH_LS:${oldEpochFullID}`).catch(()=>false)

            5) AEFPs for all the shard from the first blocks of next epoch(X+1) to know where current epoch finished

                For this, we use the [3](next epoch quorum) and ask them for first blocks in epoch. After we get it & AFPs for them, we

                try to resolve the real first block in epoch X+1. Get the AEFP from it and start reverse cycle to build the reassignment metadata
                    
                to know how each of shard done in epoch X(current one)



    */

    let vtEpochFullID = vtEpochHandler.hash+"#"+vtEpochHandler.id

    let vtEpochIndex = vtEpochHandler.id

    let nextEpochIndex = vtEpochIndex+1

    let nextEpochHash = await global.SYMBIOTE_META.EPOCH_DATA.get(`NEXT_EPOCH_HASH:${vtEpochFullID}`).catch(()=>false)

    let nextEpochQuorum = await global.SYMBIOTE_META.EPOCH_DATA.get(`NEXT_EPOCH_QUORUM:${vtEpochFullID}`).catch(()=>false)

    let nextEpochLeadersSequences = await global.SYMBIOTE_META.EPOCH_DATA.get(`NEXT_EPOCH_LS:${vtEpochFullID}`).catch(()=>false)



    if(nextEpochHash && nextEpochQuorum && nextEpochLeadersSequences){

        let epochCache = await global.SYMBIOTE_META.EPOCH_DATA.put(`VT_CACHE:${vtEpochIndex}`).catch(()=>false) || {} // {shardID:{firstBlockCreator,firstBlockHash,realFirstBlockFound}} 

        let allKnownPeers = [...await GET_QUORUM_URLS_AND_PUBKEYS(),...GET_ALL_KNOWN_PEERS()]

        let totalNumberOfShards = 0, totalNumberOfShardsReadyForMove = 0

        // Find the first blocks for epoch X+1 and AFPs for these blocks
        // Once get it - get the real first block
        for(let [primePoolPubKey,arrayOfReservePools] of Object.entries(nextEpochLeadersSequences)){

            totalNumberOfShards++

            // First of all - try to find block <epoch id+1>:<prime pool pubkey>:0 - first block by prime pool

            if(!epochCache[primePoolPubKey]) epochCache[primePoolPubKey]={}

            if(!epochCache[primePoolPubKey].realFirstBlockFound){

                // First of all - try to find AFP for block epochID:PrimePoolPubKey:0

                let firstBlockOfPrimePoolForNextEpoch = nextEpochIndex+':'+primePoolPubKey+':0'

                let afpForFirstBlockOfPrimePool = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+firstBlockOfPrimePoolForNextEpoch).catch(()=>false)

                if(afpForFirstBlockOfPrimePool){

                    epochCache[primePoolPubKey].firstBlockCreator = primePoolPubKey

                    epochCache[primePoolPubKey].firstBlockHash = afpForFirstBlockOfPrimePool.blockHash

                    epochCache[primePoolPubKey].realFirstBlockFound = true // if we get the block 0 by prime pool - it's 100% the first block

                }else{

                    let imitationOfEpochHandlerForNextEpoch = {

                        id:nextEpochIndex,

                        hash:nextEpochHash,

                        quorum:nextEpochQuorum

                    }

                    // Ask quorum for AFP for first block of prime pool

                    // Descriptor is {url,pubKey}

                    for(let peerHostname of allKnownPeers){
            
                        let itsProbablyAggregatedFinalizationProof = await fetch(peerHostname+'/aggregated_finalization_proof/'+firstBlockOfPrimePoolForNextEpoch,{agent:GET_HTTP_AGENT(peerHostname)}).then(r=>r.json()).catch(()=>false)

                        if(itsProbablyAggregatedFinalizationProof){
            
                            let isOK = await VERIFY_AGGREGATED_FINALIZATION_PROOF(itsProbablyAggregatedFinalizationProof,imitationOfEpochHandlerForNextEpoch)
            
                            if(isOK && itsProbablyAggregatedFinalizationProof.blockID === firstBlockOfPrimePoolForNextEpoch){                            
                            
                                epochCache[primePoolPubKey].firstBlockCreator = primePoolPubKey

                                epochCache[primePoolPubKey].firstBlockHash = itsProbablyAggregatedFinalizationProof.blockHash

                                epochCache[primePoolPubKey].realFirstBlockFound = true

                            }
            
                        }
            
                    }
            
                }

                //_____________________________________ Find AFPs for first blocks of reserve pools _____________________________________
            
                if(!epochCache[primePoolPubKey].realFirstBlockFound){

                    // Find AFPs for reserve pools
                
                    for(let position = 0, length = arrayOfReservePools.length ; position < length ; position++){

                        let reservePoolPubKey = arrayOfReservePools[position]

                        let firstBlockOfPool = nextEpochIndex+':'+reservePoolPubKey+':0'

                        let afp = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+firstBlockOfPool).catch(()=>false)

                        if(afp){

                            //______________Now check if block is really the first one. Otherwise, run reverse cycle from <position> to -1 get the first block in epoch______________

                            let potentialFirstBlock = await GET_BLOCK(nextEpochIndex,reservePoolPubKey,0,true)

                            if(potentialFirstBlock && afp.blockHash === Block.genHash(potentialFirstBlock)){

                                /*
                            
                                    Now, when we have block of some pool with index 0(first block in epoch) we're interested in block.extraData.aggregatedLeadersRotationProofs
                            
                                    We should get the ALRP for previous pool in leaders sequence
                                
                                        1) If previous pool was rotated on height -1 (alrp.skipIndex === -1) then try next pool

                                */

                                let currentPosition = position

                                let alrpData = {}
                                
                                while(true){

                                    let shouldBreakInfiniteWhile = false

                                    while(true){
    
                                        let previousPoolPubKey = arrayOfReservePools[currentPosition-1] || primePoolPubKey
    
                                        let aggregatedLeaderRotationProofForPreviousPool = potentialFirstBlock.extraData.aggregatedLeadersRotationProofs[previousPoolPubKey]


                                        if(previousPoolPubKey === primePoolPubKey){

                                            // In case we get the start of reassignment chain - break the cycle. The <potentialFirstBlock> will be the first block in epoch

                                            epochCache[primePoolPubKey].firstBlockCreator = alrpData.firstBlockCreator

                                            epochCache[primePoolPubKey].firstBlockHash = alrpData.firstBlockHash
        
                                            epochCache[primePoolPubKey].realFirstBlockFound = true
                                    
                                            shouldBreakInfiniteWhile = true

                                            break

                                        }else if(aggregatedLeaderRotationProofForPreviousPool.skipIndex !== -1){
    
                                            // Get the first block of pool which was reassigned on not-null height
                                            let potentialNextBlock = await GET_BLOCK(nextEpochIndex,previousPoolPubKey,0)

                                            if(potentialNextBlock && Block.genHash(potentialNextBlock) === aggregatedLeaderRotationProofForPreviousPool.firstBlockHash){

                                                potentialFirstBlock = potentialNextBlock

                                                alrpData.firstBlockCreator = previousPoolPubKey

                                                alrpData.firstBlockHash = aggregatedLeaderRotationProofForPreviousPool.firstBlockHash

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

                await global.SYMBIOTE_META.EPOCH_DATA.put(`VT_CACHE:${vtEpochIndex}`,epochCache).catch(()=>false)

            }

            
            if(epochCache[primePoolPubKey].realFirstBlockFound){

                //____________After we get the first blocks for epoch X+1 - get the AEFP from it and build the reassignment metadata to finish epoch X____________

                // Try to get block

                let firstBlockOnThisShardInThisEpoch = await GET_BLOCK(nextEpochIndex,epochCache[primePoolPubKey].firstBlockCreator,0)

                if(firstBlockOnThisShardInThisEpoch && Block.genHash(firstBlockOnThisShardInThisEpoch) === epochCache[primePoolPubKey].firstBlockHash){

                    epochCache[primePoolPubKey].aefp = firstBlockOnThisShardInThisEpoch.extraData.aefpForPreviousEpoch

                }

            }


            if(epochCache[primePoolPubKey].aefp) totalNumberOfShardsReadyForMove++

        }

        if(totalNumberOfShards === totalNumberOfShardsReadyForMove){

            // Create empty template
            if(!global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA) global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA = {}

            for(let primePoolPubKey of Object.keys(nextEpochLeadersSequences)){

                // Now, using this AEFP (especially fields lastLeader,lastIndex,lastHash,firstBlockHash) build reassignment metadata to finish epoch for this shard
                
                if(!global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA[primePoolPubKey]) await BUILD_REASSIGNMENT_METADATA_FOR_SHARDS(vtEpochHandler,primePoolPubKey,epochCache[primePoolPubKey].aefp)

            }

        }

    }

},




OPEN_TUNNEL_TO_FETCH_BLOCKS_FOR_POOL = async (poolPubKeyToOpenConnectionWith,epochHandler) => {

    /* 
    
        Open connection with websocket endpoint which was set by target pool

        Use the following rules to define the priority

            1) In case we have a URL in global.CONIG.SYMBIOTE_META.BLOCKS_TUNNELS[poolPubKeyToOpenConnectionWith] - use this URL

            2) Otherwise - use endpoint from GET_FROM_STATE(poolPubKeyToOpenConnectionWith+'(POOL)_STORAGE_POOL')

    */


    let endpointURL = global.CONFIG.SYMBIOTE?.BLOCKS_TUNNELS?.[poolPubKeyToOpenConnectionWith]

    if(!endpointURL){

        let poolBinding = await GET_FROM_STATE(poolPubKeyToOpenConnectionWith+'(POOL)_POINTER')

        let poolStorage = await GET_FROM_STATE(poolBinding+':'+poolPubKeyToOpenConnectionWith+'(POOL)_STORAGE_POOL')
        

        if(poolStorage) endpointURL = poolStorage.wssPoolURL
    
    }



    if(endpointURL){

        // Open tunnel, set listeners for events, add to cache and fetch blocks portions time by time. 

        // global.SYMBIOTE_META.STUFF_CACHE.get('TUNNEL:'+poolToVerifyRightNow)

        await new Promise(resolve=>{

            let WebSocketClient = WS.client
    
            let client = new WebSocketClient({})

            client.connect(endpointURL,'echo-protocol')


            client.on('connect',connection=>{

                connection.on('message',async message=>{

                    if(message.type === 'utf8'){

                        if(global.SYMBIOTE_META.STUFF_CACHE.has('TUNNEL_REQUEST_ACCEPTED:'+poolPubKeyToOpenConnectionWith)) return

                        global.SYMBIOTE_META.STUFF_CACHE.set('TUNNEL_REQUEST_ACCEPTED:'+poolPubKeyToOpenConnectionWith,true)
                        
                        let handler = global.SYMBIOTE_META.STUFF_CACHE.get('TUNNEL:'+poolPubKeyToOpenConnectionWith) // {url,hasUntilHeight,connection,cache(blockID=>block)}

                        let parsedData = JSON.parse(message.utf8Data) // {blocks:[],afpForLatest}

                        let limit = 500 // max 500 blocks per request. Change it if you neeed


                        if(typeof parsedData === 'object' && typeof parsedData.afpForLatest === 'object' && Array.isArray(parsedData.blocks) && parsedData.blocks.length <= limit && parsedData.blocks[0]?.index === handler.hasUntilHeight+1){

                            let lastBlockInfo = global.SYMBIOTE_META.STUFF_CACHE.get('GET_FINAL_BLOCK:'+poolPubKeyToOpenConnectionWith)

                            if(lastBlockInfo && handler.hasUntilHeight+1 === lastBlockInfo.index){

                                let lastBlockThatWeGet = parsedData.blocks[parsedData.blocks.length-1]

                                if(lastBlockThatWeGet){

                                    let blockHash = Block.genHash(lastBlockThatWeGet)

                                    if(blockHash === lastBlockInfo.hash && lastBlockInfo.index === lastBlockThatWeGet.index){

                                        let blockID = epochHandler.id+':'+poolPubKeyToOpenConnectionWith+':'+lastBlockThatWeGet.index

                                        handler.cache.set(blockID,lastBlockThatWeGet)
                                        
                                        handler.hasUntilHeight = lastBlockThatWeGet.index
                                        
                                        global.SYMBIOTE_META.STUFF_CACHE.delete('GET_FINAL_BLOCK:'+poolPubKeyToOpenConnectionWith)

                                    }

                                }

                            }else{


                                // Make sure it's a chain

                                let breaked = false

                                
                                /*
                        
                                    Run the cycle to verify the range:

                                    Start from blocks[blocks.length-1] to 0. The first block in .blocks array must be +1 than we have locally

                                    Make sure it's a valid chain(Block_N.prevHash=Hash(Block_N-1))

                                    Finally, check the AFP for latest block - this way we verify the whole segment using O(1) complexity
                        
                                */

                                for(let currentBlockIndexInArray = parsedData.blocks.length-1 ; currentBlockIndexInArray >= 0 ; currentBlockIndexInArray--){

                                    let currentBlock = parsedData.blocks[currentBlockIndexInArray]

                                    // Compare hashes - currentBlock.prevHash must be the same as Hash(blocks[index-1])

                                    let hashesAreEqual = true, indexesAreOk = true

                                    if(currentBlockIndexInArray>0){

                                        hashesAreEqual = Block.genHash(parsedData.blocks[currentBlockIndexInArray-1]) === currentBlock.prevHash

                                        indexesAreOk = parsedData.blocks[currentBlockIndexInArray-1].index+1 === parsedData.blocks[currentBlockIndexInArray].index

                                    }

                                    // Now, check the structure of block

                                    let typeCheckIsOk = typeof currentBlock.extraData==='object' && typeof currentBlock.prevHash==='string' && typeof currentBlock.epoch==='string' && typeof currentBlock.sig==='string' && Array.isArray(currentBlock.transactions)
                                
                                    let itsTheSameCreator = currentBlock.creator === poolPubKeyToOpenConnectionWith

                                    let overviewIsOk = typeCheckIsOk && itsTheSameCreator && hashesAreEqual && indexesAreOk

                                    // If it's the last block in array(and first in enumeration) - check the AFP for latest block

                                    if(overviewIsOk && currentBlockIndexInArray === parsedData.blocks.length-1){

                                        let blockIDThatMustBeInAfp = epochHandler.id+':'+poolPubKeyToOpenConnectionWith+':'+(currentBlock.index+1)

                                        let prevBlockHashThatMustBeInAfp = Block.genHash(currentBlock)

                                        overviewIsOk &&= blockIDThatMustBeInAfp === parsedData.afpForLatest.blockID && prevBlockHashThatMustBeInAfp === parsedData.afpForLatest.prevBlockHash && await VERIFY_AGGREGATED_FINALIZATION_PROOF(parsedData.afpForLatest,epochHandler)

                                    }
                                
                                
                                    if(!overviewIsOk){

                                        breaked = true

                                        break

                                    }

                                }

                            
                                // If we have size - add blocks here. The reserve is 5000 blocks per shard

                                if(handler.cache.size+parsedData.blocks.length<=5000 && !breaked){

                                    // Add the blocks to mapping

                                    parsedData.blocks.forEach(block=>{

                                        let blockID = epochHandler.id+':'+poolPubKeyToOpenConnectionWith+':'+block.index

                                        handler.cache.set(blockID,block)

                                    })

                                    handler.hasUntilHeight = parsedData.blocks[parsedData.blocks.length-1].index
                                
                                }

                            }
                            
                        }

                        global.SYMBIOTE_META.STUFF_CACHE.delete('TUNNEL_REQUEST_ACCEPTED:'+poolPubKeyToOpenConnectionWith)
                    
                    }        

                })

                // Start to ask for blocks time by time
                
                let stopHandler = setInterval(()=>{

                    if(!global.SYMBIOTE_META.STUFF_CACHE.has('TUNNEL_REQUEST_ACCEPTED:'+poolPubKeyToOpenConnectionWith)){

                        let handler = global.SYMBIOTE_META.STUFF_CACHE.get('TUNNEL:'+poolPubKeyToOpenConnectionWith) // {url,hasUntilHeight,connection,cache(blockID=>block)}

                        let lastBlockInfo = global.SYMBIOTE_META.STUFF_CACHE.get('GET_FINAL_BLOCK:'+poolPubKeyToOpenConnectionWith)

                        if(handler){
    
                            let messageToSend = {
    
                                route:'get_blocks',

                                pool:poolPubKeyToOpenConnectionWith,
        
                                hasUntilHeight:handler.hasUntilHeight,

                                epochIndex:epochHandler.id,

                                sendWithNoAfp:{}
        
                            }

                            if(lastBlockInfo && handler.hasUntilHeight+1 === lastBlockInfo.index) messageToSend.sendWithNoAfp = lastBlockInfo
        
                            connection.sendUTF(JSON.stringify(messageToSend))
    
                        }    

                    }

                },2000)

                connection.on('close',()=>{

                    global.SYMBIOTE_META.STUFF_CACHE.delete('TUNNEL:'+poolPubKeyToOpenConnectionWith)

                    clearInterval(stopHandler)

                })
                      
                connection.on('error',()=>{

                    global.SYMBIOTE_META.STUFF_CACHE.delete('TUNNEL:'+poolPubKeyToOpenConnectionWith)

                    clearInterval(stopHandler)

                })

                let hasUntilHeight = global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[poolPubKeyToOpenConnectionWith].index

                global.SYMBIOTE_META.STUFF_CACHE.set('TUNNEL:'+poolPubKeyToOpenConnectionWith,{url:endpointURL,hasUntilHeight,connection,cache:new Map()}) // mapping <cache> has the structure blockID => block

            })

            resolve()

        })                
 
    }

},




CHECK_CONNECTION_WITH_POOL=async(poolToVerifyRightNow,vtEpochHandler)=>{

    if(!global.SYMBIOTE_META.STUFF_CACHE.has('TUNNEL:'+poolToVerifyRightNow) && !global.SYMBIOTE_META.STUFF_CACHE.has('TUNNEL_OPENING_PROCESS:'+poolToVerifyRightNow)){

        await OPEN_TUNNEL_TO_FETCH_BLOCKS_FOR_POOL(poolToVerifyRightNow,vtEpochHandler)

        global.SYMBIOTE_META.STUFF_CACHE.set('TUNNEL_OPENING_PROCESS:'+poolToVerifyRightNow,true)

        setTimeout(()=>{

            global.SYMBIOTE_META.STUFF_CACHE.delete('TUNNEL_OPENING_PROCESS:'+poolToVerifyRightNow)

        },5000)

        
    }else if(global.SYMBIOTE_META.STUFF_CACHE.has('CHANGE_TUNNEL:'+poolToVerifyRightNow)){

        // Check if endpoint wasn't changed dynamically(via priority changes in configs/storage)

        let tunnelHandler = global.SYMBIOTE_META.STUFF_CACHE.get('TUNNEL:'+poolToVerifyRightNow) // {url,hasUntilHeight,connection,cache(blockID=>block)}

        tunnelHandler.connection.close()

        global.SYMBIOTE_META.STUFF_CACHE.delete('CHANGE_TUNNEL:'+poolToVerifyRightNow)

        await OPEN_TUNNEL_TO_FETCH_BLOCKS_FOR_POOL(poolToVerifyRightNow,vtEpochHandler)
        
        global.SYMBIOTE_META.STUFF_CACHE.set('TUNNEL_OPENING_PROCESS:'+poolToVerifyRightNow,true)

        setTimeout(()=>{

            global.SYMBIOTE_META.STUFF_CACHE.delete('TUNNEL_OPENING_PROCESS:'+poolToVerifyRightNow)

        },5000)

    }

},




START_VERIFICATION_THREAD=async()=>{

    let primePoolsPubkeys = global.SYMBIOTE_META.STATE_CACHE.get('PRIME_POOLS')

    if(!primePoolsPubkeys){

        let primePools = Object.keys(global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL).filter(
                
            pubKey => !global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[pubKey].isReserve
                
        )

        global.SYMBIOTE_META.STATE_CACHE.set('PRIME_POOLS',primePools)

        primePoolsPubkeys = primePools

    }

    
    let currentEpochIsFresh = EPOCH_STILL_FRESH(global.SYMBIOTE_META.VERIFICATION_THREAD)

    let vtEpochHandler = global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH

    let previousShardWeChecked = global.SYMBIOTE_META.VERIFICATION_THREAD.SHARD_POINTER

    let indexOfPreviousShard = primePoolsPubkeys.indexOf(previousShardWeChecked)

    let currentShardToCheck = primePoolsPubkeys[indexOfPreviousShard+1] || primePoolsPubkeys[0] // Take the next prime pool in a row. If it's end of pools - start from the first validator in array

    let vtEpochFullID = vtEpochHandler.hash+"#"+vtEpochHandler.id

    let vtEpochIndex = vtEpochHandler.id

        
        


    // Get the stats from reassignments

    let tempReassignmentsForSomeShard = global.SYMBIOTE_META.VERIFICATION_THREAD.TEMP_REASSIGNMENTS[vtEpochFullID]?.[currentShardToCheck] // {currentLeader,currentToVerify,reassignments:{poolPubKey:{index,hash}}}


    if(global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA?.[currentShardToCheck]){

        
        /*
        
            In case we have .REASSIGNMENT_METADATA - it's a signal that the new epoch on QT has started
            In this case, in function TRY_TO_CHANGE_EPOCH_FOR_VERIFICATION_THREAD we update the epoch and add the .REASSIGNMENT_METADATA which has the structure

            {
                shard:{

                    pool0:{index,hash},
                    ...
                    poolN:{index,hash}

                }
            }

            We just need to go through the .REASSIGNMENT_METADATA[currentShardToCheck] and start the cycle over vtEpochHandler.leadersSequence[currentShardToCheck] and verify all the blocks

        */


        if(!global.SYMBIOTE_META.STUFF_CACHE.has('SHARDS_READY_TO_NEW_EPOCH')) global.SYMBIOTE_META.STUFF_CACHE.set('SHARDS_READY_TO_NEW_EPOCH',{readyToNewEpoch:0})

        if(!global.SYMBIOTE_META.STUFF_CACHE.has('CURRENT_TO_FINISH:'+currentShardToCheck)) global.SYMBIOTE_META.STUFF_CACHE.set('CURRENT_TO_FINISH:'+currentShardToCheck,{indexOfCurrentPoolToVerify:-1})


        let shardsReadyToNewEpoch = global.SYMBIOTE_META.STUFF_CACHE.get('SHARDS_READY_TO_NEW_EPOCH') // {readyToNewEpoch:int}
        
        let handlerWithIndexToVerify = global.SYMBIOTE_META.STUFF_CACHE.get('CURRENT_TO_FINISH:'+currentShardToCheck) // {indexOfCurrentPoolToVerify:int}

        let metadataForShardFromAefp = global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA[currentShardToCheck] // {pool:{index,hash},...}


        while(true){

            let poolPubKey = vtEpochHandler.leadersSequence[currentShardToCheck][handlerWithIndexToVerify.indexOfCurrentPoolToVerify] || currentShardToCheck

            let localVtMetadataForPool = global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[poolPubKey]

            let metadataFromAefpForThisPool = metadataForShardFromAefp[poolPubKey] || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'}


            if(localVtMetadataForPool.index === metadataFromAefpForThisPool.index){

                if(vtEpochHandler.leadersSequence[currentShardToCheck].length === handlerWithIndexToVerify.indexOfCurrentPoolToVerify-1) break

                else {

                    handlerWithIndexToVerify.indexOfCurrentPoolToVerify++

                    continue

                }

            }


            await CHECK_CONNECTION_WITH_POOL(poolPubKey,vtEpochHandler)


            let tunnelHandler = global.SYMBIOTE_META.STUFF_CACHE.get('TUNNEL:'+poolPubKey) // {url,hasUntilHeight,connection,cache(blockID=>block)}

            if(tunnelHandler){

                global.SYMBIOTE_META.STUFF_CACHE.set('GET_FINAL_BLOCK:'+poolPubKey,metadataForShardFromAefp[poolPubKey])
            
                let biggestHeightInCache = tunnelHandler.hasUntilHeight

                let stepsForWhile = biggestHeightInCache - localVtMetadataForPool.index


                if(stepsForWhile <= 0){

                    // Break the outer <while> cycle to try to find blocks & finish this epoch on another shard

                    break

                }
                
                // Start the cycle to process all the blocks
                while(stepsForWhile > 0){

                    // Move to next one
                    if(metadataFromAefpForThisPool.index === localVtMetadataForPool.index) break
        

                    let blockIdToGet = vtEpochIndex+':'+poolPubKey+':'+(localVtMetadataForPool.index+1)
        
                    let block = tunnelHandler.cache.get(blockIdToGet)
        
        
                    if(block){
        
                        await verifyBlock(block,currentShardToCheck)

                        VT_STATS_LOG(vtEpochIndex,vtEpochHandler.hash,currentShardToCheck)

                    }
                    
                    stepsForWhile--
            
                }

            } else break


            if(localVtMetadataForPool.index === metadataFromAefpForThisPool.index) handlerWithIndexToVerify.indexOfCurrentPoolToVerify++

        }


        if(vtEpochHandler.leadersSequence[currentShardToCheck].length === handlerWithIndexToVerify.indexOfCurrentPoolToVerify-1) shardsReadyToNewEpoch.readyToNewEpoch++

        
    }else if(currentEpochIsFresh && tempReassignmentsForSomeShard){

        
        let indexOfCurrentPoolToVerify = tempReassignmentsForSomeShard.currentToVerify

        // Take the pool by it's position in reassignment chains. If -1 - then it's prime pool, otherwise - get the reserve pool by index
        
        let poolToVerifyRightNow = indexOfCurrentPoolToVerify === -1 ? currentShardToCheck : vtEpochHandler.leadersSequence[currentShardToCheck][indexOfCurrentPoolToVerify]
        
        let verificationStatsOfThisPool = global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[poolToVerifyRightNow] // {index,hash,isReserve}

        let metadataWherePoolWasReassigned = tempReassignmentsForSomeShard.reassignments[poolToVerifyRightNow] // {index,hash} || null(in case currentToVerify===currentLeader)

        
        if(metadataWherePoolWasReassigned && verificationStatsOfThisPool.index === metadataWherePoolWasReassigned.index){

            // Move to next one
            tempReassignmentsForSomeShard.currentToVerify++

            global.SYMBIOTE_META.VERIFICATION_THREAD.SHARD_POINTER = currentShardToCheck


            if(!currentEpochIsFresh) await TRY_TO_CHANGE_EPOCH_FOR_SHARD(vtEpochHandler)
                    
        
            setImmediate(START_VERIFICATION_THREAD)

            return

        }
        
        // Try check if we have established a WSS channel to fetch blocks

        await CHECK_CONNECTION_WITH_POOL(poolToVerifyRightNow,vtEpochHandler)


        // Now, when we have connection with some entity which has an ability to give us blocks via WS(s) tunnel

        let tunnelHandler = global.SYMBIOTE_META.STUFF_CACHE.get('TUNNEL:'+poolToVerifyRightNow) // {url,hasUntilHeight,connection,cache(blockID=>block)}


        if(tunnelHandler){

            let biggestHeightInCache = tunnelHandler.hasUntilHeight

            let stepsForWhile = biggestHeightInCache - verificationStatsOfThisPool.index

            // In this case we can grab the final block
            if(metadataWherePoolWasReassigned) global.SYMBIOTE_META.STUFF_CACHE.set('GET_FINAL_BLOCK:'+poolToVerifyRightNow,metadataWherePoolWasReassigned)

            // Start the cycle to process all the blocks

            while(stepsForWhile > 0){

    
                let blockIdToGet = vtEpochIndex+':'+poolToVerifyRightNow+':'+(verificationStatsOfThisPool.index+1)
    
                let block = tunnelHandler.cache.get(blockIdToGet)
    
    
                if(block){
    
                    await verifyBlock(block,currentShardToCheck)

                    VT_STATS_LOG(vtEpochIndex,vtEpochHandler.hash,currentShardToCheck)
        
                }
                
                stepsForWhile--
        
            }
    
        }

    }


    global.SYMBIOTE_META.VERIFICATION_THREAD.SHARD_POINTER = currentShardToCheck


    if(!currentEpochIsFresh && !global.SYMBIOTE_META.VERIFICATION_THREAD.REASSIGNMENT_METADATA?.[currentShardToCheck]) await TRY_TO_CHANGE_EPOCH_FOR_SHARD(vtEpochHandler)


    if(global.SYMBIOTE_META.STUFF_CACHE.has('SHARDS_READY_TO_NEW_EPOCH')){

        let handler = global.SYMBIOTE_META.STUFF_CACHE.get('SHARDS_READY_TO_NEW_EPOCH') // {readyToNewEpoch:int}

        if(handler.readyToNewEpoch === primePoolsPubkeys.length) await SET_UP_NEW_EPOCH_FOR_VERIFICATION_THREAD(vtEpochHandler)

    }
            

    setImmediate(START_VERIFICATION_THREAD)

},




GET_EMPTY_ACCOUNT_TEMPLATE_BINDED_TO_SHARD=async(shardContext,publicKey)=>{

    let emptyTemplate = {
        
        type:"account",
        balance:0,
        uno:0,
        nonce:0,
        rev_t:0
    
    }

    // Add to cache to write to permanent db after block verification

    global.SYMBIOTE_META.STATE_CACHE.set(shardContext+':'+publicKey,emptyTemplate)

    return emptyTemplate

},




SHARE_FEES_AMONG_STAKERS_OF_BLOCK_CREATOR=async(shardContext,feeToPay,blockCreator)=>{

    let blockCreatorOrigin = await GET_FROM_STATE(blockCreator+'(POOL)_POINTER')

    let mainStorageOfBlockCreator = await GET_FROM_STATE(blockCreatorOrigin+':'+blockCreator+'(POOL)_STORAGE_POOL')

    // Transfer part of fees to account with pubkey associated with block creator
    if(mainStorageOfBlockCreator.percentage!==0){

        // Get the pool percentage and send to appropriate Ed25519 address in the <shardContext>
        let poolBindedAccount = await GET_ACCOUNT_ON_SYMBIOTE(shardContext+':'+blockCreator)|| await GET_EMPTY_ACCOUNT_TEMPLATE_BINDED_TO_SHARD(shardContext,blockCreator)

        poolBindedAccount.balance += mainStorageOfBlockCreator.percentage*feeToPay
        
    }

    let restOfFees = feeToPay - mainStorageOfBlockCreator.percentage*feeToPay


    // Share the rest of fees among stakers due to their % part in total pool stake
    
    for(let [stakerPubKey,stakerMetadata] of Object.entries(mainStorageOfBlockCreator.stakers)){

        // Iteration over the stakerPubKey = <any of supported pubkeys>     |       stakerMetadata = {kly,uno}

        let stakerTotalPower = stakerMetadata.uno + stakerMetadata.kly

        let totalStakerPowerPercent = stakerTotalPower/mainStorageOfBlockCreator.totalPower

        let stakerAccountBindedToCurrentShardContext = await GET_ACCOUNT_ON_SYMBIOTE(shardContext+':'+stakerPubKey) || await GET_EMPTY_ACCOUNT_TEMPLATE_BINDED_TO_SHARD(shardContext,stakerPubKey)

        stakerAccountBindedToCurrentShardContext.balance += totalStakerPowerPercent*restOfFees

    }

},




SEND_FEES_TO_ACCOUNTS_ON_THE_SAME_SHARD = async(shardID,feeRecepientPoolPubKey,feeReward) => {

    // We should get the object {reward:X}. This metric shows "How much does pool <feeRecepientPool> get as a reward from txs on shard <shardID>"
    // In order to protocol, not all the fees go to the shard leader - part of them are sent to the rest of shards authorities(to pools) and smart contract automatically distribute reward among stakers of this pool

    let accountsForFeesId = shardID+':'+feeRecepientPoolPubKey

    let feesAccountForGivenPoolOnThisShard = await GET_ACCOUNT_ON_SYMBIOTE(accountsForFeesId) || await GET_EMPTY_ACCOUNT_TEMPLATE_BINDED_TO_SHARD(accountsForFeesId)

    feesAccountForGivenPoolOnThisShard.balance += feeReward

},




//Function to distribute stakes among blockCreator/his stakers/rest of prime pools
DISTRIBUTE_FEES_AMONG_STAKERS_AND_OTHER_POOLS=async(totalFees,shardContext,arrayOfPrimePools,blockCreator)=>{

    /*

        _____________________Here we perform the following logic_____________________

        [*] totalFees - number of total fees received in this block



        1) Take all the PRIME pools from <arrayOfPrimePools>

        2) Send <REWARD_PERCENTAGE_FOR_BLOCK_CREATOR * totalFees> to block creator

        3) Distribute the rest among all the other pools(excluding block creator)

            For this, we should:

            3.1) Take the pool storage from state by id = validatorPubKey+'(POOL)_STORAGE_POOL'

            3.2) Run the cycle over the POOL.STAKERS(structure is STAKER_PUBKEY => {kly,uno}) and increase reward by FEES_FOR_THIS_VALIDATOR * ( STAKER_POWER_IN_UNO / TOTAL_POOL_POWER )

    
    */

    let payToCreatorAndHisPool = totalFees * global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS.REWARD_PERCENTAGE_FOR_BLOCK_CREATOR, //the bigger part is usually for block creator

        payToEachPool = Math.floor((totalFees - payToCreatorAndHisPool)/(arrayOfPrimePools.length-1)), //and share the rest among other pools
    
        shareFeesPromises = []

          
    if(arrayOfPrimePools.length===1) payToEachPool = totalFees - payToCreatorAndHisPool


    //___________________________________________ BLOCK_CREATOR ___________________________________________

    shareFeesPromises.push(SHARE_FEES_AMONG_STAKERS_OF_BLOCK_CREATOR(shardContext,payToCreatorAndHisPool,blockCreator))

    //_____________________________________________ THE REST ______________________________________________

    arrayOfPrimePools.forEach(feesRecepientPrimePoolPubKey=>

        feesRecepientPrimePoolPubKey !== shardContext && shareFeesPromises.push(SEND_FEES_TO_ACCOUNTS_ON_THE_SAME_SHARD(shardContext,feesRecepientPrimePoolPubKey,payToEachPool))
            
    )
     
    await Promise.all(shareFeesPromises.splice(0))

},




verifyBlock=async(block,shardContext)=>{


    let blockHash = Block.genHash(block),

        overviewOk=
        
            block.transactions?.length<=global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS.TXS_LIMIT_PER_BLOCK
            &&
            global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[block.creator].hash === block.prevHash // it should be a chain

    // if(block.i === global.CONFIG.SYMBIOTE.SYMBIOTE_CHECKPOINT.HEIGHT && blockHash !== global.CONFIG.SYMBIOTE.SYMBIOTE_CHECKPOINT.HEIGHT){

    //     LOG(`SYMBIOTE_CHECKPOINT verification failed. Delete the CHAINDATA/BLOCKS,CHAINDATA/METADATA,CHAINDATA/STATE and SNAPSHOTS. Resync node with the right blockchain or load the true snapshot`,'F')

    //     LOG('Going to stop...','W')

    //     process.emit('SIGINT')

    // }


    if(overviewOk){

        // To calculate fees and split among pools.Currently - general fees sum is 0. It will be increased each performed transaction
        
        let rewardBox = {fees:0}

        let currentEpochIndex = global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH.id

        let currentBlockID = currentEpochIndex+':'+block.creator+':'+block.index


        global.SYMBIOTE_META.STATE_CACHE.set('EVM_LOGS_MAP',{}) // (contractAddress => array of logs) to store logs created by KLY-EVM


        //_________________________________________PREPARE THE KLY-EVM STATE____________________________________________

        
        let currentKlyEvmContextMetadata = global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_METADATA[shardContext] // {nextBlockIndex,parentHash,timestamp}

        // Set the next block's parameters
        KLY_EVM.setCurrentBlockParams(currentKlyEvmContextMetadata.nextBlockIndex,currentKlyEvmContextMetadata.timestamp,currentKlyEvmContextMetadata.parentHash)

        // To change the state atomically
        let atomicBatch = global.SYMBIOTE_META.STATE.batch()


        if(block.transactions.length !== 0){


            //_________________________________________GET ACCOUNTS FROM STORAGE____________________________________________
    
            // Push accounts for fees of shards prime pools


            let primePools = global.SYMBIOTE_META.STATE_CACHE.get('PRIME_POOLS')

            let accountsToAddToCache=[]


            primePools.forEach(
            
                pubKey => {
    
                    // Avoid own pubkey to be added. On own chains we send rewards directly
                    if(pubKey !== block.creator) accountsToAddToCache.push(GET_FROM_STATE(shardContext+':'+pubKey))
    
                }
                
            )
    
            // Now cache has all accounts and ready for the next cycles
            await Promise.all(accountsToAddToCache.splice(0))


            //___________________________________________START TO PERFORM TXS____________________________________________


            let txIndexInBlock = 0

            for(let transaction of block.transactions){

                if(global.SYMBIOTE_META.VERIFIERS[transaction.type]){

                    let txCopy = JSON.parse(JSON.stringify(transaction))

                    let {isOk,reason} = await global.SYMBIOTE_META.VERIFIERS[transaction.type](shardContext,txCopy,rewardBox,atomicBatch).catch(()=>{})

                    // Set the receipt of tx(in case it's not EVM tx, because EVM automatically create receipt and we store it using KLY-EVM)
                    if(reason!=='EVM'){

                        let txid = BLAKE3(txCopy.sig) // txID is a BLAKE3 hash of event you sent to blockchain. You can recount it locally(will be used by wallets, SDKs, libs and so on)

                        atomicBatch.put('TX:'+txid,{blockID:currentBlockID,id:txIndexInBlock,isOk,reason})
    
                    }

                    txIndexInBlock++
                
                }

            }
        

            //__________________________________________SHARE FEES AMONG POOLS_________________________________________
        
            /*
            
                Distribute fees among:

                    [0] Block creator itself
                    [1] Stakers of his pool
                    [2] Send the rest of fees to prime pools

            */
            await DISTRIBUTE_FEES_AMONG_STAKERS_AND_OTHER_POOLS(rewardBox.fees,shardContext,primePools,block.creator)

            
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
        
            Store the current shard block index (SID)
        
            NOTE: Since the shardID is pubkey of prime pool, but not only prime pool can generate blocks(reserve pools generate blocks in case prime pool is AFK)

            So, we need to mark each next block in shard with SID

            For example

            _______________[Shard 7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta]________________

            Block 0     ===> 7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta:0   (SID:0)
            Block 1     ===> 61TXxKDrBtb7bjpBym8zS9xRDoUQU6sW9aLvvqN9Bp9LVFiSxhRPd9Dwy3N3621RQ8:0   (SID:1)
            Block 2     ===> 75XPnpDxrAtyjcwXaATfDhkYTGBoHuonDU1tfqFc6JcNPf5sgtcsvBRXaXZGuJ8USG:0   (SID:2)
            Block 3     ===> 7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta:1   (SID:3)
        
            ... and so on

            To clearly understand that 'block N on shard X is ...<this>' we need SID
        
        */


        let currentSID = global.SYMBIOTE_META.VERIFICATION_THREAD.SID_TRACKER[shardContext]

        atomicBatch.put(`SID:${shardContext}:${currentSID}`,currentBlockID)

        global.SYMBIOTE_META.VERIFICATION_THREAD.SID_TRACKER[shardContext]++

        
        global.SYMBIOTE_META.VERIFICATION_THREAD.SHARD_POINTER = shardContext

        if(!global.SYMBIOTE_META.VERIFICATION_THREAD.VT_FINALIZATION_STATS[shardContext]) global.SYMBIOTE_META.VERIFICATION_THREAD.VT_FINALIZATION_STATS[shardContext] = {}

        global.SYMBIOTE_META.VERIFICATION_THREAD.VT_FINALIZATION_STATS[shardContext].currentLeaderOnShard = block.creator

        global.SYMBIOTE_META.VERIFICATION_THREAD.VT_FINALIZATION_STATS[shardContext].index = block.index

        global.SYMBIOTE_META.VERIFICATION_THREAD.VT_FINALIZATION_STATS[shardContext].hash = blockHash
        
        // Change metadata per validator's thread
        
        global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[block.creator].index = block.index

        global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[block.creator].hash = blockHash


        //___________________ Update the KLY-EVM ___________________

        // Update stateRoot
        global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_STATE_ROOT = await KLY_EVM.getStateRoot()

        // Increase block index
        let nextIndex = BigInt(currentKlyEvmContextMetadata.nextBlockIndex)+BigInt(1)

        currentKlyEvmContextMetadata.nextBlockIndex = Web3.utils.toHex(nextIndex.toString())

        // Store previous hash
        let currentHash = KLY_EVM.getCurrentBlock().hash()
    
        currentKlyEvmContextMetadata.parentHash = currentHash.toString('hex')
        

        // Imagine that it's 1 block per 1 second
        let nextTimestamp = currentKlyEvmContextMetadata.timestamp+1
    
        currentKlyEvmContextMetadata.timestamp = nextTimestamp
        

        // Finally, store the block
        let blockToStore = KLY_EVM.getBlockToStore(currentHash)
        
        atomicBatch.put(`${shardContext}:EVM_BLOCK:${blockToStore.number}`,blockToStore)

        atomicBatch.put(`${shardContext}:EVM_INDEX:${blockToStore.hash}`,blockToStore.number)

        atomicBatch.put(`${shardContext}:EVM_LOGS:${blockToStore.number}`,global.SYMBIOTE_META.STATE_CACHE.get('EVM_LOGS_MAP'))

        atomicBatch.put(`${shardContext}:EVM_BLOCK_RECEIPT:${blockToStore.number}`,{kly_block:currentBlockID})
        
        atomicBatch.put(`BLOCK_RECEIPT:${currentBlockID}`,{

            sid:currentSID

        })

        
        //_________________________________Commit the state of VERIFICATION_THREAD_________________________________


        atomicBatch.put('VT',global.SYMBIOTE_META.VERIFICATION_THREAD)

        await atomicBatch.write()
        

    }

}