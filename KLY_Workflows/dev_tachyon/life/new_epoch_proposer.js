import {verifyAggregatedEpochFinalizationProof, verifyAggregatedFinalizationProof} from '../common_functions/work_with_proofs.js'

import {BLOCKCHAIN_DATABASES, EPOCH_METADATA_MAPPING, WORKING_THREADS} from '../blockchain_preparation.js'

import {getQuorumMajority, getQuorumUrlsAndPubkeys} from '../common_functions/quorum_related.js'

import {useTemporaryDb} from '../common_functions/approvement_thread_related.js'

import {verifyEd25519} from '../../../KLY_Utils/utils.js'

import {CONFIGURATION} from '../../../klyn74r.js'

import {epochStillFresh} from '../common_functions/utils.js'




export let checkIfItsTimeToStartNewEpoch=async()=>{

    let atEpochHandler = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH

    let epochFullID = atEpochHandler.hash+"#"+atEpochHandler.id

    let currentEpochMetadata = EPOCH_METADATA_MAPPING.get(epochFullID)
    

    if(!currentEpochMetadata){

        setTimeout(checkIfItsTimeToStartNewEpoch,3000)

        return

    }


    let iAmBlockGenerator = CONFIGURATION.NODE_LEVEL.BLOCK_GENERATOR_MODE


    if(iAmBlockGenerator && !epochStillFresh(WORKING_THREADS.APPROVEMENT_THREAD)){
        
        // Stop to generate finalization proofs
        currentEpochMetadata.SYNCHRONIZER.set('TIME_TO_NEW_EPOCH',true)

        let canGenerateEpochFinalizationProof = true

        for(let shardID of Object.keys(atEpochHandler.leadersSequence)){

            let pubKeyOfLeader = atEpochHandler.leadersSequence[shardID][0]

            if(currentEpochMetadata.SYNCHRONIZER.has('GENERATE_FINALIZATION_PROOFS:'+pubKeyOfLeader)){

                canGenerateEpochFinalizationProof = false

                break

            }

        }
        

        if(canGenerateEpochFinalizationProof){

            await useTemporaryDb('put',currentEpochMetadata.DATABASE,'TIME_TO_NEW_EPOCH',true).then(()=>

                currentEpochMetadata.SYNCHRONIZER.set('READY_FOR_NEW_EPOCH',true)


            ).catch(()=>{})

        }
        

        // Check the safety
        if(!currentEpochMetadata.SYNCHRONIZER.has('READY_FOR_NEW_EPOCH')){

            setTimeout(checkIfItsTimeToStartNewEpoch,3000)

            return

        }
    

        let epochFinishProposition = {}

        let majority = getQuorumMajority(atEpochHandler)

        let leadersSequencePerShard = atEpochHandler.leadersSequence // shardID => [pool0,pool1,...,poolN]

        
    
        for(let [shardID,arrayOfPools] of Object.entries(leadersSequencePerShard)){

            let handlerWithIndexOfCurrentLeaderOnShard = {currentLeader:0}

            let pubKeyOfLeader = arrayOfPools[handlerWithIndexOfCurrentLeaderOnShard.currentLeader]
            
            let indexOfLeader = handlerWithIndexOfCurrentLeaderOnShard.currentLeader

            /*
            
                Now to avoid loops, check if last leader created at least 1 block
            
            */

            let localVotingDataForLeader = currentEpochMetadata.FINALIZATION_STATS.get(pubKeyOfLeader) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}

            if(localVotingDataForLeader.index === -1){

                // Change to previous leader that finish its work on height > -1

                for(let position = indexOfLeader-1 ; position >= 0 ; position --){

                    let previousShardLeader = arrayOfPools[position]

                    let localVotingData = currentEpochMetadata.FINALIZATION_STATS.get(previousShardLeader) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}

                    if(localVotingData.index > -1){

                        pubKeyOfLeader = previousShardLeader

                        indexOfLeader = position

                        // Also, change the value in pointer to current leader

                        currentEpochMetadata.SHARDS_LEADERS_HANDLERS.set(shardID,{currentLeader:position})

                        break

                    }

                }

            }

            
            // Structure is Map(shard=>Map(quorumMember=>SIG('EPOCH_DONE'+shard+lastLeaderInRcIndex+lastIndex+lastHash+hashOfFirstBlockByLastLeader+epochFullId)))
            let agreements = currentEpochMetadata.TEMP_CACHE.get('EPOCH_PROPOSITION')

            if(!agreements){

                agreements = new Map()

                currentEpochMetadata.TEMP_CACHE.set('EPOCH_PROPOSITION',agreements)
            
            }

            let agreementsForThisShard = agreements.get(shardID)

            if(!agreementsForThisShard){

                agreementsForThisShard = new Map()

                agreements.set(shardID,agreementsForThisShard)
            
            }
         
            let aefpExistsLocally = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get(`AEFP:${atEpochHandler.id}:${shardID}`).catch(()=>false)

            if(!aefpExistsLocally){

                epochFinishProposition[shardID] = {

                    currentLeader:indexOfLeader,
    
                    afpForFirstBlock:{},
    
                    lastBlockProposition:currentEpochMetadata.FINALIZATION_STATS.get(pubKeyOfLeader) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}
    
                }
    
                // In case we vote for index > 0 - we need to add the AFP proof to proposition as a proof that first block by this leader has such hash
                // This will be added to AEFP and used on verification thread
    
                if(epochFinishProposition[shardID].lastBlockProposition.index >= 0){
    
                    let firstBlockID = atEpochHandler.id+':'+pubKeyOfLeader+':0'
    
                    epochFinishProposition[shardID].afpForFirstBlock = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get('AFP:'+firstBlockID).catch(()=>({}))
    
                }    

            }
            
        }

        
        //____________________________________ Send the epoch finish proposition ____________________________________


        let optionsToSend = {method:'POST',body:JSON.stringify(epochFinishProposition)}
        
        let quorumMembers = await getQuorumUrlsAndPubkeys(true)


        //Descriptor is {url,pubKey}
        for(let descriptor of quorumMembers){      
            
            const controller = new AbortController()

            setTimeout(() => controller.abort(), 2000)

            optionsToSend.signal = controller.signal

            await fetch(descriptor.url+'/epoch_proposition',optionsToSend).then(r=>r.json()).then(async possibleAgreements => {

                /*
                
                    possibleAgreements structure is:
                    
                    
                        {
                            shardA:{
                                
                                status:'UPGRADE'|'OK',

                                -------------------------------[In case 'OK']-------------------------------

                                sig: SIG('EPOCH_DONE'+shard+lastAuth+lastIndex+lastHash+hashOfFirstBlockByLastLeader+epochFullId)
                        
                                -----------------------------[In case 'UPGRADE']----------------------------

                                currentLeader:<index>,
                                lastBlockProposition:{
                                    index,hash,afp:{prevBlockHash,blockID,blockHash,proofs}
                                }

                            },

                            shardB:{
                                ...(same)
                            },
                            ...,
                            shardQ:{
                                ...(same)
                            }
                        }
                
                
                */

                if(typeof possibleAgreements === 'object'){

                    // Start iteration

                    for(let [shardID,metadata] of Object.entries(epochFinishProposition)){

                        let agreementsForThisShard = currentEpochMetadata.TEMP_CACHE.get('EPOCH_PROPOSITION').get(shardID) // signer => signature                        

                        let response = possibleAgreements[shardID]

                        if(response){

                            if(response.status==='OK' && typeof metadata.afpForFirstBlock.blockHash === 'string'){

                                // Verify EPOCH_FINALIZATION_PROOF signature and store to mapping

                                let dataThatShouldBeSigned = `EPOCH_DONE:${shardID}:${metadata.currentLeader}:${metadata.lastBlockProposition.index}:${metadata.lastBlockProposition.hash}:${metadata.afpForFirstBlock.blockHash}:${epochFullID}`

                                if(await verifyEd25519(dataThatShouldBeSigned,response.sig,descriptor.pubKey)) agreementsForThisShard.set(descriptor.pubKey,response.sig)


                            }else if(response.status==='UPGRADE'){

                                // Check the AFP and update the local data

                                let {index,hash,afp} = response.lastBlockProposition
                            
                                let pubKeyOfProposedLeader = leadersSequencePerShard[shardID][response.currentLeader]
                                
                                let afpToUpgradeIsOk = await verifyAggregatedFinalizationProof(afp,atEpochHandler)

                                let blockIDThatShouldBeInAfp = atEpochHandler.id+':'+pubKeyOfProposedLeader+':'+index
                            
                                if(afpToUpgradeIsOk && blockIDThatShouldBeInAfp === afp.blockID && hash === afp.blockHash){

                                    let {prevBlockHash,blockID,blockHash,proofs} = afp
                            
                                    // Update the SHARDS_LEADERS_HANDLERS

                                    currentEpochMetadata.SHARDS_LEADERS_HANDLERS.set(shardID,{currentLeader:response.currentLeader})
                                    
                                    // Update FINALIZATION_STATS

                                    currentEpochMetadata.FINALIZATION_STATS.set(pubKeyOfProposedLeader,{index,hash,afp:{prevBlockHash,blockID,blockHash,proofs}})
                            
                                    // Clear the mapping with signatures because it becomes invalid

                                    agreementsForThisShard.clear()

                                }

                            }

                        }

                    }

                }
                
            }).catch(()=>{});
            
            
        }
            
    
        // Iterate over upgrades and set new values for finalization proofs

        for(let [shardID,metadata] of Object.entries(epochFinishProposition)){

            let agreementsForEpochManager = currentEpochMetadata.TEMP_CACHE.get('EPOCH_PROPOSITION').get(shardID) // signer => signature

            if(agreementsForEpochManager.size >= majority){
        
                let aggregatedEpochFinalizationProof = {

                    shard:shardID,

                    lastLeader:metadata.currentLeader,
                    
                    lastIndex:metadata.lastBlockProposition.index,
                    
                    lastHash:metadata.lastBlockProposition.hash,

                    hashOfFirstBlockByLastLeader:metadata.afpForFirstBlock.blockHash,

                    proofs:Object.fromEntries(agreementsForEpochManager)
                    
                }                

                // Make final verification

                if(await verifyAggregatedEpochFinalizationProof(aggregatedEpochFinalizationProof,atEpochHandler.quorum,majority,epochFullID)){

                    await BLOCKCHAIN_DATABASES.EPOCH_DATA.put(`AEFP:${atEpochHandler.id}:${shardID}`,aggregatedEpochFinalizationProof).catch(()=>{})

                } else {

                    agreementsForEpochManager.clear()

                }

            }

        }

    }

    setTimeout(checkIfItsTimeToStartNewEpoch,3000) // each 3 seconds - do monitoring

}