import {getAccountFromState, getFromState} from '../common_functions/state_interactions.js'

import {GLOBAL_CACHES, WORKING_THREADS} from '../blockchain_preparation.js'

import {blake3Hash, verifyEd25519} from '../../../KLY_Utils/utils.js'

import {KLY_EVM} from '../../../KLY_VirtualMachines/kly_evm/vm.js'

import tbls from '../../../KLY_Utils/signatures/threshold/tbls.js'

import bls from '../../../KLY_Utils/signatures/multisig/bls.js'

import {VM} from '../../../KLY_VirtualMachines/kly_wvm/vm.js'

import {SYSTEM_CONTRACTS} from '../system_contracts/root.js'

import {BLOCKCHAIN_GENESIS} from '../../../klyn74r.js'

import {TXS_FILTERS} from './txs_filters.js'

import web3 from 'web3'






let getPricePerSignatureType = transaction => {

    if(transaction.payload.type==='D') return 0
    
    if(transaction.payload.type==='T') return 0.01

    if(transaction.payload.type==='P/D') return 0.03

    if(transaction.payload.type==='P/B') return 0.02

    if(transaction.payload.type==='M') return 0.01+transaction.payload.afk.length*0.001

}


//Load required modules and inject to contract
// eslint-disable-next-line no-unused-vars
let getMethodsToInject=_imports=>{

    return {}

}




let defaultVerificationProcess=async(senderAccount,tx,goingToSpend)=>{


    return  senderAccount.type==='account'
            &&
            senderAccount.balance-goingToSpend>=0
            &&
            senderAccount.nonce<tx.nonce

}




export let verifyBasedOnSigTypeAndVersion = async(tx,senderStorageObject,originShard) => {

    
    if(WORKING_THREADS.VERIFICATION_THREAD.VERSION === tx.v){

        // Sender sign concatenated SYMBIOTE_ID(to prevent cross-symbiote attacks and reuse nonce & signatures), workflow version, shard(context where to execute tx), tx type, JSON'ed payload,nonce and fee
        
        let signedData = BLOCKCHAIN_GENESIS.SYMBIOTE_ID+tx.v+originShard+tx.type+JSON.stringify(tx.payload)+tx.nonce+tx.fee
    

        if(tx.payload.type==='D') return verifyEd25519(signedData,tx.sig,tx.creator)
        
        if(tx.payload.type==='T') return tbls.verifyTBLS(tx.creator,tx.sig,signedData)
        
        if(tx.payload.type==='P/D') {

            let isOk = false

            try{

                isOk = blake3Hash(tx.payload.pubKey) === tx.creator && globalThis.verifyDilithiumSignature(signedData,tx.payload.pubKey,tx.sig)
            
            }catch{isOk = false}

            return isOk === 'true'
            
        }
        
        if(tx.payload.type==='P/B'){
          
            let isOk=false

            try{

                isOk = blake3Hash(tx.payload.pubKey) === tx.creator && globalThis.verifyBlissSignature(signedData,tx.payload.pubKey,tx.sig)
            
            }catch{ isOk = false}

            return isOk === 'true'

        }
        
        if(tx.payload.type==='M') return bls.verifyThresholdSignature(tx.payload.active,tx.payload.afk,tx.creator,signedData,tx.sig,senderStorageObject.rev_t)     

    }else return false

}




export let simplifiedVerifyBasedOnSignaType=(type,pubkey,signa,data)=>{

    if(type==='D') return verifyEd25519(data,signa,pubkey)
    
    if(type==='P/D') return globalThis.verifyDilithiumSignature(data,pubkey,signa)
    
    if(type==='P/B') return globalThis.verifyBlissSignature(data,pubkey,signa)
    
}




