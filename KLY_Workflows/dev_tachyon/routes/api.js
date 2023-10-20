import {WRAP_RESPONSE,GET_NODES} from '../utils.js'

import Block from '../essences/block.js'




let




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
 *  + 0 - subchainID - Base58 encoded 32-byte Ed25519 public key which is also ID of subchain
 *  + 1 - cellID - identifier of what you want to get - contract ID, account address(Base58 ed25519,BLS,LRS,PQC,TSIG, and so on), etc.
 * 
 * 
 * ### Returns
 * 
 *  + JSON'ed value
 * 
 *  
 * */
getFromState=async(response,request)=>{
    
    response.onAborted(()=>response.aborted=true)

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.FROM_STATE){

        let subchainContext = request.getParameter(0)

        let cellID = request.getParameter(1)

        let fullID = subchainContext === 'X' ? cellID : subchainContext+':'+cellID

        let data = await global.SYMBIOTE_META.STATE.get(fullID).catch(()=>'')



        !response.aborted && WRAP_RESPONSE(response,global.CONFIG.SYMBIOTE.ROUTE_TTL.API.FROM_STATE).end(JSON.stringify(data))

    
    }else !response.aborted && response.end(JSON.stringify({err:'Trigger is off'}))

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
getKlyInfrastructureInfo=request=>WRAP_RESPONSE(request,global.CONFIG.SYMBIOTE.ROUTE_TTL.API.MY_KLY_INFRASTRUCTURE).end(global.INFO),




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




// 0 - blockID(in format <EpochID>:<Ed25519_ValidatorPubkey>:<Index of block in epoch>)
// Returns block
getBlockById=(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.BLOCK){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.BLOCK}`)
            .onAborted(()=>response.aborted=true)


        global.SYMBIOTE_META.BLOCKS.get(request.getParameter(0)).then(block=>

            !response.aborted && response.end(JSON.stringify(block))
            
        ).catch(()=>response.end(JSON.stringify({err:'No block'})))


    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},




/*

0 - START_GRID | GRID to ask blocks from
1 - N | Ask N blocks(25 by default)

Returns array of blocks sorted by SID in reverse order

*/

getLatestNBlocks=async(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.LATEST_N_BLOCKS){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.LATEST_N_BLOCKS}`)
            .onAborted(()=>response.aborted=true)


        let startGRID = +request.getParameter(0)

        let limit =  25

        let promises=[]

        for(let i=0;i<limit;i++){

            let grid = startGRID-i

            let blockPromise = global.SYMBIOTE_META.STATE.get('GRID:'+grid).then(
            
                blockID => global.SYMBIOTE_META.BLOCKS.get(blockID).then(block=>{

                    block.hash=Block.genHash(block)

                    block.grid=grid

                    return block

                })
                
            ).catch(()=>false)
    
            promises.push(blockPromise)

        }


        let blocks = await Promise.all(promises).then(array=>array.filter(Boolean))

        !response.aborted && response.end(JSON.stringify(blocks))


    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},




// 0 - subchainID
// 1 - SID(format subchainID:Index)
getBlockBySID=(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.BLOCK_BY_SID){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.BLOCK_BY_SID}`)
            .onAborted(()=>response.aborted=true)

        let subchainContext = request.getParameter(0)
        let sid = request.getParameter(1)

        global.SYMBIOTE_META.STATE.get(`SID:${subchainContext}:${sid}`).then(blockID =>

            global.SYMBIOTE_META.BLOCKS.get(blockID).then(
                
                block => !response.aborted && response.end(JSON.stringify(block))
            
            )

        ).catch(()=>response.end(JSON.stringify({err:'No block receipt'})))


    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},




getSyncState=response=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.SYNC_STATE){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.SYNC_STATE}`)
            .onAborted(()=>response.aborted=true)


        !response.aborted && response.end(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZATION_POINTER))
            

    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

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
            CHECKPOINT_TIMESTAMP:createTimestamp
        
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




