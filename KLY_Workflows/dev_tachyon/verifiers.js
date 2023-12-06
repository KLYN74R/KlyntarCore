/*

@Vlad@ Chernenko


██████╗ ███████╗███████╗ █████╗ ██╗   ██╗██╗  ████████╗     ██████╗ ██████╗ ██╗     ██╗     ███████╗ ██████╗████████╗██╗ ██████╗ ███╗   ██╗
██╔══██╗██╔════╝██╔════╝██╔══██╗██║   ██║██║  ╚══██╔══╝    ██╔════╝██╔═══██╗██║     ██║     ██╔════╝██╔════╝╚══██╔══╝██║██╔═══██╗████╗  ██║
██║  ██║█████╗  █████╗  ███████║██║   ██║██║     ██║       ██║     ██║   ██║██║     ██║     █████╗  ██║        ██║   ██║██║   ██║██╔██╗ ██║
██║  ██║██╔══╝  ██╔══╝  ██╔══██║██║   ██║██║     ██║       ██║     ██║   ██║██║     ██║     ██╔══╝  ██║        ██║   ██║██║   ██║██║╚██╗██║
██████╔╝███████╗██║     ██║  ██║╚██████╔╝███████╗██║       ╚██████╗╚██████╔╝███████╗███████╗███████╗╚██████╗   ██║   ██║╚██████╔╝██║ ╚████║
╚═════╝ ╚══════╝╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝        ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚══════╝ ╚═════╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝


 ██████╗ ███████╗    ███████╗██╗   ██╗███████╗███╗   ██╗████████╗    ██╗  ██╗ █████╗ ███╗   ██╗██████╗ ██╗     ███████╗██████╗ ███████╗
██╔═══██╗██╔════╝    ██╔════╝██║   ██║██╔════╝████╗  ██║╚══██╔══╝    ██║  ██║██╔══██╗████╗  ██║██╔══██╗██║     ██╔════╝██╔══██╗██╔════╝
██║   ██║█████╗      █████╗  ██║   ██║█████╗  ██╔██╗ ██║   ██║       ███████║███████║██╔██╗ ██║██║  ██║██║     █████╗  ██████╔╝███████╗
██║   ██║██╔══╝      ██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║╚██╗██║   ██║       ██╔══██║██╔══██║██║╚██╗██║██║  ██║██║     ██╔══╝  ██╔══██╗╚════██║
╚██████╔╝██║         ███████╗ ╚████╔╝ ███████╗██║ ╚████║   ██║       ██║  ██║██║  ██║██║ ╚████║██████╔╝███████╗███████╗██║  ██║███████║
 ╚═════╝ ╚═╝         ╚══════╝  ╚═══╝  ╚══════╝╚═╝  ╚═══╝   ╚═╝       ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝
                                                                                                                                       

@via https://patorjk.com/software/taag/   STYLE:ANSI Shadow
                                                                                                                                           


██╗   ██╗███████╗██████╗ ██╗███████╗██╗███████╗██████╗ ███████╗
██║   ██║██╔════╝██╔══██╗██║██╔════╝██║██╔════╝██╔══██╗██╔════╝
██║   ██║█████╗  ██████╔╝██║█████╗  ██║█████╗  ██████╔╝███████╗
╚██╗ ██╔╝██╔══╝  ██╔══██╗██║██╔══╝  ██║██╔══╝  ██╔══██╗╚════██║
 ╚████╔╝ ███████╗██║  ██║██║██║     ██║███████╗██║  ██║███████║
  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝
                                                               



*/




import {GET_ACCOUNT_ON_SYMBIOTE,GET_FROM_STATE} from './utils.js'

import {KLY_EVM} from '../../KLY_VirtualMachines/kly_evm/vm.js'

import tbls from '../../KLY_Utils/signatures/threshold/tbls.js'

import {BLAKE3,ED25519_VERIFY} from '../../KLY_Utils/utils.js'

import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import {VM} from '../../KLY_VirtualMachines/kly_wvm/vm.js'

import * as _ from './systemContracts/root.js'

import FILTERS from './filters.js'

import web3 from 'web3'




let GET_SPEND_BY_SIG_TYPE = transaction => {

    if(transaction.payload.type==='D') return 0
    
    if(transaction.payload.type==='T') return 0.01

    if(transaction.payload.type==='P/D') return 0.03

    if(transaction.payload.type==='P/B') return 0.02

    if(transaction.payload.type==='M') return 0.01+transaction.payload.afk.length*0.001

}


