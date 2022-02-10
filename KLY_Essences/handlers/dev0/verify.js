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




import {GET_SYMBIOTE_ACC,VERIFY} from '../../../KLY_Space/utils.js'
import {symbiotes} from '../../../klyn74r.js'




export default {




    TX:async (event,blockCreator,symbiote)=>{

        let sender=GET_SYMBIOTE_ACC(event.c,symbiote),
        
            recipient=await GET_SYMBIOTE_ACC(event.p.to,symbiote)
    
    
            
        if(!recipient){
    
            recipient={ACCOUNT:{B:0,N:0,D:''}}//default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
            
            symbiotes.get(symbiote).ACCOUNTS.set(event.p.to,recipient)//add to cache to collapse after all txs in ControllerBlock
        
        }
        
    
        if(!(symbiotes.get(symbiote).BLACKLIST.has(event.c)||sender.ND.has(event.n)) && (sender.ACCOUNT.D===blockCreator.creator || await VERIFY(JSON.stringify(event.p)+symbiote+event.n,event.s,event.c))){
    
            sender.ACCOUNT.B-=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE+event.p.a
            
            recipient.ACCOUNT.B+=event.p.a
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            blockCreator.fees+=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE
    
        }
    
    },


    
    NEWSTX:async (event,blockCreator,symbiote)=>{

        let sender=GET_SYMBIOTE_ACC(event.c,symbiote)
    
        if(event.p.length===64 && !(symbiotes.get(symbiote).BLACKLIST.has(event.c)||sender.ND.has(event.n)) && (sender.ACCOUNT.D===blockCreator.creator || await VERIFY(event.p+symbiote+event.n,event.s,event.c))){
    
            sender.ACCOUNT.B-=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            blockCreator.fees+=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE
    
        }
        
    },




    OFFSPRING:async (event,blockCreator,symbiote)=>{
    
        //Добавить проверку--->если в делегатах есть некий узел,то отминусовать у делегата ставку(чтоб не нарушать стейкинг)
    
        let sender=GET_SYMBIOTE_ACC(event.c,symbiote)
        
        if(!(symbiotes.get(symbiote).BLACKLIST.has(event.c)||sender.ND.has(event.n)) && (sender.ACCOUNT.D===blockCreator.creator || await VERIFY(event.p+symbiote+event.n,event.s,event.c))){
    
            sender.ACCOUNT.B-=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE+CONFIG.SYMBIOTES[symbiote].MANIFEST.CONTROLLER_FREEZE
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)//update maximum nonce
        
            blockCreator.fees+=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE
    
        }
    
    },




    DELEGATION:async (event,blockCreator,symbiote)=>{

        let sender=GET_SYMBIOTE_ACC(event.c,symbiote)

        if(!(symbiotes.get(symbiote).BLACKLIST.has(event.c)||sender.ND.has(event.n)) && await VERIFY(event.p+symbiote+event.n,event.s,event.c)){

            sender.ACCOUNT.B-=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE
        
            //Make changes only for bigger nonces.This way in async mode all nodes will have common state
            if(sender.ACCOUNT.N<event.n){

                sender.ACCOUNT.D=event.p

                sender.ACCOUNT.N=event.n

            }
    
            blockCreator.fees+=CONFIG.SYMBIOTES[symbiote].MANIFEST.FEE

        }

    },




    //Unimplemented
    ACC_APPROVE:async (event,blockCreator,symbiote)=>{},

    QUANTUMSWAP:async (event,blockCreator,symbiote)=>{},

    SERVICE_DEPLOY:async (event,blockCreator,symbiote)=>{},

    CONVEYOR_DEPLOY:async (event,blockCreator,symbiote)=>{},



}