export let VERIFIERS = {



    /*

    Default transaction
    
    Structure
    
    {
        to:<address to send KLY to>
        amount:<KLY to transfer>
        rev_t:<if recepient is BLS address - then we need to give a reverse threshold(rev_t = number of members of msig whose votes can be ignored)>
    }
    
    */

    TX:async(originShard,tx,rewardsAndSuccessfulTxsCollector)=>{

        let senderAccount = await getAccountFromState(originShard+':'+tx.creator),
        
            recipientAccount = await getAccountFromState(originShard+':'+tx.payload.to),

            goingToSpend = getPricePerSignatureType(tx)+tx.payload.amount+tx.fee

        tx = await TXS_FILTERS.TX(tx,originShard) //pass through the filter

        if(!tx){

            return {isOk:false,reason:`Can't get filtered value of tx`}
        
        }else if(await defaultVerificationProcess(senderAccount,tx,goingToSpend)){

            if(!recipientAccount){
    
                //Create default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
                recipientAccount={
                
                    type:'account',
                    balance:0,
                    uno:0,
                    nonce:0
                
                }
                
                //Only case when recipient is BLS multisig, so we need to add reverse threshold to account to allow to spend even in case REV_T number of pubkeys don't want to sign
                if(typeof tx.payload.rev_t === 'number') recipientAccount.rev_t=tx.payload.rev_t
    
                GLOBAL_CACHES.STATE_CACHE.set(originShard+':'+tx.payload.to,recipientAccount) //add to cache to collapse after all events in blocks of block
            
            }
            
            senderAccount.balance-=goingToSpend
                
            recipientAccount.balance+=tx.payload.amount
        
            senderAccount.nonce=tx.nonce
            
            rewardsAndSuccessfulTxsCollector.fees+=tx.fee

            return {isOk:true}

        }else return {isOk:false,reason:`Default verification process failed. Make sure input is ok`}
        
    },




    /*

    Method to deploy onchain contract to VM. You can use any payment method you want
    
    Payload is

        {
            bytecode:<hexString>,
            lang:<RUST|ASC>,
            constructorParams:[]
        }

    If it's one of SPEC_CONTRACTS (alias define,service deploying,unobtanium mint and so on) the structure will be like this

    {
        bytecode:'',(empty)
        lang:'system/<name of contract>'
        constructorParams:[]
    }

    */

    WVM_CONTRACT_DEPLOY:async (originShard,tx,rewardsAndSuccessfulTxsCollector,atomicBatch)=>{

        let senderAccount = await getAccountFromState(originShard+':'+tx.creator)

        let goingToSpend = getPricePerSignatureType(tx)+JSON.stringify(tx.payload).length+tx.fee


        tx = await TXS_FILTERS.WVM_CONTRACT_DEPLOY(tx,originShard) //pass through the filter


        if(!tx){

            return {isOk:false,reason:`Can't get filtered value of tx`}

        }
        else if(await defaultVerificationProcess(senderAccount,tx,goingToSpend)){

            if(tx.payload.lang.startsWith('system/')){

                let typeofContract = tx.payload.lang.split('/')[1]

                if(SYSTEM_CONTRACTS.has(typeofContract)){

                    await SYSTEM_CONTRACTS.get(typeofContract).constructor(tx,atomicBatch) // do deployment logic

                    senderAccount.balance-=goingToSpend
            
                    senderAccount.nonce=tx.nonce
                    
                    rewardsAndSuccessfulTxsCollector.fees+=tx.fee

                }else return {isOk:false,reason:`No such type of system contract`}

            }else{

                let contractID = blake3Hash(originShard+JSON.stringify(tx))

                let contractTemplate = {
    
                    type:"contract",
                    lang:tx.payload.lang,
                    balance:0,
                    uno:0,
                    storages:[],
                    bytecode:tx.payload.bytecode
    
                }
            
                atomicBatch.put(contractID,contractTemplate)
    
                senderAccount.balance-=goingToSpend
            
                senderAccount.nonce=tx.nonce
                
                rewardsAndSuccessfulTxsCollector.fees+=tx.fee
    
            }

            return {isOk:true}

        }else return {isOk:false,reason:`Default verification process failed. Make sure input is ok`}

    },


    /*

        Method to call contract
    
        Payload is

        {

            contractID:<BLAKE3 hashID of contract OR alias of contract(for example, system contracts)>,
            method:<string method to call>,
            gasLimit:<maximum allowed in KLY to execute contract>
            params:[] params to pass to function
            imports:[] imports which should be included to contract instance to call. Example ['default.CROSS-CONTRACT','storage.GET_FROM_ARWEAVE']. As you understand, it's form like <MODULE_NAME>.<METHOD_TO_IMPORT>
        
        }


    */
    WVM_CALL:async(originShard,tx,rewardsAndSuccessfulTxsCollector,atomicBatch)=>{

        let senderAccount = await getAccountFromState(originShard+':'+tx.creator),

            goingToSpend = getPricePerSignatureType(tx)+tx.fee+tx.payload.gasLimit

        tx = await TXS_FILTERS.WVM_CALL(tx,originShard) //pass through the filter

        
        if(!tx){

            return {isOk:false,reason:`Can't get filtered value of tx`}
        
        }else if(await defaultVerificationProcess(senderAccount,tx,goingToSpend)){

            let contractMetadata = await getFromState(originShard+':'+tx.payload.contractID)

            if(contractMetadata){

                if(contractMetadata.lang.startsWith('system/')){

                    let systemContractName = contractMetadata.lang.split('/')[1]

                    if(SYSTEM_CONTRACTS.has(systemContractName)){

                        let systemContract = SYSTEM_CONTRACTS.get(systemContractName)
                        
                        let execResultWithReason = await systemContract[tx.payload.method](tx,originShard,atomicBatch) // result is {isOk:true/false, reason:''}

                        senderAccount.balance-=goingToSpend
            
                        senderAccount.nonce=tx.nonce
                    
                        rewardsAndSuccessfulTxsCollector.fees+=tx.fee

                        return execResultWithReason


                    } else return {isOk:false,reason:`No such type of system contract`}


                } else {

                    // Prepare the contract instance

                    let gasLimit = tx.payload.gasLimit * 1_000_000_000 // 1 KLY = 10^9 gas. You set the gasLimit in KLY(to avoid confusing)

                    /*
                
                        TODO: We should return only instance, and inside .bytesToMeteredContract() we should create object to allow to execute contract & host functions from modules with the same caller's handler to control the context & gas burned
                
                    */
            
                    try{

                        //__________________________ Run the contract call logic __________________________

                        /*
                        
                            Since transaction may contain cross-contract / cross-VM calls - we have to run the infinite while loop and process transaction step-by-step
                        
                            Handle all the sub-calls. In case contract call returns object like:
                            
                                {
                                    next:<contractID>,func:<method>,params:<params>}

                                }

                        */

                        let {contractInstance,contractMetadata} = await VM.bytesToMeteredContract(
                        
                            Buffer.from(contractMetadata.bytecode,'hex'), gasLimit, await getMethodsToInject(tx.payload.imports)
                                    
                        )

                        
                        let goingToCallContractID = tx.payload.contractID

                        let methodToCall = tx.payload.method

                        let paramsToPass = tx.payload.params


                        let lastSubCallInChain = false

                        let results = new Map() // callID => result

                        let callbacksQueue = []

                        while(!lastSubCallInChain) {

                            let intermediateResultAsJSON = VM.callContract(contractInstance,contractMetadata,paramsToPass,methodToCall,contractMetadata.type)
                            
                            let parsedIntermediateResult = JSON.parse(intermediateResultAsJSON)

                            results.set(goingToCallContractID+methodToCall,parsedIntermediateResult)

                            // If this contract call includes next subcalls(saying, cross-contract / cross-VM call) - continue this while
                            
                            if(!parsedIntermediateResult.nextCall) lastSubCallInChain = true

                            else if (parsedIntermediateResult.callBackData){

                                let {vmID,contractID,methodID,params} = parsedIntermediateResult.callBackData

                                callbacksQueue.push(parsedIntermediateResult.callBackData)

                            }

                        }

                    }catch(err){

                        // eslint-disable-next-line no-unused-vars
                        resultAsJSON = err.message

                    }
            
                    senderAccount.balance -= goingToSpend
    
                    senderAccount.nonce = tx.nonce
            
                    rewardsAndSuccessfulTxsCollector.fees += tx.fee

                }

                return {isOk:true}

            }else return {isOk:false,reason:`No metadata for contract`}

        }else return {isOk:false,reason:`Default verification process failed. Make sure input is ok`}

    },


    /*

        To interact with EVM

        [+] Payload is hexadecimal evm bytecode with 0x prefix(important reminder not to omit tx)

    */
    EVM_CALL:async(originShard,txWithPayload,rewardsAndSuccessfulTxsCollector,atomicBatch)=>{

        global.ATOMIC_BATCH = atomicBatch

        let evmResult = await KLY_EVM.callEVM(originShard,txWithPayload.payload).catch(()=>false)

        if(evmResult && !evmResult.execResult.exceptionError){
          
            let totalSpentInWei = evmResult.amountSpent //BigInt value

            let totalSpentByTxInKLY = web3.utils.fromWei(totalSpentInWei.toString(),'ether')

          
            // Add appropriate value to rewardbox to distribute among KLY pools

            totalSpentByTxInKLY = +totalSpentByTxInKLY

            rewardsAndSuccessfulTxsCollector.fees += totalSpentByTxInKLY

            let possibleReceipt = KLY_EVM.getTransactionWithReceiptToStore(
                
                txWithPayload.payload,
            
                evmResult,
            
                GLOBAL_CACHES.STATE_CACHE.get('EVM_LOGS_MAP')
            
            )

            if(possibleReceipt){

                let {tx,receipt} = possibleReceipt

                atomicBatch.put('TX:'+tx.hash,{tx,receipt})

                return {isOk:true,reason:'EVM'}

            }else return {isOk:false,reason:'EVM'}

        } return {isOk:false,reason:'EVM'}

    }

}