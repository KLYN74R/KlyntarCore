import {WRAP_RESPONSE,GET_NODES} from '../utils.js'

import {BODY} from '../../../KLY_Utils/utils.js'




let



/**## API/account
 * 
 *  Returns account's state
 * 
 *  0 - symbioteID, 1 - account
 * 
 * 
 * @param {string} symbioteID 32-bytes hexadecimal hash of symbiote's manifest. It's SYMBIOTE_ID
 * @param {string} account publicKey/address of account(Base58 ed25519,BLS,LRS,PQC,TSIG, and so on)
 * 
 * @returns {Account} Account instance
 * 
 * */
account=async(a,q)=>{
    
    a.onAborted(()=>a.aborted=true)

    if(CONFIG.SYMBIOTE.SYMBIOTE_ID===q.getParameter(0)&&CONFIG.SYMBIOTE.TRIGGERS.API_ACCOUNTS){

        let data={
        
            ...await SYMBIOTE_META.STATE.get(q.getParameter(1)).catch(e=>''),
        
            COLLAPSE:SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER
    
        }

        !a.aborted&&WRAP_RESPONSE(a,CONFIG.SYMBIOTE.TTL.API_ACCOUNTS).end(JSON.stringify(data))

    }else !a.aborted&&a.end('Symbiote not supported or BALANCE trigger is off')

},



/**## API/info
 * 
 *  Returns general info about node/infrastructure
 *  
 * 
 * @returns {String} Info in JSON
 * 
 * */
info=a=>WRAP_RESPONSE(a,CONFIG.SYMBIOTE.TTL.INFO).end(INFO),




/**## API/nodes
 * 
 *  Returns set of nodes for P2P communications
 * 
 *  0 - symbioteID, 1 - preffered region(close to another node)
 * 
 * 
 * @param {string} symbioteID 32-bytes hexadecimal hash of symbiote's manifest. It's SYMBIOTE_ID
 * @param {string} prefferedRegion Continent,Country code and so on
 * 
 * @returns {Array} Array of urls. Example [http://somenode.io,https://dead::beaf,...]
 * 
 * */

nodes=(a,q)=>{

    CONFIG.SYMBIOTE.SYMBIOTE_ID===q.getParameter(0)
    ?
    a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+CONFIG.SYMBIOTE.TTL.API_NODES).end(

        CONFIG.SYMBIOTE.TRIGGERS.API_NODES&&JSON.stringify(GET_NODES(q.getParameter(1)))

    )
    :
    !a.aborted&&a.end('Symbiote not supported')

},




// 0 - blockID(in format <BLS_ValidatorPubkey>:<height>)
block=(a,q)=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.API_BLOCK){


        a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.API_BLOCK}`).onAborted(()=>a.aborted=true)

        SYMBIOTE_META.BLOCKS.get(q.getParameter(0)).then(block=>

            !a.aborted && a.end(JSON.stringify(block))
            
        ).catch(_=>a.end('No block'))


    }else !a.aborted && a.end('Symbiote not supported')

},




//Returns current validators pool
getValidators=a=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_VALIDATORS){

        a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_VALIDATORS}`).onAborted(()=>a.aborted=true)

        a.end(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS))

    }else !a.aborted && a.end('Symbiote not supported')

},



//Returns quorum for today
getCurrentQuorum=a=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_VALIDATORS){

        a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_VALIDATORS}`).onAborted(()=>a.aborted=true)

        a.end(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.QUORUM))

    }else !a.aborted && a.end('Symbiote not supported')

},


/*

? 0 - array of blockIDs to export

Insofar as blockchain verification thread works horizontally, by passing IDs of blocks,node exports next N blocks in a row

And you ask for a blocks:

*   [Validator1:10,Validator2:10,Validator3:10,...ValidatorX:A,Validator2:13,...]

*/

multiplicity=a=>a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.API_MULTI}`).onAborted(()=>a.aborted=true).onData(async v=>{
   
    let blocksIDs=await BODY(v,CONFIG.MAX_PAYLOAD_SIZE)


    if(CONFIG.SYMBIOTE.TRIGGERS.API_MULTI && Array.isArray(blocksIDs)){


        let limit=CONFIG.SYMBIOTE.BLOCKS_EXPORT_PORTION,
        
            response=[],

            promises=[]


        for(let id of blocksIDs){

            let [blockCreator,height]=id?.split(':')

            height=+height

            if(Number.isInteger(height) && SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[blockCreator]?.INDEX+100<height) continue

            promises.push(SYMBIOTE_META.BLOCKS.get(id).then(
                
                async block => {

                    let proof = await SYMBIOTE_META.VALIDATORS_COMMITMENTS.get(id).catch(e=>'')

                    response.push({b:block,p:proof})

                }
                
            ).catch(_=>{}))

            limit--

            if(limit===0) break

        }
       
        await Promise.all(promises.splice(0))
        
        !a.aborted && a.end(JSON.stringify(response))

    }else !a.aborted && a.end(JSON.stringify({e:'Symbiote not supported'}))

       
}),




//0 - stuffID
//Return useful data from stuff cache. It might be array of BLS pubkeys associated with some BLS aggregated pubkey, binding URL-PUBKEY and so on
//Also, it's a big opportunity for cool plugins e.g. dyncamically track changes in STUFF_CACHE and modify it or share to other endpoints

stuff=async(a,q)=>{
    
    a.onAborted(()=>a.aborted=true).writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_STUFF}`)
    
    let stuffID=q.getParameter(0)

    if(CONFIG.SYMBIOTE.TRIGGERS.API_SHARE_STUFF){

        let stuff = SYMBIOTE_META.STUFF_CACHE.get(stuffID) || await SYMBIOTE_META.STUFF.get(stuffID).then(obj=>{

            SYMBIOTE_META.STUFF_CACHE.set(stuffID,obj)
        
            return obj
        
        })

        !a.aborted && a.end(JSON.stringify(stuff))

    }else !a.aborted && a.end('Symbiote not supported or route is off')

},




stuffAdd=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{
    
    //Unimplemented
    a.end('')

}),




//Coming soon
alert=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{
    
    //Unimplemented
    a.end('')

})




UWS_SERVER

.get('/stuff/:stuffID/:stuffType',stuff)

.get('/getvalidators',getValidators)

.post('/multiplicity',multiplicity)

.get('/account/:address',account)

.post('/stuff_add',stuffAdd)

.get('/nodes/:region',nodes)

.get('/block/:id',block)

.post('/alert',alert)

.get('/i',info)