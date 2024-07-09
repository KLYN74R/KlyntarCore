export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='constructor') return 0.1

}


export let CONTRACT = {


    // Increase UNO balance on specific account on some shard in case majority of quorum voted for it

    mintUnobtanium:async (transaction,originShard,atomicBatch)=>{

        /*
        
            Transaction payload is 

            {

                amountUno: 10000,

                recipient:<address to>
                
                quorumAgreements:{

                    quorumMemberPubKey1: Signature(epochFullID:amount:recipient),
                    ...
                    quorumMemberPubKeyN: Signature(epochFullID:amount:recipient)

                }

            }

            [1] Verify that majority of quorum agree to add UNO to account
            [2] Change .uno amount on account by increasing for .amountUno
        
        
        */

        if(transaction?.payload){



        }else return {isOk:false}


    },

    // To decrease number of UNO from some account

    burnUnobtanium:async (transaction,originShard,atomicBatch)=>{

        

    }

}