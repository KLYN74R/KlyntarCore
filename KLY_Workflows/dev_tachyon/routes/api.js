import Block from '../essences/block.js'
import {WRAP_RESPONSE,GET_NODES, USE_TEMPORARY_DB} from '../utils.js'



let



/**## API/account
 * 
 *  Returns account's state
 * 
 *  0 - accountID
 * 
 * 
 * @param {string} account publicKey/address of account(Base58 ed25519,BLS,LRS,PQC,TSIG, and so on)
 * 
 * @returns {Account} Account instance
 * 
 * */
account=async(response,request)=>{
    
    response.onAborted(()=>response.aborted=true)

    if(CONFIG.SYMBIOTE.TRIGGERS.API_ACCOUNTS){

        let data = await SYMBIOTE_META.STATE.get(request.getParameter(0)).catch(_=>'')

        !response.aborted && WRAP_RESPONSE(response,CONFIG.SYMBIOTE.TTL.API_ACCOUNTS).end(JSON.stringify(data))

    }else !response.aborted&&response.end('Symbiote not supported or BALANCE trigger is off')

},



/**## API/info
 * 
 *  Returns general info about node/infrastructure
 *  
 * 
 * @returns {String} Info in JSON
 * 
 * */
getMyInfo=request=>WRAP_RESPONSE(request,CONFIG.SYMBIOTE.TTL.INFO).end(INFO),




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

    response.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+CONFIG.SYMBIOTE.TTL.API_NODES).end(

        CONFIG.SYMBIOTE.TRIGGERS.API_NODES&&JSON.stringify(GET_NODES(request.getParameter(0)))

    )

},




// 0 - blockID(in format <BLS_ValidatorPubkey>:<height>)
// Returns block
getBlockById=(response,request)=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.API_BLOCK){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.API_BLOCK}`)
            .onAborted(()=>response.aborted=true)


        SYMBIOTE_META.BLOCKS.get(request.getParameter(0)).then(block=>

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
    if(CONFIG.SYMBIOTE.TRIGGERS.API_LATEST_N_BLOCKS){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.API_LATEST_N_BLOCKS}`)
            .onAborted(()=>response.aborted=true)


        let startRID = +request.getParameter(0)

        let limit =  25

        let promises=[]

        for(let i=0;i<limit;i++){

            let rid = startRID-i

            let blockPromise = SYMBIOTE_META.STATE.get('RID:'+rid).then(
            
                blockID => SYMBIOTE_META.BLOCKS.get(blockID).then(block=>{

                    block.hash=Block.genHash(block)

                    block.rid=rid

                    return block

                })
                
            ).catch(_=>false)
    
            promises.push(blockPromise)

        }


        let blocks = await Promise.all(promises).then(array=>array.filter(Boolean))

        !response.aborted && response.end(JSON.stringify(blocks))


    }else !response.aborted && response.end('Route is off')

},




// 0 - blockID(in format <BLS_ValidatorPubkey>:<height>)
// Returns block receipt
getBlockReceipt=(response,request)=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.API_BLOCK_RECEIPT){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.API_BLOCK_RECEIPT}`)
            .onAborted(()=>response.aborted=true)


        SYMBIOTE_META.STATE.get('BLOCK_RECEIPT:'+request.getParameter(0)).then(block=>

            !response.aborted && response.end(JSON.stringify(block))
            
        ).catch(_=>response.end('No block receipt'))


    }else !response.aborted && response.end('Route is off')

},




getSyncState=response=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_SYNC_STATE){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_SYNC_STATE}`)
            .onAborted(()=>response.aborted=true)


        !response.aborted && response.end(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER))
            

    }else !response.aborted && response.end('Route is off')

},




