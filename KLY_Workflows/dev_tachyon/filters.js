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

import tbls from '../../KLY_Utils/signatures/threshold/tbls.js'

import {VERIFY} from '../../KLY_Utils/utils.js'




export default {
    
    TX:async(symbiote,event)=>

        typeof event.p?.a==='number' && typeof event.p.r==='string' && event.p.a>0
        &&
        await VERIFY(symbiote+event.v+event.t+JSON.stringify(event.p)+event.n+event.f,event.s,event.c)//check urgent nonce to prevent spam
        ?
        {v:event.v,f:event.f,c:event.c,t:event.t,n:event.n,p:event.p,s:event.s}
        :
        false
    ,



    PQC_TX:async(symbiote,event)=>

        typeof event.p?.a==='number' && typeof event.p.r==='string' && event.p.a>0
        &&
        await VERIFY(symbiote+event.v+event.t+JSON.stringify(event.p)+event.n+event.f,event.s,event.c)//check urgent nonce to prevent spam
        ?
        {v:event.v,f:event.f,c:event.c,t:event.t,n:event.n,p:event.p,s:event.s}
        :
        false
    ,



    ATTACH_TO_VALIDATOR:async(symbiote,event)=>

        typeof event.p === 'string'
        &&
        await VERIFY(symbiote+event.v+event.t+JSON.stringify(event.p)+event.n+event.f,event.s,event.c)//check urgent nonce to prevent spam
        ?
        {v:event.v,f:event.f,c:event.c,t:event.t,n:event.n,p:event.p,s:event.s}
        :
        false
    ,


    OFFSPRING:async(symbiote,event)=>
    
        typeof event.p==='string'
        && 
        await VERIFY(symbiote+event.v+event.t+JSON.stringify(event.p)+event.n+event.f,event.s,event.c) ? {v:event.v,f:event.f,c:event.c,t:event.t,n:event.n,p:event.p,s:event.s} : false
        
    ,

    DELEGATION:async(symbiote,event)=>
    
        typeof event.p==='string'
        &&
        await VERIFY(symbiote+event.v+event.t+JSON.stringify(event.p)+event.n+event.f,event.s,event.c) ? {v:event.v,f:event.f,c:event.c,t:event.t,n:event.n,p:event.p,s:event.s} : false
        
    ,

    SERVICE_DEPLOY:async(symbiote,event)=>
    
        typeof event.p.p==='object' && typeof event.p.m==='string' && typeof event.p.s==='object' && typeof event.p.c==='string'
        &&
        await VERIFY(symbiote+event.v+event.t+JSON.stringify(event.p)+event.n+event.f,event.s,event.c) ? {v:event.v,f:event.f,c:event.c,t:event.t,n:event.n,p:event.p,s:event.s} : false
        
    ,

    CONTRACT_DEPLOY:async(symbiote,event)=>
    
        typeof event.p.p==='object' && typeof event.p.m==='string' && typeof event.p.s==='object' && typeof event.p.c==='string'
        &&
        await VERIFY(symbiote+event.v+event.t+JSON.stringify(event.p)+event.n+event.f,event.s,event.c) ? {v:event.v,f:event.f,c:event.c,t:event.t,n:event.n,p:event.p,s:event.s} : false

    ,

    THRESHOLD:async(symbiote,event)=>
    
        typeof event.p?.a==='number' && typeof event.p.r==='string' && event.p.a>0
        &&
        await tbls.verifyTBLS(event.c,event.s,symbiote+event.v+event.t+JSON.stringify(event.p)+event.n+event.f)
        ?
        {v:event.v,f:event.f,c:event.c,t:event.t,n:event.n,p:event.p,s:event.s}
        :
        false
    ,

    //payload is a single string(hash)
    NEWSTX:async(symbiote,event)=>
    
        typeof event.p==='string' && event.p.length===64
        &&
        await VERIFY(symbiote+event.v+event.t+JSON.stringify(event.p)+event.n+event.f,event.s,event.c) ? {v:event.v,f:event.f,c:event.c,t:event.t,n:event.n,p:event.p,s:event.s} : false
        
    ,


    VALIDATORS_DEALS:async (symbiote,event)=>{
        

    },

    MULTISIG:async (symbiote,event)=>{},

    RINGSIG:async (symbiote,event)=>{},


    //Unimplemented

    ALIAS:async (symbiote,event)=>{},

    UNOBTANIUM:async (symbiote,event)=>{},
    
    RL_OWNSHIP_APPRV:async (symbiote,event)=>{},

    QUANTUMSWAP:async (symbiote,event)=>{},

    WORKFLOW_CHANGE:async (symbiote,event)=>{},

    SERVICE_COMMIT:async (symbiote,event)=>{}


}

