import {VERIFY_AGGREGATED_FINALIZATION_PROOF} from "../../verification.js"

import {BODY,ED25519_SIGN_DATA} from "../../../../KLY_Utils/utils.js"


/*
            
    The structure of AGGREGATED_EPOCH_FINALIZATION_PROOF is

    {
        subchain:<ed25519 pubkey of prime pool - the creator of new subchain>
        lastAuthority:<index of Ed25519 pubkey of some pool in subchain's reassignment chain>,
        lastIndex:<index of his block in previous epoch>,
        lastHash:<hash of this block>,
        hashOfFirstBlockByLastAuthority:<hash of the first block by this authority>,
        
        proofs:{

            quorumMemberPubKey0:Ed25519Signa0,
            ...
            quorumMemberPubKeyN:Ed25519SignaN

        }
    
    }

    Signature is ED25519('EPOCH_DONE'+subchain+lastAuth+lastIndex+lastHash+firstBlockHash+epochFullId)


*/
let getAggregatedEpochFinalizationProof=async(response,request)=>{

    response.onAborted(()=>response.aborted=true)

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.GET_AGGREGATED_EPOCH_FINALIZATION_PROOF){

        let epochFullID = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.id

        if(!global.SYMBIOTE_META.TEMP.has(epochFullID)){

            !response.aborted && response.end('QT epoch handler is not ready')
        
            return

        }


        let epochIndex = request.getParameter(0)

        let subchainID = request.getParameter(1)

        let aggregatedEpochFinalizationProofForSubchain = await global.SYMBIOTE_META.EPOCH_DATA.get(`AEFP:${epochIndex}:${subchainID}`).catch(()=>false)

        
        if(aggregatedEpochFinalizationProofForSubchain){

            !response.aborted && response.end(JSON.stringify(aggregatedEpochFinalizationProofForSubchain))

        }else !response.aborted && response.end(JSON.stringify({err:'No AEFP'}))

    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

}




