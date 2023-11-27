import {CHECK_AGGREGATED_SKIP_PROOF_VALIDITY,CHECK_ASP_CHAIN_VALIDITY,GET_BLOCK,VERIFY_AGGREGATED_FINALIZATION_PROOF} from '../verification.js'

import{BODY,BLAKE3,LOG,ED25519_SIGN_DATA,ED25519_VERIFY} from '../../../KLY_Utils/utils.js'

import EPOCH_EDGE_OPERATIONS_VERIFIERS from '../epochEdgeOperationsVerifiers.js'

import {VERIFY_AGGREGATED_EPOCH_FINALIZATION_PROOF} from '../life.js'

import {GET_MAJORITY,USE_TEMPORARY_DB} from '../utils.js'

import Block from '../essences/block.js'

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
 * // Object like this
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
let RETURN_FINALIZATION_PROOF_FOR_RANGE=async(parsedData,connection)=>{

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    // Check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
        
    if(!tempObject || tempObject.SYNCHRONIZER.has('TIME_TO_NEW_EPOCH')){

        connection.close()
    
        return
    
    }


    let {block,previousBlockAFP} = parsedData

    let overviewIsOk = typeof block === 'object' && typeof previousBlockAFP === 'object' && !tempObject.SKIP_HANDLERS.has(block.creator) && !tempObject.SYNCHRONIZER.has('CREATING_SKIP_HANDLER:'+block.creator)


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
    
        let primePoolPubKey, itIsReservePoolWhichIsAuthorityNow


        if(poolIsReal){
    
            if(itsPrimePool) primePoolPubKey = block.creator
    
            else if(typeof tempObject.REASSIGNMENTS.get(block.creator) === 'string'){
    
                primePoolPubKey = tempObject.REASSIGNMENTS.get(block.creator)
    
                itIsReservePoolWhichIsAuthorityNow = true
    
            }
    
        }

        let thisAuthorityCanGenerateBlocksNow = poolIsReal && ( itIsReservePoolWhichIsAuthorityNow || itsPrimePool )
    
        if(!thisAuthorityCanGenerateBlocksNow){
    
            connection.close()

            tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+block.creator)
    
            return
    
        }

        
        // Make sure that we work in a sync mode + verify the signature for the latest block
    
        let metadataFromEpochManagerForThisPool = tempObject.EPOCH_MANAGER.get(block.creator) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}

        let proposedBlockHash = Block.genHash(block)

        // Check that a new proposed block is a part of a valid segment

        let sameSegment = metadataFromEpochManagerForThisPool.index < block.index || metadataFromEpochManagerForThisPool.index === block.index && proposedBlockHash === metadataFromEpochManagerForThisPool.hash


        if(sameSegment){

            let proposedBlockID = epochHandler.id+':'+block.creator+':'+block.index

            let futureMetadataToStore


            if(await ED25519_VERIFY(proposedBlockHash,block.sig,block.creator).catch(()=>false)){

                if(metadataFromEpochManagerForThisPool.index === block.index){

                    futureMetadataToStore = metadataFromEpochManagerForThisPool
    
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
                            2) All the ASPs for previous pools in reassignment chains in section block.extraData.reassignments(in case the block creator is not a prime pool)

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
                            
                    ).catch(()=>false) && block.extraData.aefpForPreviousEpoch.subchain === primePoolPubKey

                        
                    //_________________________________________2_________________________________________


                    let reassignmentArray = epochHandler.reassignmentChains[primePoolPubKey]

                    let positionOfBlockCreatorInReassignmentChain = reassignmentArray.indexOf(block.creator)

                    let aspChainIsOk = itsPrimePool || await CHECK_ASP_CHAIN_VALIDITY(
        
                        primePoolPubKey,
        
                        block,

                        reassignmentArray,
        
                        positionOfBlockCreatorInReassignmentChain,
        
                        epochFullID,
        
                        epochHandler

                    ).then(value=>value.isOK).catch(()=>false)


                    if(!aefpIsOk || !aspChainIsOk){

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


                // Store the metadata for EPOCH_MANAGER

                USE_TEMPORARY_DB('put',tempObject.DATABASE,block.creator,futureMetadataToStore).then(()=>

                    // Store the block
    
                    global.SYMBIOTE_META.BLOCKS.put(proposedBlockID,block).then(()=>{

                        // Store the AFP for previous block

                        let {prevBlockHash,blockID,blockHash,proofs} = previousBlockAFP

                        global.SYMBIOTE_META.EPOCH_DATA.put('AFP:'+previousBlockID,{prevBlockHash,blockID,blockHash,proofs}).then(async()=>{

                            tempObject.EPOCH_MANAGER.set(block.creator,futureMetadataToStore)
    

                            let dataToSign = (previousBlockAFP.blockHash || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')+proposedBlockID+proposedBlockHash+epochFullID
        
                            let finalizationProof = await ED25519_SIGN_DATA(dataToSign,global.PRIVATE_KEY)
    
    
                            tempObject.SYNCHRONIZER.delete('GENERATE_FINALIZATION_PROOFS:'+block.creator)
        
                            connection.sendUTF(JSON.stringify({voter:global.CONFIG.SYMBIOTE.PUB,finalizationProof,votedForHash:proposedBlockHash}))
    

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




let RETURN_BLOCKS_RANGE = async(data,connection)=>{

    // We need to send range of blocks from <heightThatUserHave+1> to <heightThatUserHave+499> or less(limit is up to 500 blocks). Also, send the AFP for latest block
    // Also, the response structure is {blocks:[],afpForLatest}

    let responseStructure = {

        blocks:[],

        afpForLatest:{}

    }

    
    for(let i=1;i<500;i++){

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


server.listen(global.CONFIG.WEBSOCKET_PORT,global.CONFIG.WEBSOCKET_INTERFACE,()=>LOG(`Websocket server was activated on port \u001b[38;5;168m${global.CONFIG.WEBSOCKET_PORT}`,'CD'))


let WEBSOCKET_SERVER = new WebSocketServer({
    
    httpServer: server,

    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false

})




WEBSOCKET_SERVER.on('request',request=>{

    let connection = request.accept('echo-protocol', request.origin)

    connection.on('message',message=>{

        if (message.type === 'utf8') {

            let data = JSON.parse(message.utf8Data)

            if(data.route==='get_finalization_proof'){

                RETURN_FINALIZATION_PROOF_FOR_RANGE(data,connection)

            }else if(data.route==='tmb'){

                // For TMB(Trust Me Bro) requests
                

            }else if(data.route==='accept_afp'){

                // ACCEPT_AGGREGATED_FINALIZATION_PROOF(data.payload,connection)

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




let ED25519_PUBKEY_FOR_FILTER = global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY || global.CONFIG.SYMBIOTE.PUB,




/**
 * 
 * # Info
 * 
 * Handler to accept AGGREGATED_FINALIZATION_PROOFs
 * 
 * # Input format
 * 
 * 
 * ```js
 * 
 *      {
 *
 *           prevBlockHash:"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
 *
 *           blockID:"1369:9GQ46rqY238rk2neSwgidap9ww5zbAN4dyqyC7j5ZnBK:1336",
 *           
 *           blockHash:"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
 *
 *           proofs:{
 *
 *               validatorEd25519PubKey0:"hisEd25519Signa",
 *               ...
 *               validatorEd25519PubKeyN:"hisEd25519Signa"
 *
 *           }
 *           
 *      }
 * 
 * ```
 * 
 */
acceptAggregatedFinalizationProof=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)


    if(!tempObject){

        !response.aborted && response.end(JSON.stringify({err:'Epoch is not fresh'}))

        return
    }

    
   
    let possibleAggregatedFinalizationProof = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)

    let {prevBlockHash,blockID,blockHash,proofs} = possibleAggregatedFinalizationProof

    let quorumSignaIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(possibleAggregatedFinalizationProof,epochHandler)


    if(quorumSignaIsOk){

        await global.SYMBIOTE_META.EPOCH_DATA.put('AFP:'+blockID,{prevBlockHash,blockID,blockHash,proofs}).catch(()=>{})

        !response.aborted && response.end(JSON.stringify({status:'OK'}))

    }else !response.aborted && response.end(JSON.stringify({err:`Something wrong => signa_is_ok:${quorumSignaIsOk}`}))


}),




/*

To return AGGREGATED_FINALIZATION_PROOF related to some block PubX:Index

Only in case when we have AGGREGATED_FINALIZATION_PROOF we can verify block with the 100% garantee that it's the part of valid subchain and will be included to epoch

Params:

    [0] - blockID in format EpochID:BlockCreatorEd25519PubKey:IndexOfBlockInEpoch. Example 733:9H9iFRYHgN7SbZqPfuAkE6J6brPd4B5KzW5C6UzdGwxz:99

Returns:

    {
        prevBlockHash,
        blockID,
        blockHash,
        proofs:{

            signerPubKey:ed25519Signature,
            ...

        }
        
    }

*/
getAggregatedFinalizationProof=async(response,request)=>{

    response.onAborted(()=>response.aborted=true).writeHeader('Access-Control-Allow-Origin','*')


    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.GET_AGGREGATED_FINALIZATION_PROOFS){

        let epochFullID = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.id

        if(!global.SYMBIOTE_META.TEMP.has(epochFullID)){

            !response.aborted && response.end(JSON.stringify({err:'Epoch handler on QT is not ready'}))

            return
        }

        let blockID = request.getParameter(0)
       
        let aggregatedFinalizationProof = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+blockID).catch(()=>false)


        if(aggregatedFinalizationProof){

            !response.aborted && response.end(JSON.stringify(aggregatedFinalizationProof))

        }else !response.aborted && response.end(JSON.stringify({err:'No proof'}))

    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},





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
getAggregatedEpochFinalizationProof=async(response,request)=>{

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

},




acceptEpochFinishProposition=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

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


}),




/*


[Info]:

    Function to return signature of reassignment proof if we have SKIP_HANDLER for requested subchain
    
    Returns the signature if requested height to skip >= than our own
    
    Otherwise - send the UPDATE message with FINALIZATION_PROOF 



[Accept]:

    {

        poolPubKey,

        subchain

        afpForFirstBlock:{

            prevBlockHash
            blockID,    => epochID:poolPubKey:0
            blockHash,
            proofs:{

                pubkey0:signa0,         => SIG(prevBlockHash+blockID+blockHash+QT.EPOCH.HASH+"#"+QT.EPOCH.id)
                ...
                pubkeyN:signaN

            }

        }

        skipData:{

            index,
            hash,

            afp:{
                
                prevBlockHash,
                blockID,
                blockHash,

                proofs:{
                     
                    pubKey0:signa0,         => prevBlockHash+blockID+hash+QT.EPOCH.HASH+"#"+QT.EPOCH.id
                    ...
                        
                }

            }

        }

    }


[Response]:


[1] In case we have skip handler for this pool in SKIP_HANDLERS and if <skipData> in skip handler has <= index than in <skipData> from request we can response

    Also, bear in mind that we need to sign the hash of ASP for previous pool (field <previousAspHash>). We need this to verify the chains of ASPs by hashes not signatures.



    This will save us in case of a large number of ASPs that need to be checked
    
    Inserting an ASP hash for a pool that is 1 position earlier allows us to check only 1 signature and N hashes in the ASP chain
    
    Compare this with a case when we need to verify N signatures
    
    Obviously, the hash generation time and comparison with the <previousAspHash> field is cheaper than checking the aggregated signature (if considered within the O notation)
        

    Finally, we'll send this object as response

    {
        type:'OK',
        sig: ED25519_SIG('SKIP:<poolPubKey>:<previousAspHash>:<firstBlockHash>:<index>:<hash>:<epochFullID>')
    }


[2] In case we have bigger index in skip handler than in proposed <skipData> - response with 'UPDATE' message:

    {
        type:'UPDATE',
                        
        skipData:{

            index,
            hash,

            afp:{
                
                prevBlockHash,
                blockID,
                blockHash,

                proofs:{
                     
                    pubKey0:signa0,         => prevBlockHash+blockID+blockHash+QT.EPOCH.hash+"#"+QT.EPOCH.id
                    ...
                        
                }

            }

        }
                        
    }
    

*/
getReassignmentProof=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    if(!tempObject){

        !response.aborted && response.end(JSON.stringify({err:'Epoch handler on QT is not ready'}))

        return
    }


    let mySkipHandlers = tempObject.SKIP_HANDLERS

    let requestForSkipProof = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)

    let overviewIsOk = typeof requestForSkipProof === 'object' && epochHandler.reassignmentChains[requestForSkipProof.subchain] && mySkipHandlers.has(requestForSkipProof.poolPubKey)
    
                       &&
                       
                       typeof requestForSkipProof.skipData === 'object' && (requestForSkipProof.skipData.index === -1  || typeof requestForSkipProof.skipData.afp === 'object')


    if(overviewIsOk){

        
        
        let {index,hash,afp} = requestForSkipProof.skipData

        let localSkipHandler = mySkipHandlers.get(requestForSkipProof.poolPubKey)



        // We can't sign the reassignment proof in case requested height is lower than our local version of aggregated commitments. So, send 'UPDATE' message
        if(localSkipHandler.skipData && localSkipHandler.skipData.index > index){

            let responseData = {
                
                type:'UPDATE',

                skipData:localSkipHandler.skipData // {index,hash,afp:{prevBlockHash,blockID,blockHash,proofs:{quorumMember0:signa,...,quorumMemberN:signaN}}}

            }

            !response.aborted && response.end(JSON.stringify(responseData))


        }else{

           
            //________________________________________________ Verify the proposed AFP ________________________________________________
            
            // For speed we started to use Ed25519 instead of BLS again
            
            let afpInSkipDataIsOk = false

            if(index > -1 && typeof afp.blockID === 'string'){

                let [_epochID,_blockCreator,indexOfBlockInAfp] = afp.blockID.split(':')

                if(typeof afp === 'object' && afp.blockHash === hash && index == indexOfBlockInAfp){

                    afpInSkipDataIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(afp,epochHandler)

                }

            }else afpInSkipDataIsOk = true

            
            if(!afpInSkipDataIsOk){

                !response.aborted && response.end(JSON.stringify({err:'Wrong aggregated signature for skipIndex > -1'}))

                return

            }


            //_____________________ Verify the AFP for the first block to understand the hash of first block ______________________________

            // We need the hash of first block to fetch it over the network and extract the ASP for previous pool in reassignment chain, take the hash of it and include to final signature
            

            let dataToSignForSkipProof, firstBlockAfpIsOk = false


            /*
            
                We also need the hash of ASP for previous pool

                In case index === -1 it's a signal that no block was created, so no ASPs for previous pool. Sign the nullhash(0123456789ab...)

                Otherwise - find block, compare it's hash with <requestForSkipProof.afpForFirstBlock.prevBlockHash>

                In case hashes match - extract the ASP for previous pool <epochHandler.reassignmentChains[subchain][indexOfThis-1]>, get the BLAKE3 hash and paste this hash to <dataToSignForSkipProof>
            
                [REMINDER]: Signature structure is ED25519_SIG('SKIP:<poolPubKey>:<previousAspHash>:<firstBlockHash>:<index>:<hash>:<epochFullID>')

            */

            let indexInReassignmentChainForRequestedPool = epochHandler.reassignmentChains[requestForSkipProof.subchain].indexOf(requestForSkipProof.poolPubKey)

            // In case indexInReassignmentChainForRequestedPool === -1 - this means that previousPoolPubKey will be equal to prime pool pubkey(===subchainID)
            let previousPoolPubKey = epochHandler.reassignmentChains[requestForSkipProof.subchain][indexInReassignmentChainForRequestedPool-1] || requestForSkipProof.subchain


            if(index === -1){

                // If skipIndex is -1 then sign the hash '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'(null,default hash) as the hash of firstBlockHash
                
                dataToSignForSkipProof = `SKIP:${requestForSkipProof.poolPubKey}:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:${index}:${'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'}:${epochFullID}`

                firstBlockAfpIsOk = true


            }else if(index > 0 && typeof requestForSkipProof.afpForFirstBlock === 'object'){

                // Verify the aggregatedFinalizationProofForFirstBlock in case skipIndex > 0

                let blockIdOfFirstBlock = epochHandler.id+':'+requestForSkipProof.poolPubKey+':0'
            
                if(await VERIFY_AGGREGATED_FINALIZATION_PROOF(requestForSkipProof.afpForFirstBlock,epochHandler) && requestForSkipProof.afpForFirstBlock.blockID === blockIdOfFirstBlock){

                    let block = await GET_BLOCK(epochHandler.id,requestForSkipProof.poolPubKey,0)

                    if(block && Block.genHash(block) === requestForSkipProof.afpForFirstBlock.blockHash){

                        // In case it's prime pool - it has the first position in own reassignment chain. That's why, the hash of ASP for previous pool will be null(0123456789ab...)

                        let hashOfAspForPreviousPool = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

                        if(block.extraData.reassignments){

                            hashOfAspForPreviousPool = BLAKE3(JSON.stringify(block.extraData.reassignments[previousPoolPubKey]))

                        }

                        let firstBlockHash = requestForSkipProof.afpForFirstBlock.blockHash

                        dataToSignForSkipProof = `SKIP:${requestForSkipProof.poolPubKey}:${hashOfAspForPreviousPool}:${firstBlockHash}:${index}:${hash}:${epochFullID}`

                        firstBlockAfpIsOk = true                    
    
                    }

                }

            }
            
            // If proof is ok - generate reassignment proof

            if(firstBlockAfpIsOk){

                let skipMessage = {
                    
                    type:'OK',

                    sig:await ED25519_SIGN_DATA(dataToSignForSkipProof,global.PRIVATE_KEY)
                }

                !response.aborted && response.end(JSON.stringify(skipMessage))

                
            }else !response.aborted && response.end(JSON.stringify({err:`Wrong signatures in <afpForFirstBlock>`}))

             
        }


    }else !response.aborted && response.end(JSON.stringify({err:'Wrong format'}))


}),




/*

[Info]:

    Once quorum member who already have ASP get the 2/3N+1 approvements
    
    for reassignment it can produce finalization proofs for the next reserve pool in (QT/VT).EPOCH.REASSIGNMENT_CHAINS[<primePool>]
    
    and start to monitor health for this pool


[Accept]:

{

    subchain:primePoolPubKey,
    indexOfNext,
    session:<32-bytes hex string>

}


[Response]:

If we also have an <aggregatedSkipProof> in our local SKIP_HANDLERS[<poolPubKey>] - we can vote for reassignment:

Response => {type:'OK',sig:ED25519_SIG(`REASSIGNMENT:<poolPubKey>:<session>:<epochFullID>`)}

Otherwise => {type:'ERR'}

*/
getReassignmentReadyStatus=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let qtEpochHandler  = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = qtEpochHandler.hash+"#"+qtEpochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    if(!tempObject){

        !response.aborted && response.end(JSON.stringify({err:'Epoch is not fresh'}))

        return
    }

    
    let {subchain,indexOfNext,session} = await BODY(bytes,global.CONFIG.PAYLOAD_SIZE)


    if(typeof subchain === 'string' && typeof indexOfNext === 'number' && typeof session === 'string' && session.length === 64 && qtEpochHandler.reassignmentChains[subchain]){

        let pubKeyOfPoolThatWeAreGoingToSkip = qtEpochHandler.reassignmentChains[subchain][indexOfNext-1] || subchain

        let skipHandler = tempObject.SKIP_HANDLERS.get(pubKeyOfPoolThatWeAreGoingToSkip)

        let weHaveSentAlertToThisPool = tempObject.TEMP_CACHE.get(`SENT_ALERT:${subchain}:${indexOfNext}`) || await USE_TEMPORARY_DB('get',tempObject.DATABASE,`SENT_ALERT:${subchain}:${indexOfNext}`).catch(()=>false)


        if(skipHandler && skipHandler.aggregatedSkipProof && weHaveSentAlertToThisPool){
    
            let signatureToResponse = await ED25519_SIGN_DATA(`REASSIGNMENT:${pubKeyOfPoolThatWeAreGoingToSkip}:${session}:${epochFullID}`,global.PRIVATE_KEY)
    
            !response.aborted && response.end(JSON.stringify({type:'OK',sig:signatureToResponse}))
    
        }else !response.aborted && response.end(JSON.stringify({type:'ERR'}))
    

    }else !response.aborted && response.end(JSON.stringify({type:'ERR'}))


}),




/*


[Info]:

    Route to ask for <aggregatedSkipProof>(s) in function TEMPORARY_REASSIGNMENTS_BUILDER()


[Accept]:

    Nothing


[Returns]:

Object like {

    primePoolPubKey(subchainID) => {currentAuthorityIndex,firstBlockByCurrentAuthority,afpForSecondBlockByCurrentAuthority}

}

___________________________________________________________

[0] currentAuthorityIndex - index of current authority for subchain X. To get the pubkey of subchain authority - take the QUORUM_THREAD.EPOCH.REASSIGNMENT_CHAINS[<primePool>][currentAuthorityIndex]

[1] firstBlockByCurrentAuthority - default block structure.Send exactly first block to allow client to reverse the chain and understand how to continue the work on verification thread

[2] afpForSecondBlockByCurrentAuthority - default AFP structure -> 


    {
        prevBlockHash:<here will be the hash of block with index 0 - the first block in epoch by pool>
        blockID,
        blockHash,
        aggregatedSignature:<>, // prevBlockHash+blockID+hash+QT.EPOCH.HASH+"#"+QT.EPOCH.id
        aggregatedPub:<>,
        afkVoters
        
    }


*/
getDataForTempReassignments = async response => {

    response.onAborted(()=>response.aborted=true)

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.GET_DATA_FOR_TEMP_REASSIGN){

        let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

        let quorumThreadEpochFullID = epochHandler.hash+"#"+epochHandler.id

        let quorumThreadEpochIndex = epochHandler.id

        let tempObject = global.SYMBIOTE_META.TEMP.get(quorumThreadEpochFullID)

        if(!tempObject){
    
            !response.aborted && response.end(JSON.stringify({err:'Epoch handler on QT is not ready'}))
    
            return
        }

        // Get the current authorities for subchains from REASSIGNMENTS

        let currentPrimePools = epochHandler.poolsRegistry.primePools // [primePool0, primePool1, ...]

        let templateForResponse = {} // primePool => {currentAuthorityIndex,firstBlockByCurrentAuthority,afpForSecondBlockByCurrentAuthority}

        for(let primePool of currentPrimePools){

            // Get the current authority

            let reassignmentHandler = tempObject.REASSIGNMENTS.get(primePool) // primePool => {currentAuthority:<number>}

            if(reassignmentHandler){

                let currentAuthorityIndex = reassignmentHandler.currentAuthority

                let currentSubchainAuthority = currentAuthorityIndex === -1 ? primePool : epochHandler.reassignmentChains[primePool][currentAuthorityIndex]

                // Now get the first block & AFP for it

                let firstBlockID = quorumThreadEpochIndex+':'+currentSubchainAuthority+':0'

                let firstBlockByCurrentAuthority = await global.SYMBIOTE_META.BLOCKS.get(firstBlockID).catch(()=>null)

                if(firstBlockByCurrentAuthority){

                    // Finally, find the AFP for block with index 1 to approve that block 0 will be 100% accepted by network

                    let secondBlockID = quorumThreadEpochIndex+':'+currentSubchainAuthority+':1'

                    let afpForSecondBlockByCurrentAuthority = await global.SYMBIOTE_META.EPOCH_DATA.get('AFP:'+secondBlockID).catch(()=>null)

                    // Put to response

                    templateForResponse[primePool]={

                        currentAuthorityIndex,
                        
                        firstBlockByCurrentAuthority,
                        
                        afpForSecondBlockByCurrentAuthority
                        
                    }

                }

            }

        }

        // Finally, send the <templateForResponse> back

        !response.aborted && response.end(JSON.stringify(templateForResponse))


    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},




/*


Function to return the current information about authorities on subchains


[Params]:

    Nothing

[Returns]:

    {
        "subchain0":{

            currentAuthorityIndex:<number>,

            aspForPrevious:{

                previousAspHash,

                firstBlockHash,

                skipIndex,

                skipHash,

                proofs:{

                    quorumMemberPubKey0:hisEd25519Signa,
                    ...                                                 => 'SKIP:<poolPubKey>:<firstBlockHash>:<skipIndex>:<skipHash>:<epochFullID>'
                    quorumMemberPubKeyN:hisEd25519Signa

                }

            }

        }
    }


*/
getCurrentSubchainAuthorities = async response => {

    response.onAborted(()=>response.aborted=true)

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.GET_CURRENT_SUBCHAINS_AUTHORITIES){

        let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

        let quorumThreadEpochFullID = epochHandler.hash+"#"+epochHandler.id

        let tempObject = global.SYMBIOTE_META.TEMP.get(quorumThreadEpochFullID)

        if(!tempObject){
    
            !response.aborted && response.end(JSON.stringify({err:'Epoch handler on QT is not ready'}))
    
            return
        }

        // Get the current authorities for subchains from REASSIGNMENTS

        let currentPrimePools = epochHandler.poolsRegistry.primePools // [primePool0, primePool1, ...]

        let templateForResponse = {} // primePool => {currentAuthorityIndex,aspForPrevious}

        for(let primePool of currentPrimePools){

            // Get the current authority

            let reassignmentHandler = tempObject.REASSIGNMENTS.get(primePool) // primePool => {currentAuthority:<number>}

            if(reassignmentHandler){

                let currentAuthorityIndex = reassignmentHandler.currentAuthority

                // Also, we need to send the ASP for previous pool in reassignment chain as a proof of valid move to current authority

                let aspForPrevious

                if(currentAuthorityIndex === 0){

                    // If current authority is 0 this is a signal that previous was prime pool (index = -1)

                    aspForPrevious = tempObject.SKIP_HANDLERS.get(primePool)?.aggregatedSkipProof

                }else if (currentAuthorityIndex > 0){

                    let previousAuthorityPubKey = epochHandler.reassignmentChains[primePool][currentAuthorityIndex-1]

                    aspForPrevious = tempObject.SKIP_HANDLERS.get(previousAuthorityPubKey)?.aggregatedSkipProof

                }

                templateForResponse[primePool] = {currentAuthorityIndex,aspForPrevious}

            }

        }

        // Finally, send the <templateForResponse> back

        !response.aborted && response.end(JSON.stringify(templateForResponse))


    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},




/*


[Info]:

    Handler to accept ASP and start the instant reassignment procedure

[Accept]:


    {
        subchain:<subchain ID - pubkey of prime pool>,

        shouldBeThisAuthority:<number>

        aspsForPreviousPools:{

            "poolPubKeyX":{

                previousAspHash,

                firstBlockHash,

                skipIndex,

                skipHash,

                proofs:{

                    quorumMemberPubKey0:hisEd25519Signa,
                    ...
                    quorumMemberPubKeyN:hisEd25519Signa

                }

            },


            "poolPubKeY":{

                previousAspHash,

                firstBlockHash,

                skipIndex,

                skipHash,

                proofs:{

                    quorumMemberPubKey0:hisEd25519Signa,
                    ...
                    quorumMemberPubKeyN:hisEd25519Signa

                }

            },

            ... (we need to send ASPs for all the pools from index <shouldBeThisAuthority-1> until the beginning of reassignment chain. We can stop when .skipIndex of some ASP won't be -1)


        }

    }

    _________________________ What to do next _________________________

    1) Get the local reassignment data for proposed subchain => localReassignmentData = tempObject.REASSIGNMENTS.get(subchain)

    2) In case localReassignmentData.currentAuthority < obj[<subchain>].shouldBeThisAuthority => verify the ASPs
    
    3) In case all the ASPs are ok - create the CREATE_REASSIGNMENT request and push it to tempObject.SYNCHRONIZER to update the local info about reassignment

    4) Inside function REASSIGN_PROCEDURE_MONITORING check the requests and update the local reassignment data


*/
acceptReassignment=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    if(!tempObject){

        !response.aborted && response.end(JSON.stringify({err:'Epoch handler on QT is not ready'}))

        return
    }


    
    let possibleReassignmentPropositionForSubchain = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)


    if(typeof possibleReassignmentPropositionForSubchain === 'object'){


        // Parse reassignment proposition
        let {subchain,shouldBeThisAuthority,aspsForPreviousPools} = possibleReassignmentPropositionForSubchain


        if(typeof subchain !== 'string' || !epochHandler.poolsRegistry.primePools.includes(subchain) || typeof shouldBeThisAuthority !== 'number' || typeof aspsForPreviousPools !== 'object'){

            !response.aborted && response.end(JSON.stringify({err:'Wrong format of proposition components or no such subchain'}))

            return

        }

        let localRcHandlerForSubchain = tempObject.REASSIGNMENTS.get(subchain) || {currentAuthority:-1}

        // Compare the .currentAuthority indexes to make sure that proposed authority has the bigger index 

        if(localRcHandlerForSubchain.currentAuthority < shouldBeThisAuthority){

            // Verify the ASP for pool with index <shouldBeThisAuthority-1> in reassignment chain
            // If ok - create the CREATE_REASSIGNMENT:<subchain> request and push to synchronizer
            // Due to Node.js work principles - check the indexes right before push

            let pubKeyOfSkippedPool = epochHandler.reassignmentChains[subchain][shouldBeThisAuthority-1] || subchain

            let aspForSkippedPool = aspsForPreviousPools[pubKeyOfSkippedPool]

            let aspIsOk = await CHECK_AGGREGATED_SKIP_PROOF_VALIDITY(pubKeyOfSkippedPool,aspForSkippedPool,epochFullID,epochHandler)
            
            if(aspIsOk) {

                let indexInReassignmentChain = shouldBeThisAuthority-2 // -2 because we checked -1 position

                while(indexInReassignmentChain >= -1){

                    let currentPoolToVerify = epochHandler.reassignmentChains[subchain][indexInReassignmentChain] || subchain

                    let nextPoolInRC = epochHandler.reassignmentChains[subchain][indexInReassignmentChain+1]

                    let nextAspInChain = aspsForPreviousPools[nextPoolInRC]

                    // First of all - check if we already have ASP locally. If so, skip verification because we already have a valid & verified ASP

                    let currentAspToVerify = aspsForPreviousPools[currentPoolToVerify]

                    let currentAspIsOk = BLAKE3(JSON.stringify(currentAspToVerify) === nextAspInChain.previousAspHash)

 
                    if(currentAspIsOk){

                        // Verify all the ASP until skipIndex != -1
                        if(currentAspToVerify.skipIndex > -1) break // no sense to verify more

                        indexInReassignmentChain -- // otherwise - move to previous pool in rc

                    }else{

                        !response.aborted && response.end(JSON.stringify({err:'Wrong ASP in chain'}))

                        return

                    }

                }

                /*
                
                    Create the request to update the local reassignment data
                
                    But, finally check if no other request for reassignment wasn't accepted in async mode via concurrent request to this handler
                    
                    Node.js will read the data from mapping, compare .shouldBeThisAuthority property and add new request in case index is bigger - and all these ops in sync mode
                
                */
                
                let concurrentRequest = tempObject.SYNCHRONIZER.get('CREATE_REASSIGNMENT:'+subchain)


                if(!concurrentRequest || concurrentRequest && concurrentRequest.shouldBeThisAuthority < shouldBeThisAuthority){

                    tempObject.SYNCHRONIZER.set('CREATE_REASSIGNMENT:'+subchain,{shouldBeThisAuthority,aspsForPreviousPools})

                }

                !response.aborted && response.end(JSON.stringify({status:'OK'}))

            } else !response.aborted && response.end(JSON.stringify({err:'One of ASP is wrong'}))

        } else !response.aborted && response.end(JSON.stringify({err:'Local version of current subchain authority has the bigger index'}))

    }else !response.aborted && response.end(JSON.stringify({err:'Wrong format'}))


}),




/*

Body is


{
    
    type:<operation id> ===> STAKING_CONTRACT_CALL | SLASH_UNSTAKE | UPDATE_RUBICON , etc. See ../epochEdgeOperationsVerifiers.js
    
    payload:{}

}

    * Payload has different structure depending on type of EEO


*/

epochEdgeOperationsVerifier=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    
    let epochEdgeOperation = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)

    let epochFullID = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.id


    if(!global.SYMBIOTE_META.TEMP.has(epochFullID)){

        !response.aborted && response.end(JSON.stringify({err:'Epoch handler on QT is not ready'}))

        return
    }


    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.EPOCH_EDGE_OPERATIONS){

        !response.aborted && response.end(JSON.stringify({err:`Route is off. This node don't accept epoch edge operations`}))

        return
    }

    //Verify and if OK - generate signature and return

    if(EPOCH_EDGE_OPERATIONS_VERIFIERS[epochEdgeOperation.type]){

        let possibleEpochEdgeOperation = await EPOCH_EDGE_OPERATIONS_VERIFIERS[epochEdgeOperation.type](epochEdgeOperation.payload,true,false).catch(error=>({isError:true,error})) // it's just verify without state changes

        if(possibleEpochEdgeOperation?.isError){
            
            !response.aborted && response.end(JSON.stringify({err:`Verification failed. Reason => ${JSON.stringify(possibleEpochEdgeOperation)}`}))

        }
        else if(possibleEpochEdgeOperation){

            // Generate signature

            let signature = await ED25519_SIGN_DATA(

                BLAKE3(JSON.stringify(possibleEpochEdgeOperation)+epochFullID),

                global.PRIVATE_KEY

            )

            !response.aborted && response.end(JSON.stringify({

                signer:global.CONFIG.SYMBIOTE.PUB,
                
                signature

            }))
       
        }
        else !response.aborted && response.end(`Verification failed.Check your input data carefully. The returned object from function => ${JSON.stringify(possibleEpochEdgeOperation)}`)

    }else !response.aborted && response.end(`No verification function for this system sync operation => ${epochEdgeOperation.type}`)

}),




