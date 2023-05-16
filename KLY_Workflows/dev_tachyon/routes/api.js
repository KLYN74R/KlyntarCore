import {WRAP_RESPONSE,GET_NODES,USE_TEMPORARY_DB} from '../utils.js'
import {BLAKE3} from '../../../KLY_Utils/utils.js'
import Block from '../essences/block.js'




let



/**## API/account
 * 
 *  Returns account's state on given subchain
 * 
 *  0 - subchainID
 *  1 - cellID
 * 
 * 
 * @param {string} cellID publicKey/address of account(Base58 ed25519,BLS,LRS,PQC,TSIG, and so on)
 * 
 * @returns {Account} Account instance
 * 
 * */
getFromState=async(response,request)=>{
    
    response.onAborted(()=>response.aborted=true)

    if(global.CONFIG.SYMBIOTE.TRIGGERS.API.FROM_STATE){

    
        let fullID = request.getParameter(0) === 'X' ? request.getParameter(1) : BLAKE3(request.getParameter(0)+request.getParameter(1))

        let data = await global.SYMBIOTE_META.STATE.get(fullID).catch(_=>'')

        !response.aborted && WRAP_RESPONSE(response,global.CONFIG.SYMBIOTE.TTL.API.FROM_STATE).end(JSON.stringify(data))

    
    }else !response.aborted && response.end('Trigger is off')

},



/**## API/info
 * 
 *  Returns general info about node/infrastructure
 *  
 * 
 * @returns {String} Info in JSON
 * 
 * */
getMyInfo=request=>WRAP_RESPONSE(request,global.CONFIG.SYMBIOTE.TTL.API.INFO).end(INFO),




/**## API/nodes
 * 
 *  Returns set of nodes for P2P communications
 * 
 *  0 - preffered region(close to another node)
 * 
 *
 * @param {string} prefferedRegion Continent,Country code and so on
 * 
 * @returns {Array} Array of urls. Example [http://somenode.io,https://dead::beaf,...]
 * 
 * */

nodes=(response,request)=>{

    response.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+global.CONFIG.SYMBIOTE.TTL.API.NODES).end(

        global.CONFIG.SYMBIOTE.TRIGGERS.API.NODES&&JSON.stringify(GET_NODES(request.getParameter(0)))

    )

},




// 0 - blockID(in format <BLS_ValidatorPubkey>:<height>)
// Returns block
getBlockById=(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.TRIGGERS.API.BLOCK){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.TTL.API.BLOCK}`)
            .onAborted(()=>response.aborted=true)


        global.SYMBIOTE_META.BLOCKS.get(request.getParameter(0)).then(block=>

            !response.aborted && response.end(JSON.stringify(block))
            
        ).catch(_=>response.end('No block'))


    }else !response.aborted && response.end('Route is off')

},




/*

0 - START_RID | RID to ask blocks from
1 - N | Ask N blocks(25 by default)

Returns array of blocks sorted by RID in reverse order

*/

getLatestNBlocks=async(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.TRIGGERS.API.LATEST_N_BLOCKS){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.TTL.API.LATEST_N_BLOCKS}`)
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
                
            ).catch(_=>false)
    
            promises.push(blockPromise)

        }


        let blocks = await Promise.all(promises).then(array=>array.filter(Boolean))

        !response.aborted && response.end(JSON.stringify(blocks))


    }else !response.aborted && response.end('Route is off')

},




// 0 - SID(in format <BLS_ValidatorPubkey>:<height>)

getBlockBySID=(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.TRIGGERS.API.BLOCK_BY_SID){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.TTL.API.BLOCK_BY_SID}`)
            .onAborted(()=>response.aborted=true)


        global.SYMBIOTE_META.STATE.get('BLOCK_RECEIPT:'+request.getParameter(0)).then(block=>

            !response.aborted && response.end(JSON.stringify(block))
            
        ).catch(_=>response.end('No block receipt'))


    }else !response.aborted && response.end('Route is off')

},




getSyncState=response=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.TRIGGERS.API.SYNC_STATE){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.TTL.API.SYNC_STATE}`)
            .onAborted(()=>response.aborted=true)


        !response.aborted && response.end(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER))
            

    }else !response.aborted && response.end('Route is off')

},




