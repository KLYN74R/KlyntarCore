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




import tbls from '../../KLY_Utils/signatures/threshold/tbls.js'

import {BLAKE3,VERIFY,ADDONS} from '../../KLY_Utils/utils.js'

import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import {GET_ACCOUNT_ON_SYMBIOTE} from './utils.js'




let GET_SPEND_BY_SIG_TYPE = event => {

    if(event.payload.type==='D') return 0
    
    if(event.payload.type==='T') return 0.01

    if(event.payload.type==='P/D') return 0.03

    if(event.payload.type==='P/B') return 0.02

    if(event.payload.type==='M') return 0.01+event.payload.afk.length*0.001

}




export let VERIFY_BASED_ON_SIG_AND_ACCOUNT_TYPE = (event,senderStorageObject)=>{

    //It should be used by FILTER or only in case when account is not in blacklist and nonce is OK
    if(senderStorageObject==='FILTER' || !(SYMBIOTE_META.BLACKLIST.has(event.creator)||senderStorageObject.account.type!=='account'||senderStorageObject.nonceDuplicates.has(event.nonce))){

        //Sender sign concatenated SYMBIOTE_ID(to prevent cross-symbiote attacks and reuse nonce&signatures), workflow version, event type, JSON'ed payload,nonce and fee
        let signedData = CONFIG.SYMBIOTE.SYMBIOTE_ID+event.v+event.type+JSON.stringify(event.payload)+event.nonce+event.fee

        if(event.payload.type==='D') return VERIFY(signedData,event.sig,event.creator)
        
        if(event.payload.type==='T') return tbls.verifyTBLS(event.creator,event.sig,signedData)

        if(event.payload.type==='P/D') return ADDONS['verify_DIL'](signedData,event.creator,event.sig)

        if(event.payload.type==='P/B') return ADDONS['verify_BLISS'](signedData,event.creator,event.sig)

        if(event.payload.type==='M') return bls.verifyThresholdSignature(event.payload.active,event.payload.afk,event.creator,signedData,event.sig,senderStorageObject.account.rev_t)
    
    }    

}




export let SPENDERS = {

    //________________________General operations_________________________

    TX:event=>GET_SPEND_BY_SIG_TYPE(event)+event.payload.amount+event.fee,

    //Method to attach your account to a single thread for extreme speed. You can use any payment method you want
    BIND_TO_VALIDATOR:event=>GET_SPEND_BY_SIG_TYPE(event)+event.fee+0.01,

    //Method to delegate your assets to some validator | pool
    STAKE:event=>GET_SPEND_BY_SIG_TYPE(event)+event.fee,

    //Method to deploy onchain contract and callmap to VM. You can use any payment method you want
    CONTRACT_DEPLOY:event=>GET_SPEND_BY_SIG_TYPE(event)+JSON.stringify(event.payload).length+event.fee,

    //Method to call contract
    CONTRACT_CALL:event=>JSON.stringify(event.payload).length+event.fee,

    //Method to deploy rules & manifest for service. You can use any payment method you want
    SERVICE_DEPLOY:event=>GET_SPEND_BY_SIG_TYPE(event)+JSON.stringify(event.payload).length*0.01+event.fee,

    SERVICE_COMMIT:event=>GET_SPEND_BY_SIG_TYPE(event)+0.001+event.fee,

    QUANTUMSWAP:event=>GET_SPEND_BY_SIG_TYPE(event)+0.001+event.fee,




    //BLS only.Method to mint unobtanium on symbiote. Use BLS multisig, because it's offchain service
    UNOBTANIUM_MINT:event=>JSON.stringify(event.payload).length*0.001+event.fee,

    //BLS only.Method to pin aliases you own from Internet and attach your account to to this. You can use any payment method you want
    ALIAS:event=>event.payload.length*0.001+event.fee,

    //BLS only
    VALIDATORS_DEALS:event=>JSON.stringify(event.payload).length*0.01+event.fee

}








export let VERIFIERS = {


    //__________________Default payment methods__________________


    TX:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.creator),
        
            recipient=await GET_ACCOUNT_ON_SYMBIOTE(event.payload.to)
    
    
            
        if(!recipient){
    
            //Create default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
            recipient={
                
                account:{
                    type:'account',
                    balance:0,
                    uno:0,
                    nonce:0,
                    bind:''
                }
            
            }
            
            //Only case when recipient is BLS multisig, so we need to add reverse threshold to account to allow to spend even in case REV_T number of pubkeys don't want to sign
            if(event.payload.rev_t) recipient.account.rev_t=event.payload.rev_t

            SYMBIOTE_META.ACCOUNTS_CACHE.set(event.payload.to,recipient)//add to cache to collapse after all events in blocks of block
        
        }
        
    
        if(await VERIFY_BASED_ON_SIG_AND_ACCOUNT_TYPE(event,sender)){
    
            let transfer = SPENDERS.TX(event)

            sender.account.balance-=transfer
            
            recipient.account.balance+=transfer
    
            if(sender.account.nonce<event.nonce) sender.account.nonce=event.nonce
        
            rewardBox.fees+=event.fee
    
        }
    
    },


    BIND_TO_VALIDATOR:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.creator)

        if(await VERIFY_BASED_ON_SIG_AND_ACCOUNT_TYPE(event,sender)){
    
            sender.account.balance-=SPENDERS.BIND_TO_VALIDATOR(event)

            sender.account.bind=event.payload//payload - it's validators pubkey
                        
            if(sender.account.nonce<event.nonce) sender.account.nonce=event.nonce
            
            rewardBox.fees+=event.fee
        
        }
    
    },


    STAKE:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.creator)

        if(await VERIFY_BASED_ON_SIG_AND_ACCOUNT_TYPE(event,sender)){

            sender.account.balance-=SPENDERS.STAKE(event)
        
            //Make changes only for bigger nonces.This way in async mode all nodes will have common state
            if(sender.account.nonce<event.nonce) sender.account.nonce=event.nonce

            //Logic here

    
            rewardBox.fees+=event.fee

        }

    },


    CONTRACT_DEPLOY:async (event,rewardBox,symbiote)=>{},


    CONTRACT_CALL:async (event,rewardBox,symbiote)=>{},


    //Common mechanisms as with delegation
    //It's because we perform operations asynchronously
    SERVICE_DEPLOY:async (event,rewardBox)=>{
        
        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.creator),
        
            payloadJson=JSON.stringify(event.payload),

            payloadHash=BLAKE3(payloadJson),

            noSuchService=!(await SYMBIOTE_META.STATE.get(payloadHash).catch(_=>false))




        if(await VERIFY_BASED_ON_SIG_AND_ACCOUNT_TYPE(event,sender) && noSuchService){

            sender.account.balance-=SPENDERS.SERVICE_DEPLOY(event)
        
            if(sender.account.nonce<event.nonce) sender.account.nonce=event.nonce
            

            //Store service manifest
            //!Add to stage zone before
            // SYMBIOTE_META.EVENTS_STATE.put(payloadHash,event.p)

            rewardBox.fees+=event.fee
        
        }
        
    },


    SERVICE_COMMIT:async (symbiote,event)=>{},



    //BLS, coz service
    UNOBTANIUM_MINT:async (event,rewardBox,symbiote)=>{

    },

    //BLS, coz service
    ALIAS:async (event,rewardBox,symbiote)=>{

        

    },


    //BLS multisig,coz validators
    VALIDATORS_DEALS:async (event,rewardBox,symbiote)=>{
        

    },
    

    QUANTUMSWAP:async (event,rewardBox,symbiote)=>{}

}