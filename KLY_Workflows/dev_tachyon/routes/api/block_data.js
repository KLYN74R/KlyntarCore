import {FASTIFY_SERVER} from '../../../../klyn74r.js'

import Block from '../../essences/block.js'




// Returns block
// 0 - blockID(in format <EpochID>:<Ed25519_ValidatorPubkey>:<Index of block in epoch>)

FASTIFY_SERVER.get('/block/:id',(request,response)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.BLOCK){

        response
        
            .header('Access-Control-Allow-Origin','*')    
            .header('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.BLOCK}`)
    

        global.SYMBIOTE_META.BLOCKS.get(request.params.id).then(block=>

            response.send(block)
            
        ).catch(()=>response.send({err:'No block'}))


    }else response.send({err:'Route is off'})

})




// 0 - shardID - ed25519 identifier of shard
// 1 - index

FASTIFY_SERVER.get('/block_by_sid/:shard/:sid',(request,response)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.BLOCK_BY_SID){

        response
        
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.BLOCK_BY_SID}`)
            

        let shardContext = request.params.shard
        
        let indexOfBlockOnShard = request.params.sid


        global.SYMBIOTE_META.STATE.get(`SID:${shardContext}:${indexOfBlockOnShard}`).then(blockID =>

            global.SYMBIOTE_META.BLOCKS.get(blockID).then(
                
                block => response.send(block)
            
            )

        ).catch(()=>response.send({err:'No block receipt'}))


    }else response.send({err:'Route is off'})

})



/*

0 - START to ask blocks from
1 - N | Ask N blocks(25 by default)

Returns array of blocks sorted by SID in reverse order

*/

FASTIFY_SERVER.get('/latest_n_blocks/:num_of_blocks/:limit',async(request,response)=>{

    //Set triggers
    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.API.LATEST_N_BLOCKS){

        response
        
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${global.CONFIG.SYMBIOTE.ROUTE_TTL.API.LATEST_N_BLOCKS}`)
            

        let startCount = +request.params.num_of_blocks

        let limit =  25

        let promises=[]

        for(let i=0;i<limit;i++){

            let sid = startCount-i

            let blockPromise = global.SYMBIOTE_META.STATE.get('SID:'+sid).then(
            
                blockID => global.SYMBIOTE_META.BLOCKS.get(blockID).then(block=>{

                    block.hash = Block.genHash(block)

                    block.sid = sid

                    return block

                })
                
            ).catch(()=>false)
    
            promises.push(blockPromise)

        }


        let blocksArray = await Promise.all(promises).then(array=>array.filter(Boolean))

        response.send(blocksArray)


    }else response.end({err:'Route is off'})

})