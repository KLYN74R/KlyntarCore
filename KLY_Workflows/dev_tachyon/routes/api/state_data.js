import {FASTIFY_SERVER} from '../../../../klyn74r.js'



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
FASTIFY_SERVER.get('/state/:shardID/:cellID',async(request,response)=>{

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.FROM_STATE){

        let shardContext = request.params.shardID

        let cellID = request.params.cellID

        let fullID = shardContext === 'X' ? cellID : shardContext+':'+cellID

        let data = await global.SYMBIOTE_META.STATE.get(fullID).catch(()=>null)


        response

            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control','max-age='+global.CONFIG.SYMBIOTE.ROUTE_TTL.API.FROM_STATE)
        
            .send(data)
    
    }else response.send({err:'Trigger is off'})

})


// 0 - txid
FASTIFY_SERVER.get('/tx_receipt/:txid',(request,response)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.TX_RECEIPT){

        response
        
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.TX_RECEIPT}`)
            

        global.SYMBIOTE_META.STATE.get('TX:'+request.params.txid).then(
            
            txReceipt => response.send(txReceipt)
            
        ).catch(()=>response.send({err:'No tx with such id'}))


    }else response.send({err:'Route is off'})

})




FASTIFY_SERVER.get('/search_result/:query',async(request,response)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.SEARCH_RESULT){

        response
        
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.SEARCH_RESULT}`)
            


        //_____________ Find possible values _____________

        let query = request.params.query

        let responseType

        
        let possibleTxReceipt = await global.SYMBIOTE_META.STATE.get('TX:'+query).then(receipt=>{

            responseType='TX_RECEIPT'

            return receipt

        }).catch(()=>false)


        if(possibleTxReceipt){

            response.send({responseType,data:possibleTxReceipt})

            return

        }
        
    
        let possibleBlock = await global.SYMBIOTE_META.BLOCKS.get(query).then(block=>{

            responseType='BLOCK_BY_ID'

            return block

        }).catch(()=>false)


        if(possibleBlock){

            response.send({responseType,data:possibleBlock})

            return

        }

            
        let possibleFromState = await global.SYMBIOTE_META.STATE.get(query).then(stateCell=>{

            responseType='FROM_STATE'

            return stateCell

        }).catch(()=>false)


        
        if(possibleFromState){

            response.send({responseType,data:possibleFromState})

            return

        }


        let epochFullID = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.id

        let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

        if(!tempObject){

            response.send({responseType:'ERROR',data:'Wait for a next epoch'})

            return

        }else{


            let possibleAggregatedFinalizationProof = await global.SYMBIOTE_META.EPOCH_DATA.get(query).then(aggregatedFinalizationProof=>{

                responseType = query.startsWith('AFP') && 'AGGREGATED_FINALIZATION_PROOF'

                return aggregatedFinalizationProof

            }).catch(()=>false)
    

            if(possibleAggregatedFinalizationProof){

                response.send({responseType,data:possibleAggregatedFinalizationProof})
    
                return
    
            }else response.send({responseType,data:`No data`})


        }


    }else response.send({err:'Route is off'})

})


/** 
* 
* returns object like {shardID => {currentLeader,index,hash}}
* 
*/

FASTIFY_SERVER.get('/sync_state',(request,response)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.SYNC_STATE){
 
        response
        
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.SYNC_STATE}`)
            
            .send(global.SYMBIOTE_META.VERIFICATION_THREAD.VT_FINALIZATION_STATS)
            
 
    }else response.send({err:'Route is off'})
 
})