import {GET_QUORUM_URLS_AND_PUBKEYS,GET_RANDOM_FROM_ARRAY,VERIFY_AGGREGATED_FINALIZATION_PROOF} from '../utils.js'

import {CHECK_ALRP_CHAIN_VALIDITY,GET_BLOCK} from '../verification_process/verification.js'

import {WORKING_THREADS} from '../blockchain_preparation.js'

import {CONFIGURATION} from '../../../klyn74r.js'

import Block from '../essences/block.js'






export let BUILD_TEMPORARY_SEQUENCE_OF_VERIFICATION_THREAD=async()=>{

    /*
    
        [+] In this function we should time by time ask for ALRPs for pools to build the reassignment chains

        [+] Use VT.TEMP_REASSIGNMENTS


        Based on current epoch in QUORUM_THREAD - build the temporary reassignments
    
    */


    let verificationThread = WORKING_THREADS.VERIFICATION_THREAD

    let tempReassignmentOnVerificationThread = verificationThread.TEMP_REASSIGNMENTS

    let vtEpochHandler = verificationThread.EPOCH

    let vtEpochFullID = vtEpochHandler.hash+'#'+vtEpochHandler.id

    let vtLeadersSequences = vtEpochHandler.leadersSequence


    if(!tempReassignmentOnVerificationThread[vtEpochFullID]){

        tempReassignmentOnVerificationThread[vtEpochFullID] = {} // create empty template

        // Fill with data from here. Structure: primePool => [reservePool0,reservePool1,...,reservePoolN]

        for(let primePoolPubKey of vtEpochHandler.poolsRegistry.primePools){
            
            tempReassignmentOnVerificationThread[vtEpochFullID][primePoolPubKey] = {

                currentLeader:-1, // -1 means that it's prime pool itself. Indexes 0,1,2...N are the pointers to reserve pools in VT.REASSIGNMENT_CHAINS
                
                currentToVerify:-1, // to start the verification in START_VERIFICATION_THREAD from prime pool(-1 index) and continue with reserve pools(0,1,2,...N)

                reassignments:{} // poolPubKey => {index,hash}

            }

        }

    }


    //________________________________ Start to find ________________________________

    // TODO: Choose only several random sources instead of the whole quorum

    let quorumMembers = await GET_QUORUM_URLS_AND_PUBKEYS(true)

    let randomTarget = GET_RANDOM_FROM_ARRAY(quorumMembers)
    
    //___________________Ask quorum member about reassignments. Grab this results, verify the proofs and build the temporary reassignment chains___________________

    let localVersionOfCurrentLeaders = {} // primePoolPubKey => assumptionAboutIndexOfCurrentLeader

    for(let primePoolPubKey of vtEpochHandler.poolsRegistry.primePools){

        localVersionOfCurrentLeaders[primePoolPubKey] = tempReassignmentOnVerificationThread[vtEpochFullID][primePoolPubKey].currentLeader

    }


    // Make request to /data_to_build_temp_data_for_verification_thread. Returns => {primePoolPubKey(shardID):<aggregatedSkipProofForProposedLeader>}

    let optionsToSend = {

        method: 'POST',

        body: JSON.stringify(localVersionOfCurrentLeaders)

    }

    let response = await fetch(randomTarget.url+'/data_to_build_temp_data_for_verification_thread',optionsToSend).then(r=>r.json()).catch(()=>({}))


    /*
        
        The response has the following structure:

        [0] - {err:'Some error text'} - ignore, do nothing

        [1] - Object with this structure

        {

            primePool0:{proposedLeaderIndex,firstBlockByProposedLeader,afpForSecondBlockProposedLeader},

            primePool1:{proposedLeaderIndex,firstBlockByProposedLeader,afpForSecondBlockProposedLeader},

            ...

            primePoolN:{proposedLeaderIndex,firstBlockByProposedLeader,afpForSecondBlockProposedLeader}

        }


        -----------------------------------------------[Decomposition]-----------------------------------------------


        [0] proposedAuthorityIndex - index of current authority for subchain X. To get the pubkey of subchain authority - take the QUORUM_THREAD.EPOCH.reassignmentChains[<primePool>][proposedAuthorityIndex]

        [1] firstBlockByCurrentAuthority - default block structure with ASP for all the previous pools in a queue

        [2] afpForSecondBlockByCurrentAuthority - default AFP structure -> 


            {
                prevBlockHash:<string>              => it should be the hash of <firstBlockByCurrentAuthority>
                blockID:<string>,
                blockHash:<string>,
                proofs:{

                    quorumMemberPubKey0:ed25519Signa,
                    ...                                             => Signa is prevBlockHash+blockID+hash+QT.EPOCH.HASH+"#"+QT.EPOCH.id
                    quorumMemberPubKeyN:ed25519Signa,

                }
                         
            }


            -----------------------------------------------[What to do next?]-----------------------------------------------
        
            Compare the <proposedAuthorityIndex> with our local pointer tempReassignmentOnVerificationThread[quorumThreadCheckpointFullID][primePool].currentAuthority

            In case our local version has bigger index - ignore

            In case proposed version has bigger index it's a clear signal that some of reassignments occured and we need to update our local data

            For this:

                0) Verify that this block was approved by quorum majority(2/3N+1) by checking the <afpForSecondBlockByCurrentAuthority>

                If all the verification steps is OK - add to some cache

                ---------------------------------[After the verification of all the responses?]---------------------------------

                Start to build the temporary reassignment chains

    */

    for(let [primePoolPubKey, metadata] of Object.entries(response)){

        if(typeof primePoolPubKey === 'string' && typeof metadata==='object'){

            let {proposedIndexOfLeader,firstBlockByCurrentLeader,afpForSecondBlockByCurrentLeader} = metadata
    
            if(typeof proposedIndexOfLeader === 'number' && typeof firstBlockByCurrentLeader === 'object' && typeof afpForSecondBlockByCurrentLeader==='object'){
                  
                if(localVersionOfCurrentLeaders[primePoolPubKey] <= proposedIndexOfLeader && firstBlockByCurrentLeader.index === 0){

                    // Verify the AFP for second block(with index 1 in epoch) to make sure that block 0(first block in epoch) was 100% accepted
    
                    let afpIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(afpForSecondBlockByCurrentLeader,vtEpochHandler)
    
                    afpIsOk &&= afpForSecondBlockByCurrentLeader.prevBlockHash === Block.genHash(firstBlockByCurrentLeader)

                    if(afpIsOk){

                        // Verify all the ALRPs in block header
    
                        let {isOK,filteredReassignments:filteredReassignmentsInBlockOfProposedLeader} = await CHECK_ALRP_CHAIN_VALIDITY(
                                
                            primePoolPubKey, firstBlockByCurrentLeader, vtLeadersSequences[primePoolPubKey], proposedIndexOfLeader, vtEpochFullID, vtEpochHandler, true
                            
                        )

                        let shouldChangeThisShard = true

                        if(isOK){

                            let collectionOfAlrpsFromAllThePreviousLeaders = [filteredReassignmentsInBlockOfProposedLeader] // each element here is object like {pool:{index,hash,firstBlockHash}}

                            let currentAlrpSet = {...filteredReassignmentsInBlockOfProposedLeader}

                            let position = proposedIndexOfLeader-1


                            /*
                            
                            ________________ What to do next? ________________

                            Now we know that proposed leader has created some first block(firstBlockByProposedLeader)

                            and we verified the AFP so it's clear proof that block is 100% accepted and the data inside is valid and will be a part of epoch data



                            Now, start the cycle in reverse order on range

                            [proposedLeaderIndex-1 ; localVersionOfCurrentLeaders[primePoolPubKey]]
                            
                            

                            
                            */

                            if(position>=localVersionOfCurrentLeaders[primePoolPubKey]){

                                // eslint-disable-next-line no-constant-condition
                                while(true){

                                    for(; position >= localVersionOfCurrentLeaders[primePoolPubKey] ; position--){

                                        let poolOnThisPosition = position === -1 ? primePoolPubKey : vtLeadersSequences[primePoolPubKey][position]
    
                                        let alrpForThisPoolFromCurrentSet = currentAlrpSet[poolOnThisPosition]
    
                                        if(alrpForThisPoolFromCurrentSet.index !== -1){
    
                                            // Ask the first block and extract next set of ALRPs
    
                                            let firstBlockInThisEpochByPool = await GET_BLOCK(vtEpochHandler.id,poolOnThisPosition,0)
    
                                            // Compare hashes to make sure it's really the first block by pool X in epoch Y
    
                                            if(firstBlockInThisEpochByPool && Block.genHash(firstBlockInThisEpochByPool) === alrpForThisPoolFromCurrentSet.firstBlockHash){
                            
                                                let alrpChainValidation = position === -1 ? {isOK:true,filteredReassignments:{}} : await CHECK_ALRP_CHAIN_VALIDITY(
                                                    
                                                    primePoolPubKey, firstBlockInThisEpochByPool, vtLeadersSequences[primePoolPubKey], position, vtEpochFullID, vtEpochHandler, true
                                                    
                                                )
                            
                                                if(alrpChainValidation.isOK){
    
                                                    // If ok - fill the <potentialReassignments>
    
                                                    collectionOfAlrpsFromAllThePreviousLeaders.push(alrpChainValidation.filteredReassignments)
    
                                                    currentAlrpSet = alrpChainValidation.filteredReassignments

                                                    position--
    
                                                    break
    
                                                }else{
    
                                                    shouldChangeThisShard = false
    
                                                    break
    
                                                }
    
                                            }else{
    
                                                shouldChangeThisShard = false
    
                                                break
    
                                            }
    
                                        }
    
                                    }

                                    if(!shouldChangeThisShard || position <= localVersionOfCurrentLeaders[primePoolPubKey]) break

                                }


                                // Now, <collectionOfAlrpsFromAllThePreviousLeaders> is array of objects like {pool:{index,hash,firstBlockHash}}
                                // We need to reverse it and fill the temp data for VT

                                if(shouldChangeThisShard){

                                    // Update the reassignment data

                                    let tempReassignmentChain = tempReassignmentOnVerificationThread[vtEpochFullID][primePoolPubKey].reassignments // poolPubKey => {index,hash}


                                    for(let reassignStats of collectionOfAlrpsFromAllThePreviousLeaders.reverse()){

                                        // collectionOfAlrpsFromAllThePreviousLeaders[i] = {primePool:{index,hash},pool0:{index,hash},poolN:{index,hash}}

                                        for(let [poolPubKey,descriptor] of Object.entries(reassignStats)){

                                            if(!tempReassignmentChain[poolPubKey]) tempReassignmentChain[poolPubKey] = descriptor
                
                                        }

                                    }

                                    // Finally, set the <currentAuthority> to the new pointer

                                    tempReassignmentOnVerificationThread[vtEpochFullID][primePoolPubKey].currentLeader = proposedIndexOfLeader


                                }

                            }

                        }

                    }

                }

            } 
        
        }

    }
        
    setTimeout(BUILD_TEMPORARY_SEQUENCE_OF_VERIFICATION_THREAD,CONFIGURATION.NODE_LEVEL.TEMPORARY_REASSIGNMENTS_BUILDER_TIMEOUT)

}