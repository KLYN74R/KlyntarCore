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


███╗   ██╗ ██████╗ ██████╗ ███╗   ███╗ █████╗ ██╗     ██╗███████╗███████╗██████╗ ███████╗
████╗  ██║██╔═══██╗██╔══██╗████╗ ████║██╔══██╗██║     ██║╚══███╔╝██╔════╝██╔══██╗██╔════╝
██╔██╗ ██║██║   ██║██████╔╝██╔████╔██║███████║██║     ██║  ███╔╝ █████╗  ██████╔╝███████╗
██║╚██╗██║██║   ██║██╔══██╗██║╚██╔╝██║██╔══██║██║     ██║ ███╔╝  ██╔══╝  ██╔══██╗╚════██║
██║ ╚████║╚██████╔╝██║  ██║██║ ╚═╝ ██║██║  ██║███████╗██║███████╗███████╗██║  ██║███████║
╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝



*/


//You can also provide DDoS protection & WAFs & Caches & Advanced filters here


import {VERIFY_BASED_ON_SIG_TYPE} from './verifiers.js'


let VERIFY_WRAP=event=>VERIFY_BASED_ON_SIG_TYPE(event,'FILTER') ? {v:event.v,f:event.f,c:event.c,t:event.t,n:event.n,p:event.p,s:event.s} : false


export default {

    
    TX:async event=>

        typeof event.p?.a==='number' && typeof event.p.r==='string' && event.p.a>0 && (!event.p.rev_t || typeof event.p.rev_t==='number')
        &&
        await VERIFY_WRAP(event)
    ,

    //Payload(event.p) is validators BLS pubkey
    ATTACH_TO_VALIDATOR:async event=>

        typeof event.p === 'string'
        &&
        await VERIFY_WRAP(event)
    ,

    //Payload(event.p) is validators BLS pubkey
    DELEGATION:async event=>
    
        typeof event.p==='string'
        &&
        await VERIFY_WRAP(event)
        
    ,

    
    CONTRACT_DEPLOY:async event=>
    
        typeof event.p.p==='object' && typeof event.p.m==='string' && typeof event.p.s==='object' && typeof event.p.c==='string'
        &&
        await VERIFY_WRAP(event)

    ,

    CONTRACT_CALL:async(symbiote,event)=>
    
        typeof event.p.p==='object' && typeof event.p.m==='string' && typeof event.p.s==='object' && typeof event.p.c==='string'
        &&
        await VERIFY_WRAP(event)

    ,

    
    SERVICE_DEPLOY:async(symbiote,event)=>
    
        typeof event.p.p==='object' && typeof event.p.m==='string' && typeof event.p.s==='object' && typeof event.p.c==='string'
        &&
        await VERIFY_WRAP(event)
    
    ,

    SERVICE_COMMIT:async (symbiote,event)=>{},

    QUANTUMSWAP:async (symbiote,event)=>{},



    //BLS only,because it's offchain service

    UNOBTANIUM_MINT:async (symbiote,event)=>{},

    ALIAS:async (symbiote,event)=>{},

    VALIDATORS_DEALS:async (symbiote,event)=>{
        

    },


}

