import {getFromApprovementThreadState} from '../../common_functions/approvement_thread_related.js'

import {getFromState} from '../../common_functions/state_interactions.js'

import {CONFIGURATION, FASTIFY_SERVER} from '../../../../klyn74r.js'

import {BLOCKCHAIN_DATABASES} from '../../blockchain_preparation.js'




/**## Returns the data directrly from state
 * 
 * 
 * ### Info
 * 
 *  This GET route returns data from state - it might be account, contract metadata, contract storage, KLY-EVM address binding and so on!
 * 
 * 
 * ### Params
 * 
 *  + 0 - shardID - Base58 encoded 32-byte Ed25519 public key which is also ID of shard
 *  + 1 - cellID - identifier of what you want to get - contract ID, account address(Base58 ed25519,BLS,LRS,PQC,TSIG, and so on), etc.
 * 
 * 
 * ### Returns
 * 
 *  + JSON'ed value
 * 
 *  
 * */
FASTIFY_SERVER.get('/state/:shardID/:cellID',async(request,response)=>{


    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.FROM_STATE){

        let shardContext = request.params.shardID

        let cellID = request.params.cellID

        let fullID = shardContext === 'x' ? cellID : shardContext+':'+cellID

        let data = await BLOCKCHAIN_DATABASES.STATE.get(fullID).catch(()=>null)


        response

            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control','max-age='+CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.FROM_STATE)
        
            .send(data)
    
    }else response.send({err:'Trigger is off'})

})