// To accept system sync operation, verify that majority from quorum agree with it and add to mempool

/*


    {

        aggreementProofs:{

            quorumMemberPubKey0:ED25519_SIGN(BLAKE3( JSON(epochEdgeOperation) + epochFullID)),
            ...
            quorumMemberPubKeyN:<>                

        }

        epochEdgeOperation:{<your operation here>}

    }




Returns object like:

    [If verification is OK and system sync operation was added to mempool]:

        {status:'OK'}

    [Else]:

        {err:''}



*/
epochEdgeOperationToMempool=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{


    let epochEdgeOperationWithAgreementProofs = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id


    if(!global.SYMBIOTE_META.TEMP.has(epochFullID)){

        !response.aborted && response.end(JSON.stringify({err:'Epoch handler on QT is not ready'}))

        return
    }

    
    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)


    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.EPOCH_EDGE_OPERATIONS){

        !response.aborted && response.end(JSON.stringify({err:`Route is off. This node don't accept epoch edge operations`}))

        return
    }


    if(typeof epochEdgeOperationWithAgreementProofs.epochEdgeOperation !== 'object' || typeof epochEdgeOperationWithAgreementProofs.aggreementProofs !== 'object'){

        !response.aborted && response.end(JSON.stringify({err:`Wrong format. Input data must contain <epochEdgeOperation>(your operation) and <agreementProofs>(aggregated version of verification proofs from quorum members majority)`}))

        return

    }

    // Verify agreement and if OK - add to mempool

    let hashOfEpochFullIDAndOperation = BLAKE3(

        JSON.stringify(epochEdgeOperationWithAgreementProofs.epochEdgeOperation) + epochFullID

    )


    let majority = GET_MAJORITY(epochHandler)

    let promises = []

    let okSignatures = 0


    for(let [signerPubKey,signa] of Object.entries(epochEdgeOperationWithAgreementProofs.aggreementProofs)){

        promises.push(ED25519_VERIFY(hashOfEpochFullIDAndOperation,signa,signerPubKey).then(isOK => isOK && epochHandler.quorum.includes(signerPubKey) && okSignatures++))

    }

    await Promise.all(promises)

    
    if(okSignatures >= majority){

        // Add to mempool
        
        tempObject.EPOCH_EDGE_OPERATIONS_MEMPOOL.push(epochEdgeOperationWithAgreementProofs.epochEdgeOperation)

        !response.aborted && response.end(JSON.stringify({status:`OK`}))
        

    } else !response.aborted && response.end(JSON.stringify({err:`Verification failed`}))

}),