// 0 - GRID(general real block index)
getBlockByGRID=(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.BLOCK_BY_GRID){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.BLOCK_BY_GRID}`)
            .onAborted(()=>response.aborted=true)


        global.SYMBIOTE_META.STATE.get('GRID:'+request.getParameter(0)).then(
            
            blockID => global.SYMBIOTE_META.BLOCKS.get(blockID).then(block=>

                !response.aborted && response.end(JSON.stringify(block))
            )    
            
        ).catch(()=>!response.aborted && response.end(JSON.stringify({err:'No block'})))


    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},




getSearchResult=async(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.SEARCH_RESULT){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.SEARCH_RESULT}`)
            .onAborted(()=>response.aborted=true)


        //_____________ Find possible values _____________

        let query = request.getParameter(0)

        let responseType

        
        let possibleTxReceipt = await global.SYMBIOTE_META.STATE.get('TX:'+query).then(receipt=>{

            responseType='TX_RECEIPT'

            return receipt

        }).catch(()=>false)


        if(possibleTxReceipt){

            !response.aborted && response.end(JSON.stringify({responseType,data:possibleTxReceipt}))

            return

        }


        let blockByGRID = await global.SYMBIOTE_META.STATE.get(query).then(
            
            blockID => global.SYMBIOTE_META.BLOCKS.get(blockID)

        ).then(block=>{

            responseType='BLOCK_BY_GRID'

            return block

        }).catch(()=>false)


        if(blockByGRID){

            !response.aborted && response.end(JSON.stringify({responseType,data:blockByGRID}))

            return

        }

    
        let possibleBlock = await global.SYMBIOTE_META.BLOCKS.get(query).then(block=>{

            responseType='BLOCK_BY_ID'

            return block

        }).catch(()=>false)


        if(possibleBlock){

            !response.aborted && response.end(JSON.stringify({responseType,data:possibleBlock}))

            return

        }

            
        let possibleFromState = await global.SYMBIOTE_META.STATE.get(query).then(stateCell=>{

            responseType='FROM_STATE'

            return stateCell

        }).catch(()=>false)


        
        if(possibleFromState){

            !response.aborted && response.end(JSON.stringify({responseType,data:possibleFromState}))

            return

        }


        let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.id

        let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

        if(!tempObject){

            !response.aborted && response.end(JSON.stringify({responseType:'ERROR',data:'Wait for a next checkpoint'}))

            return

        }else{


            let possibleAggregatedFinalizationProof = await global.SYMBIOTE_META.EPOCH_DATA.get(query).then(aggregatedFinalizationProof=>{

                responseType = query.startsWith('AFP') && 'AGGREGATED_FINALIZATION_PROOF'

                return aggregatedFinalizationProof

            }).catch(()=>false)
    

            if(possibleAggregatedFinalizationProof){

                !response.aborted && response.end(JSON.stringify({responseType,data:possibleAggregatedFinalizationProof}))
    
                return
    
            }else !response.aborted && response.end(JSON.stringify({responseType,data:`No data`}))


        }


    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},




// 0 - txid
getTransactionReceipt=(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.TX_RECEIPT){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.TX_RECEIPT}`)
            .onAborted(()=>response.aborted=true)


        global.SYMBIOTE_META.STATE.get('TX:'+request.getParameter(0)).then(
            
            txReceipt => !response.aborted && response.end(JSON.stringify(txReceipt))
            
        ).catch(()=>!response.aborted && response.end(JSON.stringify({err:'No tx with such id'})))


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




//Returns the checkpoint of QUORUM_THREAD that is currently used by node
getCurrentQuorumThreadCheckpoint=response=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.QUORUM_THREAD_CHECKPOINT){

        response
            
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.QUORUM_THREAD_CHECKPOINT}`)
            .onAborted(()=>response.aborted=true)

        response.end(JSON.stringify(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT))

    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},



//0 - stuffID
//Return useful data from stuff cache. It might be array of BLS pubkeys associated with some BLS aggregated pubkey, binding URL-PUBKEY and so on
//Also, it's a big opportunity for cool plugins e.g. dyncamically track changes in STUFF_CACHE and modify it or share to other endpoints

stuff=async(response,request)=>{
    
    response.onAborted(()=>response.aborted=true).writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.STUFF}`)
    
    let stuffID=request.getParameter(0)

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.SHARE_STUFF){

        let stuff = await global.SYMBIOTE_META.STUFF.get(stuffID).then(obj=>{

            global.SYMBIOTE_META.STUFF_CACHE.set(stuffID,obj)
        
            return obj
        
        }).catch(()=>false)

        !response.aborted && response.end(JSON.stringify(stuff))

    }else !response.aborted && response.end(JSON.stringify({err:'Symbiote not supported or route is off'}))

},




stuffAdd=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async()=>{
    
    //Unimplemented
    response.end('')

})




global.UWS_SERVER

// Get data about checkpoint

.get('/quorum_thread_checkpoint',getCurrentQuorumThreadCheckpoint)

.get('/pools_metadata',getPoolsMetadata)

.get('/symbiote_info',getSymbioteInfo)


.get('/latest_n_blocks/:NUMBER_OF_BLOCKS/:LIMIT',getLatestNBlocks)



// Get blocks

.get('/block/:ID',getBlockById)

.get('/block_by_grid/:GRID',getBlockByGRID)

.get('/block_by_sid/:SUBCHAIN/:SID',getBlockBySID)



// Get data from state

.get('/state/:SUBCHAIN_ID/:CELL_ID',getFromState)

.get('/tx_receipt/:TXID',getTransactionReceipt)

.get('/search_result/:QUERY',getSearchResult)

.get('/sync_state',getSyncState)

.get('/stuff/:STUFF_ID',stuff)



// Misc

.get('/get_kly_infrastructure_info',getKlyInfrastructureInfo)

.post('/stuff_add',stuffAdd)

.get('/nodes/:REGION',nodes)


/*

TODO:

GET /plugins - get the list of available plugins runned in the same instance. Via /info you can get the list about other plugins related to "this" infrastructure(runned as a separate process, available via other hosts etc.)

GET /checkpoint/:type - get the current checkpoint based on type(QT - quorum thread, VT - verification thread).

*/