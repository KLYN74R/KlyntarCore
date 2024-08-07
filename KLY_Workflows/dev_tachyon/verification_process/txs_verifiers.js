import {getAccountFromState, getFromState} from '../common_functions/state_interactions.js'

import {verifyQuorumMajoritySolution} from '../../../KLY_VirtualMachines/common_modules.js'

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





let getCostPerSignatureType = transaction => {

    if(transaction.payload.sigType==='D' || typeof transaction.payload.abstractionBoosts === 'object') return 0 // In case it's default ed25519 or AAv2 - don't charge extra fees
    
    if(transaction.payload.sigType==='T') return 0.00001

    if(transaction.payload.sigType==='P/D') return 0.0001

    if(transaction.payload.sigType==='P/B') return 0.00007

    if(transaction.payload.sigType==='M') return 0.00001+transaction.payload.afk.length*0.00001

    return 0

}


// Load required modules and inject to contract
// eslint-disable-next-line no-unused-vars
let getMethodsToInject=_imports=>{

    return {}

}




let commonVerificationProcess=async(senderAccount,tx)=>{


    return  tx.fee >= 0
            &&
            senderAccount.type==='account'
            &&
            senderAccount.nonce<tx.nonce

}




// let trackTransactionsList=async(originShard,txid,...touchedAccounts)=>{

//     // Function to allow to fill the list of transaction per address

//     let dataToPush = {isOk: true, txid}

//     for(let account of touchedAccounts){

//         let accStore = await BLOCKCHAIN_DATABASES.EXPLORER_DATA.get(`TXS_TRACKER:${originShard}:${account}`).catch(_=>[])
        
//         accStore.push(dataToPush)

//         await BLOCKCHAIN_DATABASES.EXPLORER_DATA.put(`TXS_TRACKER:${originShard}:${tx.creator}`,accStore)        

//     }


//     let txsTrackerForSender = await BLOCKCHAIN_DATABASES.EXPLORER_DATA.get(`TXS_TRACKER:${originShard}:${tx.creator}`)

//     let txsTrackerForRecepient = await BLOCKCHAIN_DATABASES.EXPLORER_DATA.get(`TXS_TRACKER:${originShard}:${tx.payload.to}`)

//     txsTrackerForSender.push(dataToPush)



//     txsTrackerForRecepient.push(dataToPush)

//     await BLOCKCHAIN_DATABASES.EXPLORER_DATA.put(`TXS_TRACKER:${originShard}:${tx.creator}`,txsTrackerForSender)

//     await BLOCKCHAIN_DATABASES.EXPLORER_DATA.put(`TXS_TRACKER:${originShard}:${tx.payload.to}`,txsTrackerForRecepient)

// }



export let verifyBasedOnSigTypeAndVersion = async(tx,senderStorageObject,originShard) => {

    
    if(WORKING_THREADS.VERIFICATION_THREAD.VERSION === tx.v){

        // Sender sign concatenated SYMBIOTE_ID(to prevent cross-symbiote attacks and reuse nonce & signatures), workflow version, shard(context where to execute tx), tx type, JSON'ed payload,nonce and fee
        
        let signedData = BLOCKCHAIN_GENESIS.SYMBIOTE_ID+tx.v+originShard+tx.type+JSON.stringify(tx.payload)+tx.nonce+tx.fee
    

        if(tx.payload.sigType==='D') return verifyEd25519(signedData,tx.sig,tx.creator)
        
        if(tx.payload.sigType==='T') return tbls.verifyTBLS(tx.creator,tx.sig,signedData)
        
        if(tx.payload.sigType==='P/D') {

            let isOk = false

            try{

                isOk = blake3Hash(tx.payload.pubKey) === tx.creator && globalThis.verifyDilithiumSignature(signedData,tx.payload.pubKey,tx.sig)
            
            }catch{isOk = false}

            return isOk === 'true'
            
        }
        
        if(tx.payload.sigType==='P/B'){
          
            let isOk = false

            try{

                isOk = blake3Hash(tx.payload.pubKey) === tx.creator && globalThis.verifyBlissSignature(signedData,tx.payload.pubKey,tx.sig)
            
            }catch{ isOk = false}

            return isOk === 'true'

        }
        
        if(tx.payload.sigType==='M') return bls.verifyThresholdSignature(tx.payload.active,tx.payload.afk,tx.creator,signedData,tx.sig,senderStorageObject.rev_t)     

    }else return false

}




export let simplifiedVerifyBasedOnSignaType=(type,pubkey,signa,data)=>{

    if(type==='D') return verifyEd25519(data,signa,pubkey)
    
    if(type==='P/D') return globalThis.verifyDilithiumSignature(data,pubkey,signa)
    
    if(type==='P/B') return globalThis.verifyBlissSignature(data,pubkey,signa)
    
}


