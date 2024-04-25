import {GET_FROM_QUORUM_THREAD_STATE, GET_MAJORITY, GET_PSEUDO_RANDOM_SUBSET_FROM_QUORUM_BY_TICKET_ID, USE_TEMPORARY_DB} from '../utils.js'

import {BLOCKCHAIN_DATABASES, WORKING_THREADS} from '../blockchain_preparation.js'

import {COLORS,ED25519_VERIFY,LOG} from '../../../KLY_Utils/utils.js'

import {CONFIGURATION} from '../../../klyn74r.js'

import Block from '../essences/block.js'

import WS from 'websocket'






let OPEN_CONNECTIONS_WITH_QUORUM = async (epochHandler,tempObject) => {

    // Now we can open required WebSocket connections with quorums majority

    let {FINALIZATION_PROOFS,TEMP_CACHE} = tempObject

    let epochFullID = epochHandler.hash + "#" + epochHandler.id

    for(let pubKey of epochHandler.quorum){

        // Check if we already have an open connection stored in cache

        if(!TEMP_CACHE.has('WS:'+pubKey)){

            let poolStorage = global.SYMBIOTE_META.APPROVEMENT_THREAD_CACHE.get(pubKey+'(POOL)_STORAGE_POOL') || await GET_FROM_QUORUM_THREAD_STATE(pubKey+'(POOL)_STORAGE_POOL').catch(()=>null)

            if(poolStorage){

                let WebSocketClient = WS.client
    
                let client = new WebSocketClient({})
                
                
                // Connect to remote WSS server
                client.connect(poolStorage.wssPoolURL,'echo-protocol')
                
                client.on('connect',connection=>{

                    connection.on('message',async message=>{

                        if(message.type === 'utf8'){

                            let parsedData = JSON.parse(message.utf8Data)

                            let proofsGrabber = TEMP_CACHE.get('PROOFS_GRABBER')

                            if(parsedData.finalizationProof && proofsGrabber.huntingForHash === parsedData.votedForHash && FINALIZATION_PROOFS.has(proofsGrabber.huntingForBlockID)){

                                if(parsedData.type === 'tmb'){

                                    let dataThatShouldBeSigned = proofsGrabber.acceptedHash+proofsGrabber.huntingForBlockID+proofsGrabber.huntingForHash+epochFullID
                        
                                    let finalizationProofIsOk = FINALIZATION_PROOFS.has(proofsGrabber.huntingForBlockID) && epochHandler.quorum.includes(parsedData.voter) && await ED25519_VERIFY(dataThatShouldBeSigned,parsedData.finalizationProof,parsedData.voter)

                                    if(finalizationProofIsOk && FINALIZATION_PROOFS.has(proofsGrabber.huntingForBlockID)){
                        
                                        FINALIZATION_PROOFS.get(proofsGrabber.huntingForBlockID).set(parsedData.voter,parsedData.finalizationProof)
                        
                                    }

                                } else if(parsedData.tmbProof) {

                                    // Verify the finalization proof
                        
                                    let dataThatShouldBeSigned = proofsGrabber.acceptedHash+proofsGrabber.huntingForBlockID+proofsGrabber.huntingForHash+epochFullID
                        
                                    let finalizationProofIsOk = FINALIZATION_PROOFS.has(proofsGrabber.huntingForBlockID) && epochHandler.quorum.includes(parsedData.voter) && await ED25519_VERIFY(dataThatShouldBeSigned,parsedData.finalizationProof,parsedData.voter)

                                    // Now verify the TMB proof(that block was delivered)

                                    dataThatShouldBeSigned += 'VALID_BLOCK_RECEIVED'

                                    let tmbProofIsOk = await ED25519_VERIFY(dataThatShouldBeSigned,parsedData.tmbProof,parsedData.voter)
                            
                                    if(finalizationProofIsOk && tmbProofIsOk && FINALIZATION_PROOFS.has(proofsGrabber.huntingForBlockID)){
                        
                                        FINALIZATION_PROOFS.get(proofsGrabber.huntingForBlockID).set(parsedData.voter,parsedData.finalizationProof)

                                        FINALIZATION_PROOFS.get('TMB:'+proofsGrabber.huntingForBlockID).set(parsedData.voter,parsedData.tmbProof)
                        
                                    }

                                }

                            }
                                                
                        }        

                    })

                    connection.on('close',()=>TEMP_CACHE.delete('WS:'+pubKey))
                      
                    connection.on('error',()=>TEMP_CACHE.delete('WS:'+pubKey))

                    TEMP_CACHE.set('WS:'+pubKey,connection)

                })
                
            }
                 
        }

    }

}




