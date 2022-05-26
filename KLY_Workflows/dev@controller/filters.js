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


import {VERIFY} from '../../KLY_Utils/utils.js'

export default {
    
    TX:async(symbiote,event)=>
        
        typeof event.p?.a==='number' && typeof event.p.r==='string' && event.p.a>0
        &&
        await VERIFY(JSON.stringify(event.p)+symbiote+event.n+event.t,event.s,event.c)//check urgent nonce to prevent spam
        ?
        {c:event.c,t:event.t,n:event.n,p:event.p,s:event.s}
        :
        false
    ,


    //payload is a single string(hash)
    NEWSTX:async(symbiote,event)=>
    
        typeof event.p==='string' && event.p.length===64
        &&
        await VERIFY(JSON.stringify(event.p)+symbiote+event.n+event.t,event.s,event.c) ? {c:event.c,t:event.t,n:event.n,p:event.p,s:event.s} : false
        
    ,


    OFFSPRING:async(symbiote,event)=>
    
        typeof event.p==='string'
        && 
        await VERIFY(JSON.stringify(event.p)+symbiote+event.n+event.t,event.s,event.c) ? {c:event.c,t:event.t,n:event.n,p:event.p,s:event.s} : false
        
    ,

    DELEGATION:async(symbiote,event)=>
    
        typeof event.p==='string'
        &&
        await VERIFY(JSON.stringify(event.p)+symbiote+event.n+event.t,event.s,event.c) ? {c:event.c,t:event.t,n:event.n,p:event.p,s:event.s} : false
        
    ,

    ALIAS:async (symbiote,event)=>{},

    UNOBTANIUM:async (symbiote,event)=>{},
    
    //Unimplemented
    RL_OWNSHIP_APPRV:async (symbiote,event)=>{},

    QUANTUMSWAP:async (symbiote,event)=>{},

    SERVICE_DEPLOY:async(symbiote,event)=>
    
        typeof event.p.p==='object' && typeof event.p.m==='string' && typeof event.p.s==='object' && typeof event.p.c==='string'
        &&
        await VERIFY(JSON.stringify(event.p)+symbiote+event.n+event.t,event.s,event.c) ? {c:event.c,t:event.t,n:event.n,p:event.p,s:event.s} : false
    
    ,

    WORKFLOW_CHANGE:async (symbiote,event)=>{},

    MULTISIG:async (symbiote,event)=>{},

    THRESHOLD:async (symbiote,event)=>{},

    SERVICE_COMMIT:async (symbiote,event)=>{},

    PQC_TX:async (symbiote,event)=>{},

}

