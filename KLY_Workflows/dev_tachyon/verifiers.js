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

import {GET_ACCOUNT_ON_SYMBIOTE} from './utils.js'




let MAIN_VERIFY=async(event,senderStorageObject)=>{

    if(!(SYMBIOTE_META.BLACKLIST.has(event.c)||senderStorageObject.ND.has(event.n))){

        return VERIFY(CONFIG.SYMBIOTE.SYMBIOTE_ID+event.v+event.t+JSON.stringify(event.p)+event.n+event.f,event.s,event.c)

    }

}


//Type of event defined in "t" property

export let SPENDERS = {

    //__________________Default payment methods__________________

    //Ed25519 Base58 encoded
    TX:event=>event.p.a+event.f,

    //Dilithium | BLISS
    PQC_TX:event=>event.p.a+event.f+0.01,

    //TBLS - for T/N or N/N solutions
    THRESHOLD:event=>event.p.a+event.f+0.01,

    //BLS - more UX friendly to use. Used in T/N or N/N cases
    MULTISIG:event=>event.p.a+event.f,

    //________________________Operations_________________________

    //Method to attach your account to a single thread for extreme speed. You can use any payment method you want
    ATTACH_TO_VALIDATOR:event=>event.f+0.01,

    //Method to delegate your assets to some validator | pool
    DELEGATION:event=>event.f,

    //Method to get aliases you own from Internet and attach your account to to this. You can use any payment method you want
    ALIAS:event=>event.p.length*0.001+event.f,

    //Method to mint unobtanium on symbiote. Use BLS multisig, because it's offchain service
    UNOBTANIUM:event=>JSON.stringify(event.p).length*0.001+event.f,

    //Method to deploy rules & manifest for service. You can use any payment method you want
    SERVICE_DEPLOY:event=>JSON.stringify(event.p).length*0.01+event.f,

    //Method to deploy onchain contract and callmap to VM. You can use any payment method you want
    CONTRACT_DEPLOY:event=>JSON.stringify(event.p).length+event.f,

    VALIDATORS_DEALS:event=>JSON.stringify(event.p).length*0.01+event.f,


    //_______________________________________Unimplemented section_______________________________________

    //Coming soon
    RINGSIG:event=>event.p.a+event.f,

    QUANTUMSWAP:async event=>{},

    SERVICE_COMMIT:async event=>{},

}








export let VERIFIERS = {


    //__________________Default payment methods__________________


    TX:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c),
        
            recipient=await GET_ACCOUNT_ON_SYMBIOTE(event.p.r)
    
    
            
        if(!recipient){
    
            recipient={ACCOUNT:{B:0,N:0,T:'A'}}//default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
            
            SYMBIOTE_META.ACCOUNTS.set(event.p.r,recipient)//add to cache to collapse after all events in blocks of block
        
        }
        
    
        if(await MAIN_VERIFY(event,sender)){
    
            sender.ACCOUNT.B-=event.f+event.p.a
            
            recipient.ACCOUNT.B+=event.p.a
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            rewardBox.fees+=event.f
    
        }
    
    },


    PQC_TX:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c),
        
            recipient=await GET_ACCOUNT_ON_SYMBIOTE(event.p.r)
    
    
            
        if(!recipient){
    
            recipient={ACCOUNT:{B:0,N:0,T:'A'}}
            
            SYMBIOTE_META.ACCOUNTS.set(event.p.r,recipient)
        
        }
        

        let verifyOverview = 
        
            !(SYMBIOTE_META.BLACKLIST.has(event.c)||sender.ND.has(event.n))
            &&
            ADDONS[event.p.t==='DIL'?'verify_DIL':'verify_BLISS'](CONFIG.SYMBIOTE.SYMBIOTE_ID+event.v+event.t+JSON.stringify(event.p)+event.n+event.f,event.c,event.s)
    

        if(verifyOverview){
    
            sender.ACCOUNT.B-=event.f+event.p.a
            
            recipient.ACCOUNT.B+=event.p.a
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            rewardBox.fees+=event.f
    
        }
    
    },

    THRESHOLD:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c),
        
            recipient=await GET_ACCOUNT_ON_SYMBIOTE(event.p.r)
    
    
            
        if(!recipient){
    
            recipient={ACCOUNT:{B:0,N:0,T:'A'}}//default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
            
            SYMBIOTE_META.ACCOUNTS.set(event.p.r,recipient)//add to cache to collapse after all events in blocks of block
        
        }
        

        let verifyOverview = 
        
            !(SYMBIOTE_META.BLACKLIST.has(event.c)||sender.ND.has(event.n))
            &&
            await tbls.verifyTBLS(event.c,event.s,CONFIG.SYMBIOTE.SYMBIOTE_ID+event.v+event.t+JSON.stringify(event.p)+event.n+event.f)
    

        if(verifyOverview){
    
            sender.ACCOUNT.B-=event.f+event.p.a
            
            recipient.ACCOUNT.B+=event.p.a
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            rewardBox.fees+=event.f
    
        }
    
    },

    MULTISIG:async (symbiote,event)=>{},




    //________________________Operations_________________________




    //Diff
    ATTACH_TO_VALIDATOR:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c)

        if(await MAIN_VERIFY(event,sender)){
    
            sender.ACCOUNT.B-=event.f+0.01

            sender.ACCOUNT.V=event.p//payload - it's validators pubkey
                        
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
            
            rewardBox.fees+=event.f
        
        }
    
    },

    //Diff
    DELEGATION:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c)

        if(await MAIN_VERIFY(event,sender)){

            sender.ACCOUNT.B-=event.f
        
            //Make changes only for bigger nonces.This way in async mode all nodes will have common state
            if(sender.ACCOUNT.N<event.n){

                sender.ACCOUNT.D=event.p

                sender.ACCOUNT.N=event.n

            }
    
            rewardBox.fees+=event.f

        }

    },

    //BLS, coz service
    ALIAS:async (event,rewardBox,symbiote)=>{

        

    },

    //BLS, coz service
    UNOBTANIUM:async (event,rewardBox,symbiote)=>{

    },


    //Common mechanisms as with delegation
    //It's because we perform operations asynchronously
    //Diff
    SERVICE_DEPLOY:async (event,rewardBox)=>{
        
        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c),
        
            payloadJson=JSON.stringify(event.p),

            payloadHash=BLAKE3(payloadJson),

            noSuchService=!(await SYMBIOTE_META.STATE.get(payloadHash).catch(e=>false))




        if(await MAIN_VERIFY(event,sender) && noSuchService){

            sender.ACCOUNT.B-=event.f+payloadJson.length*0.01
        
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
            

            //Store service manifest
            //!Add to stage zone before
            // SYMBIOTE_META.EVENTS_STATE.put(payloadHash,event.p)

            rewardBox.fees+=event.f
        
        }
        
    },


    //Diff
    CONTRACT_DEPLOY:async (event,rewardBox,symbiote)=>{},

    //BLS multisig,coz validators
    VALIDATORS_DEALS:async (event,rewardBox,symbiote)=>{
        

    },


    //_______________________________________Unimplemented section_______________________________________
    
    RINGSIG:async (event,rewardBox,symbiote)=>{

    },

    QUANTUMSWAP:async (event,rewardBox,symbiote)=>{},

    SERVICE_COMMIT:async (symbiote,event)=>{}

}