export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='constructor') return 10000

}



export let CONTRACT = {


    setAlias:async(originShard,tx,atomicBatch)=>{

        /*
    
            Used to assign some alias to account identifier

            Payload is {

                alias:"blablabla",
                assignTo:"<normal KLY identifier - eth address or kly ids(ed25519,bls,tbls,pqc)>"
                shard:"<shard id where identifier is>"
            }
    
        */

    },

    unSetAlias:async(originShard,tx,atomicBatch)=>{

        

    },

    changeRoot:async(originShard,tx,atomicBatch)=>{

        

    }

}