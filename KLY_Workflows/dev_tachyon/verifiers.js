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




export let SPENDERS = {
    
    TX:event=>event.p.a+event.f,

    PQC_TX:event=>event.p.a+event.f,

    ATTACH_TO_VALIDATOR:event=>event.f+0.01,

    OFFSPRING:event=>event.f,

    ALIAS:event=>event.p.length*0.001+event.f,

    UNOBTANIUM:event=>JSON.stringify(event.p).length*0.001+event.f,

    SERVICE_DEPLOY:event=>JSON.stringify(event.p).length*0.01+event.f,

    CONTRACT_DEPLOY:event=>JSON.stringify(event.p).length+event.f,

    VALIDATORS_DEALS:event=>JSON.stringify(event.p).length*0.01+event.f,

    THRESHOLD:event=>event.p.a+event.f,

    //Coming soon
    RINGSIG:event=>event.p.a+event.f,


    //_______________________________________Unimplemented section_______________________________________

    RL_OWNSHIP_APPRV:(_event,symbiote)=>{},

    QUANTUMSWAP:async event=>{},

    WORKFLOW_CHANGE:async event=>{},

    SERVICE_COMMIT:async event=>{},

    MULTISIG:async event=>{},

}








export let VERIFIERS = {




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


    ATTACH_TO_VALIDATOR:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c)

        if(await MAIN_VERIFY(event,sender)){
    
            sender.ACCOUNT.B-=event.f+0.01

            sender.ACCOUNT.V=event.p//payload - it's validators pubkey
                        
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
            
            rewardBox.fees+=event.f
        
        }
    
    },

    
    NEWSTX:async (event,rewardBox)=>{

        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c)
    
        if(event.p.length===64 && await MAIN_VERIFY(event,sender)){
    
            sender.ACCOUNT.B-=event.f
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            rewardBox.fees+=event.f
    
        }
        
    },


    OFFSPRING:async(event,rewardBox)=>{
    
        //Добавить проверку--->если в делегатах есть некий узел,то отминусовать у делегата ставку(чтоб не нарушать стейкинг)
    
        let sender=GET_ACCOUNT_ON_SYMBIOTE(event.c)
        
        if(await MAIN_VERIFY(event,sender)){
    
            sender.ACCOUNT.B-=event.f+CONFIG.SYMBIOTE.MANIFEST.CONTROLLER_FREEZE
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)//update maximum nonce
        
            rewardBox.fees+=event.f
    
        }
    
    },


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


    //Common mechanisms as with delegation
    //It's because we perform operations asynchronously
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
            SYMBIOTE_META.EVENTS_STATE.put(payloadHash,event.p)

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


    CONTRACT_DEPLOY:async (event,rewardBox,symbiote)=>{},



    VALIDATORS_DEALS:async (event,rewardBox,symbiote)=>{
        

    },


    ALIAS:async (event,rewardBox,symbiote)=>{

        

    },


    UNOBTANIUM:async (event,rewardBox,symbiote)=>{

    },


    //Unimplemented
    RL_OWNSHIP_APPRV:async(event,rewardBox,symbiote)=>{},

    QUANTUMSWAP:async (event,rewardBox,symbiote)=>{},
    
    MULTISIG:async (symbiote,event)=>{},

    SERVICE_COMMIT:async (symbiote,event)=>{},

}