getSymbioteInfo=response=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.TRIGGERS.API.SYMBIOTE_INFO){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.TTL.API.SYMBIOTE_INFO}`)
            .onAborted(()=>response.aborted=true)


        // SymbioteID - it's BLAKE3 hash of manifest( SYMBIOTE_ID = BLAKE3(JSON.stringify(global.CONFIG.SYMBIOTE.MANIFEST)))
        
        let symbioteID = global.CONFIG.SYMBIOTE.SYMBIOTE_ID

        //Get the info from symbiote manifest - its static info, as a genesis, but for deployment to hostchain

        let {
        
            WORKFLOW:workflowID,
            WORKFLOW_HASH:workflowHash,
            HIVEMIND:hivemind,
            HOSTCHAINS:hostchains,
            GENESIS_HASH:genesisHash
        
        }=global.CONFIG.SYMBIOTE.MANIFEST

        
        //Get the current version of VT and QT

        let verificationThreadWorkflowVersion = global.SYMBIOTE_META.VERIFICATION_THREAD.VERSION
        let quorumThreadWorkflowVersion = global.SYMBIOTE_META.QUORUM_THREAD.VERSION


        //Get the current version of workflows_options on VT and QT

        let verificationThreadWorkflowOptions = global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS
        let quorumThreadWorkflowOptions = global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS


        // Send
        !response.aborted && response.end(JSON.stringify({

            symbioteID, workflowID, workflowHash,hivemind,hostchains,genesisHash,

            verificationThreadWorkflowVersion,quorumThreadWorkflowVersion,

            verificationThreadWorkflowOptions,quorumThreadWorkflowOptions

        }))
            

    }else !response.aborted && response.end('Route is off')

},




// 0 - GRID(general real block index)
getBlockByGRID=(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.TRIGGERS.API.BLOCK_BY_GRID){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.TTL.API.BLOCK_BY_GRID}`)
            .onAborted(()=>response.aborted=true)


        global.SYMBIOTE_META.STATE.get('GRID:'+request.getParameter(0)).then(
            
            blockID => global.SYMBIOTE_META.BLOCKS.get(blockID).then(block=>

                !response.aborted && response.end(JSON.stringify(block))
            )    
            
        ).catch(_=>!response.aborted && response.end('No block'))


    }else !response.aborted && response.end('Route is off')

},




getSearchResult=async(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.TRIGGERS.API.SEARCH_RESULT){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.TTL.API.SEARCH_RESULT}`)
            .onAborted(()=>response.aborted=true)


        //_____________ Find possible values _____________

        let query = request.getParameter(0)

        let responseType

        
        let possibleTxReceipt = await global.SYMBIOTE_META.STATE.get('TX:'+query).then(receipt=>{

            responseType='TX_RECEIPT'

            return receipt

        }).catch(_=>false)


        if(possibleTxReceipt){

            !response.aborted && response.end(JSON.stringify({responseType,data:possibleTxReceipt}))

            return

        }


        let blockByGRID = await global.SYMBIOTE_META.STATE.get(query).then(
            
            blockID => global.SYMBIOTE_META.BLOCKS.get(blockID)

        ).then(block=>{

            responseType='BLOCK_BY_GRID'

            return block

        }).catch(_=>false)


        if(blockByGRID){

            !response.aborted && response.end(JSON.stringify({responseType,data:blockByGRID}))

            return

        }

    
        let possibleBlock = await global.SYMBIOTE_META.BLOCKS.get(query).then(block=>{

            responseType='BLOCK_BY_ID'

            return block

        }).catch(_=>false)


        if(possibleBlock){

            !response.aborted && response.end(JSON.stringify({responseType,data:possibleBlock}))

            return

        }

            
        let possibleFromState = await global.SYMBIOTE_META.STATE.get(query).then(stateCell=>{

            responseType='FROM_STATE'

            return stateCell

        }).catch(_=>false)


        
        if(possibleFromState){

            !response.aborted && response.end(JSON.stringify({responseType,data:possibleFromState}))

            return

        }


        let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

        if(!tempObject){

            !response.aborted && response.end(JSON.stringify({responseType:'ERROR',data:'Wait for a next checkpoint'}))

            return

        }else{

            let possibleSuperFinalizationProof = await USE_TEMPORARY_DB('get',tempObject.DATABASE,query).then(superFinalizationProof=>{

                responseType = query.startsWith('SFP') && 'SUPER_FINALIZATION_PROOF'

                return superFinalizationProof

            }).catch(_=>false)
    

            if(possibleSuperFinalizationProof){

                !response.aborted && response.end(JSON.stringify({responseType,data:possibleSuperFinalizationProof}))
    
                return
    
            }else !response.aborted && response.end(JSON.stringify({responseType,data:`No data`}))


        }


    }else !response.aborted && response.end('Route is off')

},




// 0 - txid
getTransactionReceipt=(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.TRIGGERS.API.TX_RECEIPT){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.TTL.API.TX_RECEIPT}`)
            .onAborted(()=>response.aborted=true)


        global.SYMBIOTE_META.STATE.get('TX:'+request.getParameter(0)).then(
            
            txReceipt => !response.aborted && response.end(JSON.stringify(txReceipt))
            
        ).catch(_=>!response.aborted && response.end('No tx with such id'))


    }else !response.aborted && response.end('Route is off')

},




