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




import {BLAKE3,ED25519_VERIFY,ADDONS} from '../../KLY_Utils/utils.js'

import {GET_ACCOUNT_ON_SYMBIOTE,GET_FROM_STATE} from './utils.js'

import tbls from '../../KLY_Utils/signatures/threshold/tbls.js'

import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import {VM} from '../../KLY_VMs/default/vm.js'

import * as _ from './specContracts/root.js'

import FILTERS from './filters.js'

import web3 from 'web3'




let GET_SPEND_BY_SIG_TYPE = event => {

    if(event.payload.type==='D') return 0
    
    if(event.payload.type==='T') return 0.01

    if(event.payload.type==='P/D') return 0.03

    if(event.payload.type==='P/B') return 0.02

    if(event.payload.type==='M') return 0.01+event.payload.afk.length*0.001

}


//Load required modules and inject to contract
let GET_METHODS_TO_INJECT=imports=>{

    return {}

}


let DEFAULT_VERIFICATION_PROCESS=async(senderAccount,event,goingToSpend)=>

    senderAccount.type==='account'
    &&
    senderAccount.balance-goingToSpend>=0
    &&
    senderAccount.nonce<event.nonce




export let VERIFY_BASED_ON_SIG_TYPE_AND_VERSION = async(event,senderStorageObject,originSubchain) => {

    
    if(SYMBIOTE_META.VERIFICATION_THREAD.VERSION === event.v){

        //Sender sign concatenated SYMBIOTE_ID(to prevent cross-symbiote attacks and reuse nonce & signatures), workflow version, subchain(where to execute event), event type, JSON'ed payload,nonce and fee
        let signedData = CONFIG.SYMBIOTE.SYMBIOTE_ID+event.v+originSubchain+event.type+JSON.stringify(event.payload)+event.nonce+event.fee
    

        if(event.payload.type==='D') return ED25519_VERIFY(signedData,event.sig,event.creator)
        
        if(event.payload.type==='T') return tbls.verifyTBLS(event.creator,event.sig,signedData)
        
        if(event.payload.type==='P/D') {

            let isOk = false

            try{

                isOk = BLAKE3(event.payload.pubKey) === event.creator && ADDONS['verify_DIL'](signedData,event.payload.pubKey,event.sig)
            
            }catch{ isOk = false}

            return isOk === 'true'
            
        }
        
        if(event.payload.type==='P/B'){
          
            let isOk=false

            try{

                isOk = BLAKE3(event.payload.pubKey) === event.creator && ADDONS['verify_BLISS'](signedData,event.payload.pubKey,event.sig)
            
            }catch{ isOk = false}

            return isOk === 'true'

        }
        
        if(event.payload.type==='M') return bls.verifyThresholdSignature(event.payload.active,event.payload.afk,event.creator,signedData,event.sig,senderStorageObject.rev_t).catch(_=>false)      

    }else return false

}




