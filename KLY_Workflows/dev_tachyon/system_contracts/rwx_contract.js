import { verifyQuorumMajoritySolution } from "../../../KLY_VirtualMachines/common_modules.js"

import { GLOBAL_CACHES, WORKING_THREADS } from "../blockchain_preparation.js"

import { getFromState } from "../common_functions/state_interactions.js"

import {blake3Hash} from "../../../KLY_Utils/utils.js"



export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='createContract') return 10000

    else if(methodID==='executeBatchOfDelegations') return 10000

}




export let CONTRACT = {


    createContract:async(originShard,transaction,_rewardsAndSuccessfulTxsCollector,atomicBatch)=>{

        /*
        
            Format of transaction.payload.params[0] is
       
            {

                params:{

                    agreementText:'BlaBlaBLa',

                    delegations:{

                        account1:[], // delegations in form of {contract:'',method:'',params:[]}
                    
                        account2:[],

                        ...
                        accountN:[]

                    }

                    ...<Here in form of key:value will be added additional params to extend the mediation setup. For example, preffered region and language, wished validators and other params>

                }

                signatures:{

                    account1: {sigType:'D',sig:SIG(params+tx.nonce)}
                    
                    account2: {sigType:'M',sig:SIG(params+tx.nonce)},

                    ...
                    accountN: {sigType:'P/D',sig:SIG(params+tx.nonce)}

                }

            }

            ------------- What to do ? -------------

            Just put the contract to BLOCKCHAIN_DATABASES.STATE and bind to <origin shard>. Contract ID is BLAKE3(transaction.payload.params[0])

        
        */

        // Create metadata first
        let futureRwxContractMetadataTemplate = {

            type:"contract",
            lang:'system/rwx',
            balance:0,
            uno:0,
            storages:['CONTRACT_BODY'],
            bytecode:''

        }

        // ...then - create a single storage for this new contract to store the body itself
        let futureRwxContractSingleStorage = transaction.payload.params[0]

        let contractID = blake3Hash(futureRwxContractSingleStorage)

        
        // And put it to atomic batch to BLOCKCHAIN_DATABASES.STATE

        atomicBatch.put(originShard+':'+contractID,futureRwxContractMetadataTemplate)

        atomicBatch.put(originShard+':'+contractID+'_STORAGE_CONTRACT_BODY',futureRwxContractSingleStorage)

        return {isOk:true}

    },




    executeBatchOfDelegations:async(originShard,transaction,_rewardsAndSuccessfulTxsCollector,atomicBatch)=>{

        // Here we simply execute array of delegations by contract parties dependent on solution and delete contract from state to mark deal as solved and prevent replay attacks
        // For stats it's possible to leave the fact of contract in separate DB
        // Batch of contract calls must be signed by quorum majority

        /*
        
            Format of transaction.payload.params[0] is

            {

                rwxContractId:<BLAKE3 hash id of contrct on this shard>,

                executionBatch:[

                    -------- This is array of KLY operations - TX, WVM_DEPLOY, WVM_CALL, EVM_CALL

                    {
            
                        delegator:<KLY account ID - one of 4 types + EVM format>,
                        type:TX | WVM_DEPLOY | WVM_CALL | EVM_CALL,
                        payload:,
            
                    },

                    ...

                ],

                majorityProofs:{

                    quorumMemberPubKey1: Signa1,
                    ...
                    quorumMemberPubKeyN: SignaN,

                }

            }
        
        
        */

        let epochHandler = WORKING_THREADS.VERIFICATION_THREAD.EPOCH

        let epochFullID = epochHandler.hash+'#'+epochHandler.id

        let payloadJSON = JSON.stringify(transaction.payload)
    
        let dataThatShouldBeSigned = `RWX:${epochFullID}:${payloadJSON}`
    
        let proofsByQuorumMajority = transaction.payload?.params?.[0]?.majorityProofs



        if(verifyQuorumMajoritySolution(dataThatShouldBeSigned,proofsByQuorumMajority)){

            // Now, parse the rest data from payload and execute all inner txs

            let {rwxContractId, executionBatch} = transaction.payload.params[0]

            // Check if it's not a same-block-replay attack

            if(!GLOBAL_CACHES.STATE_CACHE.has(originShard+':'+rwxContractId+':'+'REPLAY_PROTECTION')){

                // Check if contract present in state

                let rwxContractWasCreated = await getFromState(rwxContractId)

                if(rwxContractWasCreated){

                    for(let tx of executionBatch){

                        tx
    
                    }
    
                    // Finally - delete this RWX contract from DB to prevent replay attacks
                
                    atomicBatch.del(originShard+':'+rwxContractId)
    
                    atomicBatch.del(originShard+':'+rwxContractId+'_STORAGE_CONTRACT_BODY')

                    // Delete from cache too

                    GLOBAL_CACHES.STATE_CACHE.delete(originShard+':'+rwxContractId)

                    GLOBAL_CACHES.STATE_CACHE.delete(originShard+':'+rwxContractId+'_STORAGE_CONTRACT_BODY')
                
                    GLOBAL_CACHES.STATE_CACHE.set(originShard+':'+rwxContractId+':'+'REPLAY_PROTECTION',true)


                } else return {isOk:false, reason:'No RWX contract with this id'}
                
            } else return {isOk:false, reason:'Replay attack detection'}
            
        } else return {isOk:false, reason:'Majority verification failed'}

    }

}