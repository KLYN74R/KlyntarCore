import {VERIFY_AGGREGATED_FINALIZATION_PROOF} from '../../utils.js'

import {ED25519_SIGN_DATA} from '../../../../KLY_Utils/utils.js'

import {CONFIGURATION, FASTIFY_SERVER} from '../../../../klyn74r.js'








/*
            
    The structure of AGGREGATED_EPOCH_FINALIZATION_PROOF is

    {
        shard:<ed25519 pubkey of prime pool - the creator of new shard>
        lastLeader:<index of Ed25519 pubkey of some pool in shard's leaders sequence>,
        lastIndex:<index of his block in previous epoch>,
        lastHash:<hash of this block>,
        hashOfFirstBlockByLastLeader:<hash of the first block by this leader>,
        
        proofs:{

            quorumMemberPubKey0:Ed25519Signa0,
            ...
            quorumMemberPubKeyN:Ed25519SignaN

        }
    
    }

    Signature is => ED25519('EPOCH_DONE'+shard+lastAuth+lastIndex+lastHash+firstBlockHash+epochFullId)


*/

// Simple GET handler to return AEFP for given shard and epoch ✅

FASTIFY_SERVER.get('/aggregated_epoch_finalization_proof/:epoch_index/:shard',async(request,response)=>{

    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.MAIN.GET_AGGREGATED_EPOCH_FINALIZATION_PROOF){

        let epochFullID = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.id

        if(!global.SYMBIOTE_META.TEMP.has(epochFullID)){

            response.send({err:'QT epoch handler is not ready'})
        
            return

        }


        let aggregatedEpochFinalizationProofForShard = await global.SYMBIOTE_META.EPOCH_DATA.get(`AEFP:${request.params.epoch_index}:${request.params.shard}`).catch(()=>null)

        
        if(aggregatedEpochFinalizationProofForShard){

            response.send(aggregatedEpochFinalizationProofForShard)

        }else response.send({err:'No AEFP'})

    }else response.send({err:'Route is off'})

})



// Handler to acccept propositions to finish the epoch for shards and return agreement to build AEFP - Aggregated Epoch Finalization Proof ✅