//Returns current pools data
getPoolsMetadata=response=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.TRIGGERS.API.POOLS_METADATA){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.TTL.API.POOLS_METADATA}`)
            .onAborted(()=>response.aborted=true)


        response.end(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA))

    }else !response.aborted && response.end('Symbiote not supported')

},




//Returns the checkpoint of QUORUM_THREAD that is currently used by node
getCurrentQuorumThreadCheckpoint=response=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.TRIGGERS.API.QUORUM_THREAD_CHECKPOINT){

        response
            
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.TTL.API.QUORUM_THREAD_CHECKPOINT}`)
            .onAborted(()=>response.aborted=true)

        response.end(JSON.stringify(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT))

    }else !response.aborted && response.end('Route is off')

},



//0 - stuffID
//Return useful data from stuff cache. It might be array of BLS pubkeys associated with some BLS aggregated pubkey, binding URL-PUBKEY and so on
//Also, it's a big opportunity for cool plugins e.g. dyncamically track changes in STUFF_CACHE and modify it or share to other endpoints

stuff=async(response,request)=>{
    
    response.onAborted(()=>response.aborted=true).writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.TTL.API.STUFF}`)
    
    let stuffID=request.getParameter(0)

    if(global.CONFIG.SYMBIOTE.TRIGGERS.API.SHARE_STUFF){

        let stuff = await global.SYMBIOTE_META.STUFF.get(stuffID).then(obj=>{

            global.SYMBIOTE_META.STUFF_CACHE.set(stuffID,obj)
        
            return obj
        
        }).catch(_=>false)

        !response.aborted && response.end(JSON.stringify(stuff))

    }else !response.aborted && response.end('Symbiote not supported or route is off')

},




stuffAdd=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async v=>{
    
    //Unimplemented
    response.end('')

})




UWS_SERVER

// Get data about checkpoint

.get('/quorum_thread_checkpoint',getCurrentQuorumThreadCheckpoint)

.get('/pools_metadata',getPoolsMetadata)

.get('/symbiote_info',getSymbioteInfo)


.get('/latest_n_blocks/:NUMBER_OF_BLOCKS/:LIMIT',getLatestNBlocks)



// Get blocks

.get('/block/:ID',getBlockById)

.get('/block_by_grid/:GRID',getBlockByGRID)

.get('/block_by_sid/:SUBCHAIN_ID/:INDEX',getBlockBySID)



// Get data from state

.get('/state/:SUBCHAIN_ID/:CELL_ID',getFromState)

.get('/tx_receipt/:TXID',getTransactionReceipt)

.get('/search_result/:QUERY',getSearchResult)

.get('/sync_state',getSyncState)

.get('/stuff/:STUFF_ID',stuff)



// Misc

.post('/stuff_add',stuffAdd)

.get('/nodes/:REGION',nodes)

.get('/my_info',getMyInfo)


/*


TODO:

GET /health/:subchain - get own version about health of some subchain(pool)

GET /plugins - get the list of available plugins runned in the same instance. Via /info you can get the list about other plugins related to "this" infrastructure(runned as a separate process, available via other hosts etc.)

GET /checkpoint/:type - get the current checkpoint based on type(QT - quorum thread, VT - verification thread).

GET 

*/