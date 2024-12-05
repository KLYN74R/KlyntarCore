import {verifyAggregatedFinalizationProof} from '../../common_functions/work_with_proofs.js'

import {EPOCH_METADATA_MAPPING, WORKING_THREADS} from '../../blockchain_preparation.js'

import {CONFIGURATION, FASTIFY_SERVER} from '../../../../klyn74r.js'

import {signEd25519} from '../../../../KLY_Utils/utils.js'






// Handler to acccept propositions to finish the epoch for shards and return agreement to build AEFP - Aggregated Epoch Finalization Proof ✅

FASTIFY_SERVER.post('/epoch_proposition',async(request,response)=>{

    // CONFIGURATION.NODE_LEVEL.MAX_PAYLOAD_SIZE - set the limit mb

    let atEpochHandler = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH

    let epochFullID = atEpochHandler.hash+"#"+atEpochHandler.id

    let currentEpochMetadata = EPOCH_METADATA_MAPPING.get(epochFullID)


    if(!currentEpochMetadata){

        response.send({err:'Epoch handler on AT is not fresh'})

        return
    }

    if(!currentEpochMetadata.SYNCHRONIZER.has('READY_FOR_NEW_EPOCH')){

        response.send({err:'Not ready'})

        return

    }
    

    let possiblePropositionForNewEpoch = JSON.parse(request.body)

    let responseStructure = {}
    

    if(typeof possiblePropositionForNewEpoch === 'object'){


        for(let [shardID,proposition] of Object.entries(possiblePropositionForNewEpoch)){

            if(responseStructure[shardID]) continue

            if(typeof shardID === 'string' && typeof proposition.currentLeader === 'number' && typeof proposition.afpForFirstBlock === 'object' && typeof proposition.lastBlockProposition === 'object' && typeof proposition.lastBlockProposition.afp === 'object'){

                let leadersHandlerForThisShard = {currentLeader:0}

                let localIndexOfLeader = leadersHandlerForThisShard.currentLeader

                let pubKeyOfCurrentLeaderOnShard = atEpochHandler.leadersSequence[shardID][localIndexOfLeader]

                // Structure is {index,hash,afp}

                let epochManagerForLeader = currentEpochMetadata.FINALIZATION_STATS.get(pubKeyOfCurrentLeaderOnShard) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}


                // Try to define the first block hash. For this, use the proposition.afpForFirstBlock
                        
                let hashOfFirstBlockByLastLeaderInThisEpoch

                let blockIdOfFirstBlock = atEpochHandler.id+':'+pubKeyOfCurrentLeaderOnShard+':0' // first block has index 0 - numeration from 0

                if(blockIdOfFirstBlock === proposition.afpForFirstBlock.blockID && proposition.lastBlockProposition.index>=0){

                    // Verify the AFP for first block

                    let afpIsOk = await verifyAggregatedFinalizationProof(proposition.afpForFirstBlock,atEpochHandler)

                    if(afpIsOk) hashOfFirstBlockByLastLeaderInThisEpoch = proposition.afpForFirstBlock.blockHash


                }


                if(!hashOfFirstBlockByLastLeaderInThisEpoch) continue


                //_________________________________________ Now compare _________________________________________

                if(proposition.currentLeader === localIndexOfLeader){

                    if(epochManagerForLeader.index === proposition.lastBlockProposition.index && epochManagerForLeader.hash === proposition.lastBlockProposition.hash){
                        
                        // Send AEFP signature

                        let {index,hash} = proposition.lastBlockProposition

                        let dataToSign = `EPOCH_DONE:${shardID}:${proposition.currentLeader}:${index}:${hash}:${hashOfFirstBlockByLastLeaderInThisEpoch}:${epochFullID}`


                        responseStructure[shardID] = {
                                                
                            status:'OK',
                                            
                            sig:await signEd25519(dataToSign,CONFIGURATION.NODE_LEVEL.PRIVATE_KEY)
                                            
                        }

                            
                    }else if(epochManagerForLeader.index < proposition.lastBlockProposition.index){

                        // Verify AGGREGATED_FINALIZATION_PROOF & upgrade local version & send AEFP signature

                        let {index,hash,afp} = proposition.lastBlockProposition

                        let isOk = await verifyAggregatedFinalizationProof(afp,atEpochHandler)


                        if(isOk){

                            // Check that this AFP is for appropriate pool

                            let [epochIndex,pubKeyOfCreator] = afp.blockID.split(':')

                            let blockIdThatShouldBeInAfp = `${epochIndex}:${pubKeyOfCreator}:${index}`

                            if(pubKeyOfCreator === pubKeyOfCurrentLeaderOnShard && hash === afp.blockHash && blockIdThatShouldBeInAfp === afp.blockID){

                            
                                if(leadersHandlerForThisShard) leadersHandlerForThisShard.currentLeader = proposition.currentLeader
    

                                if(epochManagerForLeader){

                                    epochManagerForLeader.index = index
    
                                    epochManagerForLeader.hash = hash
    
                                    epochManagerForLeader.afp = afp
    
                                } else currentEpochMetadata.FINALIZATION_STATS.set(pubKeyOfCurrentLeaderOnShard,{index,hash,afp})

                            
                                // Generate EPOCH_FINALIZATION_PROOF_SIGNATURE

                                let dataToSign = `EPOCH_DONE:${shardID}:${proposition.currentLeader}:${index}:${hash}:${hashOfFirstBlockByLastLeaderInThisEpoch}:${epochFullID}`

                                responseStructure[shardID] = {
                            
                                    status:'OK',
                        
                                    sig:await signEd25519(dataToSign,CONFIGURATION.NODE_LEVEL.PRIVATE_KEY)
                        
                                }

                            }

                        }


                    }else if(epochManagerForLeader.index > proposition.lastBlockProposition.index){

                        // Send 'UPGRADE' msg

                        responseStructure[shardID] = {

                            status:'UPGRADE',
                            
                            currentLeader:localIndexOfLeader,
                
                            lastBlockProposition:epochManagerForLeader // {index,hash,afp}
                    
                        }

                    }

                }else if(proposition.currentLeader < localIndexOfLeader){

                    // Send 'UPGRADE' msg

                    responseStructure[shardID] = {

                        status:'UPGRADE',
                            
                        currentLeader:localIndexOfLeader,
                
                        lastBlockProposition:epochManagerForLeader // {index,hash,afp}
                    
                    }

                }

            }

        }

        response.send(responseStructure)

    }else response.send({err:'Wrong format'})


})