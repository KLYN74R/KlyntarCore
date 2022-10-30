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


import {VERIFY_BASED_ON_SIG_TYPE_AND_VERSION} from './verifiers.js'


let VERIFY_WRAP=event=>{

    if(VERIFY_BASED_ON_SIG_TYPE_AND_VERSION(event)){
        
        return {
            
            v:event.v,
            fee:event.fee,
            creator:event.creator,
            type:event.type,
            nonce:event.nonce,
            payload:event.payload,
            sig:event.sig
        
        }

    }else return false

}




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
        }

    If it's one of SPEC_CONTRACTS (alias define,service deploying,unobtanium mint and so on) the structure will be like this

    {
        bytecode:'',(empty)
        type:'SPEC/<name of contract>'
    }

    */
    CONTRACT_DEPLOY:async event=>
    
        typeof event.payload.bytecode==='string' && (event.payload.type==='RUST'||event.payload.type==='ASC'||event.payload.type.startsWith('SPEC/'))
        &&
        await VERIFY_WRAP(event)

    ,

    /*
    
        Payload is

        {

            contractID:<BLAKE3 hashID of contract OR alias of contract(for example, SPECIAL_CONTRACTS)>,
            method:<string method to call>,
            params:[] params to pass to function

        }

    */
    CONTRACT_CALL:async event=>
    
        typeof event.payload.contractID==='string' && event.payload.contractID.length<256 && typeof event.payload.method==='string' && Array.isArray(event.payload.params)
        &&
        await VERIFY_WRAP(event)

    ,

}

