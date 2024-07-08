export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='constructor') return 0.1

}



export let CONTRACT = {


    changeShard:async(transaction,originShard,atomicBatch)=>{

        /*
        
            transaction.payload format is
       
            {

                wishedShard:'<shardID to move to>'

            }

            [*] Delete the
            
                originShard:transaction.from - ID in database
                
            and move the account to
            
                transaction.payload.wishedShard:transaction.from - ID in database
        
        */

    }

}