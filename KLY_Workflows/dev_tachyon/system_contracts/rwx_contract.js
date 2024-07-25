import {blake3Hash} from "../../../KLY_Utils/utils.js"




export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='createContract') return 10000

}




export let CONTRACT = {


    createContract:async(transaction,originShard,atomicBatch)=>{

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




    executeBatchOfDelegations:async(transaction,originShard,atomicBatch)=>{

        // Here we simply execute array of delegations by contract parties dependent on solution and delete contract from state to mark deal as solved and prevent replay attacks
        // For stats it's possible to leave the fact of contract in separate DB
        // Batch of contract calls must be signed by quorum majority

        /*
        
            Format of transaction.payload.params[0] is

            {

                rwxContractId:<BLAKE3 hash id of contrct on this shard>,

                executionBatch:[

                    -------- This is array of KLY operations - TX, WVM_DEPLOY, WVM_CALL, EVM_CALL

                    {},
                    {},
                    {},

                ],



            }
        
        
        */

    }

}