let acceptEpochFinishProposition=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let qtEpochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = qtEpochHandler.hash+"#"+qtEpochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)


    if(!tempObject){

        !response.aborted && response.end(JSON.stringify({err:'Epoch handler on QT is not fresh'}))

        return
    }

    if(!tempObject.SYNCHRONIZER.has('READY_FOR_NEW_EPOCH')){

        !response.aborted && response.end(JSON.stringify({err:'Not ready'}))

        return

    }
    


    /* 
    
        Parse the proposition

        !Reminder:  The structure of proposition is:

        {
                
            "subchain0":{

                currentAuthority:<int - pointer to current authority of subchain based on QT.EPOCH.reassignmentChains[primePool]. In case -1 - it's prime pool>
                
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

            "subchain1":{
                ...            
            }

            ...
                    
            "subchainN":{
                ...
            }
                
        }


        1) We need to iterate over propositions(per subchain)
        2) Compare <currentAuth> with our local version of current authority on subchain(take it from tempObj.REASSIGNMENTS)
        
            [If proposed.currentAuth >= local.currentAuth]:

                1) Verify index & hash & afp in <metadataForCheckpoint>
                
                2) If proposed height >= local version - generate and return signature ED25519_SIG('EPOCH_DONE'+subchain+lastAuth+lastIndex+lastHash+hashOfFirstBlockByLastAuthority+epochFullId)

                3) Else - send status:'UPGRADE' with local version of finalization proof, index and hash(take it from tempObject.EPOCH_MANAGER)

            [Else if proposed.currentAuth < local.currentAuth AND tempObj.EPOCH_MANAGER.has(local.currentAuth)]:

                1) Send status:'UPGRADE' with local version of currentAuthority, metadata for epoch(from tempObject.EPOCH_MANAGER), index and hash



        !Reminder: Response structure is

        {
            
            subchainA:{
                                
                status:'UPGRADE'|'OK',

                -------------------------------[In case status === 'OK']-------------------------------

                signa: SIG('EPOCH_DONE'+subchain+lastAuth+lastIndex+lastHash+hashOfFirstBlockByLastAuthority+epochFullId)
                        
                ----------------------------[In case status === 'UPGRADE']-----------------------------

                currentAuthority:<index>,
                
                metadataForCheckpoint:{
                
                    index,
                    hash,
                    afp
                
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
   
    

    let possiblePropositionForNewEpoch = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)

    let responseStructure = {}



    if(typeof possiblePropositionForNewEpoch === 'object'){


        for(let [subchainID,proposition] of Object.entries(possiblePropositionForNewEpoch)){

            if(responseStructure[subchainID]) continue

            if(typeof subchainID === 'string' && typeof proposition.currentAuthority === 'number' && typeof proposition.afpForFirstBlock === 'object' && typeof proposition.metadataForCheckpoint === 'object' && typeof proposition.metadataForCheckpoint.afp === 'object'){

                // Get the local version of REASSIGNMENTS and CHECKPOINT_MANAGER

                let reassignmentForThisSubchain = tempObject.REASSIGNMENTS.get(subchainID) // {currentAuthority:<uint>}

                let pubKeyOfCurrentAuthorityOnSubchain, localIndexOfAuthority
                
                if(typeof reassignmentForThisSubchain === 'string') continue // type string is only for reserve pool. So, if this branch is true it's a sign that subchainID is pubkey of reserve pool what is impossible. So, continue

                else if(typeof reassignmentForThisSubchain === 'object') {

                    localIndexOfAuthority = reassignmentForThisSubchain.currentAuthority

                    pubKeyOfCurrentAuthorityOnSubchain = qtEpochHandler.reassignmentChains[subchainID][localIndexOfAuthority] || subchainID

                }else{

                    // Assume that there is no data about reassignments for given subchain locally. So, imagine that epoch will stop on prime pool (prime pool pubkey === subchainID)

                    localIndexOfAuthority = -1

                    pubKeyOfCurrentAuthorityOnSubchain = subchainID

                }


                // Structure is {index,hash,aggregatedCommitments:{aggregatedPub,aggregatedSignature,afkVoters}}

                let epochManagerForAuthority = tempObject.EPOCH_MANAGER.get(pubKeyOfCurrentAuthorityOnSubchain) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}


                // Try to define the first block hash. For this, use the proposition.afpForFirstBlock
                        
                let hashOfFirstBlockByLastAuthority

                let blockIdOfFirstBlock = qtEpochHandler.id+':'+pubKeyOfCurrentAuthorityOnSubchain+':0' // first block has index 0 - numeration from 0

                if(blockIdOfFirstBlock === proposition.afpForFirstBlock.blockID && proposition.metadataForCheckpoint.index>=0){

                    // Verify the AFP for first block

                    let afpIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(proposition.afpForFirstBlock,qtEpochHandler)

                    if(afpIsOk) hashOfFirstBlockByLastAuthority = proposition.afpForFirstBlock.blockHash


                }


                if(!hashOfFirstBlockByLastAuthority) continue


                //_________________________________________ Now compare _________________________________________

                if(proposition.currentAuthority === localIndexOfAuthority){

                    if(epochManagerForAuthority.index === proposition.metadataForCheckpoint.index && epochManagerForAuthority.hash === proposition.metadataForCheckpoint.hash){
                        
                        // Send EPOCH_FINALIZATION_PROOF signature

                        let {index,hash} = proposition.metadataForCheckpoint

                        let dataToSign = 'EPOCH_DONE'+subchainID+proposition.currentAuthority+index+hash+hashOfFirstBlockByLastAuthority+epochFullID
    
                        responseStructure[subchainID] = {
                                                
                            status:'OK',
                                            
                            sig:await ED25519_SIGN_DATA(dataToSign,global.PRIVATE_KEY)
                                            
                        }

                            
                    }else if(epochManagerForAuthority.index < proposition.metadataForCheckpoint.index){

                        // Verify AGGREGATED_FINALIZATION_PROOF & upgrade local version & send EPOCH_FINALIZATION_PROOF

                        let {index,hash,afp} = proposition.metadataForCheckpoint

                        let isOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(afp,qtEpochHandler)


                        if(isOk){

                            // Check that this AFP is for appropriate pool

                            let [_,pubKeyOfCreator] = afp.blockID.split(':')

                            if(pubKeyOfCreator === pubKeyOfCurrentAuthorityOnSubchain){

                            
                                if(reassignmentForThisSubchain) reassignmentForThisSubchain.currentAuthority = proposition.currentAuthority

                                else tempObject.REASSIGNMENTS.set(subchainID,{currentAuthority:proposition.currentAuthority})
    

                                if(epochManagerForAuthority){

                                    epochManagerForAuthority.index = index
    
                                    epochManagerForAuthority.hash = hash
    
                                    epochManagerForAuthority.afp = afp
    
                                }else tempObject.EPOCH_MANAGER.set(pubKeyOfCurrentAuthorityOnSubchain,{index,hash,afp})

                            
                                // Generate EPOCH_FINALIZATION_PROOF_SIGNATURE

                                let dataToSign = 'EPOCH_DONE'+subchainID+proposition.currentAuthority+index+hash+hashOfFirstBlockByLastAuthority+epochFullID

                                responseStructure[subchainID] = {
                            
                                    status:'OK',
                        
                                    sig:await ED25519_SIGN_DATA(dataToSign,global.PRIVATE_KEY)
                        
                                }

                            }

                        }


                    }else if(epochManagerForAuthority.index > proposition.metadataForCheckpoint.index){

                        // Send 'UPGRADE' msg

                        responseStructure[subchainID] = {

                            status:'UPGRADE',
                            
                            currentAuthority:localIndexOfAuthority,
                
                            metadataForCheckpoint:epochManagerForAuthority // {index,hash,afp}
                    
                        }

                    }

                }else if(proposition.currentAuthority < localIndexOfAuthority){

                    // Send 'UPGRADE' msg

                    responseStructure[subchainID] = {

                        status:'UPGRADE',
                            
                        currentAuthority:localIndexOfAuthority,
                
                        metadataForCheckpoint:epochManagerForAuthority // {index,hash,afp}
                    
                    }

                }

            }

        }

        !response.aborted && response.end(JSON.stringify(responseStructure))

    }else !response.aborted && response.end(JSON.stringify({err:'Wrong format'}))


})




global.UWS_SERVER



// Simple GET handler to return AEFP for given subchain and epoch ✅
.get('/aggregated_epoch_finalization_proof/:EPOCH_INDEX/:SUBCHAIN_ID',getAggregatedEpochFinalizationProof)

// Handler to acccept propositions to finish the epoch for subchains and return agreement to build AEFP - Aggregated Epoch Finalization Proof ✅
.post('/epoch_proposition',acceptEpochFinishProposition)