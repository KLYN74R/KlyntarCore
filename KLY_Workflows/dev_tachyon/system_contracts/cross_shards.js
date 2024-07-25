import {getAccountFromState} from "../common_functions/state_interactions.js"

import {GLOBAL_CACHES} from "../blockchain_preparation.js"




export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='changeShard') return 10000

}



export let CONTRACT = {


    changeShard:async(transaction,originShard,atomicBatch)=>{

        /*
        
            transaction.payload.params format is

            [

                {

                    wishedShard:'<shardID to move to>'

                }

            ]
            
            [*] Delete the
            
                originShard:transaction.creator - ID in database
                
            and move the account to
            
                transaction.payload.params[0].wishedShard:transaction.creator - ID in database
        
        */

        let wishedShard = transaction.payload.params[0].wishedShard

        let txCreatorAccount = await getAccountFromState(originShard+':'+transaction.creator)

        if(txCreatorAccount && typeof wishedShard === 'string'){

            // Delete the old account on <originShard> and move to <wishedShard>

            atomicBatch.del(originShard+':'+transaction.creator)

            atomicBatch.put(wishedShard+':'+transaction.creator,txCreatorAccount)

            // Delete from cache too

            GLOBAL_CACHES.STATE_CACHE.delete(originShard+':'+transaction.creator)

            return {isOk:true}
            

        } else return {isOk:false, reason: 'No such account on shard or <wishedShard> variable is not string'}

    }

}