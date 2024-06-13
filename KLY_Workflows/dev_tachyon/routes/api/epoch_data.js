import {BLOCKCHAIN_DATABASES, EPOCH_METADATA_MAPPING, WORKING_THREADS} from '../../blockchain_preparation.js'

import {CONFIGURATION, FASTIFY_SERVER} from '../../../../klyn74r.js'




// Returns the info about the current epoch on AT(Approvement Thread) and VT(Verification Thread)

FASTIFY_SERVER.get('/current_epoch/:threadID',(request,response)=>{

    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.DATA_ABOUT_EPOCH_ON_THREAD){

        response
            
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.DATA_ABOUT_EPOCH_ON_THREAD}`)
            
        
        response.send(

            WORKING_THREADS[request.params.threadID === 'vt' ? 'VERIFICATION_THREAD': 'APPROVEMENT_THREAD'].EPOCH

        )

    }else response.send({err:'Route is off'})

})




// Returns the info about the current leaders on shards(leader = pool with the right to generate blocks in current timeframe of epoch)

FASTIFY_SERVER.get('/current_shards_leaders',(_request,response)=>{

    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.GET_CURRENT_SHARD_LEADERS){

        response
            
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.GET_CURRENT_SHARD_LEADERS}`)
            
        
        // Get the current epoch metadata
        
        let epochFullID = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash+"#"+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.id

        let currentEpochMetadata = EPOCH_METADATA_MAPPING.get(epochFullID)

        response.send(

            currentEpochMetadata.SHARDS_LEADERS_HANDLERS // primePoolPubKey => {currentLeader:<number>} | ReservePool => PrimePool

        )

    }else response.send({err:'Route is off'})

})




// Returns the info about specific epoch by it's numerical index.

FASTIFY_SERVER.get('/epoch_by_index/:index',async(request,response)=>{

    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.GET_EPOCH_BY_INDEX){

        response
            
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.GET_EPOCH_BY_INDEX}`)
            
        
        // Get epoch handle from DB

        let epochHandle = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get(`EPOCH_HANDLER:${request.params.index}`).catch(()=>null)

        response.send(epochHandle)


    }else response.send({err:'Route is off'})

})