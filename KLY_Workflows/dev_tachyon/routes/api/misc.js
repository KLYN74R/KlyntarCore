import {WRAP_RESPONSE,GET_NODES} from '../../utils.js'

import {BODY} from '../../../../KLY_Utils/utils.js'


let ED25519_PUBKEY_FOR_FILTER = global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY || global.CONFIG.SYMBIOTE.PUB





let




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



/**## Returns the info about your KLY infrastructure
 *
 * 
 * ### Info
 * 
 * This route returns the JSON object that you set manually in CONFIG.SYMBIOTE.MY_KLY_INFRASTRUCTURE
 * Here you can describe your infrastructure - redirects, supported services, plugins installed
 *  Set the CONFIG.SYMBIOTE.MY_KLY_INFRASTRUCTURE with extra data 
 * 
 * 
 * ### Params
 * 
 *  + 0 - Nothing
 * 
 * 
 * ### Returns
 * 
 *  + JSON'ed value in CONFIG.SYMBIOTE.MY_KLY_INFRASTRUCTURE
 * 
 *  
 * */
getKlyInfrastructureInfo=request=>WRAP_RESPONSE(request,global.CONFIG.SYMBIOTE.ROUTE_TTL.API.MY_KLY_INFRASTRUCTURE).end(global.MY_KLY_INFRASTRUCTURE),




/**## Returns the portion of KLY nodes to connect with
 *
 * 
 * ### Info
 * 
 * This route returns the nodes in CONFIG.SYMBIOTE.NODES[<region ID>]
 * Here are addresses of KLY nodes which works on the same symbiote
 * 
 * 
 * ### Params
 * 
 *  + 0 - preffered region(close to another node)
 * 
 * 
 * ### Returns
 * 
 *  + Array of urls. Example [http://somenode.io,https://dead::beaf,...]
 * 
 *  
 * */
nodes=(response,request)=>{

    response.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+global.CONFIG.SYMBIOTE.ROUTE_TTL.API.NODES).end(

        global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.NODES && JSON.stringify(GET_NODES(request.getParameter(0)))

    )

},




// Returns info about symbiotic chain
getSymbioteInfo=response=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.SYMBIOTE_INFO){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.SYMBIOTE_INFO}`)
            .onAborted(()=>response.aborted=true)


        // SymbioteID - it's BLAKE3 hash of genesis( SYMBIOTE_ID = BLAKE3(JSON.stringify(<genesis object without SYMBIOTE_ID field>)))
        
        let symbioteID = global.GENESIS.SYMBIOTE_ID

        //Get the info from symbiote manifest - its static info, as a genesis, but for deployment to hostchain

        let {
        
            WORKFLOW:workflowID,
            HIVEMIND:hivemind,
            HOSTCHAINS:hostchains,
            EPOCH_TIMESTAMP:createTimestamp
        
        } = global.GENESIS

        
        //Get the current version of VT and QT

        let verificationThreadWorkflowVersion = global.SYMBIOTE_META.VERIFICATION_THREAD.VERSION
        let quorumThreadWorkflowVersion = global.SYMBIOTE_META.QUORUM_THREAD.VERSION


        //Get the current version of workflows_options on VT and QT

        let verificationThreadWorkflowOptions = global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS
        let quorumThreadWorkflowOptions = global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS


        // Send
        !response.aborted && response.end(JSON.stringify({

            genesis:{

                symbioteID,createTimestamp,workflowID,hivemind,hostchains
            
            },

            verificationThread:{

                version:verificationThreadWorkflowVersion,
                options:verificationThreadWorkflowOptions

            },

            quorumThread:{

                version:quorumThreadWorkflowVersion,
                options:quorumThreadWorkflowOptions
            
            }

        }))
            

    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},




//Returns current pools data
getPoolsMetadata=response=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.POOLS_METADATA){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.POOLS_METADATA}`)
            .onAborted(()=>response.aborted=true)


        response.end(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA))

    }else !response.aborted && response.end(JSON.stringify({err:'Symbiote not supported'}))

},




//Returns the info about epoch on QT and VT
getDataAboutEpochOnThreads=response=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.GET_EPOCH_DATA){

        response
            
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.QUORUM_THREAD_CHECKPOINT}`)
            .onAborted(()=>response.aborted=true)

        response.end(JSON.stringify({

            quorumThread:global.SYMBIOTE_META.QUORUM_THREAD.EPOCH,

            verificationThread:global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH

        }))

    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},


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

// Just GET route to return the AFP for block by it's id (reminder - BlockID structure is <epochID>:<blockCreatorPubKey>:<index of block in this epoch>) ✅
.get('/aggregated_finalization_proof/:BLOCK_ID',getAggregatedFinalizationProof)


.get('/epoch_on_threads',getDataAboutEpochOnThreads)

.get('/pools_metadata',getPoolsMetadata)

.get('/symbiote_info',getSymbioteInfo)



// Misc

.get('/get_kly_infrastructure_info',getKlyInfrastructureInfo)

.get('/nodes/:REGION',nodes)


//___________________________________ Other ___________________________________________


// Handler to accept transaction, make overview and add to mempool ✅
.post('/transaction',acceptTransactions)

// Handler to accept peers to exchange data with ✅
.post('/addpeer',addPeer)


/*

TODO:

GET /plugins - get the list of available plugins runned in the same instance. Via /info you can get the list about other plugins related to "this" infrastructure(runned as a separate process, available via other hosts etc.)

*/