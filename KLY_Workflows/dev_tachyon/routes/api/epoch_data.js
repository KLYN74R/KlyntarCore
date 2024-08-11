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
            
        
        let responseObj = {}

        // Get the current epoch metadata

        let atEpochHandler = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH
        
        let epochFullID = atEpochHandler.hash+"#"+atEpochHandler.id

        let currentEpochMetadata = EPOCH_METADATA_MAPPING.get(epochFullID)


        // Iterate over shards to get information about current leader

        for(let shardID of Object.keys(atEpochHandler.leadersSequence)){

            let currentShardLeader = currentEpochMetadata.SHARDS_LEADERS_HANDLERS.get(shardID) || {currentLeader:0}

            // Once we know index => get the pubkey
            // It might be pubkey of prime pool (if index of current leader is -1) or one of reserve pools
            let pubKeyOfLeader = atEpochHandler.leadersSequence[shardID][currentShardLeader.currentLeader]

            responseObj[shardID] = pubKeyOfLeader


        }
        
        response.send(responseObj)

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




// Returns stats - total number of blocks, total number of txs and number of succesful txs

FASTIFY_SERVER.get('/total_blocks_and_txs_stats_per_epoch/:index',async(request,response)=>{

    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.VT_STATS_PER_EPOCH){

        response
        
            .header('Access-Control-Allow-Origin','*')    
            .header('Cache-Control',`max-age=${CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.VT_STATS_PER_EPOCH}`)


        if(request.params.index == WORKING_THREADS.VERIFICATION_THREAD.EPOCH.id){

            response.send(WORKING_THREADS.VERIFICATION_THREAD.STATS_PER_EPOCH)

        }else{

            // Get these stats from DB related to epoch data

            let emptyTemplate = { totalBlocksNumber:'N/A', totalTxsNumber:'N/A', successfulTxsNumber:'N/A' }

            let vtStatsPerEpoch = await BLOCKCHAIN_DATABASES.EPOCH_DATA.get(`VT_STATS:${request.params.index}`).catch(()=>emptyTemplate)

            response.send(vtStatsPerEpoch)

        }


    }else response.send({err:'Route is off'})

})