// Format of body : <transaction>
acceptTransactions=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let transaction = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)
    
    //Reject all txs if route is off and other guards methods

    /*
    
        ...and do such "lightweight" verification here to prevent db bloating
        Anyway we can bump with some short-term desynchronization while perform operations over block
        Verify and normalize object
        Fetch values about fees and MC from some decentralized sources
    
        The second operand tells us:if buffer is full-it makes whole logical expression FALSE
        Also check if we have normalizer for this type of event

    
    */

    if(typeof transaction?.creator!=='string' || typeof transaction.nonce!=='number' || typeof transaction.sig!=='string'){

        !response.aborted && response.end(JSON.stringify({err:'Event structure is wrong'}))

        return
    }

    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.ACCEPT_TXS){
        
        !response.aborted && response.end(JSON.stringify({err:'Route is off'}))
        
        return
        
    }

    if(!global.SYMBIOTE_META.FILTERS[transaction.type]){

        !response.aborted && response.end(JSON.stringify({err:'No such filter. Make sure your <tx.type> is supported by current version of workflow runned on symbiote'}))
        
        return

    }

    
    if(global.SYMBIOTE_META.MEMPOOL.length < global.CONFIG.SYMBIOTE.TXS_MEMPOOL_SIZE){

        let filteredEvent=await global.SYMBIOTE_META.FILTERS[transaction.type](transaction,ED25519_PUBKEY_FOR_FILTER)

        if(filteredEvent){

            !response.aborted && response.end(JSON.stringify({status:'OK'}))

            global.SYMBIOTE_META.MEMPOOL.push(filteredEvent)
                        
        }else !response.aborted && response.end(JSON.stringify({err:`Can't get filtered value of tx`}))

    }else !response.aborted && response.end(JSON.stringify({err:'Mempool is fullfilled'}))

}),




