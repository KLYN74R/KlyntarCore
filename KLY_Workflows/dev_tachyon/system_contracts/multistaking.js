import { verifyQuorumMajoritySolution } from "../../../KLY_VirtualMachines/common_modules.js"

import { getFromState } from "../common_functions/state_interactions.js"

import { WORKING_THREADS } from "../blockchain_preparation.js"


export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='constructor') return 0.1

}


export let CONTRACT = {


    // Increase UNO balance on specific account on some shard in case majority of quorum voted for it

    mintUnobtanium:async (transaction, originShard)=>{

        /*
        
            Transaction payload is 

            [

                {

                    amountUno: 10000,

                    recipient:<address to>
                
                    quorumAgreements:{

                        quorumMemberPubKey1: Signature(epochFullID:amount:recipient:'mintUnobtanium'),
                        ...
                        quorumMemberPubKeyN: Signature(epochFullID:amount:recipient:'mintUnobtanium')

                    }

                }


            ]

            [1] Verify that majority of quorum agree to add UNO to account
            [2] Change .uno amount on account by increasing for .amountUno
        
        
        */

        let {amountUno, recipient, quorumAgreements} = transaction.payload.params[0] 

        let epochHandler = WORKING_THREADS.VERIFICATION_THREAD.EPOCH

        let epochFullID = epochHandler.hash+'#'+epochHandler.id

        let dataThatShouldBeSigned = `${epochFullID}:${amountUno}:${recipient}:mintUnobtanium`


        if(typeof amountUno === 'number' && typeof recipient === 'number' && typeof quorumAgreements === 'object' && verifyQuorumMajoritySolution(dataThatShouldBeSigned,quorumAgreements)){

            let recipientAccount = await getFromState(originShard+':'+recipient)

            if(recipientAccount){

                recipientAccount.uno += amountUno

                return {isOk:true}

            } else return {isOk:false, reason:'No such account'}

        } else return {isOk:false, reason:'Wrong datatypes or majority verification failed'}


    },

    // To decrease number of UNO from some account

    burnUnobtanium:async (transaction,originShard)=>{

        /*
        
            Transaction payload is 

            {

                amountToBurn:<number>,

                recipient:<address to>


            }
        
        */

        // let {amountUno, recipient, quorumAgreements} = transaction.payload[0]

        // let epochHandler = WORKING_THREADS.VERIFICATION_THREAD.EPOCH

        // let epochFullID = epochHandler.hash+'#'+epochHandler.id

        // let dataThatShouldBeSigned = `${epochFullID}:${amountUno}:${recipient}:mintUnobtanium`


        // if(typeof amountUno === 'number' && typeof recipient === 'number' && typeof quorumAgreements === 'object' && verifyQuorumMajoritySolution(dataThatShouldBeSigned,quorumAgreements)){

        //     let recipientAccount = await getFromState(originShard+':'+recipient)

        //     if(recipientAccount){

        //         recipientAccount.uno += amountUno

        //         return {isOk:true}

        //     } else return {isOk:false, reason:'No such account'}

        // } else return {isOk:false, reason:'Wrong datatypes or majority verification failed'}

    }

}