//Load required modules and inject to contract
let GET_METHODS_TO_INJECT=imports=>{

    return {}

}


let DEFAULT_VERIFICATION_PROCESS=async(senderAccount,tx,goingToSpend)=>

    senderAccount.type==='account'
    &&
    senderAccount.balance-goingToSpend>=0
    &&
    senderAccount.nonce<tx.nonce




export let VERIFY_BASED_ON_SIG_TYPE_AND_VERSION = async(tx,senderStorageObject,originShard) => {

    
    if(global.SYMBIOTE_META.VERIFICATION_THREAD.VERSION === tx.v){

        //Sender sign concatenated SYMBIOTE_ID(to prevent cross-symbiote attacks and reuse nonce & signatures), workflow version, shard(context where to execute tx), tx type, JSON'ed payload,nonce and fee
        let signedData = global.GENESIS.SYMBIOTE_ID+tx.v+originShard+tx.type+JSON.stringify(tx.payload)+tx.nonce+tx.fee
    

        if(tx.payload.type==='D') return ED25519_VERIFY(signedData,tx.sig,tx.creator)
        
        if(tx.payload.type==='T') return tbls.verifyTBLS(tx.creator,tx.sig,signedData)
        
        if(tx.payload.type==='P/D') {

            let isOk = false

            try{

                isOk = BLAKE3(tx.payload.pubKey) === tx.creator && globalThis.verifyDilithiumSignature(signedData,tx.payload.pubKey,tx.sig)
            
            }catch{ isOk = false}

            return isOk === 'true'
            
        }
        
        if(tx.payload.type==='P/B'){
          
            let isOk=false

            try{

                isOk = BLAKE3(tx.payload.pubKey) === tx.creator && globalThis.verifyBlissSignature(signedData,tx.payload.pubKey,tx.sig)
            
            }catch{ isOk = false}

            return isOk === 'true'

        }
        
        if(tx.payload.type==='M') return bls.verifyThresholdSignature(tx.payload.active,tx.payload.afk,tx.creator,signedData,tx.sig,senderStorageObject.rev_t).catch(()=>false)      

    }else return false

}




