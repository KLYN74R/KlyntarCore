import {verifyQuorumMajoritySolution} from "../../../KLY_VirtualMachines/common_modules.js"

import {WORKING_THREADS} from "../blockchain_preparation.js"




export let gasUsedByMethod=methodID=>{

    if(methodID==='votingAccept') return 10000

}




export let CONTRACT = {


    /*
    
        {

            votingType:'version' | 'workflow'

            payload:{

                newMajorVersion: <uint> (?)

                OR

                updateField: 'Field name from workflow params',
                newValue:''

            }

            quorumAgreements:{

                quorumMemberPubKey1: Signature(`votingAccept:${votingType}:${JSON.stringify(payload)}`),
                ...
                quorumMemberPubKeyN: Signature(`votingAccept:${votingType}:${JSON.stringify(payload)}`)

            }
        }

    
    */
    votingAccept:async(threadContext, transaction)=>{

        let {votingType, payload, quorumAgreements} = transaction.payload.params[0]

        let threadById = threadContext === 'AT' ? WORKING_THREADS.APPROVEMENT_THREAD : WORKING_THREADS.VERIFICATION_THREAD

        // Verify the majority's proof

        let dataThatShouldBeSignedByQuorum = `votingAccept:${votingType}:${JSON.stringify(payload)}`

        let majorityProofIsOk = verifyQuorumMajoritySolution(dataThatShouldBeSignedByQuorum,quorumAgreements)


        if(majorityProofIsOk){

            if(votingType === 'version') threadById.VERSION = payload.newMajorVersion

            else if (votingType === 'workflow') threadById.WORKFLOW_OPTIONS[payload.updateField] = payload.newValue

            return {isOk:true}

        } else return {isOk:false,reason:'Majority proof verification failed'}

    }
    
}