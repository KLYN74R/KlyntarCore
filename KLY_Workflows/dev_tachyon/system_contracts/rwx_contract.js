// Coming soon

export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='createContract') return 0.1

}




export let CONTRACT = {


    createContract:async(transaction,originShard,atomicBatch)=>{

        /*
        
            Format of transaction.payload.params[0] is
       
            {

                params:{

                    agreementText:'BlaBlaBLa',

                    delegations:{

                        account1:[], // delegations in form of {contract:'',method:'',params:[]}
                    
                        account2:[],

                        ...
                        accountN:[]

                    }

                    ...<Here in form of key:value will be added additional params to extend the mediation setup. For example, preffered region and language, wished validators and other params>

                }

                signatures:{

                    account1: {sigType:'D',sig:SIG(params)}
                    
                    account2: {sigType:'M',sig:SIG(params)},

                    ...
                    accountN: {sigType:'P/D',sig:SIG(params)}

                }

            }

        
        */

    },

    executeBatchOfDelegations:async(transaction,originShard,atomicBatch)=>{

        // Here we simply execute array of delegations by contract parties dependent on solution and delete contract from state to mark deal as solved and prevent replay attacks
        // For stats it's possible to leave the fact of contract in separate DB
        // Batch of contract calls must be signed by quorum majority

    }

}