/*

To add node to local set of peers to exchange data with

Params:

    [symbioteID,hostToAdd(initiator's valid and resolved host)]

    [0] - symbiote ID       EXAMPLE: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
    [1] - host to add       EXAMPLE: http://example.org | https://some.subdomain.org | http://cafe::babe:8888


Returns:

    'OK' - if node was added to local peers
    '<MSG>' - if some error occured

*/

addPeer=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{
    
    let acceptedData = await BODY(bytes,global.CONFIG.PAYLOAD_SIZE)

    if(!Array.isArray(acceptedData)){

        !response.aborted && response.end('Input must be a 2-elements array like [symbioteID,you_endpoint]')
        
        return

    }

    let [symbioteID,domain]=acceptedData
   
    if(global.GENESIS.SYMBIOTE_ID!==symbioteID){

        !response.aborted && response.end('Symbiotic chain not supported')
        
        return

    }

    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.NEW_NODES){

        !response.aborted && response.end('Route is off')
        
        return
    }
    
    if(typeof domain==='string' && domain.length<=256){
        
        //Add more advanced logic in future(or use plugins - it's even better)
        let nodes=global.SYMBIOTE_META.PEERS
        
        if(!(nodes.includes(domain) || global.CONFIG.SYMBIOTE.BOOTSTRAP_NODES.includes(domain))){
            
            nodes.length<global.CONFIG.SYMBIOTE.MAX_CONNECTIONS
            ?
            nodes.push(domain)
            :
            nodes[~~(Math.random() * nodes.length)]=domain//if no place-paste instead of random node
    
            !response.aborted && response.end('Your node has been added')
    
        }else !response.aborted && response.end('Your node already in scope')
    
    }else !response.aborted && response.end('Wrong types => endpoint(domain) must be 256 chars in length or less')

})








