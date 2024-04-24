import {EPOCH_STILL_FRESH,GET_MAJORITY,GET_QUORUM_URLS_AND_PUBKEYS,USE_TEMPORARY_DB,VERIFY_AGGREGATED_FINALIZATION_PROOF} from '../utils.js'

import {ED25519_VERIFY} from '../../../KLY_Utils/utils.js'

import {CONFIGURATION} from '../../../klyn74r.js'




export let CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH=async()=>{

    let qtEpochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = qtEpochHandler.hash+"#"+qtEpochHandler.id

    let temporaryObject = global.SYMBIOTE_META.TEMP.get(epochFullID)


    if(!temporaryObject){

        setTimeout(CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH,3000)

        return

    }


    let iAmInTheQuorum = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.quorum.includes(CONFIGURATION.NODE_LEVEL.PUBLIC_KEY)


    if(iAmInTheQuorum && !EPOCH_STILL_FRESH(global.SYMBIOTE_META.QUORUM_THREAD)){
        
        // Stop to generate commitments/finalization proofs
        temporaryObject.SYNCHRONIZER.set('TIME_TO_NEW_EPOCH',true)

        let canGenerateEpochFinalizationProof = true

        
        for(let primePoolPubKey of qtEpochHandler.poolsRegistry.primePools){

            let reassignmentData = temporaryObject.SHARDS_LEADERS_HANDLERS.get(primePoolPubKey) || {currentLeader:-1}

            let pubKeyOfLeader = qtEpochHandler.leadersSequence[primePoolPubKey][reassignmentData.currentLeader] || primePoolPubKey


            if(temporaryObject.SYNCHRONIZER.has('GENERATE_FINALIZATION_PROOFS:'+pubKeyOfLeader)){

                canGenerateEpochFinalizationProof = false

                break

            }

        }

        if(canGenerateEpochFinalizationProof){

            await USE_TEMPORARY_DB('put',temporaryObject.DATABASE,'TIME_TO_NEW_EPOCH',true).then(()=>

                temporaryObject.SYNCHRONIZER.set('READY_FOR_NEW_EPOCH',true)


            ).catch(()=>{})

        }
        

        // Check the safety
        if(!temporaryObject.SYNCHRONIZER.has('READY_FOR_NEW_EPOCH')){

            setTimeout(CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH,3000)

            return

        }
    

        let epochFinishProposition = {}

        let majority = GET_MAJORITY(qtEpochHandler)

        let leadersSequencePerShard = qtEpochHandler.leadersSequence // primePoolPubKey => [reservePool0,reservePool1,...,reservePoolN]

        
    
        for(let [shardId,arrayOfReservePools] of Object.entries(leadersSequencePerShard)){

            let handlerWithIndexOfCurrentLeaderOnShard = temporaryObject.SHARDS_LEADERS_HANDLERS.get(shardId) || {currentLeader:-1}// {currentLeader:<number>}

            let pubKeyOfLeader, indexOfLeader
            
            
            if(handlerWithIndexOfCurrentLeaderOnShard.currentLeader !== -1){

                pubKeyOfLeader = arrayOfReservePools[handlerWithIndexOfCurrentLeaderOnShard.currentLeader]

                indexOfLeader = handlerWithIndexOfCurrentLeaderOnShard.currentLeader

            }else{

                pubKeyOfLeader = shardId

                indexOfLeader = -1

            }
            

            /*
            
                Now to avoid loops, check if last leader created at least 1 block
            
            */

            let localVotingDataForLeader = temporaryObject.FINALIZATION_STATS.get(pubKeyOfLeader) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}

            if(localVotingDataForLeader.index === -1){

                // Change to previous leader that finish its work on height > -1

                for(let position = indexOfLeader-1 ; position >= -1 ; position --){

                    let previousShardLeader = arrayOfReservePools[position] || shardId

                    let localVotingData = temporaryObject.FINALIZATION_STATS.get(previousShardLeader) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}

                    if(localVotingData.index > -1){

                        pubKeyOfLeader = previousShardLeader

                        indexOfLeader = position

                        // Also, change the value in pointer to current leader

                        temporaryObject.SHARDS_LEADERS_HANDLERS.set(shardId,{currentLeader:position})

                        break

                    }

                }

            }

            
            // Structure is Map(shard=>Map(quorumMember=>SIG('EPOCH_DONE'+shard+lastLeaderInRcIndex+lastIndex+lastHash+hashOfFirstBlockByLastLeader+epochFullId)))
            let agreements = temporaryObject.TEMP_CACHE.get('EPOCH_PROPOSITION')

            if(!agreements){

                agreements = new Map()

                temporaryObject.TEMP_CACHE.set('EPOCH_PROPOSITION',agreements)
            
            }

            let agreementsForThisShard = agreements.get(shardId)

            if(!agreementsForThisShard){

                agreementsForThisShard = new Map()

                agreements.set(shardId,agreementsForThisShard)
            
            }


            /*
            
                Thanks to verification process of block 0 on route POST /block (see routes/main.js) we know that each block created by shard leader will contain all the ALRPs
        
                1) Start to build so called CHECKPOINT_PROPOSITION. This object has the following structure


                {
                
                    "shard0":{

                        currentLeader:<int - pointer to current leader of shard based on QT.EPOCH.leadersSequence[primePool]. In case -1 - it's prime pool>

                        metadataForCheckpoint:{
                            index:,
                            hash:,
                            
                            afp:{

                                prevBlockHash:<must be the same as metadataForCheckpoint.hash>

                                blockID:<must be next to metadataForCheckpoint.index>,

                                blockHash,

                                proofs:{

                                    quorumMember0_Ed25519PubKey: ed25519Signa0,
                                    ...
                                    quorumMemberN_Ed25519PubKey: ed25519SignaN
                
                                }

                            }
                    
                        }

                    },

                    "shard1":{
                        
                    }

                    ...
                    
                    "shardN":{
                        ...
                    }
                
                }


                2) Take the <metadataForCheckpoint> for <currentLeader> from TEMP.get(<checkpointID>).FINALIZATION_STATS

                3) If nothing in FINALIZATION_STATS - then set index to -1 and hash to default(0123...)

                4) Send CHECKPOINT_PROPOSITION to POST /checkpoint_proposition to all(or at least 2/3N+1) quorum members


                ____________________________________________After we get responses____________________________________________

                5) If validator agree with all the propositions - it generate signatures for all the shard to paste this short proof to the fist block in the next epoch(to section block.extraData.aefpForPreviousEpoch)

                6) If we get 2/3N+1 agreements for ALL the shards - aggregate it and store locally. This called AGGREGATED_EPOCH_FINALIZATION_PROOF (AEFP)

                    The structure is


                       {
                
                            lastLeader:<index of Ed25519 pubkey of some pool in shard's reassignment chain>,
                            lastIndex:<index of his block in previous epoch>,
                            lastHash:<hash of this block>,
                            firstBlockHash,

                            proofs:{

                                ed25519PubKey0:ed25519Signa0,
                                ...
                                ed25519PubKeyN:ed25519SignaN
                         
                            }

                        }


                7) Then, we can share these proofs by route GET /aggregated_epoch_finalization_proof/:EPOCH_ID/:SHARD_ID

                8) Prime pool and other reserve pools on each shard can query network for this proofs to set to
                
                    block.extraData.aefpForPreviousEpoch to know where to start VERIFICATION_THREAD in a new epoch                
                

            */
         
            let aefpExistsLocally = await global.SYMBIOTE_META.EPOCH_DATA.get(`AEFP:${qtEpochHandler.id}:${shardId}`).catch(()=>false)

            if(!aefpExistsLocally){

                epochFinishProposition[shardId] = {

                    currentLeader:indexOfLeader,
    
                    afpForFirstBlock:{},
    
                    metadataForCheckpoint:temporaryObject.FINALIZATION_STATS.get(pubKeyOfLeader) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}
    
                }
    
                // In case we vote for index > 0 - we need to add the AFP proof to proposition. This will be added to AEFP and used on verification thread to build reassignment metadata
    
                if(epochFinishProposition[shardId].metadataForCheckpoint.index >= 0){
    
                    let firstBlockID = qtEpochHandler.id+':'+pubKeyOfLeader+':0'
    
                    epochFinishProposition[shardId].afpForFirstBlock = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+firstBlockID).catch(()=>({}))
    
                }    

            }
            
        }

        
        //____________________________________ Send the epoch finish proposition ____________________________________


        let optionsToSend = {method:'POST',body:JSON.stringify(epochFinishProposition)}
        
        let quorumMembers = await GET_QUORUM_URLS_AND_PUBKEYS(true)


        //Descriptor is {url,pubKey}
        for(let descriptor of quorumMembers){        

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
                                metadataForCheckpoint:{
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

                    for(let [primePoolPubKey,metadata] of Object.entries(epochFinishProposition)){

                        let agreementsForThisShard = temporaryObject.TEMP_CACHE.get('EPOCH_PROPOSITION').get(primePoolPubKey) // signer => signature                        

                        let response = possibleAgreements[primePoolPubKey]

                        if(response){

                            if(response.status==='OK' && typeof metadata.afpForFirstBlock.blockHash === 'string'){

                                // Verify EPOCH_FINALIZATION_PROOF signature and store to mapping

                                let dataThatShouldBeSigned = 'EPOCH_DONE'+primePoolPubKey+metadata.currentLeader+metadata.metadataForCheckpoint.index+metadata.metadataForCheckpoint.hash+metadata.afpForFirstBlock.blockHash+epochFullID

                                let isOk = await ED25519_VERIFY(dataThatShouldBeSigned,response.sig,descriptor.pubKey)

                                if(isOk) agreementsForThisShard.set(descriptor.pubKey,response.sig)


                            }else if(response.status==='UPGRADE'){

                                // Check the AFP and update the local data

                                let {index,hash,afp} = response.metadataForCheckpoint
                            
                                let pubKeyOfProposedLeader = leadersSequencePerShard[primePoolPubKey][response.currentLeader] || primePoolPubKey
                                
                                let afpToUpgradeIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(afp,qtEpochHandler)

                                let blockIDThatShouldBeInAfp = qtEpochHandler.id+':'+pubKeyOfProposedLeader+':'+index
                            
                                if(afpToUpgradeIsOk && blockIDThatShouldBeInAfp === afp.blockID && hash === afp.blockHash){

                                    let {prevBlockHash,blockID,blockHash,proofs} = afp
                            
                                    // Update the SHARDS_LEADERS_HANDLERS

                                    temporaryObject.SHARDS_LEADERS_HANDLERS.set(primePoolPubKey,{currentLeader:response.currentLeader})
                                    
                                    // Update FINALIZATION_STATS

                                    temporaryObject.FINALIZATION_STATS.set(pubKeyOfProposedLeader,{index,hash,afp:{prevBlockHash,blockID,blockHash,proofs}})
                            
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

        for(let [primePoolPubKey,metadata] of Object.entries(epochFinishProposition)){

            let agreementsForEpochManager = temporaryObject.TEMP_CACHE.get('EPOCH_PROPOSITION').get(primePoolPubKey) // signer => signature

            if(agreementsForEpochManager.size >= majority){

        
                let aggregatedEpochFinalizationProof = {

                    shard:primePoolPubKey,

                    lastLeader:metadata.currentLeader,
                    
                    lastIndex:metadata.metadataForCheckpoint.index,
                    
                    lastHash:metadata.metadataForCheckpoint.hash,

                    hashOfFirstBlockByLastLeader:metadata.afpForFirstBlock.blockHash,

                    proofs:Object.fromEntries(agreementsForEpochManager)
                    
                }

                await global.SYMBIOTE_META.EPOCH_DATA.put(`AEFP:${qtEpochHandler.id}:${primePoolPubKey}`,aggregatedEpochFinalizationProof).catch(()=>{})

            }

        }

    }

    setTimeout(CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH,3000) // each 3 seconds - do monitoring

}