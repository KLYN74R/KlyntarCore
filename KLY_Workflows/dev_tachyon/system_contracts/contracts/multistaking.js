import {verifyQuorumMajoritySolution} from "../../common_functions/work_with_proofs.js"

import {getFromState} from "../../common_functions/state_interactions.js"




export let gasUsedByMethod=methodID=>{

    if(methodID==='changeUnobtaniumAmount') return 10000

}


export let CONTRACT = {


    changeUnobtaniumAmount:async (originShard,transaction)=>{

        /*
        
            transaction.payload.params is 

            {

                targetPool: "PoolX",

                changesPerAccounts:{
                
                    "staker_1": -389,
                    "staker_2": 5894,
                    ...
                    "staker_N": -389

                }
                
                quorumAgreements:{

                    quorumMember1: SIG(`changeUnoAmount:${transaction.creator}:${transaction.nonce}:${JSON.stringify(changesPerAccounts}`),
                    ...
                    quorumMemberPubKeyN: SIG(`changeUnoAmount:${transaction.creator}:${transaction.nonce}:${JSON.stringify(changesPerAccounts}`)

                }

            }

        
        */

        let {amountUno, action, quorumAgreements} = transaction.payload.params

        if(typeof amountUno === 'number' && typeof action === 'string' && quorumAgreements && typeof quorumAgreements === 'object'){

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