global.UWS_SERVER


//_______________________________ Consensus related routes _______________________________


// 3rd stage - logic with super finalization proofs. Accept AGGREGATED_FINALIZATION_PROOF(aggregated 2/3N+1 FINALIZATION_PROOFs from QUORUM members) ✅
.post('/aggregated_finalization_proof',acceptAggregatedFinalizationProof)

// Just GET route to return the AFP for block by it's id (reminder - BlockID structure is <epochID>:<blockCreatorPubKey>:<index of block in this epoch>) ✅
.get('/aggregated_finalization_proof/:BLOCK_ID',getAggregatedFinalizationProof)



//_______________________________ Routes to change epoch ________________________________



// Simple GET handler to return AEFP for given subchain and epoch ✅
.get('/aggregated_epoch_finalization_proof/:EPOCH_INDEX/:SUBCHAIN_ID',getAggregatedEpochFinalizationProof)

// Handler to acccept propositions to finish the epoch for subchains and return agreement to build AEFP - Aggregated Epoch Finalization Proof ✅
.post('/epoch_proposition',acceptEpochFinishProposition)



//______________________ Routes related to the reassignment procedure _________________________



// Function to return signature of reassignment proof if we have SKIP_HANDLER for requested pool. Return the signature if requested INDEX >= than our own or send UPDATE message with AGGREGATED_COMMITMENTS ✅
.post('/get_reassignment_proof',getReassignmentProof)