let calculateAmountToSpendAndGasToBurn = tx => {

    let goingToSpendInNativeCurrency = 0

    let goingToBurnGasAmount = 0

    let transferAmount = tx.payload.amount || 0
    

    if(tx.fee > 0){

        // In this case creator pays fee in native KLY currency

        goingToSpendInNativeCurrency = getCostPerSignatureType(tx) + transferAmount + tx.fee

        if(tx.type === 'WVM_CONTRACT_DEPLOY'){

            goingToSpendInNativeCurrency += 0.000002 * (tx.payload.bytecode.length/2) // 0.000002 KLY per byte

        } else if(tx.type === 'WVM_CALL'){

            goingToSpendInNativeCurrency += 0.000002 * (tx.payload.bytecode.length/2)

        } else if(tx.type === 'EVM_CALL'){


        }

    } else if(tx.fee === 0 && tx.payload.abstractionBoosts){

        // In this case creator pays using boosts. This should be signed by current quorum

        goingToSpendInNativeCurrency = transferAmount

        let dataThatShouldBeSignedForBoost = `BOOST:${tx.creator}:${tx.nonce}` // TODO: Fix data that should be signed

        if(verifyQuorumMajoritySolution(dataThatShouldBeSignedForBoost,tx.payload.abstractionBoosts?.quorumAgreements)){

            goingToBurnGasAmount = tx.payload.abstractionBoosts.proposedGasToBurn

        } return {errReason:`Majority verification failed in attempt to use boost`}

    } else {

        // Otherwise - it's AA 2.0 usage and we just should reduce the gas amount from account

        goingToSpendInNativeCurrency = transferAmount

        goingToBurnGasAmount = getCostPerSignatureType(tx) * 1_000_000_000 * 2

        if(tx.type === 'WVM_CONTRACT_DEPLOY'){


        } else if(tx.type === 'WVM_CALL'){

        } else if(tx.type === 'EVM_CALL'){

            
        }

    }

    return {goingToSpendInNativeCurrency,goingToBurnGasAmount}

}