FASTIFY_SERVER.post('/epoch_proposition',async(request,response)=>{

    // CONFIGURATION.NODE_LEVEL.MAX_PAYLOAD_SIZE - set the limit mb

    let qtEpochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = qtEpochHandler.hash+"#"+qtEpochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)


    if(!tempObject){

        response.send({err:'Epoch handler on QT is not fresh'})

        return
    }

    if(!tempObject.SYNCHRONIZER.has('READY_FOR_NEW_EPOCH')){

        response.send({err:'Not ready'})

        return

    }
    
    /* 
    
        Parse the proposition

        !Reminder:  The structure of proposition is:

        {
                
            "shard0":{

                currentLeader:<int - pointer to current leader of shard based on QT.EPOCH.leadersSequence[primePool]. In case -1 - it's prime pool>
                
                afpForFirstBlock:{

                    prevBlockHash,
                    blockID,
                    blockHash,

                    proofs:{
                     
                        pubKey0:signa0,         => prevBlockHash+blockID+hash+QT.EPOCH.hash+"#"+QT.EPOCH.id
                        ...
                        
                    }

                },

                metadataForCheckpoint:{
                    
                    index:,
                    hash:,

                    afp:{

                        prevBlockHash,
                        blockID,
                        blockHash,

                        proofs:{
                     
                            pubKey0:signa0,         => prevBlockHash+blockID+hash+QT.CHECKPOINT.HASH+"#"+QT.CHECKPOINT.id
                            ...
                        
                        }                        

                    }
                    
                }

            },

            "shard1":{
                ...            
            }

            ...
                    
            "shardN":{
                ...
            }
                
        }


        1) We need to iterate over propositions(per shard)
        2) Compare <currentAuth> with our local version of current leader on shard(take it from tempObj.SHARDS_LEADERS_HANDLERS)
        
            [If proposed.currentAuth >= local.currentAuth]:

                1) Verify index & hash & afp in <metadataForCheckpoint>
                
                2) If proposed height >= local version - generate and return signature ED25519_SIG('EPOCH_DONE'+shard+lastAuth+lastIndex+lastHash+hashOfFirstBlockByLastLeader+epochFullId)

                3) Else - send status:'UPGRADE' with local version of finalization proof, index and hash(take it from tempObject.FINALIZATION_STATS)

            [Else if proposed.currentAuth < local.currentAuth AND tempObj.FINALIZATION_STATS.has(local.currentAuth)]:

                1) Send status:'UPGRADE' with local version of currentLeader, metadata for epoch(from tempObject.FINALIZATION_STATS), index and hash



        !Reminder: Response structure is

        {
            
            shardA:{
                                
                status:'UPGRADE'|'OK',

                -------------------------------[In case status === 'OK']-------------------------------

                signa: SIG('EPOCH_DONE'+shard+lastAuth+lastIndex+lastHash+hashOfFirstBlockByLastLeader+epochFullId)
                        
                ----------------------------[In case status === 'UPGRADE']-----------------------------

                currentLeader:<index>,
                
                metadataForCheckpoint:{
                
                    index,
                    hash,
                    afp
                
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
   

    let possiblePropositionForNewEpoch = JSON.parse(request.body)

    let responseStructure = {}
    

    if(typeof possiblePropositionForNewEpoch === 'object'){


        for(let [shardID,proposition] of Object.entries(possiblePropositionForNewEpoch)){

            if(responseStructure[shardID]) continue

            if(typeof shardID === 'string' && typeof proposition.currentLeader === 'number' && typeof proposition.afpForFirstBlock === 'object' && typeof proposition.metadataForCheckpoint === 'object' && typeof proposition.metadataForCheckpoint.afp === 'object'){

                // Get the local version of SHARDS_LEADERS_HANDLERS and FINALIZATION_STATS

                let leadersHandlerForThisShard = tempObject.SHARDS_LEADERS_HANDLERS.get(shardID) // {currentLeader:<uint>}

                let pubKeyOfCurrentLeaderOnShard, localIndexOfLeader
                
                if(typeof leadersHandlerForThisShard === 'string') continue // type string is only for reserve pool. So, if this branch is true it's a sign that shardID is pubkey of reserve pool what is impossible. So, continue

                else if(typeof leadersHandlerForThisShard === 'object') {

                    localIndexOfLeader = leadersHandlerForThisShard.currentLeader

                    pubKeyOfCurrentLeaderOnShard = qtEpochHandler.leadersSequence[shardID][localIndexOfLeader] || shardID

                }else{

                    // Assume that there is no data about leaders for given shard locally. So, imagine that epoch will stop on prime pool (prime pool pubkey === shardID)

                    localIndexOfLeader = -1

                    pubKeyOfCurrentLeaderOnShard = shardID

                }


                // Structure is {index,hash,aggregatedCommitments:{aggregatedPub,aggregatedSignature,afkVoters}}

                let epochManagerForLeader = tempObject.FINALIZATION_STATS.get(pubKeyOfCurrentLeaderOnShard) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}


                // Try to define the first block hash. For this, use the proposition.afpForFirstBlock
                        
                let hashOfFirstBlockByLastLeaderInThisEpoch

                let blockIdOfFirstBlock = qtEpochHandler.id+':'+pubKeyOfCurrentLeaderOnShard+':0' // first block has index 0 - numeration from 0

                if(blockIdOfFirstBlock === proposition.afpForFirstBlock.blockID && proposition.metadataForCheckpoint.index>=0){

                    // Verify the AFP for first block

                    let afpIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(proposition.afpForFirstBlock,qtEpochHandler)

                    if(afpIsOk) hashOfFirstBlockByLastLeaderInThisEpoch = proposition.afpForFirstBlock.blockHash


                }


                if(!hashOfFirstBlockByLastLeaderInThisEpoch) continue


                //_________________________________________ Now compare _________________________________________

                if(proposition.currentLeader === localIndexOfLeader){

                    if(epochManagerForLeader.index === proposition.metadataForCheckpoint.index && epochManagerForLeader.hash === proposition.metadataForCheckpoint.hash){
                        
                        // Send EPOCH_FINALIZATION_PROOF signature

                        let {index,hash} = proposition.metadataForCheckpoint

                        let dataToSign = 'EPOCH_DONE'+shardID+proposition.currentLeader+index+hash+hashOfFirstBlockByLastLeaderInThisEpoch+epochFullID
    
                        responseStructure[shardID] = {
                                                
                            status:'OK',
                                            
                            sig:await ED25519_SIGN_DATA(dataToSign,CONFIGURATION.NODE_LEVEL.PRIVATE_KEY)
                                            
                        }

                            
                    }else if(epochManagerForLeader.index < proposition.metadataForCheckpoint.index){

                        // Verify AGGREGATED_FINALIZATION_PROOF & upgrade local version & send EPOCH_FINALIZATION_PROOF

                        let {index,hash,afp} = proposition.metadataForCheckpoint

                        let isOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(afp,qtEpochHandler)


                        if(isOk){

                            // Check that this AFP is for appropriate pool

                            // eslint-disable-next-line no-unused-vars
                            let [_,pubKeyOfCreator] = afp.blockID.split(':')

                            if(pubKeyOfCreator === pubKeyOfCurrentLeaderOnShard){

                            
                                if(leadersHandlerForThisShard) leadersHandlerForThisShard.currentLeader = proposition.currentLeader

                                else tempObject.SHARDS_LEADERS_HANDLERS.set(shardID,{currentLeader:proposition.currentLeader})
    

                                if(epochManagerForLeader){

                                    epochManagerForLeader.index = index
    
                                    epochManagerForLeader.hash = hash
    
                                    epochManagerForLeader.afp = afp
    
                                }else tempObject.FINALIZATION_STATS.set(pubKeyOfCurrentLeaderOnShard,{index,hash,afp})

                            
                                // Generate EPOCH_FINALIZATION_PROOF_SIGNATURE

                                let dataToSign = 'EPOCH_DONE'+shardID+proposition.currentLeader+index+hash+hashOfFirstBlockByLastLeaderInThisEpoch+epochFullID

                                responseStructure[shardID] = {
                            
                                    status:'OK',
                        
                                    sig:await ED25519_SIGN_DATA(dataToSign,CONFIGURATION.NODE_LEVEL.PRIVATE_KEY)
                        
                                }

                            }

                        }


                    }else if(epochManagerForLeader.index > proposition.metadataForCheckpoint.index){

                        // Send 'UPGRADE' msg

                        responseStructure[shardID] = {

                            status:'UPGRADE',
                            
                            currentLeader:localIndexOfLeader,
                
                            metadataForCheckpoint:epochManagerForLeader // {index,hash,afp}
                    
                        }

                    }

                }else if(proposition.currentLeader < localIndexOfLeader){

                    // Send 'UPGRADE' msg

                    responseStructure[shardID] = {

                        status:'UPGRADE',
                            
                        currentLeader:localIndexOfLeader,
                
                        metadataForCheckpoint:epochManagerForLeader // {index,hash,afp}
                    
                    }

                }

            }

        }

        response.send(responseStructure)

    }else response.send({err:'Wrong format'})


})