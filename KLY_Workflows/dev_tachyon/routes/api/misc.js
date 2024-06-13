import {BLOCKCHAIN_GENESIS, CONFIGURATION, FASTIFY_SERVER} from '../../../../klyn74r.js'

import {NODE_METADATA, WORKING_THREADS} from '../../blockchain_preparation.js'

import {TXS_FILTERS} from '../../verification_process/txs_filters.js'






let PUBKEY_FOR_FILTER = CONFIGURATION.NODE_LEVEL.PRIME_POOL_PUBKEY || CONFIGURATION.NODE_LEVEL.PUBLIC_KEY






/**## Returns the info about your KLY infrastructure
 *
 * 
 * ### Info
 * 
 * This route returns the JSON object that you set manually in CONFIGURATION.NODE_LEVEL.MY_KLY_INFRASTRUCTURE
 * Here you can describe your infrastructure - redirects, supported services, plugins installed
 *  Set the CONFIGURATION.NODE_LEVEL.MY_KLY_INFRASTRUCTURE with extra data 
 * 
 * 
 * ### Params
 * 
 *  + 0 - Nothing
 * 
 * 
 * ### Returns
 * 
 *  + JSON'ed value in CONFIGURATION.NODE_LEVEL.MY_KLY_INFRASTRUCTURE
 * 
 *  
 * */

FASTIFY_SERVER.get('/infrastructure_info',(_request,response)=>{

    response
        
        .header('Access-Control-Allow-Origin','*')
        .header('Cache-Control','max-age='+CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.MY_KLY_INFRASTRUCTURE)

        .send(JSON.stringify(CONFIGURATION.NODE_LEVEL.MY_KLY_INFRASTRUCTURE))


})




// Returns info about symbiotic chain

FASTIFY_SERVER.get('/chain_info',(_request,response)=>{

    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.CHAIN_INFO){

        response
        
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.CHAIN_INFO}`)
            


        // SymbioteID - it's BLAKE3 hash of genesis( SYMBIOTE_ID = BLAKE3(JSON.stringify(<genesis object without SYMBIOTE_ID field>)))

        let symbioteID = BLOCKCHAIN_GENESIS.SYMBIOTE_ID

        // Get the info from symbiote manifest - its static info, as a genesis, but for deployment to hostchain

        let {
        
            WORKFLOW:workflowID,
            HIVEMIND:hivemind,
            HOSTCHAINS:hostchains,
            EPOCH_TIMESTAMP:startOfFirstEpoch
        
        } = BLOCKCHAIN_GENESIS

        
        // Get the current version of VT and QT(need to understand the core version)

        let verificationThreadWorkflowVersion = WORKING_THREADS.VERIFICATION_THREAD.VERSION
        let approvementThreadWorkflowVersion = WORKING_THREADS.APPROVEMENT_THREAD.VERSION


        // Get the current version of workflows_options on VT and QT

        let verificationThreadWorkflowOptions = WORKING_THREADS.VERIFICATION_THREAD.WORKFLOW_OPTIONS
        let approvementThreadWorkflowOptions = WORKING_THREADS.APPROVEMENT_THREAD.WORKFLOW_OPTIONS


        response.send({

            genesis:{

                symbioteID,startOfFirstEpoch,workflowID,hivemind,hostchains
            
            },

            verificationThread:{

                version:verificationThreadWorkflowVersion,
                options:verificationThreadWorkflowOptions

            },

            approvementThread:{

                version:approvementThreadWorkflowVersion,
                options:approvementThreadWorkflowOptions
            
            }

        })
            

    }else response.send({err:'Route is off'})

})




// Returns metadata related to KLY-EVM on shards
FASTIFY_SERVER.get('/kly_evm_metadata',(_request,response)=>{

    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.KLY_EVM_METADATA){

        response
        
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.KLY_EVM_METADATA}`)
    

        let responseObject = {

            klyEvmMetadata:WORKING_THREADS.VERIFICATION_THREAD.KLY_EVM_METADATA, // shardID => {nextEvmBlockIndex,parentHash,timestamp},

            epochMetadata:{

                id: WORKING_THREADS.VERIFICATION_THREAD.EPOCH.id,
                hash: WORKING_THREADS.VERIFICATION_THREAD.EPOCH.hash,
                startTimestamp: WORKING_THREADS.VERIFICATION_THREAD.EPOCH.startTimestamp,

            }

        }

        response.send(responseObject)

    }else response.send({err:'Symbiote not supported'})

})




// Handler to accept transaction, make overview and add to mempool ✅

FASTIFY_SERVER.post('/transaction',{bodyLimit:CONFIGURATION.NODE_LEVEL.MAX_PAYLOAD_SIZE},async(request,response)=>{

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
    
        
    if(NODE_METADATA.MEMPOOL.length < CONFIGURATION.NODE_LEVEL.TXS_MEMPOOL_SIZE){
    
        let filteredEvent = await TXS_FILTERS[transaction.type](transaction,PUBKEY_FOR_FILTER)
    
        if(filteredEvent){
    
            response.send({status:'OK'})
    
            NODE_METADATA.MEMPOOL.push(filteredEvent)
                            
        }else response.send({err:`Can't get filtered value of tx`})
    
    }else response.send({err:'Mempool is fullfilled'})
    

})




// Handler to accept peers to exchange data with ✅
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

FASTIFY_SERVER.post('/addpeer',{bodyLimit:CONFIGURATION.NODE_LEVEL.PAYLOAD_SIZE},(request,response)=>{

    let acceptedData = JSON.parse(request.body)

    if(!Array.isArray(acceptedData)){

        response.send({err:'Input must be a 2-elements array like [symbioteID,you_endpoint]'})
        
        return

    }

    let [symbioteID,domain] = acceptedData
   
    if(BLOCKCHAIN_GENESIS.SYMBIOTE_ID!==symbioteID){

        response.send({err:'Symbiotic chain not supported'})
        
        return

    }

    if(!CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.MAIN.NEW_NODES){

        response.send({err:'Route is off'})
        
        return
    }

    if(typeof domain==='string' && domain.length<=256){
        
        //Add more advanced logic in future(or use plugins - it's even better)

        let nodes = NODE_METADATA.PEERS
        
        if(!(nodes.includes(domain) || CONFIGURATION.NODE_LEVEL.BOOTSTRAP_NODES.includes(domain))){
            
            nodes.length<CONFIGURATION.NODE_LEVEL.MAX_CONNECTIONS
            ?
            nodes.push(domain)
            :
            nodes[~~(Math.random() * nodes.length)]=domain//if no place-paste instead of random node
    
            response.send({ok:'Your node has been added'})
    
        }else response.send({ok:'Your node already in scope'})
    
    }else response.send({err:'Wrong types => endpoint(domain) must be 256 chars in length or less'})



})




/*

TODO:

GET /plugins - get the list of available plugins runned in the same instance. Via /info you can get the list about other plugins related to "this" infrastructure(runned as a separate process, available via other hosts etc.)

GET /current_shard_leader/:SHARD - returns info about current shard leader - returns data from tempData.SHARD_LEADERS_HANDLERS.get(SHARD)

GET /finalization_stats - returns the data from local FINALIZATION_STATS object (currentEpochMetadata.FINALIZATION_STATS.get(poolPubKey))

GET /eeo_mempool - tempData.EPOCH_EDGE_OPERATIONS_MEMPOOL

*/