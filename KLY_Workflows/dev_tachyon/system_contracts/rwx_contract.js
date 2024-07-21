// Coming soon

export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='createContract') return 0.1

}




export let CONTRACT = {


    createContract:async(transaction,originShard,atomicBatch)=>{

        /*
        
            Format of transaction.payload.params[0] is
       
            {

                additionalParams:{

                    agreementText:'BlaBlaBLa',

                    ...<Here in form of key:value will be added additional params to extend the mediation setup. For example, preffered region and language, wished validators and other params>

                }

                delegations:{

                    account1:[], // delegations in form of {contract:'',method:'',params:[]}
                    
                    account2:[],

                    ...
                    accountN:[]

                }

                signatures:{

                    account1: {sigType:'D',sig:SIG(additionalParams+delegations)}
                    
                    account2: {sigType:'M',sig:SIG(additionalParams+delegations)},

                    ...
                    accountN: {sigType:'P/D',sig:SIG(additionalParams+delegations)}

                }

            }

            
            Once transaction occured - we need to check signed delegations by agreement sides
        
        */

    }

}