import Block from '../../essences/block.js'




// Returns block
// 0 - blockID(in format <EpochID>:<Ed25519_ValidatorPubkey>:<Index of block in epoch>)
let getBlockById=(response,request)=>{

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

}


// 0 - shardID - ed25519 identifier of shard
// 1 - index
let getBlockBySID=(response,request)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.BLOCK_BY_SID){

        response
        
            .writeHeader('Access-Control-Allow-Origin','*')
            .writeHeader('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.BLOCK_BY_SID}`)
            .onAborted(()=>response.aborted=true)

        let shardContext = request.getParameter(0)
        let indexOnShard = request.getParameter(1)

        global.SYMBIOTE_META.STATE.get(`SID:${shardContext}:${indexOnShard}`).then(blockID =>

            global.SYMBIOTE_META.BLOCKS.get(blockID).then(
                
                block => !response.aborted && response.end(JSON.stringify(block))
            
            )

        ).catch(()=>response.end(JSON.stringify({err:'No block receipt'})))


    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

}


/*

0 - START_GRID | GRID to ask blocks from
1 - N | Ask N blocks(25 by default)

Returns array of blocks sorted by SID in reverse order

*/

let getLatestNBlocks=async(response,request)=>{

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

                    block.hash = Block.genHash(block)

                    block.grid = grid

                    return block

                })
                
            ).catch(()=>false)
    
            promises.push(blockPromise)

        }


        let blocks = await Promise.all(promises).then(array=>array.filter(Boolean))

        !response.aborted && response.end(JSON.stringify(blocks))


    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

}




global.UWS_SERVER

// Get blocks

.get('/block/:ID',getBlockById)

.get('/block_by_sid/:SHARD/:SID',getBlockBySID)

.get('/latest_n_blocks/:NUMBER_OF_BLOCKS/:LIMIT',getLatestNBlocks)