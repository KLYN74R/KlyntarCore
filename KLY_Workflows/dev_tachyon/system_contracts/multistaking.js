import {verifyQuorumMajoritySolution} from "../../../KLY_VirtualMachines/common_modules.js"

import {getFromState} from "../common_functions/state_interactions.js"


export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='mintUnobtanium') return 10000

    else if(methodID==='burnUnobtanium') return 10000

}


export let CONTRACT = {


    // Change the UNO amount on specific account on some shard in case majority of quorum voted for it

    changeUnobtaniumAmount:async (originShard,transaction)=>{

        /*
        
            transaction.payload.params[0] is 

            {

                amountUno: 10000,

                action:'+' - to increase | '-' to decrease
                
                quorumAgreements:{

                    quorumMember1: SIG(`changeUnoAmount:${transaction.creator}:${amountUno}:${action}:${transaction.nonce}`),
                    ...
                    quorumMemberPubKeyN: SIG(`changeUnoAmount:${transaction.creator}:${gasAmount}:${action}:${transaction.nonce}`)

                }

            }


            [1] Verify that majority of quorum agree to add UNO to account
            [2] Change .uno amount on account by increasing for .amountUno
        
        
        */

        let {amountUno, action, quorumAgreements} = transaction.payload.params[0]

        let dataThatShouldBeSigned = `changeUnoAmount:${transaction.creator}:${amountUno}:${action}:${transaction.nonce}` // with nonce + tx.creator to prevent replay


        if(typeof amountUno === 'number' && typeof action === 'string' && typeof quorumAgreements === 'object' && verifyQuorumMajoritySolution(dataThatShouldBeSigned,quorumAgreements)){

            let recipientAccount = await getFromState(originShard+':'+transaction.creator)

            if(recipientAccount){

                if(action === '+') recipientAccount.uno += amountUno

                else recipientAccount.uno -= amountUno

                return {isOk:true}

            } else return {isOk:false, reason:'No such account'}

        } else return {isOk:false, reason:'Wrong datatypes or majority verification failed'}


    }

}