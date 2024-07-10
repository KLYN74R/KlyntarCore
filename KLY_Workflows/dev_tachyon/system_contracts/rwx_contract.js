// Coming soon

export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='constructor') return 0.1

}




export let CONTRACT = {


    createContract:async(transaction,originShard,atomicBatch)=>{

        /*
        
            Format of transaction.payload.params is
       
            [
            
                {

                    agreementText:''

                    sides:['Account1','Account2',...,'AccountN'],

                    delegations:{

                        account1:[],
                    
                        account2:[],

                        ...
                        accountN:[]

                    }

                }
            ]
        
        */

    }

}