export let VERIFIERS = {



    /*

    Default transaction
    
    Structure of payload
    
    {
        to:<address to send KLY to>
        amount:<KLY to transfer>
        rev_t:<if recipient is BLS address - then we need to give a reverse threshold(rev_t = number of members of msig whose votes can be ignored)>
    }

    ----------------- In case of usage AA / boosts -----------------

    You may add to payload:

    abstractionBoosts: {
        
        proposedGasToBurn:<amount>,

        quorumAgreements:{

            quorumMember1:SIG(),
            ...
            quorumMemberN:SIG()

        }

    }


    
    */

    TX:async(originShard,tx,rewardsAndSuccessfulTxsCollector)=>{

        let senderAccount = await getAccountFromState(originShard+':'+tx.creator), recipientAccount = await getFromState(originShard+':'+tx.payload.to)

        tx = await TXS_FILTERS.TX(tx,originShard) // pass through the filter

        if(tx && await commonVerificationProcess(senderAccount,tx)){

            if(!recipientAccount){
    
                // Create default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
                recipientAccount = {
                
                    type:'account',

                    balance:0,
                    
                    uno:0,
                    
                    nonce:0,

                    gas:0
                
                }
                
                // Only case when recipient is BLS multisig, so we need to add reverse threshold to account to allow to spend even in case REV_T number of pubkeys don't want to sign
                if(typeof tx.payload.rev_t === 'number') recipientAccount.rev_t = tx.payload.rev_t
    
                GLOBAL_CACHES.STATE_CACHE.set(originShard+':'+tx.payload.to,recipientAccount) // add to cache to collapse after all events in block
            
            }

            let goingToSpent = calculateAmountToSpendAndGasToBurn(tx)

            if(!goingToSpent.errReason){

                if(senderAccount.balance - goingToSpent.goingToSpendInNativeCurrency >= 0 && senderAccount.gas - goingToSpent.goingToBurnGasAmount >= 0){

                    senderAccount.balance -= goingToSpent.goingToSpendInNativeCurrency
                
                    recipientAccount.balance += tx.payload.amount
    
                    senderAccount.gas -= goingToSpent.goingToBurnGasAmount
                
                    senderAccount.nonce = tx.nonce
                    
                    rewardsAndSuccessfulTxsCollector.fees += tx.fee
        
                    return {isOk:true}        

                } else return {isOk:false,reason:`Not enough native currency or gas to execute transaction`}

            } else return {isOk:false,reason:goingToSpent.errReason}
            
        } else return {isOk:false,reason:`Default verification process failed. Make sure input is ok`}
        
    },




    /*

    Method to deploy onchain contract to VM. You can use any payment method you want
    
    Payload is

        {
            bytecode:<hexString>,
            lang:<RUST|ASC>,
            constructorParams:[]
        }

    If it's one of system contracts (alias define,service deploying,unobtanium mint and so on) the structure will be like this

    {
        bytecode:'',(empty)
        lang:'system/<name of contract>'
        constructorParams:[]
    }

    */

    WVM_CONTRACT_DEPLOY:async (originShard,tx,rewardsAndSuccessfulTxsCollector,atomicBatch)=>{

        let senderAccount = await getAccountFromState(originShard+':'+tx.creator)

        let goingToSpend = getCostPerSignatureType(tx)+tx.fee

        tx = await TXS_FILTERS.WVM_CONTRACT_DEPLOY(tx,originShard) //pass through the filter

        if(tx && await commonVerificationProcess(senderAccount,tx,goingToSpend)){

            if(tx.payload.lang.startsWith('system/staking')){ // TODO - delete once we add more

                let typeofContract = tx.payload.lang.split('/')[1]

                if(SYSTEM_CONTRACTS.has(typeofContract)){

                    await SYSTEM_CONTRACTS.get(typeofContract).constructor(originShard,tx,atomicBatch) // run deployment logic

                    senderAccount.balance -= goingToSpend
            
                    senderAccount.nonce = tx.nonce
                    
                    rewardsAndSuccessfulTxsCollector.fees += tx.fee

                    return {isOk:true}

                }else return {isOk:false,reason:`No such type of system contract`}

            }else{

                let contractID = blake3Hash(originShard+JSON.stringify(tx))

                let contractMetadataTemplate = {
    
                    type:'contract',
                    lang:tx.payload.lang,
                    balance:0,
                    uno:0,
                    gas:0,
                    storages:['DEFAULT'],
                    bytecode:tx.payload.bytecode,
                    storageAbstractionLastPayment:WORKING_THREADS.VERIFICATION_THREAD.EPOCH.id
    
                }
            
                atomicBatch.put(originShard+':'+contractID,contractMetadataTemplate)

                atomicBatch.put(originShard+':'+contractID+'_STORAGE_DEFAULT',{}) // autocreate the default storage for contract
    
                senderAccount.balance -= goingToSpend
            
                senderAccount.nonce = tx.nonce
                
                rewardsAndSuccessfulTxsCollector.fees += tx.fee

                return {isOk:true}
    
            }

        } else return {isOk:false,reason:`Can't get filtered value of tx`}

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

            goingToSpend = getCostPerSignatureType(tx)+tx.fee+tx.payload.gasLimit

        tx = await TXS_FILTERS.WVM_CALL(tx,originShard) // pass through the filter


        if(tx && await commonVerificationProcess(senderAccount,tx,goingToSpend)){

            if(tx.payload.contractID?.startsWith('system/')){

                // Call system smart-contract

                let systemContractName = tx.payload.contractID.split('/')[1]

                if(SYSTEM_CONTRACTS.has(systemContractName)){

                    let systemContract = SYSTEM_CONTRACTS.get(systemContractName)
                    
                    let execResultWithStatusAndReason = await systemContract[tx.payload.method](originShard,tx,atomicBatch) // result is {isOk:true/false, reason:''}

                    senderAccount.balance -= goingToSpend
        
                    senderAccount.nonce = tx.nonce
                
                    rewardsAndSuccessfulTxsCollector.fees += tx.fee

                    return execResultWithStatusAndReason


                } else return {isOk:false,reason:`No such type of system contract`}


            } else  {

                // Otherwise it's attempt to call custom contract

                let contractMetadata = await getFromState(originShard+':'+tx.payload.contractID)

                if(contractMetadata){

                    // Prepare the contract instance

                    let gasLimit = tx.payload.gasLimit * 1_000_000_000 // 1 KLY = 10^9 gas. You set the gasLimit in KLY(to avoid confusing)

                    let {contractInstance,contractMetadata} = await VM.bytesToMeteredContract(Buffer.from(contractMetadata.bytecode,'hex'), gasLimit, getMethodsToInject(tx.payload.imports))

                    let methodToCall = tx.payload.method

                    let paramsToPass = tx.payload.params

                    // Before call - get the contract default storage from state DB

                    let contractStorage = await getFromState(originShard+':'+tx.payload.contractID+'_STORAGE_DEFAULT')

                    // Call contract

                    let resultAsJson = VM.callContract(contractInstance,contractMetadata,paramsToPass,methodToCall,contractMetadata.lang)
            
            
                    senderAccount.balance -= goingToSpend
    
                    senderAccount.nonce = tx.nonce
            
                    rewardsAndSuccessfulTxsCollector.fees += tx.fee

                    return {isOk:true,extraData:JSON.parse(resultAsJson)} // TODO: Limit the size of <extraData> field

                } else return {isOk:false,reason:`No metadata for contract`}

            }

        } else return {isOk:false,reason:`Can't get filtered value of tx`}

    },


    /*

        To interact with EVM

        [+] Payload is hexadecimal evm bytecode with 0x prefix(important reminder not to omit tx)

    */
    EVM_CALL:async(originShard,txWithPayload,rewardsAndSuccessfulTxsCollector,atomicBatch)=>{

        global.ATOMIC_BATCH = atomicBatch

        let evmResult = await KLY_EVM.callEVM(originShard,txWithPayload.payload).catch(()=>false)

        if(evmResult && !evmResult.execResult.exceptionError){
          
            let totalSpentInWei = evmResult.amountSpent // BigInt value

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