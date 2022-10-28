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


//You can also provide DDoS protection & WAFs & Caches & Advanced filters here(for example, if prices are changes)


import {VERIFY_BASED_ON_SIG_TYPE} from './verifiers.js'


let VERIFY_WRAP=event=>VERIFY_BASED_ON_SIG_TYPE(event) ? {v:event.v,fee:event.fee,creator:event.creator,type:event.type,nonce:event.nonce,payload:event.payload,sig:event.sig} : false


export default {

    
    /*
    
    Payload

    {
        to:<address to send KLY to>
        amount:<KLY to transfer>
        rev_t:<if recepient is BLS address - then we need to give a reverse threshold(rev_t = number of members of msig who'se votes can be ignored)>
    }

    */
    TX:async event=>

        typeof event.payload?.amount==='number' && typeof event.payload.to==='string' && event.payload.amount>0 && (!event.payload.rev_t || typeof event.payload.rev_t==='number')
        &&
        await VERIFY_WRAP(event)
    ,

    //Payload is validators' BLS pubkey to bind to(soon we'll add more advanced stuff)
    BIND_TO_VALIDATOR:async event=>

        typeof event.payload === 'string'
        &&
        await VERIFY_WRAP(event)
    ,

    /*

    Payload

    {
        pool:<BLS validator's pubkey>
        amount:<amount in KLY or UNO> | NOTE:must be int - not float
        type:<KLY|UNO>

        Optional(if it's pool creation)

        percent:?<0 to 1>

    }

    */
    STAKE:async event=>{

        let generalOverview = typeof event.payload?.pool==='string' && event.payload.pool.endsWith('(POOL)') //check if valid
        
        let amountIsOk = event.payload.amount >= CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.MINIMAL_STAKE[event.payload.type] //dependends on type of stake (KLY | UNO)
        
        let deployOptsIsOk = false

        if(event.payload.percent){

            deployOptsIsOk = event.payload.percent>=0 && event.payload.percent<=0

        }else deployOptsIsOk=true

        let verified = await VERIFY_WRAP(event)

        return generalOverview && amountIsOk && verified

    },

    /*
    
    Payload is

        {
            bytecode:<hexString>,
            type:<RUST|ASC>
            callMap:{},
            master:<pubkey or empty>
        }

    */
    CONTRACT_DEPLOY:async event=>
    
        typeof event.payload.bytecode==='string' && typeof event.payload.map==='string' && typeof event.payload.s==='object' && typeof event.payload.creator==='string'
        &&
        await VERIFY_WRAP(event)

    ,

    /*
    
        Payload is

        {

            contractID:<BLAKE3 hashID of contract>,
            method:<string method to call>,
            params:[] params to pass to function

        }

    */
    CONTRACT_CALL:async event=>
    
        typeof event.p.p==='object' && typeof event.p.m==='string' && typeof event.p.s==='object' && typeof event.p.c==='string'
        &&
        await VERIFY_WRAP(event)

    ,


    /*
    
    Payload is

        {

            to:<Pubkey of destination>,
            amount:<amount in KLY>,
            hash:<BLAKE3 of secret>

        }

    */
    QUANTUMSWAP:async event=>{}


}