// 0 - txid
FASTIFY_SERVER.get('/tx_receipt/:txid',(request,response)=>{

    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.TX_RECEIPT){

        response
        
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.TX_RECEIPT}`)
            

        BLOCKCHAIN_DATABASES.STATE.get('TX:'+request.params.txid).then(
            
            txReceipt => response.send(txReceipt)
            
        ).catch(()=>response.send({err:'No tx with such id'}))


    }else response.send({err:'Route is off'})

})




FASTIFY_SERVER.get('/pool_stats/:poolID',async(request,response)=>{


    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.POOL_STATS){

        // Take the info related to pool based on data in VT(verification thread) and AT(approvement thread)

        let poolOriginShard = await getFromState(`${request.params.poolID}_POINTER`)

        let poolMetadata = await getFromState(`${poolOriginShard}:${request.params.poolID}`)

        let poolStorage = await getFromState(`${poolOriginShard}:${request.params.poolID}_STORAGE_POOL`)


        response

            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control','max-age='+CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.POOL_STATS)
        
            .send({poolOriginShard,poolMetadata,poolStorage})

            
    }else response.send({err:'Trigger is off'})

})



/*

    API endpoint that is used for searchbar in explorer and useful for general purpose queries

    Supported filters:

        ✅ + block - to get block by ID or SID
        ✅ + account - to get info about EOA account or contract by id in format <shard>:<id>
        ✅ + txid - to get info about transaction by TXID
        ✅ + epoch - to get info about epoch by epoch full id (format <epoch_hash>#<epoch_index>)
        ✅ + pool - to get info about pool by id (format <pool_pubkey>(POOL))
        ✅ + storage - to get the key/value storage of some contract. Format (<shard>:<id>_STORAGE_<id>)

*/
FASTIFY_SERVER.get('/search_result/:filter/:to_find',async(request,response)=>{

    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.SEARCH_RESULT){

        response
        
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.SEARCH_RESULT}`)
            

        let searchFilter = request.params.filter

        let searchId = request.params.to_find

        let responseData




        if(searchFilter === 'block'){

            // Response with block + AFP(if exists)

            // searchId might be BlockID(in format epochIndex:poolCreator:index) or SID(in format shardID:index)

            let blockById = await BLOCKCHAIN_DATABASES.BLOCKS.get(searchId).catch(() => null)

            let block, blockId

            if(blockById){

                blockId = searchId

                block = blockById

            } else {

                block = await BLOCKCHAIN_DATABASES.STATE.get(`SID:${searchId}`).then(blockID => {

                    blockId = blockID
    
                    return BLOCKCHAIN_DATABASES.BLOCKS.get(blockID)
    
                }).catch(()=>null)

            }


            if(block){

                // Find AFP to show finalization status of block

                let aggregatedFinalizationProof = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get('AFP:'+blockId).catch(()=>null)

                responseData = {block, aggregatedFinalizationProof}

            } else responseData = {err:`No such block associated with ${searchId}. Make sure your BlockID or SID correct`}


        } else if (searchFilter === 'account'){
            
            // Just return EOA account or contract metadata from state

            responseData = await BLOCKCHAIN_DATABASES.STATE.get(searchFilter).catch(()=>({err:'No such EOA account or contract. Make sure input format is <shard>:<contract/address ID>'}))

        } else if (searchFilter === 'txid'){

            // Just return tx receipt and tx body from block

            let possibleTxReceipt = await BLOCKCHAIN_DATABASES.STATE.get('TX:'+searchFilter).catch(()=>({err:'No transaction with such TXID'}))

            if(!possibleTxReceipt.err){
                
                /*
                
                    It might be KLY transaction and EVM transaction

                    In case tx receipt has format {tx,receipt} - it's EVM transaction and we just send it as response

                    But in case it has format {blockID,isOk,reason} - it's KLY transaction. We need to get the body of transaction from appropriate block and response with {tx,receipt}
                
                */

                if(possibleTxReceipt.tx){

                    responseData = possibleTxReceipt

                } else {

                    let wishedTransaction = await BLOCKCHAIN_DATABASES.BLOCKS.get(possibleTxReceipt.blockID)
                        
                        .then( block => block.transactions[possibleTxReceipt.order]) // get the order of transaction from receipt, then fetch the block and extract the body of transaction from there
                        
                    .catch(()=>null)

                    responseData = {tx: wishedTransaction,receipt: possibleTxReceipt}



                }

            } else responseData = {err:`Impossible to get receipt of transaction. Make sure TXID is equal to BLAKE3 hash of tx signature`}

            
        } else if (searchFilter === 'epoch'){

            // Return the data from BLOCKCHAIN_DATABASES.EPOCH_DATA Epoch handler + list of epoch edge transactions

            // searchId is equal to epoch full id(in format epochHash#epochIndex) or epoch index

            let [epochHash, epochIndex] = searchId.split('#')

            let epochHandler = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get('EPOCH_HANDLER:'+epochIndex).catch(()=>null)

            let listOfEpochEdgeTransactions


            if(epochHash && epochIndex){

                // In case both valid - then it's request epoch data by full id (format epochHash#epochIndex)

                listOfEpochEdgeTransactions = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get('EPOCH_EDGE_TXS:'+searchId).catch(()=>null)


            } else {

                // Otherwise it's request of epoch data just by index

                // So, get the epoch hash from handler and build the full id to get the list of epoch edge transactions

                let epochFullID = epochHandler.hash+'#'+searchId

                listOfEpochEdgeTransactions = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get('EPOCH_EDGE_OPS:'+epochFullID).catch(()=>null)

            }

            responseData = {epochHandler, listOfEpochEdgeTransactions}

            
        } else if (searchFilter === 'pool'){


            /*

                Return metadata of pool + storage with id <POOL> (to show stakers) + pool pointer (_POINTER)

                searchId is equal to full poolID. For example - 9GQ46rqY238rk2neSwgidap9ww5zbAN4dyqyC7j5ZnBK(POOL)
            
            */

            let poolPointer = await BLOCKCHAIN_DATABASES.STATE.get(searchId+'_POINTER').catch(()=>null)

            if(poolPointer){

                // Now when we know the shard - extract the rest data

                let poolContractMetadata = await BLOCKCHAIN_DATABASES.STATE.get(searchId).catch(()=>null)

                let poolStorage = await BLOCKCHAIN_DATABASES.STATE.get(searchId+'_STORAGE_POOL').catch(()=>null)

                responseData = {

                    shard: poolPointer,

                    poolContractMetadata,

                    poolStorage

                }


            } else responseData = {err:'Impossible to get info about shard where pool binded'}

            
        } else if (searchFilter === 'storage'){

            // Just return account from state

            responseData = await BLOCKCHAIN_DATABASES.STATE.get(searchFilter).catch(()=>({err:'No such storage for contract'}))

            
        } else responseData = {err:`Filter ${searchFilter} not supported`}

        
        response.send(responseData)

        
    }else response.send({err:'Route is off'})

})