import {CONFIGURATION, FASTIFY_SERVER} from '../../../../klyn74r.js'

import {WORKING_THREADS} from '../../blockchain_preparation.js'



// Returns the info about epoch on AT(Approvement Thread) and VT(Verification Thread)

FASTIFY_SERVER.get('/epoch_data/:threadID',(request,response)=>{

    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.GET_EPOCH_DATA){

        response
            
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.DATA_ABOUT_EPOCH_ON_THREAD}`)
            
        
        response.send(

            WORKING_THREADS[request.params.threadID === 'vt' ? 'VERIFICATION_THREAD': 'APPROVEMENT_THREAD'].EPOCH

        )

    }else response.send({err:'Route is off'})

})