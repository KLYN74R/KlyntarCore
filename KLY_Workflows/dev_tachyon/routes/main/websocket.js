import {GET_PSEUDO_RANDOM_SUBSET_FROM_QUORUM_BY_TICKET_ID, USE_TEMPORARY_DB,VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF,VERIFY_AGGREGATED_FINALIZATION_PROOF} from '../../utils.js'

import {CHECK_ALRP_CHAIN_VALIDITY} from '../../verification_process/verification.js'

import{LOG,ED25519_SIGN_DATA,ED25519_VERIFY} from '../../../../KLY_Utils/utils.js'

import Block from '../../essences/block.js'

import WS from 'websocket'

import http from 'http'








/**
 * 
 * # Info
 * 
 * The main handler that is used for consensus. Here you:
 * 
 *  + Accept the blocks & AFP for previous block
 *  + Verify that it's the part of a valid segment(by comparing a hashes & verifying AFP)
 *  + Store the new block locally
 *  + Generate the finalization proof(FP) for a proposed block => ED25519_SIGNA(prevBlockHash+blockID+blockHash+epochFullID)
 *  + Store the fact that we have voted for a block with a specific hash for proposed slot to prevent double voting(and slashing as result) 
 * 
 * 
 * 
 * # Accept
 * 
 *
 * ```js
 * 
 * //Object like this
 * 
 * 
 * {
 *  
 *      block: {
                        
            creator:'7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta',
            time:1666744452126,
            transactions:[
                tx1,
                tx2,
                tx3,
            ]
            index:1337,
            prevHash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            sig:'jXO7fLynU9nvN6Hok8r9lVXdFmjF5eye09t+aQsu+C/wyTWtqwHhPwHq/Nl0AgXDDbqDfhVmeJRKV85oSEDrMjVJFWxXVIQbNBhA7AZjQNn7UmTI75WAYNeQiyv4+R4S'
                        
        },


        previousBlockAFP:{

            prevBlockHash:"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",

            blockID:"1369:7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1336",
            
            blockHash:"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",

            proofs:{

                validatorEd25519PubKey0:hisEd25519Signa,
                ...
                validatorEd25519PubKeyN:hisEd25519Signa

            }
            
        }
 * 
 * } 
 * 
 * 
 *  P.S: In case it's the first block in epoch by current pool - we don't need to verify the AFP 
 * 
 * 
 * ```
 *  
 *  
 */