let RUN_FINALIZATION_PROOFS_GRABBING = async (epochHandler,proofsGrabber) => {

    let epochFullID = epochHandler.hash + "#" + epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    if(!tempObject) return

    let {FINALIZATION_PROOFS,DATABASE,TEMP_CACHE} = tempObject


    // Get the block index & hash that we're currently hunting for

    let blockIDForHunting = epochHandler.id+':'+CONFIGURATION.NODE_LEVEL.PUBLIC_KEY+':'+(proofsGrabber.acceptedIndex+1)

    let finalizationProofsMapping, tmbProofsMapping


    if(FINALIZATION_PROOFS.has(blockIDForHunting)){

        finalizationProofsMapping = FINALIZATION_PROOFS.get(blockIDForHunting)

        tmbProofsMapping = FINALIZATION_PROOFS.get('TMB:'+blockIDForHunting)
    }

    else{

        finalizationProofsMapping = new Map()
        
        tmbProofsMapping = new Map()

        FINALIZATION_PROOFS.set(blockIDForHunting,finalizationProofsMapping)
        
        FINALIZATION_PROOFS.set('TMB:'+blockIDForHunting,tmbProofsMapping)

    }

    let majority = GET_MAJORITY(epochHandler)

    let blockToSend = TEMP_CACHE.get(blockIDForHunting) || await BLOCKCHAIN_DATABASES.BLOCKS.get(blockIDForHunting).catch(()=>null)


    if(!blockToSend) return


    let blockHash = Block.genHash(blockToSend)


    TEMP_CACHE.set(blockIDForHunting,blockToSend)


    proofsGrabber.huntingForBlockID = blockIDForHunting

    proofsGrabber.huntingForHash = blockHash


    if(finalizationProofsMapping.size<majority){

        // To prevent spam

        // In case we already have enough TMB proofs - no sense to send blocks to the rest. Send just TMB proofs as proofs that "enough number of validators from quorum has a valid block"

        if(tmbProofsMapping.size >= 21){

            // Otherwise - send blocks to safe minority to grab TMB proofs

            let templateToSend = {}

            tmbProofsMapping.forEach((signa,pubKey)=>templateToSend[pubKey] = signa)

            let dataToSend = JSON.stringify({

                route:'tmb',
            
                blockCreator: blockToSend.creator,

                blockIndex:blockToSend.index,

                blockHash: blockHash,
                
                previousBlockAFP:proofsGrabber.afpForPrevious,

                tmbProofs: templateToSend,

                tmbTicketID:0
    
            })
    
    
            for(let pubKeyOfQuorumMember of epochHandler.quorum){
    
                // No sense to get the commitment if we already have
    
                if(finalizationProofsMapping.has(pubKeyOfQuorumMember)) continue
    
                let connection = TEMP_CACHE.get('WS:'+pubKeyOfQuorumMember)
    
                if(connection) connection.sendUTF(dataToSend)
    
            }

            await new Promise(resolve=>

                setTimeout(()=>resolve(),200)
        
            )


        }else{

            if(TEMP_CACHE.has('FP_SPAM_FLAG')) return
    
            TEMP_CACHE.set('FP_SPAM_FLAG',true)

            // Otherwise - send blocks to safe minority to grab TMB proofs

            let dataToSend = JSON.stringify({

                route:'get_finalization_proof',
            
                block:blockToSend,
                
                previousBlockAFP:proofsGrabber.afpForPrevious
    
            })
    
            // Send only to safe subset of validators from quorum

            let subsetToSendBlocks = GET_PSEUDO_RANDOM_SUBSET_FROM_QUORUM_BY_TICKET_ID(0,epochHandler)
    
            for(let pubKeyOfQuorumMember of subsetToSendBlocks){
    
                // No sense to contact if we already have a proof
    
                if(finalizationProofsMapping.has(pubKeyOfQuorumMember)) continue
    
                let connection = TEMP_CACHE.get('WS:'+pubKeyOfQuorumMember)
    
                if(connection){

                    connection.sendUTF(dataToSend)

                }
    
            }    

        }

    }


    //_______________________ It means that we now have enough FINALIZATION_PROOFs for appropriate block. Now we can start to generate AGGREGATED_FINALIZATION_PROOF _______________________

    if(finalizationProofsMapping.size >= majority){

        // In this case , aggregate FINALIZATION_PROOFs to get the AGGREGATED_FINALIZATION_PROOF and share over the network
        // Also, increase the counter of tempObject.TEMP_CACHE.get('PROOFS_GRABBER') to move to the next block and udpate the hash

        /*
        
        Aggregated version of FINALIZATION_PROOFs (it's AGGREGATED_FINALIZATION_PROOF)
        
        {
            prevBlockHash:"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        
            blockID:"93:7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

            blockHash:"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        
            proofs:{

                voterPubKey0:hisEd25519Signa,
                ...
                voterPubKeyN:hisEd25519Signa

            }

        }
    

        */
        
        let aggregatedFinalizationProof = {

            prevBlockHash:proofsGrabber.acceptedHash,

            blockID:blockIDForHunting,
            
            blockHash,

            proofs:Object.fromEntries(finalizationProofsMapping)
            
        }


        // Store locally
        await BLOCKCHAIN_DATABASES.EPOCH_DATA.put('AFP:'+blockIDForHunting,aggregatedFinalizationProof).catch(()=>false)

        LOG(`Approved height for epoch \u001b[38;5;50m${epochHandler.id} \x1b[31;1mis \u001b[38;5;50m${proofsGrabber.acceptedIndex} \x1b[32;1m(${(finalizationProofsMapping.size/epochHandler.quorum.length).toFixed(3)*100}% agreements)`,COLORS.RED)

        console.log('\n')

        // Delete finalization proofs that we don't need more
        FINALIZATION_PROOFS.delete(blockIDForHunting)

        FINALIZATION_PROOFS.delete('TMB:'+blockIDForHunting)


        // Repeat procedure for the next block and store the progress
        await USE_TEMPORARY_DB('put',DATABASE,'PROOFS_GRABBER',proofsGrabber).then(()=>{

            proofsGrabber.afpForPrevious = aggregatedFinalizationProof

            proofsGrabber.acceptedIndex++
    
            proofsGrabber.acceptedHash = proofsGrabber.huntingForHash

        }).catch(()=>{})


        TEMP_CACHE.delete('FP_SPAM_FLAG')

        TEMP_CACHE.delete(blockIDForHunting)


    }else{

        setTimeout(()=>TEMP_CACHE.delete('FP_SPAM_FLAG'),10000)

    }

}











