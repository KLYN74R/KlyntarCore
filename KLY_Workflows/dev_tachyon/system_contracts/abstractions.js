import {verifyQuorumMajoritySolution} from "../../../KLY_VirtualMachines/common_modules.js"

import {getFromState} from "../common_functions/state_interactions.js"



export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='constructor') return 10000

}




export let CONTRACT = {


    changeGasAmount:async(originShard,transaction)=>{

        /*

            tx.payload.params[0] format is:

            {

                targetAccount

                gasAmount:100000,

                action:'+' | '-',
                
                majorityProofs:{

                    quorumMember1: SIG(`changeGasAmount:${transaction.creator}:${gasAmount}:${action}:${transaction.nonce}`),
                    ...

                }
                
            }
        
        */


        let {gasAmount, action, quorumAgreements} = transaction.payload.params[0] 

        if(typeof gasAmount === 'number' && typeof action === 'string' && typeof quorumAgreements === 'object'){

            let accountToModifyGasAmount = await getFromState(originShard+':'+transaction.creator)

            if(accountToModifyGasAmount){

                let dataThatShouldBeSigned = `changeGasAmount:${transaction.creator}:${gasAmount}:${action}:${transaction.nonce}` // with nonce + tx.creator to prevent replay


                if(action === '+' && verifyQuorumMajoritySolution(dataThatShouldBeSigned,quorumAgreements)) accountToModifyGasAmount.gas += gasAmount

                else if(accountToModifyGasAmount.gas - gasAmount >=0) accountToModifyGasAmount.gas -= gasAmount


                return {isOk:true}

            } else return {isOk:false, reason:'No such account'}

        } else return {isOk:false, reason:'Wrong datatypes or majority verification failed'}


    },

    
    chargePaymentForStorageUsedByContract:async(originShard,transaction,atomicBatch)=>{

        /*

            Method to charge some assets as a rent for storage used by contract. Once charge - update the .storageAbstractionLastPayment field to current value of epoch        
        
            tx.payload.params[0] format is:

            {

                payForContract:<contract ID on the same shard>,

                amount:

            }
        
        */

    },

}