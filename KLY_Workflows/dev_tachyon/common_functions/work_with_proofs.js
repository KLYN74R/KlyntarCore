import {BLOCKCHAIN_DATABASES, GLOBAL_CACHES} from '../blockchain_preparation.js'

import {getQuorumMajority, getQuorumUrlsAndPubkeys} from './quorum_related.js'

import {verifyEd25519} from '../../../KLY_Utils/utils.js'

import Block from '../structures/block.js'








export let verifyAggregatedEpochFinalizationProof = async (itsProbablyAggregatedEpochFinalizationProof,quorum,majority,epochFullID) => {

    let overviewIsOK =
        
        typeof itsProbablyAggregatedEpochFinalizationProof === 'object'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.shard === 'string'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.lastLeader === 'number'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.lastIndex === 'number'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.lastHash === 'string'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.hashOfFirstBlockByLastLeader === 'string'
        &&
        typeof itsProbablyAggregatedEpochFinalizationProof.proofs === 'object'



    if(overviewIsOK && itsProbablyAggregatedEpochFinalizationProof){

        /*
    
            The structure of AGGREGATED_EPOCH_FINALIZATION_PROOF is

            {
                shard,
                lastLeader:<index of Ed25519 pubkey of some pool in sequences of validators for this shard in current epoch>,
                lastIndex:<index of his block in previous epoch>,
                lastHash:<hash of this block>,
                hashOfFirstBlockByLastLeader,

                proofs:{

                    ed25519PubKey0:ed25519Signa0,
                    ...
                    ed25519PubKeyN:ed25519SignaN
                         
                }

            }

            We need to verify that majority have voted for such solution


        */

        let {shard,lastLeader,lastIndex,lastHash,hashOfFirstBlockByLastLeader} = itsProbablyAggregatedEpochFinalizationProof

        let dataThatShouldBeSigned = 'EPOCH_DONE'+shard+lastLeader+lastIndex+lastHash+hashOfFirstBlockByLastLeader+epochFullID

        let promises = []

        let okSignatures = 0

        let unique = new Set()


        for(let [signerPubKey,signa] of Object.entries(itsProbablyAggregatedEpochFinalizationProof.proofs)){

            promises.push(verifyEd25519(dataThatShouldBeSigned,signa,signerPubKey).then(isOK => {

                if(isOK && quorum.includes(signerPubKey) && !unique.has(signerPubKey)){

                    unique.add(signerPubKey)

                    okSignatures++

                }

            }))

        }

        await Promise.all(promises)
        
        if(okSignatures>=majority){

            return {
            
                shard,lastLeader,lastIndex,lastHash,hashOfFirstBlockByLastLeader,
        
                proofs:itsProbablyAggregatedEpochFinalizationProof.proofs

            }

        }
        
    }

}




export let verifyAggregatedFinalizationProof = async (itsProbablyAggregatedFinalizationProof,epochHandler) => {

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

        let majority = getQuorumMajority(epochHandler)


        let promises = []

        let okSignatures = 0

        let unique = new Set()


        for(let [signerPubKey,signa] of Object.entries(proofs)){

            promises.push(verifyEd25519(dataThatShouldBeSigned,signa,signerPubKey).then(isOK => {

                if(isOK && epochHandler.quorum.includes(signerPubKey) && !unique.has(signerPubKey)){

                    unique.add(signerPubKey)

                    okSignatures++

                }

            }))

        }

        await Promise.all(promises)

        return okSignatures >= majority


    }

}




export let getVerifiedAggregatedFinalizationProofByBlockId = async (blockID,epochHandler) => {

    let localVersionOfAfp = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get('AFP:'+blockID).catch(()=>null)

    if(!localVersionOfAfp){

        // Go through known hosts and find AGGREGATED_FINALIZATION_PROOF. Call GET /aggregated_finalization_proof route
    
        let setOfUrls = await getQuorumUrlsAndPubkeys(false,epochHandler)

        for(let endpoint of setOfUrls){

            let itsProbablyAggregatedFinalizationProof = await fetch(endpoint+'/aggregated_finalization_proof/'+blockID).then(r=>r.json()).catch(()=>null)

            if(itsProbablyAggregatedFinalizationProof){

                let isOK = await verifyAggregatedFinalizationProof(itsProbablyAggregatedFinalizationProof,epochHandler)

                if(isOK){

                    let {prevBlockHash,blockID,blockHash,proofs} = itsProbablyAggregatedFinalizationProof

                    return {prevBlockHash,blockID,blockHash,proofs}

                }

            }

        }

    }else return localVersionOfAfp

}