getSymbioteInfo=response=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_SYMBIOTE_INFO){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_SYMBIOTE_INFO}`)
            .onAborted(()=>response.aborted=true)


        // SymbioteID - it's BLAKE3 hash of manifest( SYMBIOTE_ID = BLAKE3(JSON.stringify(CONFIG.SYMBIOTE.MANIFEST)))
        
        let symbioteID = CONFIG.SYMBIOTE.SYMBIOTE_ID

        //Get the info from symbiote manifest - its static info, as a genesis, but for deployment to hostchain

        let {
        
            WORKFLOW:workflowID,
            WORKFLOW_HASH:workflowHash,
            HIVEMIND:hivemind,
            HOSTCHAINS:hostchains,
            GENESIS_HASH:genesisHash
        
        }=CONFIG.SYMBIOTE.MANIFEST

        
        //Get the current version of VT and QT

        let verificationThreadWorkflowVersion = SYMBIOTE_META.VERIFICATION_THREAD.VERSION
        let quorumThreadWorkflowVersion = SYMBIOTE_META.QUORUM_THREAD.VERSION


        //Get the current version of workflows_options on VT and QT

        let verificationThreadWorkflowOptions = SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS
        let quorumThreadWorkflowOptions = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS

        // Get the additional hostchain info
        let hostchainInfo = CONFIG.SYMBIOTE.CONNECTOR.TICKER_INFO


        // Send
        !response.aborted && response.end(JSON.stringify({

            symbioteID, workflowID, workflowHash,hivemind,hostchains,genesisHash,

            verificationThreadWorkflowVersion,quorumThreadWorkflowVersion,

            verificationThreadWorkflowOptions,quorumThreadWorkflowOptions,

            hostchainInfo

        }))
            

    }else !response.aborted && response.end('Route is off')

},




// 0 - RID(relative block index)
getBlockByRID=(response,request)=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_BLOCK_BY_RID){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_BLOCK_BY_RID}`)
            .onAborted(()=>response.aborted=true)


        SYMBIOTE_META.STATE.get('RID:'+request.getParameter(0)).then(
            
            blockID => SYMBIOTE_META.BLOCKS.get(blockID).then(block=>

                !response.aborted && response.end(JSON.stringify(block))
            )    
            
        ).catch(_=>!response.aborted && response.end('No block'))


    }else !response.aborted && response.end('Route is off')

},




getSearchResult=async(response,request)=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_SEARCH_RESULT){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_SEARCH_RESULT}`)
            .onAborted(()=>response.aborted=true)


        //_____________ Find possible values _____________

        let query = request.getParameter(0)

        let responseType

        
        let possibleTxReceipt = await SYMBIOTE_META.STATE.get('TXID:'+query).then(receipt=>{

            responseType='EVENT_RECEIPT'

            return receipt

        }).catch(_=>false)


        if(possibleTxReceipt){

            !response.aborted && response.end(JSON.stringify({responseType,data:possibleTxReceipt}))

            return

        }


        let blockByRID = await SYMBIOTE_META.STATE.get(query).then(
            
            blockID => SYMBIOTE_META.BLOCKS.get(blockID)

        ).then(block=>{

            responseType='BLOCK_BY_RID'

            return block

        }).catch(_=>false)


        if(blockByRID){

            !response.aborted && response.end(JSON.stringify({responseType,data:blockByRID}))

            return

        }

    
        let possibleBlock = await SYMBIOTE_META.BLOCKS.get(query).then(block=>{

            responseType='BLOCK_BY_ID'

            return block

        }).catch(_=>false)


        if(possibleBlock){

            !response.aborted && response.end(JSON.stringify({responseType,data:possibleBlock}))

            return

        }

            
        let possibleFromState = await SYMBIOTE_META.STATE.get(query).then(stateCell=>{

            responseType='FROM_STATE'

            return stateCell

        }).catch(_=>false)


        
        if(possibleFromState){

            !response.aborted && response.end(JSON.stringify({responseType,data:possibleFromState}))

            return

        }


        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

        if(!tempObject){

            !response.aborted && response.end(JSON.stringify({responseType:'ERROR',data:'Wait for a next checkpoint'}))

            return

        }else{

            let possibleSuperFinalizationProofOrSkipStage3 = await USE_TEMPORARY_DB('get',tempObject.DATABASE,query).then(sfpOrSkipStage3=>{

                responseType = query.startsWith('SFP') ? 'SUPER_FINALIZATION_PROOF' : 'SKIP_STAGE_3'

                return sfpOrSkipStage3

            }).catch(_=>false)
    

            if(possibleSuperFinalizationProofOrSkipStage3){

                !response.aborted && response.end(JSON.stringify({responseType,data:possibleSuperFinalizationProofOrSkipStage3}))
    
                return
    
            }else !response.aborted && response.end(JSON.stringify({responseType,data:`No data`}))


        }


    }else !response.aborted && response.end('Route is off')

},




// 0 - txid
getEventReceipt=(response,request)=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_EVENT_RECEIPT){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_EVENT_RECEIPT}`)
            .onAborted(()=>response.aborted=true)


        SYMBIOTE_META.STATE.get('TX:'+request.getParameter(0)).then(
            
            eventReceipt => !response.aborted && response.end(JSON.stringify(eventReceipt))
            
        ).catch(_=>!response.aborted && response.end('No event with such id'))


    }else !response.aborted && response.end('Route is off')

},




