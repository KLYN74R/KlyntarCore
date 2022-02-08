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




    TX:async event=>{

        let {from,to,tag,amount,blockCreator,chain,nonce,sig}=event

        let sender=GET_CHAIN_ACC(from,chain),
        
            recipient=await GET_CHAIN_ACC(to,chain)
    
    
            
        if(!recipient){
    
            recipient={ACCOUNT:{B:0,N:0,D:''}}//default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
            
            symbiotes.get(chain).ACCOUNTS.set(to,recipient)//add to cache to collapse after all txs in ControllerBlock
        
        }
        
    
        if(!(symbiotes.get(chain).BLACKLIST.has(from)||sender.ND.has(nonce)) && (sender.ACCOUNT.D===blockCreator.creator || await VERIFY(to+tag+amount+chain+nonce,sig,from))){
    
            sender.ACCOUNT.B-=CONFIG.CHAINS[chain].MANIFEST.FEE+amount
            
            recipient.ACCOUNT.B+=amount
    
            sender.ACCOUNT.N<nonce&&(sender.ACCOUNT.N=nonce)
        
            blockCreator.fees+=CONFIG.CHAINS[chain].MANIFEST.FEE
    
        }
    
    },


    
    NEWSTX:async event=>{

        let {from,newsHash,blockCreator,chain,nonce,sig}=event
        
        let sender=GET_CHAIN_ACC(from,chain)
    
        if(newsHash.length===64 && !(symbiotes.get(chain).BLACKLIST.has(from)||sender.ND.has(nonce)) && (sender.ACCOUNT.D===blockCreator.creator || await VERIFY(newsHash+chain+nonce,sig,from))){
    
            sender.ACCOUNT.B-=CONFIG.CHAINS[chain].MANIFEST.FEE
    
            sender.ACCOUNT.N<nonce&&(sender.ACCOUNT.N=nonce)
        
            blockCreator.fees+=CONFIG.CHAINS[chain].MANIFEST.FEE
    
        }
        
    },




    OFFSPRING:async event=>{

        let {from,manifest,blockCreator,chain,nonce,sig}=event
    
        //Добавить проверку--->если в делегатах есть некий узел,то отминусовать у делегата ставку(чтоб не нарушать стейкинг)
    
        let sender=GET_CHAIN_ACC(from,chain)
        
        if(!(symbiotes.get(chain).BLACKLIST.has(from)||sender.ND.has(nonce)) && (sender.ACCOUNT.D===blockCreator.creator || await VERIFY(manifest+chain+nonce,sig,from))){
    
            sender.ACCOUNT.B-=CONFIG.CHAINS[chain].MANIFEST.FEE+CONFIG.CHAINS[chain].MANIFEST.CONTROLLER_FREEZE
    
            sender.ACCOUNT.N<nonce&&(sender.ACCOUNT.N=nonce)//update maximum nonce
        
            blockCreator.fees+=CONFIG.CHAINS[chain].MANIFEST.FEE
    
        }
    
    },




    DELEGATION:async event=>{

        let {from,newDelegate,blockCreator,chain,nonce,sig}=event

        let sender=GET_CHAIN_ACC(from,chain)

        if(!(symbiotes.get(chain).BLACKLIST.has(from)||sender.ND.has(nonce)) && await VERIFY(newDelegate+chain+nonce,sig,from)){

            sender.ACCOUNT.B-=CONFIG.CHAINS[chain].MANIFEST.FEE
        
            //Make changes only for bigger nonces.This way in async mode all nodes will have common state
            if(sender.ACCOUNT.N<nonce){

                sender.ACCOUNT.D=newDelegate

                sender.ACCOUNT.N=nonce

            }
    
            blockCreator.fees+=CONFIG.CHAINS[chain].MANIFEST.FEE

        }

    },




    //Unimplemented
    ACC_APPROVE:async event=>{},

    QUANTUMSWAP:async event=>{},

    SERVICE_DEPLOY:async events=>{},

    CONVEYOR_DEPLOY:async events=>{},

    

}