import {EPOCH_METADATA_MAPPING, getCurrentShardLeaderURL, NODE_METADATA, WORKING_THREADS} from '../../blockchain_preparation.js'

import {CONFIGURATION, FASTIFY_SERVER} from '../../../../klyn74r.js'

import {TXS_FILTERS} from '../../verification_process/txs_filters.js'





// Handler to response with a signature for requests specific to epoch edge transactions
FASTIFY_SERVER.post('/signature_request',{bodyLimit:CONFIGURATION.NODE_LEVEL.MAX_PAYLOAD_SIZE},async(request,response)=>{

    response.header('Access-Control-Allow-Origin','*')

    let transaction = JSON.parse(request.body)

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

        response.send({err:'Event structure is wrong'})
    
        return
    
    }
    
    if(!CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.MAIN.ACCEPT_TXS){
            
        response.send({err:'Route is off'})
            
        return
            
    }
    
    if(!TXS_FILTERS[transaction.type]){
    
        response.send({err:'No such filter. Make sure your <tx.type> is supported by current version of workflow runned on symbiote'})
            
        return
    
    }

    // In case this node is not a shard leader - just check the tx.payload.shard, get the shard leader and transfer tx to that leader
    
    let whoIsShardLeader = await getCurrentShardLeaderURL(transaction.payload.shard)

    if(!whoIsShardLeader?.isMeShardLeader){

        if(whoIsShardLeader.url){

            fetch(whoIsShardLeader.url+'/transaction',{

                method:'POST', body:request.body
    
            }).catch(error=>error)

            response.send({status:`Ok, tx redirected to current shard leader`})

        } else response.send({err:`Impossible to redirect to current shard leader`})

    } else if(NODE_METADATA.MEMPOOL.length < CONFIGURATION.NODE_LEVEL.TXS_MEMPOOL_SIZE){

        let epochHandler = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH
    
        let epochFullID = epochHandler.hash+"#"+epochHandler.id

        let currentEpochMetadata = EPOCH_METADATA_MAPPING.get(epochFullID)

        if(currentEpochMetadata){

            let myShardForThisEpoch = currentEpochMetadata.TEMP_CACHE.get('MY_SHARD_FOR_THIS_EPOCH')
    
            let filteredEvent = await TXS_FILTERS[transaction.type](transaction,myShardForThisEpoch)
        
            if(filteredEvent){
        
                response.send({status:'OK'})
        
                NODE_METADATA.MEMPOOL.push(filteredEvent)
                                
            }else response.send({err:`Can't get filtered value of tx`})

        } else response.send({err:'Try later'})

    } else response.send({err:'Mempool is fullfilled'})
    
})




// Handler to accept epoch edge transactions and put to appropriate mempool

FASTIFY_SERVER.post('/epoch_edge_tx',{bodyLimit:CONFIGURATION.NODE_LEVEL.MAX_PAYLOAD_SIZE},async(request,response)=>{

    response.header('Access-Control-Allow-Origin','*')

    let epochEdgeTransaction = JSON.parse(request.body)

    //Reject all txs if route is off and other guards methods

    /*
    
        ...and do such "lightweight" verification here to prevent db bloating
        Anyway we can bump with some short-term desynchronization while perform operations over block
        Verify and normalize object
        Fetch values about fees and MC from some decentralized sources
    
        The second operand tells us:if buffer is full-it makes whole logical expression FALSE
        Also check if we have normalizer for this type of event

    
    */

    if(typeof epochEdgeTransaction?.creator!=='string' || typeof epochEdgeTransaction.nonce!=='number' || typeof epochEdgeTransaction.sig!=='string'){

        response.send({err:'Event structure is wrong'})
    
        return
    
    }
    
    if(!CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.MAIN.ACCEPT_TXS){
            
        response.send({err:'Route is off'})
            
        return
            
    }
    
    if(!TXS_FILTERS[epochEdgeTransaction.type]){
    
        response.send({err:'No such filter. Make sure your <tx.type> is supported by current version of workflow runned on symbiote'})
            
        return
    
    }

    // In case this node is not a shard leader - just check the tx.payload.shard, get the shard leader and transfer tx to that leader
    
    let whoIsShardLeader = await getCurrentShardLeaderURL(epochEdgeTransaction.payload.shard)

    if(!whoIsShardLeader?.isMeShardLeader){

        if(whoIsShardLeader.url){

            fetch(whoIsShardLeader.url+'/transaction',{

                method:'POST', body:request.body
    
            }).catch(error=>error)

            response.send({status:`Ok, tx redirected to current shard leader`})

        } else response.send({err:`Impossible to redirect to current shard leader`})

    } else if(NODE_METADATA.MEMPOOL.length < CONFIGURATION.NODE_LEVEL.TXS_MEMPOOL_SIZE){

        let epochHandler = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH
    
        let epochFullID = epochHandler.hash+"#"+epochHandler.id

        let currentEpochMetadata = EPOCH_METADATA_MAPPING.get(epochFullID)

        if(currentEpochMetadata){

            let myShardForThisEpoch = currentEpochMetadata.TEMP_CACHE.get('MY_SHARD_FOR_THIS_EPOCH')
    
            let filteredEvent = await TXS_FILTERS[epochEdgeTransaction.type](epochEdgeTransaction,myShardForThisEpoch)
        
            if(filteredEvent){
        
                response.send({status:'OK'})
        
                NODE_METADATA.MEMPOOL.push(filteredEvent)
                                
            }else response.send({err:`Can't get filtered value of tx`})

        } else response.send({err:'Try later'})

    } else response.send({err:'Mempool is fullfilled'})
    
})