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
        
            FINALIZATION_STAGE:SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER
    
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
getValidators=response=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_VALIDATORS){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_VALIDATORS}`)
            .onAborted(()=>response.aborted=true)


        response.end(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.SUBCHAINS))

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


/*

? 0 - array of blockIDs to export

Insofar as blockchain verification thread works horizontally, by passing IDs of blocks,node exports next N blocks in a row

And you ask for a blocks:

*   [Validator1:10,Validator2:10,Validator3:10,...ValidatorX:A,Validator2:13,...]

*/

multiplicity=response=>

    response.writeHeader('Access-Control-Allow-Origin','*')
    
            .writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.API_MULTI}`)
            
            .onAborted(()=>response.aborted=true)
            
.onData(async v=>{
   
    let blocksIDs=await BODY(v,CONFIG.MAX_PAYLOAD_SIZE)


    if(CONFIG.SYMBIOTE.TRIGGERS.API_MULTI && Array.isArray(blocksIDs)){


        let limit=CONFIG.SYMBIOTE.BLOCKS_EXPORT_PORTION,
        
            response=[],

            promises=[]


        for(let id of blocksIDs){

            let [blockCreator,height]=id?.split(':')

            height=+height

            if(Number.isInteger(height) && SYMBIOTE_META.VERIFICATION_THREAD.SUBCHAINS_METADATA[blockCreator]?.INDEX+100<height) continue

            promises.push(SYMBIOTE_META.BLOCKS.get(id).then(
                
                async block => {

                    let proof = await SYMBIOTE_META.VALIDATORS_COMMITMENTS.get(id).catch(_=>'')

                    response.push({b:block,p:proof})

                }
                
            ).catch(_=>{}))

            limit--

            if(limit===0) break

        }
       
        await Promise.all(promises.splice(0))
        
        !response.aborted && response.end(JSON.stringify(response))

    }else !response.aborted && response.end(JSON.stringify({e:'Symbiote not supported'}))

       
}),




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

.get('/stuff/:STUFF_ID/:STUFF_TYPE',stuff)

.get('/get_validators',getValidators)

.get('/get_quorum',getCurrentQuorum)

// .post('/multiplicity',multiplicity)

.get('/account/:ADDRESS',account)

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