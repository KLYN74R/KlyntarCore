export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='constructor') return 10000

}



export let CONTRACT = {


    setAlias:async(transaction,originShard,atomicBatch)=>{

        /*
    
            Used to assign some alias to account identifier

            Payload is {

                alias:"blablabla",
                assignTo:"<normal KLY identifier - eth address or kly ids(ed25519,bls,tbls,pqc)>"
                shard:"<shard id where identifier is>"
            }
    
        */

    },

    unSetAlias:async(transaction,originShard,atomicBatch)=>{

        

    },

    changeRoot:async(transaction,originShard,atomicBatch)=>{

        

    }

}