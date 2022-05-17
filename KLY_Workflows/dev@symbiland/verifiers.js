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




import {BLAKE3,GET_SYMBIOTE_ACC,VERIFY,ADDONS} from '../../KLY_Utils/utils.js'

import {symbiotes} from '../../klyn74r.js'




let MAIN_VERIFY=async(symbiote,event,sender)=>

    !(symbiotes.get(symbiote).BLACKLIST.has(event.c)||sender.ND.has(event.n))
    &&
    await VERIFY(JSON.stringify(event.p)+symbiote+event.n+event.t,event.s,event.c)



export let SPENDERS = {
    
    TX:(event,symbiote)=>event.p.a+CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE,

    OFFSPRING:(_event,symbiote)=>CONFIG.SYMBIOTES[symbiote].MANIFEST.CONTROLLER_FREEZE+CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE,

    ALIAS:(event,symbiote)=>event.p.length*0.001+CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE,

    UNOBTANIUM:(event,symbiote)=>JSON.stringify(event.p).length*0.001+CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE,

    //_______________________________________Unimplemented section_______________________________________

    RL_OWNSHIP_APPRV:(_event,symbiote)=>{},

    QUANTUMSWAP:async event=>{},

    SERVICE_DEPLOY:async event=>JSON.stringify(event.p).length*0.01+CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE,

    WORKFLOW_CHANGE:async event=>{},

    MULTISIG:async (symbiote,event)=>{},

    SERVICE_COMMIT:async (symbiote,event)=>{},

    PQC_TX:async (symbiote,event)=>{},


}



export let VERIFIERS = {




    TX:async (event,blockCreator,symbiote)=>{

        let sender=GET_SYMBIOTE_ACC(event.c,symbiote),
        
            recipient=await GET_SYMBIOTE_ACC(event.p.r,symbiote)
    
    
            
        if(!recipient){
    
            recipient={ACCOUNT:{B:0,N:0,D:'',T:'A'}}//default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
            
            symbiotes.get(symbiote).ACCOUNTS.set(event.p.r,recipient)//add to cache to collapse after all events in blocks of ControllerBlock
        
        }
        
    
        if(await MAIN_VERIFY(symbiote,event,sender)){
    
            sender.ACCOUNT.B-=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE+event.p.a
            
            recipient.ACCOUNT.B+=event.p.a
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            blockCreator.fees+=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE
    
        }
    
    },


    
    NEWSTX:async (event,blockCreator,symbiote)=>{

        let sender=GET_SYMBIOTE_ACC(event.c,symbiote)
    
        if(event.p.length===64 && await MAIN_VERIFY(symbiote,event,sender)){
    
            sender.ACCOUNT.B-=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            blockCreator.fees+=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE
    
        }
        
    },




    OFFSPRING:async (event,blockCreator,symbiote)=>{
    
        //Добавить проверку--->если в делегатах есть некий узел,то отминусовать у делегата ставку(чтоб не нарушать стейкинг)
    
        let sender=GET_SYMBIOTE_ACC(event.c,symbiote)
        
        if(await MAIN_VERIFY(symbiote,event,sender)){
    
            sender.ACCOUNT.B-=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE+CONFIG.SYMBIOTES[symbiote].MANIFEST.CONTROLLER_FREEZE
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)//update maximum nonce
        
            blockCreator.fees+=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE
    
        }
    
    },




    DELEGATION:async (event,blockCreator,symbiote)=>{

        let sender=GET_SYMBIOTE_ACC(event.c,symbiote)

        if(await MAIN_VERIFY(symbiote,event,sender)){

            sender.ACCOUNT.B-=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE
        
            //Make changes only for bigger nonces.This way in async mode all nodes will have common state
            if(sender.ACCOUNT.N<event.n){

                sender.ACCOUNT.D=event.p

                sender.ACCOUNT.N=event.n

            }
    
            blockCreator.fees+=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE

        }

    },




    //Common mechanisms as with delegation
    //It's because we perform operations asynchronously
    SERVICE_DEPLOY:async (event,blockCreator,symbiote)=>{
        
        let sender=GET_SYMBIOTE_ACC(event.c,symbiote),
        
            payloadJson=JSON.stringify(event.p),

            payloadHash=BLAKE3(payloadJson),

            noSuchService=!(await symbiotes.get(symbiote).STATE.get(payloadHash).catch(e=>false))




        if(await MAIN_VERIFY(symbiote,event,sender) && noSuchService){

            sender.ACCOUNT.B-=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE+payloadJson.length*0.01
        
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
            

            //Store service manifest
            //!Add to stage zone before
            symbiotes.get(symbiote).EVENTS_STATE.put(payloadHash,event.p)

            blockCreator.fees+=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE
        
        }
        
    },


    ALIAS:async (event,blockCreator,symbiote)=>{

        

    },


    UNOBTANIUM:async (event,blockCreator,symbiote)=>{

    },


    //Unimplemented
    RL_OWNSHIP_APPRV:async(event,blockCreator,symbiote)=>{},

    QUANTUMSWAP:async (event,blockCreator,symbiote)=>{},
    
    MULTISIG:async (symbiote,event)=>{},

    SERVICE_COMMIT:async (symbiote,event)=>{},

    //We'll use BLISS due to less pubkey size
    PQC_TX:async (symbiote,event)=>{},



}