export let SIMPLIFIED_VERIFY_BASED_ON_SIG_TYPE=(type,pubkey,signa,data)=>{

    if(type==='D') return ED25519_VERIFY(data,signa,pubkey)
    
    if(type==='P/D') return ADDONS['verify_DIL'](data,pubkey,signa)
    
    if(type==='P/B') return ADDONS['verify_BLISS'](data,pubkey,signa)
    
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

    TX:async (originSubchain,event,rewardBox,_)=>{

        let senderAccount=await GET_ACCOUNT_ON_SYMBIOTE(BLAKE3(originSubchain+event.creator)),
        
            recipientAccount=await GET_ACCOUNT_ON_SYMBIOTE(BLAKE3(originSubchain+event.payload.to)),

            goingToSpend = GET_SPEND_BY_SIG_TYPE(event)+event.payload.amount+event.fee

        event = await FILTERS.TX(event,originSubchain) //pass through the filter

        if(!event){

            return {isOk:false,reason:`Can't get filtered value of event`}
        
        }else if(await DEFAULT_VERIFICATION_PROCESS(senderAccount,event,goingToSpend)){

            if(!recipientAccount){
    
                //Create default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
                recipientAccount={
                
                    type:'account',
                    balance:0,
                    uno:0,
                    nonce:0
                
                }
                
                //Only case when recipient is BLS multisig, so we need to add reverse threshold to account to allow to spend even in case REV_T number of pubkeys don't want to sign
                if(typeof event.payload.rev_t === 'number') recipientAccount.rev_t=event.payload.rev_t
    
                SYMBIOTE_META.STATE_CACHE.set(BLAKE3(originSubchain+event.payload.to),recipientAccount)//add to cache to collapse after all events in blocks of block
            
            }
            
            senderAccount.balance-=goingToSpend
                
            recipientAccount.balance+=event.payload.amount
        
            senderAccount.nonce=event.nonce
            
            rewardBox.fees+=event.fee

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

    CONTRACT_DEPLOY:async (originSubchain,event,rewardBox,atomicBatch)=>{

        let senderAccount=await GET_ACCOUNT_ON_SYMBIOTE(BLAKE3(originSubchain+event.creator))

        let goingToSpend = GET_SPEND_BY_SIG_TYPE(event)+JSON.stringify(event.payload).length+event.fee


        event = await FILTERS.CONTRACT_DEPLOY(event,originSubchain) //pass through the filter


        if(!event){

            return {isOk:false,reason:`Can't get filtered value of event`}

        }
        else if(await DEFAULT_VERIFICATION_PROCESS(senderAccount,event,goingToSpend)){

            if(event.payload.lang.startsWith('spec/')){

                let typeofContract = event.payload.lang.split('/')[1]

                if(SPECIAL_CONTRACTS.has(typeofContract)){

                    await SPECIAL_CONTRACTS.get(typeofContract).constructor(event,atomicBatch) // do deployment logic

                    senderAccount.balance-=goingToSpend
            
                    senderAccount.nonce=event.nonce
                    
                    rewardBox.fees+=event.fee

                }else return {isOk:false,reason:`No such type of special contract`}

            }else{

                let contractID = BLAKE3(originSubchain+JSON.stringify(event))

                let contractTemplate = {
    
                    type:"contract",
                    lang:event.payload.lang,
                    balance:0,
                    uno:0,
                    storages:[],
                    bytecode:event.payload.bytecode
    
                }
            
                atomicBatch.put(contractID,contractTemplate)
    
                senderAccount.balance-=goingToSpend
            
                senderAccount.nonce=event.nonce
                
                rewardBox.fees+=event.fee
    
            }

            return {isOk:true}

        }else return {isOk:false,reason:`Default verification process failed. Make sure input is ok`}

    },


    /*

        Method to call contract
    
        Payload is

        {

            contractID:<BLAKE3 hashID of contract OR alias of contract(for example, SPECIAL_CONTRACTS)>,
            method:<string method to call>,
            energyLimit:<maximum allowed in KLY to execute contract>
            params:[] params to pass to function
            imports:[] imports which should be included to contract instance to call. Example ['default.CROSS-CONTRACT','storage.GET_FROM_ARWEAVE']. As you understand, it's form like <MODULE_NAME>.<METHOD_TO_IMPORT>
        
        }


    */
    CONTRACT_CALL:async(originSubchain,event,rewardBox,atomicBatch)=>{

        let senderAccount=await GET_ACCOUNT_ON_SYMBIOTE(BLAKE3(originSubchain+event.creator)),

            goingToSpend = GET_SPEND_BY_SIG_TYPE(event)+event.fee+event.payload.energyLimit

        event = await FILTERS.CONTRACT_CALL(event,originSubchain) //pass through the filter

        
        if(!event){

            return {isOk:false,reason:`Can't get filtered value of event`}
        
        }else if(await DEFAULT_VERIFICATION_PROCESS(senderAccount,event,goingToSpend)){


            let contractMeta = await GET_FROM_STATE(BLAKE3(originSubchain+event.payload.contractID))


            if(contractMeta){

                if(contractMeta.lang.startsWith('spec/')){

                    let typeofContract = contractMeta.lang.split('/')[1]

                    if(SPECIAL_CONTRACTS.has(typeofContract)){

                        let contract = SPECIAL_CONTRACTS.get(typeofContract)
                        
                        await contract[event.payload.method](event,originSubchain,atomicBatch)


                        senderAccount.balance-=goingToSpend
            
                        senderAccount.nonce=event.nonce
                    
                        rewardBox.fees+=event.fee


                    }else return {isOk:false,reason:`No such type of special contract`}


                }else {

                    //Create contract instance
                    let energyLimit = event.payload.energyLimit * 1_000_000_000, // 1 KLY = 10^9 energy. You set the energyLimit in KLY(to avoid confusing)

                        /*
                
                        TODO: We should return only instance, and inside .bytesToMeteredContract() we should create object to allow to execute contract & host functions from modules with the same caller's handler to control the context & energy used
                
                        */
                        {contractInstance,contractMetadata} = await VM.bytesToMeteredContract(contractMeta.bytecode,energyLimit,await GET_METHODS_TO_INJECT(event.payload.imports)),

                        result
            

                    try{

                        result = VM.callContract(contractInstance,contractMetadata,originSubchain,'',event.payload.method,contractMeta.type)

                    }catch(err){

                        result = err.message

                    }
            
                    senderAccount.balance-=goingToSpend
    
                    senderAccount.nonce=event.nonce
            
                    rewardBox.fees+=event.fee

                }

                return {isOk:true}

            }else return {isOk:false,reason:`No metadata for contract`}

        }else return {isOk:false,reason:`Default verification process failed. Make sure input is ok`}

    },


    /*

        To interact with EVM

        [+] Payload is hexadecimal evm bytecode with 0x prefix(important reminder not to omit tx)

    */
    EVM_CALL:async(originSubchain,event,rewardBox,atomicBatch)=>{

        let evmID = SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_REASSIGN[originSubchain]

        if(!evmID) return


        let timestamp = SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_METADATA[evmID].TIMESTAMP

        let evmOfSubchain = SYMBIOTE_META.KLY_EVM_PER_SUBCHAIN.get(evmID)



        let evmResult = await evmOfSubchain.callEVM(event.payload,timestamp).catch(_=>false)



        if(evmResult && !evmResult.execResult.exceptionError){            
          
            let totalSpentInWei = evmResult.amountSpent //BigInt value

            let totalSpentByTxInKLY = web3.utils.fromWei(totalSpentInWei.toString(),'ether')

          
            // Add appropriate value to rewardbox to distribute among KLY pools

            totalSpentByTxInKLY = +totalSpentByTxInKLY

            rewardBox.fees += totalSpentByTxInKLY


            let {tx,receipt} = evmOfSubchain.getTransactionWithReceiptToStore(event.payload,evmResult,SYMBIOTE_META.STATE_CACHE.get(evmID+'EVM_LOGS_MAP'))

            atomicBatch.put(BLAKE3(evmID+'TX:'+tx.hash),{tx,receipt})

            return {isOk:true,reason:'EVM'}

        }

    },
    

    /*
    
        To move funds KLY <=> EVM

        Payload is

        {
            to:'K|E', - destination env. E-means "add X KLY from my account on KLY env to EVM env". K-means "send X KLY from my EVM env to KLY env"
            
            _________ Dependent of path, set appropriate address to move funds to _________
            
            address:<20 bytes typical EVM compatible address | other KLY compatible address> | the only one point - if you generate keychain following BIP-44, use 7331 identifier. Details here: https://github.com
            amount:<KLY> - amount in KLY to mint on EVM and burn on KLY or vice versa
        }
    

    */
    // MIGRATE_BETWEEN_ENV:async(originSubchain,event,rewardBox,atomicBatch)=>{

    //     let {to,address,amount} = event.payload

    //     if(to==='K'){

    //         // Migration from EVM to KLY

    //         let evmAccount = await KLY_EVM.getAccount()



    //     }else{

    //         let sender=await GET_ACCOUNT_ON_SYMBIOTE(event.creator),
        
    //         recipient=await GET_ACCOUNT_ON_SYMBIOTE(event.payload.to),

    //         goingToSpend = GET_SPEND_BY_SIG_TYPE(event)+event.payload.amount+event.fee

    //     event = await FILTERS.TX(event,sender) //pass through the filter
    
    //     if(event && await DEFAULT_VERIFICATION_PROCESS(sender,event,goingToSpend)){

    //         if(!recipient){
    
    //             //Create default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
    //             recipient={
                
    //                 type:'account',
    //                 balance:0,
    //                 uno:0,
    //                 nonce:0
                
    //             }
                
    //             //Only case when recipient is BLS multisig, so we need to add reverse threshold to account to allow to spend even in case REV_T number of pubkeys don't want to sign
    //             if(typeof event.payload.rev_t === 'number') recipient.rev_t=event.payload.rev_t
    
    //             SYMBIOTE_META.STATE_CACHE.set(event.payload.to,recipient)//add to cache to collapse after all events in blocks of block
            
    //         }
            
    //         sender.balance-=goingToSpend
                
    //         recipient.balance+=event.payload.amount
        
    //         sender.nonce=event.nonce
            
    //         rewardBox.fees+=event.fee

    //     }

    //     }

    // }
    
        
}