export let SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS = async () => {

    let qtEpochHandler = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH
    
    let epochFullID = qtEpochHandler.hash + "#" + qtEpochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)



    if(!tempObject){

        setTimeout(SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS,2000)

        return

    }


    // If we don't generate the blocks - skip this function
    if(!tempObject.TEMP_CACHE.get('CAN_PRODUCE_BLOCKS')){

        setTimeout(SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS,2000)

        return

    }

    let {DATABASE,TEMP_CACHE} = tempObject

    let proofsGrabber = TEMP_CACHE.get('PROOFS_GRABBER')


    if(!proofsGrabber || proofsGrabber.epochID !== qtEpochHandler.id){

        //If we still works on the old checkpoint - continue
        //Otherwise,update the latest height/hash and send them to the new QUORUM
        proofsGrabber = await USE_TEMPORARY_DB('get',DATABASE,'PROOFS_GRABBER').catch(()=>false)

        if(!proofsGrabber){

            // Set the new handler with index 0(because each new epoch start with block index 0)
            proofsGrabber = {
    
                epochID:qtEpochHandler.id,

                acceptedIndex:-1,

                acceptedHash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

                afpForPrevious:{}
    
            }
    
        }
        
        // And store new descriptor

        await USE_TEMPORARY_DB('put',DATABASE,'PROOFS_GRABBER',proofsGrabber).catch(()=>false)

        TEMP_CACHE.set('PROOFS_GRABBER',proofsGrabber)

    }


    await OPEN_CONNECTIONS_WITH_QUORUM(qtEpochHandler,tempObject)

    await RUN_FINALIZATION_PROOFS_GRABBING(qtEpochHandler,proofsGrabber).catch(()=>{})


    setImmediate(SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS)

}