let RETURN_FINALIZATION_PROOF_FOR_BLOCK=async(parsedData,connection)=>{

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    // Check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
        
    if(!tempObject || tempObject.SYNCHRONIZER.has('TIME_TO_NEW_EPOCH')){

        connection.close()
    
        return
    
    }


    let {block,previousBlockAFP} = parsedData

    let overviewIsOk = typeof block === 'object' && typeof previousBlockAFP === 'object' && !tempObject.SYNCHRONIZER.has('STOP_PROOFS_GENERATION:'+block.creator)


    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.ACCEPT_BLOCKS_AND_RETURN_FINALIZATION_PROOFS || !overviewIsOk){
    
        connection.close()
                   
        return
    
    }else if(!tempObject.SYNCHRONIZER.has('GENERATE_FINALIZATION_PROOFS:'+block.creator)){
    
        // Add the sync flag to prevent creation proofs during the process of skip this pool
        tempObject.SYNCHRONIZER.set('GENERATE_FINALIZATION_PROOFS:'+block.creator,true)

        let poolsRegistryOnQuorumThread = epochHandler.poolsRegistry

        let itsPrimePool = poolsRegistryOnQuorumThread.primePools.includes(block.creator)
    
        let itsReservePool = poolsRegistryOnQuorumThread.reservePools.includes(block.creator)
    
        let poolIsReal = itsPrimePool || itsReservePool
    
        let primePoolPubKey, itIsReservePoolWhichIsLeaderNow


        if(poolIsReal){
    
            if(itsPrimePool){

                primePoolPubKey = block.creator

                // Check if it still a leader on own shard

                if(tempObject.SHARDS_LEADERS_HANDLERS.get(block.creator)){

                    connection.close()

                    tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+block.creator)
            
                    return
                    
                }

            } else if(typeof tempObject.SHARDS_LEADERS_HANDLERS.get(block.creator) === 'string'){
    
                primePoolPubKey = tempObject.SHARDS_LEADERS_HANDLERS.get(block.creator)
    
                itIsReservePoolWhichIsLeaderNow = true
    
            }
    
        }

        let thisLeaderCanGenerateBlocksNow = poolIsReal && ( itIsReservePoolWhichIsLeaderNow || itsPrimePool )
    
        if(!thisLeaderCanGenerateBlocksNow){
    
            connection.close()

            tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+block.creator)
    
            return
    
        }

        
        // Make sure that we work in a sync mode + verify the signature for the latest block
    
        let finalizationStatsForThisPool = tempObject.FINALIZATION_STATS.get(block.creator) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}

        let proposedBlockHash = Block.genHash(block)

        // Check that a new proposed block is a part of a valid segment

        let sameSegment = finalizationStatsForThisPool.index < block.index || finalizationStatsForThisPool.index === block.index && proposedBlockHash === finalizationStatsForThisPool.hash && block.epoch === epochFullID


        if(sameSegment){

            let proposedBlockID = epochHandler.id+':'+block.creator+':'+block.index

            let futureMetadataToStore


            if(await ED25519_VERIFY(proposedBlockHash,block.sig,block.creator).catch(()=>false)){

                if(finalizationStatsForThisPool.index === block.index){

                    futureMetadataToStore = finalizationStatsForThisPool
    
                }else{
    
                    futureMetadataToStore = {
    
                        index:block.index-1,
                        
                        hash:previousBlockAFP.blockHash,
    
                        afp:previousBlockAFP
    
                    }
    
                }


                let previousBlockID

                if(block.index === 0){


                    /*
    
                        And finally, if it's the first block in epoch - verify that it contains:
        
                            1) AGGREGATED_EPOCH_FINALIZATION_PROOF for previous epoch(in case we're not working on epoch 0) in block.extraData.aefpForPreviousEpoch
                            2) All the ALRPs for previous pools in leaders sequence in section block.extraData.aggregatedLeadersRotationProofs(in case the block creator is not a prime pool)

                        Also, these proofs should be only in the first block in epoch, so no sense to verify blocks with index !=0

                    */


                    //_________________________________________1_________________________________________
                    
                    // Since we need to verify the AEFP signed by previous quorum - take it from legacy data

                    let legacyEpochData = await global.SYMBIOTE_META.EPOCH_DATA.get(`LEGACY_DATA:${epochHandler.id-1}`).catch(()=>null) // {epochFullID,quorum,majority}

                    let aefpIsOk = epochHandler.id === 0 || legacyEpochData && await VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF(
        
                        block.extraData.aefpForPreviousEpoch,
                            
                        legacyEpochData.quorum,
                            
                        legacyEpochData.majority,
        
                        legacyEpochData.epochFullID
                            
                    ).catch(()=>false) && block.extraData.aefpForPreviousEpoch.shard === primePoolPubKey

                        
                    //_________________________________________2_________________________________________


                    let leadersSequence = epochHandler.leadersSequence[primePoolPubKey]

                    let positionOfBlockCreatorInLeadersSequence = leadersSequence.indexOf(block.creator)

                    let alrpChainIsOk = itsPrimePool || await CHECK_ALRP_CHAIN_VALIDITY(
        
                        primePoolPubKey,
        
                        block,

                        leadersSequence,
        
                        positionOfBlockCreatorInLeadersSequence,
        
                        epochFullID,
        
                        epochHandler

                    ).then(value=>value.isOK).catch(()=>false)


                    // Finally, check if we still don't have assumptions for the first block in current epoch

                    let assumptionAboutFirstBlockExists = await global.SYMBIOTE_META.EPOCH_DATA.get(`FIRST_BLOCK_ASSUMPTION:${epochHandler.id}:${primePoolPubKey}`).catch(()=>false)

                    if(!assumptionAboutFirstBlockExists){

                        assumptionAboutFirstBlockExists = await global.SYMBIOTE_META.EPOCH_DATA.put(`FIRST_BLOCK_ASSUMPTION:${epochHandler.id}:${primePoolPubKey}`,proposedBlockID).then(()=>true).catch(()=>false)

                    }


                    if(!aefpIsOk || !alrpChainIsOk || !assumptionAboutFirstBlockExists){

                        connection.close()

                        tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+block.creator)

                        return

                    }

                }else{


                    let {prevBlockHash,blockID,blockHash,proofs} = previousBlockAFP

                    previousBlockID = epochHandler.id+':'+block.creator+':'+(block.index-1)
    
                    let itsAfpForPreviousBlock = blockID === previousBlockID
        
                    if(!itsAfpForPreviousBlock || typeof prevBlockHash !== 'string' || typeof blockID !== 'string' || typeof blockHash !== 'string' || typeof proofs !== 'object'){
                        
                        connection.close()

                        tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+block.creator)
                
                        return
                
                    }
                       
                    let isOK = await VERIFY_AGGREGATED_FINALIZATION_PROOF(previousBlockAFP,epochHandler)
    
                    if(!isOK){

                        tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+block.creator)

                        return

                    }


                }


                // Store the metadata for FINALIZATION_STATS

                USE_TEMPORARY_DB('put',tempObject.DATABASE,block.creator,futureMetadataToStore).then(()=>

                    // Store the block
    
                    global.SYMBIOTE_META.BLOCKS.put(proposedBlockID,block).then(()=>{

                        // Store the AFP for previous block

                        let {prevBlockHash,blockID,blockHash,proofs} = previousBlockAFP

                        global.SYMBIOTE_META.EPOCH_DATA.put('AFP:'+previousBlockID,{prevBlockHash,blockID,blockHash,proofs}).then(async()=>{

                            tempObject.FINALIZATION_STATS.set(block.creator,futureMetadataToStore)
    

                            let dataToSign = (previousBlockAFP.blockHash || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')+proposedBlockID+proposedBlockHash+epochFullID
        
                            let finalizationProof = await ED25519_SIGN_DATA(dataToSign,global.PRIVATE_KEY)

                            // Once we get the block - return the TMB(Trust Me Bro) proof that we have received the valid block

                            dataToSign += 'VALID_BLOCK_RECEIVED'

                            let tmbProof = await ED25519_SIGN_DATA(dataToSign,global.PRIVATE_KEY)
    
    
                            tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+block.creator)
        
                            connection.sendUTF(JSON.stringify({voter:global.CONFIG.SYMBIOTE.PUB,finalizationProof,tmbProof,votedForHash:proposedBlockHash}))
    

                        })    
  
                    })
    
                ).catch(()=>{})


            } else {

                connection.close()

                tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+block.creator)
            }

        }        

    }
        
}




