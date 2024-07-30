import {getAccountFromState} from "../common_functions/state_interactions.js"

import {GLOBAL_CACHES} from "../blockchain_preparation.js"




export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='changeShard') return 10000

}



export let CONTRACT = {


    sendMessage:async(transaction,originShard)=>{

        /*
        
            Function to send message from current shard to another one

                For MVP functionality we just allow sending messages to transfer native KLY coins from one shard to another one

                Later, we'll add support for cross-shards interactions between contracts


            ----------------------------------------------------------

            transaction.payload.params[0] is:

            {
                amount:<amount of KLY to transfer to another shard>,
                recipientNextNonce:<nonce of target address on another shard - need it to prevent replay attacks>
            }
            
        

            This amount will be burnt on this shard and we put an UTXO with ID = Hash(nonce+current_shard)

            Then, once you get approvements from quorum majority - you can get the same amount on another shard
       
        */

        let txCreatorAccount = await getAccountFromState(originShard+':'+transaction.creator)

        let amountToMove = transaction.payload.params[0]


        if(txCreatorAccount.type === 'account' && typeof amountToMove === 'number' && amountToMove <= txCreatorAccount.balance){

            txCreatorAccount.balance -= amountToMove

            return {isOk:true, reason:'', extraData:{amount:amountToMove,to:transaction.creator,recipientNonce:}}


        } else return {isOk:false, reason:'No such account or not enough balance'}
        

    },


    acceptMessage:async(transaction,originShard,atomicBatch)=>{

        /*
        
            Function to accept message on a new shard

                For MVP functionality we just allow sending messages to transfer native KLY coins from one shard to another one

                Later, we'll add support for cross-shards interactions between contracts

            ----------------------------------------------------------

            transaction.payload.params[0] is:

            {

                moveToShard: 'new shard ID to move to',

                amount:'',

                quorumAgreements:{

                    quorumMemberPubKey1: Signature(epochFullID:amount:recipient:'mintUnobtanium'),
                    ...
                    quorumMemberPubKeyN: Signature(epochFullID:amount:recipient:'mintUnobtanium')

                }

            }
        
        */
       
        let epochHandler = WORKING_THREADS.VERIFICATION_THREAD.EPOCH

        let epochFullID = epochHandler.hash+'#'+epochHandler.id

        let payloadJSON = JSON.stringify(transaction.payload) 
    
        let dataThatShouldBeSigned = `RWX:${epochFullID}:${payloadJSON}`
    
        let proofsByQuorumMajority = transaction.payload?.params?.[0]?.majorityProofs



        if(verifyQuorumMajoritySolution(dataThatShouldBeSigned,proofsByQuorumMajority)){}

        

    }

}