export let SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE=(type,pubkey,signa,data)=>{

    if(type==='D') return ED25519_VERIFY(data,signa,pubkey)
    
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

    TX:async (originShard,tx,rewardBox)=>{

        let senderAccount=await GET_ACCOUNT_ON_SYMBIOTE(originShard+':'+tx.creator),
        
            recipientAccount=await GET_ACCOUNT_ON_SYMBIOTE(originShard+':'+tx.payload.to),

            goingToSpend = GET_SPEND_BY_SIG_TYPE(tx)+tx.payload.amount+tx.fee

        tx = await FILTERS.TX(tx,originShard) //pass through the filter

        if(!tx){

            return {isOk:false,reason:`Can't get filtered value of tx`}
        
        }else if(await DEFAULT_VERIFICATION_PROCESS(senderAccount,tx,goingToSpend)){

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
    
                global.SYMBIOTE_META.STATE_CACHE.set(originShard+':'+tx.payload.to,recipientAccount)//add to cache to collapse after all events in blocks of block
            
            }
            
            senderAccount.balance-=goingToSpend
                
            recipientAccount.balance+=tx.payload.amount
        
            senderAccount.nonce=tx.nonce
            
            rewardBox.fees+=tx.fee

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
        lang:'spec/<name of contract>'
        constructorParams:[]
    }

    */

    CONTRACT_DEPLOY:async (originShard,tx,rewardBox,atomicBatch)=>{

        let senderAccount=await GET_ACCOUNT_ON_SYMBIOTE(originShard+':'+tx.creator)

        let goingToSpend = GET_SPEND_BY_SIG_TYPE(tx)+JSON.stringify(tx.payload).length+tx.fee


        tx = await FILTERS.CONTRACT_DEPLOY(tx,originShard) //pass through the filter


        if(!tx){

            return {isOk:false,reason:`Can't get filtered value of tx`}

        }
        else if(await DEFAULT_VERIFICATION_PROCESS(senderAccount,tx,goingToSpend)){

            if(tx.payload.lang.startsWith('system/')){

                let typeofContract = tx.payload.lang.split('/')[1]

                if(global.SYSTEM_CONTRACTS.has(typeofContract)){

                    await global.SYSTEM_CONTRACTS.get(typeofContract).constructor(tx,atomicBatch) // do deployment logic

                    senderAccount.balance-=goingToSpend
            
                    senderAccount.nonce=tx.nonce
                    
                    rewardBox.fees+=tx.fee

                }else return {isOk:false,reason:`No such type of system contract`}

            }else{

                let contractID = BLAKE3(originShard+JSON.stringify(tx))

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
                
                rewardBox.fees+=tx.fee
    
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
    CONTRACT_CALL:async(originShard,tx,rewardBox,atomicBatch)=>{

        let senderAccount=await GET_ACCOUNT_ON_SYMBIOTE(originShard+':'+tx.creator),

            goingToSpend = GET_SPEND_BY_SIG_TYPE(tx)+tx.fee+tx.payload.gasLimit

        tx = await FILTERS.CONTRACT_CALL(tx,originShard) //pass through the filter

        
        if(!tx){

            return {isOk:false,reason:`Can't get filtered value of tx`}
        
        }else if(await DEFAULT_VERIFICATION_PROCESS(senderAccount,tx,goingToSpend)){


            let contractMeta = await GET_FROM_STATE(originShard+':'+tx.payload.contractID)


            if(contractMeta){

                if(contractMeta.lang.startsWith('spec/')){

                    let typeofContract = contractMeta.lang.split('/')[1]

                    if(global.SYSTEM_CONTRACTS.has(typeofContract)){

                        let contract = global.SYSTEM_CONTRACTS.get(typeofContract)
                        
                        await contract[tx.payload.method](tx,originShard,atomicBatch)


                        senderAccount.balance-=goingToSpend
            
                        senderAccount.nonce=tx.nonce
                    
                        rewardBox.fees+=tx.fee


                    }else return {isOk:false,reason:`No such type of system contract`}


                }else {

                    //Create contract instance
                    let gasLimit = tx.payload.gasLimit * 1_000_000_000 // 1 KLY = 10^9 gas. You set the gasLimit in KLY(to avoid confusing)

                        /*
                
                        TODO: We should return only instance, and inside .bytesToMeteredContract() we should create object to allow to execute contract & host functions from modules with the same caller's handler to control the context & gas burned
                
                        */
                    let {contractInstance,contractMetadata} = await VM.bytesToMeteredContract(Buffer.from(contractMeta.bytecode,'hex'),gasLimit,await GET_METHODS_TO_INJECT(tx.payload.imports))

                    let result
            

                    try{

                        // Get the initial data to pass as '' param
                        // Check if contract is binded to given shard

                        result = VM.callContract(contractInstance,contractMetadata,tx.payload.params,tx.payload.method,contractMeta.type)

                    }catch(err){

                        result = err.message

                    }
            
                    senderAccount.balance-=goingToSpend
    
                    senderAccount.nonce=tx.nonce
            
                    rewardBox.fees+=tx.fee

                }

                return {isOk:true}

            }else return {isOk:false,reason:`No metadata for contract`}

        }else return {isOk:false,reason:`Default verification process failed. Make sure input is ok`}

    },


    /*

        To interact with EVM

        [+] Payload is hexadecimal evm bytecode with 0x prefix(important reminder not to omit tx)

    */
    EVM_CALL:async(originShard,tx,rewardBox,atomicBatch)=>{


        let evmResult = await KLY_EVM.callEVM(originShard,tx.payload).catch(()=>false)


        if(evmResult && !evmResult.execResult.exceptionError){            
          
            let totalSpentInWei = evmResult.amountSpent //BigInt value

            let totalSpentByTxInKLY = web3.utils.fromWei(totalSpentInWei.toString(),'ether')

          
            // Add appropriate value to rewardbox to distribute among KLY pools

            totalSpentByTxInKLY = +totalSpentByTxInKLY

            rewardBox.fees += totalSpentByTxInKLY


            let {tx,receipt} = KLY_EVM.getTransactionWithReceiptToStore(tx.payload,evmResult,global.SYMBIOTE_META.STATE_CACHE.get('EVM_LOGS_MAP'))

            atomicBatch.put('TX:'+tx.hash,{tx,receipt})

            return {isOk:true,reason:'EVM'}

        }

    }

}