/*

    Accept
    
    {
        blockCreator,

        blockIndex,

        blockHash,

        previousBlockAFP,

        tmbProofs:{

            poolPubKey0: Ed25519Signa(previousBlockHash+proposedBlockID+proposedBlockHash+epochFullID+'VALID_BLOCK_RECEIVED'),
            ...
            (20 more proofs)
        }

        tmbTicketID:<int in range 0-9999>

    }

*/
let RETURN_FINALIZATION_PROOF_BASED_ON_TMB_PROOF=async(parsedData,connection)=>{

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    // Check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
        
    if(!tempObject || tempObject.SYNCHRONIZER.has('TIME_TO_NEW_EPOCH')){

        connection.close()
    
        return
    
    }


    let {blockCreator,blockIndex,blockHash,previousBlockAFP,tmbProofs,tmbTicketID} = parsedData


    let typeCheckOverviewIsOk = typeof blockCreator === 'string' && typeof blockHash === 'string' && typeof blockIndex === 'number' && typeof tmbTicketID === 'number'
    
                                && 
                                
                                typeof previousBlockAFP === 'object' && typeof tmbProofs === 'object'
                                
                                &&
                                
                                !tempObject.SYNCHRONIZER.has('STOP_PROOFS_GENERATION:'+blockCreator)



    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.ACCEPT_BLOCKS_AND_RETURN_FINALIZATION_PROOFS || !typeCheckOverviewIsOk){
    
        connection.close()
                   
        return
    
    }else if(!tempObject.SYNCHRONIZER.has('GENERATE_FINALIZATION_PROOFS:'+blockCreator)){
    
        // Add the sync flag to prevent creation proofs during the process of skip this pool
        tempObject.SYNCHRONIZER.set('GENERATE_FINALIZATION_PROOFS:'+blockCreator,true)

        let poolsRegistryOnQuorumThread = epochHandler.poolsRegistry

        let itsPrimePool = poolsRegistryOnQuorumThread.primePools.includes(blockCreator)
    
        let itsReservePool = poolsRegistryOnQuorumThread.reservePools.includes(blockCreator)
    
        let poolIsReal = itsPrimePool || itsReservePool

        let shardsLeadersData = tempObject.SHARDS_LEADERS_HANDLERS.get(blockCreator)
    
        let itIsReservePoolWhichIsLeaderNow = poolIsReal && typeof shardsLeadersData === 'string'

        let thisLeaderCanGenerateBlocksNow = poolIsReal && ( itIsReservePoolWhichIsLeaderNow || itsPrimePool )
    
        
        if(!thisLeaderCanGenerateBlocksNow){
    
            connection.close()

            tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+blockCreator)
    
            return
    
        }

        
        // Make sure that we work in a sync mode + verify the signature for the latest block
    
        let finalizationStatsForThisPool = tempObject.FINALIZATION_STATS.get(blockCreator) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}

        let proposedBlockHash = blockHash

        // Check that a new proposed block is a part of a valid segment

        let sameSegment = finalizationStatsForThisPool.index < blockIndex || finalizationStatsForThisPool.index === blockIndex && proposedBlockHash === finalizationStatsForThisPool.hash


        if(sameSegment){

            let proposedBlockID = epochHandler.id+':'+blockCreator+':'+blockIndex

            let dataToSignToApproveProposedBlock = (previousBlockAFP.blockHash || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')+proposedBlockID+proposedBlockHash+epochFullID

            let futureMetadataToStore

            // Verify the TMB proofs

            let subsetOfValidators = GET_PSEUDO_RANDOM_SUBSET_FROM_QUORUM_BY_TICKET_ID(tmbTicketID,epochHandler)

            let dataThatShouldBeSignedInTMB = dataToSignToApproveProposedBlock+'VALID_BLOCK_RECEIVED'

            // Now, we have to get valid signatures for all the members in this array

            let tmbVerificationIsOk = true


            for(let choosenValidator of subsetOfValidators) {

                let signaIsOk = await ED25519_VERIFY(dataThatShouldBeSignedInTMB,tmbProofs[choosenValidator],choosenValidator)

                if(!signaIsOk) {

                    tmbVerificationIsOk = false

                    break

                }

            }


            if(tmbVerificationIsOk){

                if(finalizationStatsForThisPool.index === blockIndex){

                    futureMetadataToStore = finalizationStatsForThisPool
    
                }else{
    
                    futureMetadataToStore = {
    
                        index:blockIndex-1,
                        
                        hash:previousBlockAFP.blockHash,
    
                        afp:previousBlockAFP
    
                    }
    
                }


                // Now verify the aggregated skip proof
                let {prevBlockHash,blockID:blockIDFromAFP,blockHash:blockHashFromAFP,proofs} = previousBlockAFP

                if(blockIndex !== 0 ){

                    let previousBlockID = epochHandler.id+':'+blockCreator+':'+(blockIndex-1)
    
                    let itsReallyAfpForPreviousBlock = blockIDFromAFP === previousBlockID
    
    
                    if(!itsReallyAfpForPreviousBlock || typeof prevBlockHash !== 'string' || typeof blockIDFromAFP !== 'string' || typeof blockHashFromAFP !== 'string' || typeof proofs !== 'object'){
                            
                        connection.close()
    
                        tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+blockCreator)
                
                        return
                
                    }
                       
                    let isOK = await VERIFY_AGGREGATED_FINALIZATION_PROOF(previousBlockAFP,epochHandler)
    
                    if(!isOK){
    
                        tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+blockCreator)
    
                        return
    
                    }
    
                } else {


                    // Check if we still don't have assumptions for the first block in current epoch

                    let shardID = itsPrimePool ? blockCreator : shardsLeadersData

                    let assumptionAboutFirstBlockExists = await global.SYMBIOTE_META.EPOCH_DATA.get(`FIRST_BLOCK_ASSUMPTION:${epochHandler.id}:${shardID}`).catch(()=>false)

                    if(!assumptionAboutFirstBlockExists){

                        assumptionAboutFirstBlockExists = await global.SYMBIOTE_META.EPOCH_DATA.put(`FIRST_BLOCK_ASSUMPTION:${epochHandler.id}:${shardID}`,proposedBlockID).then(()=>true).catch(()=>false)

                    }

                    if(!assumptionAboutFirstBlockExists){

                        tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+blockCreator)
    
                        return

                    }

                }



                // Store the metadata for FINALIZATION_STATS

                USE_TEMPORARY_DB('put',tempObject.DATABASE,blockCreator,futureMetadataToStore).then(()=>{

                    // Store the AFP for previous block

                    global.SYMBIOTE_META.EPOCH_DATA.put('AFP:'+blockIDFromAFP,{prevBlockHash,blockID:blockIDFromAFP,blockHash:blockHashFromAFP,proofs}).then(async()=>{

                        tempObject.FINALIZATION_STATS.set(blockCreator,futureMetadataToStore)
            
                        let finalizationProof = await ED25519_SIGN_DATA(dataToSignToApproveProposedBlock,global.PRIVATE_KEY)    
    
                        tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+blockCreator)
        
                        connection.sendUTF(JSON.stringify({type:'tmb',voter:global.CONFIG.SYMBIOTE.PUB,finalizationProof,votedForHash:proposedBlockHash}))
    
                    })
    
                }).catch(()=>{})


            } else {

                connection.close()

                tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+blockCreator)
            }

        }        

    }
        
}