// Once quorum member who already have ASP get the 2/3N+1 approvements for reassignment it can produce commitments, finalization proofs for the next reserve pool in (QT/VT).EPOCH.reassignmentChains[<primePool>] and start to monitor health for this pool ✅
.post('/get_reassignment_ready_status',getReassignmentReadyStatus)

// We need this route for function TEMPORARY_REASSIGNMENTS_BUILDER() to build temporary reassignments. This function just return the ASP for some pools(if ASP exists locally) ✅
.get('/get_data_for_temp_reassign',getDataForTempReassignments)

// Get current subchains' authorities based on reassignment chains of current epoch ✅
.get('/get_current_subchain_authorities',getCurrentSubchainAuthorities)

// Handler to accept ASPs and to start forced reassignment
.post('/accept_reassignment',acceptReassignment)



//___________________________________ Other ___________________________________________



// Handler to accept system sync operation, verify it and sign if OK. The caller is EEO creator while verifiers - current quorum members ✅
.post('/sign_epoch_edge_operation',epochEdgeOperationsVerifier)

// Handler to accept EEO with 2/3N+1 aggregated agreements which proves that majority of current quorum verified this EEO and we can add it to block header ✅
.post('/epoch_edge_operation_to_mempool',epochEdgeOperationToMempool)

// Handler to accept transaction, make overview and add to mempool ✅
.post('/transaction',acceptTransactions)

// Handler to accept peers to exchange data with ✅
.post('/addpeer',addPeer)