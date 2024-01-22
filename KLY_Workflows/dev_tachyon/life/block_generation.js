import {
    
    BLOCKLOG, GET_ALL_KNOWN_PEERS, GET_MAJORITY,
    
    GET_QUORUM_URLS_AND_PUBKEYS, GET_VERIFIED_AGGREGATED_FINALIZATION_PROOF_BY_BLOCK_ID,
    
    VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF, VERIFY_AGGREGATED_FINALIZATION_PROOF

} from '../utils.js'

import {ED25519_SIGN_DATA,ED25519_VERIFY} from '../../../KLY_Utils/utils.js'

import Block from '../essences/block.js'

import fetch from 'node-fetch'







let 


//TODO:Add more advanced logic(e.g. number of txs,ratings,etc.)

GET_TRANSACTIONS = () => global.SYMBIOTE_META.MEMPOOL.splice(0,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.TXS_LIMIT_PER_BLOCK),




GET_EPOCH_EDGE_OPERATIONS = epochFullID => {

    if(!global.SYMBIOTE_META.TEMP.has(epochFullID)) return []

    let epochEdgeOperationsMempool = global.SYMBIOTE_META.TEMP.get(epochFullID).EPOCH_EDGE_OPERATIONS_MEMPOOL

    return epochEdgeOperationsMempool.splice(0,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.EPOCH_EDGE_OPERATIONS_LIMIT_PER_BLOCK)

}








/*

Function to find the AGGREGATED_EPOCH_FINALIZATION_PROOFS for appropriate shard

Ask the network in special order:

    1) Special configured URL (it might be plugin's API)
    2) Quorum members
    3) Other known peers

*/
let GET_PREVIOUS_AGGREGATED_EPOCH_FINALIZATION_PROOF = async() => {

    // global.SYMBIOTE_META.GENERATION_THREAD

    let allKnownNodes = [global.CONFIG.SYMBIOTE.GET_PREVIOUS_EPOCH_AGGREGATED_FINALIZATION_PROOF_URL,...await GET_QUORUM_URLS_AND_PUBKEYS(),...GET_ALL_KNOWN_PEERS()]

    let shardID = global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY || global.CONFIG.SYMBIOTE.PUB

    // Find locally

    let aefpProof = await global.SYMBIOTE_META.EPOCH_DATA.get(`AEFP:${global.SYMBIOTE_META.GENERATION_THREAD.epochIndex}:${shardID}`).catch(()=>null)

    if(aefpProof) return aefpProof

    else {

        for(let nodeEndpoint of allKnownNodes){

            let finalURL = `${nodeEndpoint}/aggregated_epoch_finalization_proof/${global.SYMBIOTE_META.GENERATION_THREAD.epochIndex}/${shardID}`
    
            let itsProbablyAggregatedEpochFinalizationProof = await fetch(finalURL).then(r=>r.json()).catch(()=>false)
    
            let aefpProof = itsProbablyAggregatedEpochFinalizationProof?.shard === shardID && await VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF(
                
                itsProbablyAggregatedEpochFinalizationProof,
    
                global.SYMBIOTE_META.GENERATION_THREAD.quorum,
    
                global.SYMBIOTE_META.GENERATION_THREAD.majority,        
    
                global.SYMBIOTE_META.GENERATION_THREAD.epochFullId
            
            )
    
            if(aefpProof) return aefpProof
    
        }    

    }
    
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

    else if(afpForFirstBlock) firstBlockHash = afpForFirstBlock.blockHash

    else return


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

}




let GENERATE_BLOCKS_PORTION = async() => {

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH
    
    let qtEpochFullID = epochHandler.hash+"#"+epochHandler.id

    let epochIndex = epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(qtEpochFullID)


    if(!tempObject) return


    //_________________ No sense to generate blocks more in case we haven't approved the previous ones _________________

    let proofsGrabber = tempObject.TEMP_CACHE.get('PROOFS_GRABBER')


    if(proofsGrabber && global.SYMBIOTE_META.GENERATION_THREAD.nextIndex > proofsGrabber.acceptedIndex+1) return

    //__________________________________________________________________________________________________________________


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

}



export let BLOCKS_GENERATION=async()=>{

    await GENERATE_BLOCKS_PORTION()

    setTimeout(BLOCKS_GENERATION,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.BLOCK_TIME)
 
}