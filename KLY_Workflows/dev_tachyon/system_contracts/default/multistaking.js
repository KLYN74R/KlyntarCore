import {verifyQuorumMajoritySolution} from "../../common_functions/work_with_proofs.js"

import {getFromState} from "../../common_functions/state_interactions.js"




export let gasUsedByMethod=methodID=>{

    if(methodID==='changeUnobtaniumAmount') return 10000

}


export let CONTRACT = {


    // Change the UNO amount on specific account on some shard in case majority of quorum voted for it

    changeUnobtaniumAmount:async (originShard,transaction)=>{

        /*
        
            transaction.payload.params is 

            {

                targetAccount:

                amountUno: 10000,

                action:'+' - to increase | '-' to decrease
                
                quorumAgreements:{

                    quorumMember1: SIG(`changeUnoAmount:${transaction.creator}:${amountUno}:${action}:${transaction.nonce}`),
                    ...
                    quorumMemberPubKeyN: SIG(`changeUnoAmount:${transaction.creator}:${amountUno}:${action}:${transaction.nonce}`)

                }

            }


            [1] Verify that majority of quorum agree to add UNO to account
            [2] Change .uno amount on account by increasing for .amountUno
        
        
        */

        let {amountUno, action, quorumAgreements} = transaction.payload.params

        if(typeof amountUno === 'number' && typeof action === 'string' && typeof quorumAgreements === 'object'){

            let recipientAccount = await getFromState(originShard+':'+transaction.creator)

            if(recipientAccount){

                let dataThatShouldBeSigned = `changeUnoAmount:${transaction.creator}:${amountUno}:${action}:${transaction.nonce}` // with nonce + tx.creator to prevent replay

                // Minting require quorum's majority agreement while burning is your own deal
                // Burning is a signal for offchain service like "I burnt my UNO, please release my freezed assets"
                
                if(action === '+' && verifyQuorumMajoritySolution(dataThatShouldBeSigned,quorumAgreements)) recipientAccount.uno += amountUno

                else if(recipientAccount.uno - amountUno >= 0) recipientAccount.uno -= amountUno // you can't burn more UNO than you have


                return {isOk:true}

            } else return {isOk:false, reason:'No such account'}

        } else return {isOk:false, reason:'Wrong datatypes or majority verification failed'}


    }

}