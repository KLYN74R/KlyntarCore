/* eslint-disable no-unused-vars */
import {verifyQuorumMajoritySolution} from "../../../KLY_VirtualMachines/common_modules.js"

import {WORKING_THREADS} from "../blockchain_preparation.js"

import Web3 from 'web3'




export let gasUsedByMethod=methodID=>{

    if(methodID==='votingAccept') return 10000

    else if(methodID==='addNewShard') return 10000

}




export let CONTRACT = {


    /*
    
        {

            votingType:'version' | 'parameters'

            payload:{

                newMajorVersion: <uint> (?)

                OR

                updateField: 'Field name from network params',
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

        let threadById = threadContext === 'APPROVEMENT_THREAD' ? WORKING_THREADS.APPROVEMENT_THREAD : WORKING_THREADS.VERIFICATION_THREAD

        // Verify the majority's proof

        let dataThatShouldBeSignedByQuorum = `votingAccept:${votingType}:${JSON.stringify(payload)}`

        let majorityProofIsOk = verifyQuorumMajoritySolution(dataThatShouldBeSignedByQuorum,quorumAgreements)


        if(majorityProofIsOk){

            if(votingType === 'version') threadById.CORE_MAJOR_VERSION = payload.newMajorVersion

            else if (votingType === 'parameters') threadById.NETWORK_PARAMETERS[payload.updateField] = payload.newValue

            return {isOk:true}

        } else return {isOk:false,reason:'Majority proof verification failed'}

    },


    /*
    
        Method to cahnge number of shards
    
        {

            shardID:'shard_id',

            operation:'+' | '-'

            quorumAgreements:{

                quorumMemberPubKey1: Signature(`changeNumberOfShards:${shardID}:${operation}`),
                ...
                quorumMemberPubKeyN: Signature(`changeNumberOfShards:${shardID}:${operation}`)

            }
        }
    
    */
    changeNumberOfShards:async(threadContext, transaction)=>{

        let {shardID, operation, quorumAgreements} = transaction.payload.params[0]

        let threadById = threadContext === 'APPROVEMENT_THREAD' ? WORKING_THREADS.APPROVEMENT_THREAD : WORKING_THREADS.VERIFICATION_THREAD

        // Verify the majority's proof

        let dataThatShouldBeSignedByQuorum = `changeNumberOfShards:${shardID}:${operation}`

        let majorityProofIsOk = verifyQuorumMajoritySolution(dataThatShouldBeSignedByQuorum,quorumAgreements)


        if(majorityProofIsOk){

            if(operation === '+' && !threadById.EPOCH.shardsRegistry.includes(shardID)){

                threadById.EPOCH.shardsRegistry.push(shardID)

                // Add the SID tracker

                if(threadContext === 'VT'){

                    WORKING_THREADS.VERIFICATION_THREAD.SID_TRACKER[shardID] = 0

                    WORKING_THREADS.VERIFICATION_THREAD.KLY_EVM_METADATA[shardID] = {
        
                        nextBlockIndex: Web3.utils.toHex(BigInt(0).toString()),
                
                        parentHash:'0000000000000000000000000000000000000000000000000000000000000000',
                
                        timestamp:Math.floor(WORKING_THREADS.VERIFICATION_THREAD.EPOCH.startTimestamp/1000)
                
                    }

                }

            } else if(operation === '-' && threadById.EPOCH.shardsRegistry.includes(shardID)){

                let indexInRegistry = threadById.EPOCH.shardsRegistry.indexOf(shardID)

                threadById.EPOCH.shardsRegistry.splice(indexInRegistry, 1)

                // Remove the SID tracker

                if(threadContext === 'VERIFICATION_THREAD'){

                    delete WORKING_THREADS.VERIFICATION_THREAD.SID_TRACKER[shardID]

                    delete WORKING_THREADS.VERIFICATION_THREAD.KLY_EVM_METADATA[shardID]
                
                }

            }

            return {isOk:true}

        } else return {isOk:false,reason:'Majority proof verification failed'}

    }
    
}