let RETURN_BLOCKS_RANGE = async(data,connection)=>{

    // We need to send range of blocks from <heightThatUserHave+1> to <heightThatUserHave+499> or less(limit is up to 500 blocks). Also, send the AFP for latest block
    // Also, the response structure is {blocks:[],afpForLatest}

    let responseStructure = {

        blocks:[],

        afpForLatest:{}

    }

    
    for(let i=1;i<50;i++){

        let blockIdToFind = data.epochIndex+':'+global.CONFIG.SYMBIOTE.PUB+':'+(data.hasUntilHeight+i)

        let blockIdToFindAfp = data.epochIndex+':'+global.CONFIG.SYMBIOTE.PUB+':'+(data.hasUntilHeight+i+1)

        let block = await global.SYMBIOTE_META.BLOCKS.get(blockIdToFind).catch(()=>null)

        let afpForBlock = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+blockIdToFindAfp).catch(()=>null)

        if(block && afpForBlock){

            responseStructure.blocks.push(block)

            responseStructure.afpForLatest = afpForBlock

        }else if(block && data.sendWithNoAfp && data.sendWithNoAfp.index === block.index){

            responseStructure.blocks.push(block)

        }else break

    }

    connection.sendUTF(JSON.stringify(responseStructure))

}




let WebSocketServer = WS.server