//Returns current validators subchains
getSubchainsMetadata=response=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_SUBCHAINS){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_SUBCHAINS}`)
            .onAborted(()=>response.aborted=true)


        response.end(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.SUBCHAINS_METADATA))

    }else !response.aborted && response.end('Symbiote not supported')

},




//Returns the checkpoint of QUORUM_THREAD that is currently used by node
getCurrentQuorumThreadCheckpoint=response=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_QUORUM_THREAD_CHECKPOINT){

        response
            
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_QUORUM_THREAD_CHECKPOINT}`)
            .onAborted(()=>response.aborted=true)

        response.end(JSON.stringify(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT))

    }else !response.aborted && response.end('Route is off')

},



//0 - stuffID
//Return useful data from stuff cache. It might be array of BLS pubkeys associated with some BLS aggregated pubkey, binding URL-PUBKEY and so on
//Also, it's a big opportunity for cool plugins e.g. dyncamically track changes in STUFF_CACHE and modify it or share to other endpoints

stuff=async(response,request)=>{
    
    response.onAborted(()=>response.aborted=true).writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_STUFF}`)
    
    let stuffID=request.getParameter(0)

    if(CONFIG.SYMBIOTE.TRIGGERS.API_SHARE_STUFF){

        let stuff = await SYMBIOTE_META.STUFF.get(stuffID).then(obj=>{

            SYMBIOTE_META.STUFF_CACHE.set(stuffID,obj)
        
            return obj
        
        })

        !response.aborted && response.end(JSON.stringify(stuff))

    }else !response.aborted && response.end('Symbiote not supported or route is off')

},




stuffAdd=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async v=>{
    
    //Unimplemented
    response.end('')

})




UWS_SERVER

.get('/get_latest_n_blocks/:START_RID/:NUMBER_OF_BLOCKS',getLatestNBlocks)

.get('/get_quorum_thread_checkpoint',getCurrentQuorumThreadCheckpoint)

.get('/get_subchains_metadata',getSubchainsMetadata)

.get('/get_search_result/:QUERY',getSearchResult)

.get('/get_event_receipt/:txid',getEventReceipt)

.get('/get_block_by_rid/:RID',getBlockByRID)

.get('/get_symbiote_info',getSymbioteInfo)

.get('/block_receipt/:ID',getBlockReceipt)

.get('/account/:ADDRESS',account)

.get('/sync_state',getSyncState)

.get('/block/:ID',getBlockById)

.get('/stuff/:STUFF_ID',stuff)

.get('/get_my_info',getMyInfo)

.post('/stuff_add',stuffAdd)

.get('/nodes/:REGION',nodes)




/*


TODO:

GET /health/:subchain - get own version about health of some subchain(pool)

GET /plugins - get the list of available plugins runned in the same instance. Via /info you can get the list about other plugins related to "this" infrastructure(runned as a separate process, available via other hosts etc.)

GET /checkpoint/:type - get the current checkpoint based on type(QT - quorum thread, VT - verification thread).

GET 

*/