export let getFirstBlockOnEpochOnSpecificShard = async(epochHandler,shardID,getBlockFunction) => {

    // Check if we already tried to find first block by finding pivot in cache

    let idOfHandlerWithFirstBlockPerShard = `${epochHandler.id}:${shardID}`

    let pivotShardData = GLOBAL_CACHES.STUFF_CACHE.get(idOfHandlerWithFirstBlockPerShard) // {position,pivotPubKey,firstBlockByPivot,firstBlockHash}

    if(!pivotShardData){

        // Ask known peers about first block assumption

        


        let arrayOfPoolsForShard = epochHandler.leadersSequence[shardID]
        
        for(let position = 0, length = arrayOfPoolsForShard.length ; position < length ; position++){

            let potentialPivotPubKey = arrayOfPoolsForShard[position]

            let firstBlockIDByThisPubKey = epochHandler.id+':'+potentialPivotPubKey+':0'

            // Try to get AFP & first block to commit pivot and continue to find first block

            let afp = await getVerifiedAggregatedFinalizationProofByBlockId(firstBlockIDByThisPubKey,epochHandler)

            let potentialFirstBlock = await getBlockFunction(epochHandler.id,potentialPivotPubKey,0)


            if(afp && afp.blockID === firstBlockIDByThisPubKey && potentialFirstBlock && afp.blockHash === Block.genHash(potentialFirstBlock)){

                // Once we find it - set as pivot for further actions

                let pivotTemplate = {

                    position,

                    pivotPubKey:potentialPivotPubKey,
                    
                    firstBlockByPivot:potentialFirstBlock,

                    firstBlockHash:afp.blockHash

                }

                GLOBAL_CACHES.STUFF_CACHE.set(idOfHandlerWithFirstBlockPerShard,pivotTemplate)

                break

            }
        
        }

    }

    
    pivotShardData = GLOBAL_CACHES.STUFF_CACHE.get(idOfHandlerWithFirstBlockPerShard)


    if(pivotShardData){

        // In pivot we have first block created in epoch by some pool

        // Try to move closer to the beginning of the epochHandler.leadersSequence[shardID] to find the real first block

        // Based on ALRP in pivot block - find the real first block

        let blockToEnumerateAlrp = pivotShardData.firstBlockByPivot

        let arrayOfPoolsForShard = epochHandler.leadersSequence[shardID]


        if(pivotShardData.position === 0){

            GLOBAL_CACHES.STUFF_CACHE.delete(idOfHandlerWithFirstBlockPerShard)

            return {firstBlockCreator:pivotShardData.pivotPubKey,firstBlockHash:pivotShardData.firstBlockHash}

        }


        for(let position = pivotShardData.position-1 ; position >= 0 ; position--){

        
            let previousPoolInLeadersSequence = arrayOfPoolsForShard[position]
    
            let leaderRotationProofForPreviousPool = blockToEnumerateAlrp.extraData.aggregatedLeadersRotationProofs[previousPoolInLeadersSequence]


            if(position === 0){

                GLOBAL_CACHES.STUFF_CACHE.delete(idOfHandlerWithFirstBlockPerShard)

                if(leaderRotationProofForPreviousPool.skipIndex === -1){

                    return {firstBlockCreator:pivotShardData.pivotPubKey,firstBlockHash:pivotShardData.firstBlockHash}

                } else return {firstBlockCreator:previousPoolInLeadersSequence,firstBlockHash:leaderRotationProofForPreviousPool.firstBlockHash}


            } else if(leaderRotationProofForPreviousPool.skipIndex !== -1) {

                // This means that we've found new pivot - so update it and break the cycle to repeat procedure later

                let firstBlockByNewPivot = await getBlockFunction(epochHandler.id,previousPoolInLeadersSequence,0)

                if(firstBlockByNewPivot && leaderRotationProofForPreviousPool.firstBlockHash === Block.genHash(firstBlockByNewPivot)){

                    let newPivotTemplate = {

                        position,
    
                        pivotPubKey:previousPoolInLeadersSequence,
    
                        firstBlockByPivot:firstBlockByNewPivot,
    
                        firstBlockHash:leaderRotationProofForPreviousPool.firstBlockHash
    
                    }

                    GLOBAL_CACHES.STUFF_CACHE.set(idOfHandlerWithFirstBlockPerShard,newPivotTemplate)

                    break

                } else return

            }
    
        }

    }

}