let server = http.createServer({},(_,response)=>{

    response.writeHead(404)

    response.end()

})


server.listen(global.CONFIG.SYMBIOTE.WEBSOCKET_PORT,global.CONFIG.SYMBIOTE.WEBSOCKET_INTERFACE,()=>

    LOG(`Websocket server was activated on \u001b[38;5;168m${global.CONFIG.SYMBIOTE.WEBSOCKET_INTERFACE}:${global.CONFIG.SYMBIOTE.WEBSOCKET_PORT}`,'CD')
    
)


let WEBSOCKET_SERVER = new WebSocketServer({
    
    httpServer: server,

    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false,

    maxReceivedMessageSize: 1024*1024*50 // 50 Mb

})




WEBSOCKET_SERVER.on('request',request=>{

    let connection = request.accept('echo-protocol', request.origin)

    connection.on('message',message=>{

        if (message.type === 'utf8') {

            let data = JSON.parse(message.utf8Data)

            if(data.route==='get_finalization_proof'){

                RETURN_FINALIZATION_PROOF_FOR_BLOCK(data,connection)

            }else if(data.route==='tmb'){

                // For TMB(Trust Me Bro) requests

                RETURN_FINALIZATION_PROOF_BASED_ON_TMB_PROOF(data,connection)
                

            }else if(data.route==='get_blocks'){

                RETURN_BLOCKS_RANGE(data,connection)

            }

            else{

                connection.close(1337,'No available route. You can use <get_commitment_for_block_range> | <get_finalization_proof_for_range>')

            }

        }
    
    })
    
    connection.on('close',()=>{})

    connection.on('error',()=>{})

})