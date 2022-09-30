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

    if(event.p.t==='D') return 0
    
    if(event.p.t==='T') return 0.01

    if(event.p.t==='P/D') return 0.03

    if(event.p.t==='P/B') return 0.02

    if(event.p.t==='M') return 0.01+event.p.afk.length*0.001

}




export let VERIFY_BASED_ON_SIG_TYPE = (event,senderStorageObject)=>{

    //It should be used by FILTER or only in case when account is not in blacklist and nonce is OK
    if(senderStorageObject==='FILTER' || !(SYMBIOTE_META.BLACKLIST.has(event.c)||senderStorageObject.ND.has(event.n))){

        //Sender sign concatenated SYMBIOTE_ID(to prevent cross-symbiote attacks and reuse nonce&signatures), workflow version, event type, JSON'ed payload,nonce and fee
        let signedData = CONFIG.SYMBIOTE.SYMBIOTE_ID+event.v+event.t+JSON.stringify(event.p)+event.n+event.f

        if(event.p.t==='D') return VERIFY(signedData,event.s,event.c)
        
        if(event.p.t==='T') return tbls.verifyTBLS(event.c,event.s,signedData)

        if(event.p.t==='P/D') return ADDONS['verify_DIL'](signedData,event.c,event.s)

        if(event.p.t==='P/B') return ADDONS['verify_BLISS'](signedData,event.c,event.s)

        if(event.p.t==='M') return bls.verifyThresholdSignature(event.p.active,event.p.afk,event.c,signedData,event.s,senderStorageObject.ACCOUNT.REV_T)
    
    }    

}




export let SPENDERS = {

    //________________________General operations_________________________

    TX:event=>GET_SPEND_BY_SIG_TYPE(event)+event.p.a+event.f,

    //Method to attach your account to a single thread for extreme speed. You can use any payment method you want
    ATTACH_TO_VALIDATOR:event=>GET_SPEND_BY_SIG_TYPE(event)+event.f+0.01,

    //Method to delegate your assets to some validator | pool
    DELEGATION:event=>GET_SPEND_BY_SIG_TYPE(event)+event.f,

    //Method to deploy onchain contract and callmap to VM. You can use any payment method you want
    CONTRACT_DEPLOY:event=>GET_SPEND_BY_SIG_TYPE(event)+JSON.stringify(event.p).length+event.f,

    //Method to call contract
    CONTRACT_CALL:event=>JSON.stringify(event.p).length+event.f,

    //Method to deploy rules & manifest for service. You can use any payment method you want
    SERVICE_DEPLOY:event=>GET_SPEND_BY_SIG_TYPE(event)+JSON.stringify(event.p).length*0.01+event.f,

    SERVICE_COMMIT:event=>GET_SPEND_BY_SIG_TYPE(event)+0.001,

    QUANTUMSWAP:event=>GET_SPEND_BY_SIG_TYPE(event)+0.001,




    //BLS only.Method to mint unobtanium on symbiote. Use BLS multisig, because it's offchain service
    UNOBTANIUM_MINT:event=>JSON.stringify(event.p).length*0.001+event.f,

    //BLS only.Method to pin aliases you own from Internet and attach your account to to this. You can use any payment method you want
    ALIAS:event=>event.p.length*0.001+event.f,

    //BLS only
    VALIDATORS_DEALS:event=>JSON.stringify(event.p).length*0.01+event.f

}








export let VERIFIERS = {


    //__________________Default payment methods__________________


    TX:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c),
        
            recipient=await GET_ACCOUNT_ON_SYMBIOTE(event.p.r)
    
    
            
        if(!recipient){
    
            //Create default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
            recipient={ACCOUNT:{B:0,N:0,T:'A'}}
            
            //Only case when recipient is BLS multisig, so we need to add reverse threshold to account to allow to spend even in case REV_T number of pubkeys don't want to sign
            if(event.p.rev_t) recipient.ACCOUNT.REV_T=event.p.rev_t

            SYMBIOTE_META.ACCOUNTS.set(event.p.r,recipient)//add to cache to collapse after all events in blocks of block
        
        }
        
    
        if(await VERIFY_BASED_ON_SIG_TYPE(event,sender)){
    
            let transfer = SPENDERS.TX(event)

            sender.ACCOUNT.B-=transfer
            
            recipient.ACCOUNT.B+=transfer
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            rewardBox.fees+=event.f
    
        }
    
    },


    ATTACH_TO_VALIDATOR:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c)

        if(await VERIFY_BASED_ON_SIG_TYPE(event,sender)){
    
            sender.ACCOUNT.B-=SPENDERS.ATTACH_TO_VALIDATOR(event)

            sender.ACCOUNT.V=event.p//payload - it's validators pubkey
                        
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
            
            rewardBox.fees+=event.f
        
        }
    
    },


    DELEGATION:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c)

        if(await VERIFY_BASED_ON_SIG_TYPE(event,sender)){

            sender.ACCOUNT.B-=SPENDERS.DELEGATION(event)
        
            //Make changes only for bigger nonces.This way in async mode all nodes will have common state
            if(sender.ACCOUNT.N<event.n){

                sender.ACCOUNT.D=event.p

                sender.ACCOUNT.N=event.n

            }
    
            rewardBox.fees+=event.f

        }

    },


    CONTRACT_DEPLOY:async (event,rewardBox,symbiote)=>{},


    CONTRACT_CALL:async (event,rewardBox,symbiote)=>{},


    //Common mechanisms as with delegation
    //It's because we perform operations asynchronously
    SERVICE_DEPLOY:async (event,rewardBox)=>{
        
        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c),
        
            payloadJson=JSON.stringify(event.p),

            payloadHash=BLAKE3(payloadJson),

            noSuchService=!(await SYMBIOTE_META.STATE.get(payloadHash).catch(e=>false))




        if(await VERIFY_BASED_ON_SIG_TYPE(event,sender) && noSuchService){

            sender.ACCOUNT.B-=SPENDERS.SERVICE_DEPLOY(event)
        
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
            

            //Store service manifest
            //!Add to stage zone before
            // SYMBIOTE_META.EVENTS_STATE.put(payloadHash,event.p)

            rewardBox.fees+=event.f
        
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