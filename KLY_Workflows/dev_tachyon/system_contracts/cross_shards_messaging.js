import {verifyQuorumMajoritySolution} from "../../../KLY_VirtualMachines/common_modules.js"

import {getUserAccountFromState} from "../common_functions/state_interactions.js"

import {GLOBAL_CACHES} from "../blockchain_preparation.js"





export let gasUsedByMethod=methodID=>{

    if(methodID==='sendMessage') return 10000

    else if(methodID==='acceptMessage') return 10000

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
                moveToShard:'',
                recipient:'',
                recipientNextNonce:<next nonce of target address on another shard - need it to prevent replay attacks>,
                amount:<amount of KLY to transfer to another shard>,
            }
            
        

            This amount will be burnt on this shard and we put an UTXO with ID = Hash(nonce+current_shard)

            Then, once you get approvements from quorum majority - you can get the same amount on another shard
       
        */

        let txCreatorAccount = await getUserAccountFromState(originShard+':'+transaction.creator)

        let {moveToShard,recipient,recipientNextNonce,amount} = transaction.payload.params[0]


        if(txCreatorAccount.type === 'eoa' && typeof moveToShard === 'string' && typeof recipient === 'string' && typeof recipientNextNonce === 'number' && typeof amount === 'number' && amount <= txCreatorAccount.balance){

            txCreatorAccount.balance -= amount

            return {isOk:true, extraData:{moveToShard,recipient,recipientNextNonce,amount}}


        } else return {isOk:false, reason:'No such account or not enough balance'}
        

    },


    acceptMessage:async(transaction,originShard)=>{

        /*
        
            Function to accept message on a new shard

                For MVP functionality we just allow sending messages to transfer native KLY coins from one shard to another one

                Later, we'll add support for cross-shards interactions between contracts

            ----------------------------------------------------------

            transaction.payload.params[0] is:

            {

                moveToShard:'',
                
                recipient:'',
                
                recipientNextNonce:<nonce of target address on another shard - need it to prevent replay attacks>,
                
                amount:<amount of KLY to transfer to another shard>,

                quorumAgreements:{

                    quorumMemberPubKey1: Signature(moveToShard+recipient+recipientNextNonce+amount),
                    ...
                    quorumMemberPubKeyN: Signature(moveToShard+recipient+recipientNextNonce+amount)

                }

            }

                1) Verify that moveToShard === originShard
                2) recipientNextNonce === tx.nonce

            ================================================================

            After that - message is valid
        
        */

        let txCreatorAccount = await getUserAccountFromState(originShard+':'+transaction.creator)

        let {moveToShard,recipient,recipientNextNonce,amount, quorumAgreements} = transaction.payload.params[0]

        if(!txCreatorAccount){

            txCreatorAccount = {
                
                type:'eoa',

                balance:0,
                
                uno:0,
                
                nonce:0,

                gas:0
            
            }

            GLOBAL_CACHES.STATE_CACHE.set(originShard+':'+transaction.creator)

        }

        let typesCheck = txCreatorAccount.type === 'eoa' && typeof moveToShard === 'string' && typeof recipient === 'string' && typeof recipientNextNonce === 'number' && typeof amount === 'number'

        if(typesCheck && recipient === transaction.creator && moveToShard === originShard && recipientNextNonce === transaction.nonce) {

            let dataThatShouldBeSigned = `acceptMessage:${originShard}:${transaction.creator}:${recipientNextNonce}:${amount}` // with nonce + tx.creator to prevent replay
 
            if(verifyQuorumMajoritySolution(dataThatShouldBeSigned,quorumAgreements)){

                txCreatorAccount.balance += amount

                return {isOk:true}

            } else return {isOk:false, reason:'Impossible to verify that majority voted for this'}

        } else return {isOk:false, reason:'Types check failed, wrong recipient(tx.creator must be equal to <recipient>), <moveToShard> not equal to <originShard> or wrong <recipientNextNonce>'}

    }

}