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




import {GET_CHAIN_ACC,VERIFY} from '../../../KLY_Space/utils.js'
import {symbiotes} from '../../../klyn74r.js'




export default {




    TX:async (event,blockCreator,chain)=>{

        let sender=GET_CHAIN_ACC(event.c,chain),
        
            recipient=await GET_CHAIN_ACC(event.p.to,chain)
    
    
            
        if(!recipient){
    
            recipient={ACCOUNT:{B:0,N:0,D:''}}//default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
            
            symbiotes.get(chain).ACCOUNTS.set(event.p.to,recipient)//add to cache to collapse after all txs in ControllerBlock
        
        }
        
    
        if(!(symbiotes.get(chain).BLACKLIST.has(event.c)||sender.ND.has(event.n)) && (sender.ACCOUNT.D===blockCreator.creator || await VERIFY(JSON.stringify(event.p)+chain+event.n,event.s,event.c))){
    
            sender.ACCOUNT.B-=CONFIG.CHAINS[chain].MANIFEST.FEE+event.p.a
            
            recipient.ACCOUNT.B+=event.p.a
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            blockCreator.fees+=CONFIG.CHAINS[chain].MANIFEST.FEE
    
        }
    
    },


    
    NEWSTX:async (event,blockCreator,chain)=>{

        let sender=GET_CHAIN_ACC(event.c,chain)
    
        if(event.p.length===64 && !(symbiotes.get(chain).BLACKLIST.has(event.c)||sender.ND.has(event.n)) && (sender.ACCOUNT.D===blockCreator.creator || await VERIFY(event.p+chain+event.n,event.s,event.c))){
    
            sender.ACCOUNT.B-=CONFIG.CHAINS[chain].MANIFEST.FEE
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)
        
            blockCreator.fees+=CONFIG.CHAINS[chain].MANIFEST.FEE
    
        }
        
    },




    OFFSPRING:async (event,blockCreator,chain)=>{
    
        //Добавить проверку--->если в делегатах есть некий узел,то отминусовать у делегата ставку(чтоб не нарушать стейкинг)
    
        let sender=GET_CHAIN_ACC(event.c,chain)
        
        if(!(symbiotes.get(chain).BLACKLIST.has(event.c)||sender.ND.has(event.n)) && (sender.ACCOUNT.D===blockCreator.creator || await VERIFY(event.p+chain+event.n,event.s,event.c))){
    
            sender.ACCOUNT.B-=CONFIG.CHAINS[chain].MANIFEST.FEE+CONFIG.CHAINS[chain].MANIFEST.CONTROLLER_FREEZE
    
            sender.ACCOUNT.N<event.n&&(sender.ACCOUNT.N=event.n)//update maximum nonce
        
            blockCreator.fees+=CONFIG.CHAINS[chain].MANIFEST.FEE
    
        }
    
    },




    DELEGATION:async (event,blockCreator,chain)=>{

        let sender=GET_CHAIN_ACC(event.c,chain)

        if(!(symbiotes.get(chain).BLACKLIST.has(event.c)||sender.ND.has(event.n)) && await VERIFY(event.p+chain+event.n,event.s,event.c)){

            sender.ACCOUNT.B-=CONFIG.CHAINS[chain].MANIFEST.FEE
        
            //Make changes only for bigger nonces.This way in async mode all nodes will have common state
            if(sender.ACCOUNT.N<event.n){

                sender.ACCOUNT.D=event.p

                sender.ACCOUNT.N=event.n

            }
    
            blockCreator.fees+=CONFIG.CHAINS[chain].MANIFEST.FEE

        }

    },




    //Unimplemented
    ACC_APPROVE:async (event,blockCreator,chain)=>{},

    QUANTUMSWAP:async (event,blockCreator,chain)=>{},

    SERVICE_DEPLOY:async (event,blockCreator,chain)=>{},

    CONVEYOR_DEPLOY:async (event,blockCreator,chain)=>{},



}