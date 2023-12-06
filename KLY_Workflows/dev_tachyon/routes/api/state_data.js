import {WRAP_RESPONSE} from '../../utils.js'

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
let getRawDataFromState=async(response,request)=>{
    
    response.onAborted(()=>response.aborted=true)

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.FROM_STATE){

        let shardContext = request.getParameter(0)

        let cellID = request.getParameter(1)

        let fullID = shardContext === 'X' ? cellID : shardContext+':'+cellID

        let data = await global.SYMBIOTE_META.STATE.get(fullID).catch(()=>'')



        !response.aborted && WRAP_RESPONSE(response,global.CONFIG.SYMBIOTE.ROUTE_TTL.API.FROM_STATE).end(JSON.stringify(data))

    
    }else !response.aborted && response.end(JSON.stringify({err:'Trigger is off'}))

}



// 0 - txid
let getTransactionReceipt=(response,request)=>{

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

}




let getSearchResult=async(response,request)=>{

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


        let epochFullID = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.id

        let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

        if(!tempObject){

            !response.aborted && response.end(JSON.stringify({responseType:'ERROR',data:'Wait for a next epoch'}))

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

}


/** 
* 
* returns object like {shardID => {currentLeader,index,hash}}
* 
*/
let getSyncState=response=>{

   //Set triggers
   if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.SYNC_STATE){

       response
       
           .writeHeader('Access-Control-Allow-Origin','*')
           .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.SYNC_STATE}`)
           .onAborted(()=>response.aborted=true)


       !response.aborted && response.end(JSON.stringify(global.SYMBIOTE_META.VERIFICATION_THREAD.VT_FINALIZATION_STATS))
           

   }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

}




global.UWS_SERVER


.get('/state/:SHARD_ID/:CELL_ID',getRawDataFromState)

.get('/tx_receipt/:TXID',getTransactionReceipt)

.get('/search_result/:QUERY',getSearchResult)

.get('/sync_state',getSyncState)
