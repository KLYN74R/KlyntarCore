import {WRAP_RESPONSE,GET_NODES} from '../utils.js'

import {BODY} from '../../../KLY_Utils/utils.js'




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

        let data={
        
            ...await SYMBIOTE_META.STATE.get(request.getParameter(0)).catch(_=>''),
        
            finalizationStage:SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER
    
        }

        !response.aborted&&WRAP_RESPONSE(response,CONFIG.SYMBIOTE.TTL.API_ACCOUNTS).end(JSON.stringify(data))

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
info=request=>WRAP_RESPONSE(request,CONFIG.SYMBIOTE.TTL.INFO).end(INFO),




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
block=(response,request)=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.API_BLOCK){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.API_BLOCK}`)
            .onAborted(()=>response.aborted=true)


        SYMBIOTE_META.BLOCKS.get(request.getParameter(0)).then(block=>

            !response.aborted && response.end(JSON.stringify(block))
            
        ).catch(_=>response.end('No block'))


    }else !response.aborted && response.end('Symbiote not supported')

},




//Returns current validators pool
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




//Returns quorum for today(based on QUORUM_THREAD because it shows really current quorum)
getCurrentQuorum=response=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_QUORUM){

        response
            
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_QUORUM}`)
            .onAborted(()=>response.aborted=true)

        response.end(JSON.stringify(SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM))

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

.get('/get_quorum_thread_checkpoint',getCurrentQuorumThreadCheckpoint)

.get('/get_subchains_metadata',getSubchainsMetadata)

.get('/get_quorum',getCurrentQuorum)
// .post('/multiplicity',multiplicity)

.get('/account/:ADDRESS',account)

.get('/stuff/:STUFF_ID',stuff)

.post('/stuff_add',stuffAdd)

.get('/nodes/:REGION',nodes)

.get('/block/:ID',block)

.get('/info',info)



/*


TODO:

GET /health/:subchain - get own version about health of some subchain(pool)

GET /plugins - get the list of available plugins runned in the same instance. Via /info you can get the list about other plugins related to "this" infrastructure(runned as a separate process, available via other hosts etc.)

GET /checkpoint/:type - get the current checkpoint based on type(QT - quorum thread, VT - verification thread).

GET 

*/