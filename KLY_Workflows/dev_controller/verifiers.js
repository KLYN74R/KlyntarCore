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




import {BLAKE3,VERIFY} from '../../KLY_Utils/utils.js'

import {GET_SYMBIOTE_ACC} from './utils.js'




let MAIN_VERIFY=async(event,senderStorageObject)=>{

    if(!(SYMBIOTE_META.BLACKLIST.has(event.c)||senderStorageObject.ND.has(event.n))){

        return VERIFY(CONFIG.SYMBIOTE.SYMBIOTE_ID+event.v+event.t+JSON.stringify(event.p)+event.n+event.f,event.s,event.c)

    }

}



export let SPENDERS = {
    
    TX:event=>event.p.a+event.f,

    OFFSPRING:event=>CONFIG.SYMBIOTE.MANIFEST.CONTROLLER_FREEZE+event.f,

    ALIAS:event=>event.p.length*0.001+event.f,

    UNOBTANIUM:event=>JSON.stringify(event.p).length*0.001+event.f,

    //_______________________________________Unimplemented section_______________________________________

    RL_OWNSHIP_APPRV:(_event,symbiote)=>{},

    QUANTUMSWAP:async event=>{},

    SERVICE_DEPLOY:async event=>JSON.stringify(event.p).length*0.01+event.f,

    CONTRACT_DEPLOY:async event=>{},

    WORKFLOW_CHANGE:async event=>{},

    MULTISIG:async event=>{},

    THRESHOLD:async event=>{},

    SERVICE_COMMIT:async event=>{},

    PQC_TX:async event=>{},


}








export let VERIFIERS = {




    TX:async (event,blockCreator)=>{

        let sender=GET_SYMBIOTE_ACC(event.c),
        
            recipient=await GET_SYMBIOTE_ACC(event.p.r)
    
    
            
        if(!recipient){
    
            recipient={ACCOUNT:{B:0,N:0,T:'A'}}//default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
            
            SYMBIOTE_META.ACCOUNTS.set(event.p.r,recipient)//add to cache to collapse after all events in blocks of ControllerBlock
        
        }
        
    
        if(await MAIN_VERIFY(event,sender)){
    
            sender.ACCOUNT.B-=event.f+event.p.a
            
            recipient.ACCOUNT.B+=event.p.a
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            blockCreator.fees+=event.f
    
        }
    
    },


    
    NEWSTX:async (event,blockCreator)=>{

        let sender=GET_SYMBIOTE_ACC(event.c)
    
        if(event.p.length===64 && await MAIN_VERIFY(event,sender)){
    
            sender.ACCOUNT.B-=event.f
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            blockCreator.fees+=event.f
    
        }
        
    },




    OFFSPRING:async (event,blockCreator)=>{
    
        //Добавить проверку--->если в делегатах есть некий узел,то отминусовать у делегата ставку(чтоб не нарушать стейкинг)
    
        let sender=GET_SYMBIOTE_ACC(event.c)
        
        if(await MAIN_VERIFY(event,sender)){
    
            sender.ACCOUNT.B-=event.f+CONFIG.SYMBIOTE.MANIFEST.CONTROLLER_FREEZE
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)//update maximum nonce
        
            blockCreator.fees+=event.f
    
        }
    
    },




    DELEGATION:async (event,blockCreator)=>{

        let sender=GET_SYMBIOTE_ACC(event.c)

        if(await MAIN_VERIFY(event,sender)){

            sender.ACCOUNT.B-=event.f
        
            //Make changes only for bigger nonces.This way in async mode all nodes will have common state
            if(sender.ACCOUNT.N<event.n){

                sender.ACCOUNT.D=event.p

                sender.ACCOUNT.N=event.n

            }
    
            blockCreator.fees+=event.f

        }

    },




    //Common mechanisms as with delegation
    //It's because we perform operations asynchronously
    SERVICE_DEPLOY:async (event,blockCreator)=>{
        
        let sender=GET_SYMBIOTE_ACC(event.c),
        
            payloadJson=JSON.stringify(event.p),

            payloadHash=BLAKE3(payloadJson),

            noSuchService=!(await SYMBIOTE_META.STATE.get(payloadHash).catch(e=>false))




        if(await MAIN_VERIFY(event,sender) && noSuchService){

            sender.ACCOUNT.B-=event.f+payloadJson.length*0.01
        
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
            

            //Store service manifest
            //!Add to stage zone before
            SYMBIOTE_META.EVENTS_STATE.put(payloadHash,event.p)

            blockCreator.fees+=event.f
        
        }
        
    },

    

    CONTRACT_DEPLOY:async (event,blockCreator,symbiote)=>{},


    ALIAS:async (event,blockCreator,symbiote)=>{

        

    },


    UNOBTANIUM:async (event,blockCreator,symbiote)=>{

    },


    //Unimplemented
    RL_OWNSHIP_APPRV:async(event,blockCreator,symbiote)=>{},

    QUANTUMSWAP:async (event,blockCreator,symbiote)=>{},
    
    MULTISIG:async (symbiote,event)=>{},

    THRESHOLD:async (symbiote,event)=>{},

    SERVICE_COMMIT:async (symbiote,event)=>{},

    PQC_TX:async (symbiote,event)=>{},



}