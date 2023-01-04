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


import {VERIFY_BASED_ON_SIG_TYPE_AND_VERSION} from './verifiers.js'
import { GET_ACCOUNT_ON_SYMBIOTE} from './utils.js'
import { KLY_EVM } from '../../KLY_VMs/kly-evm/vm.js'




let VERIFY_WRAP=async event=>{

    let creatorAccount = await GET_ACCOUNT_ON_SYMBIOTE(event.creator)

    if(await VERIFY_BASED_ON_SIG_TYPE_AND_VERSION(event,creatorAccount)){
        
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
        to:<address to send KLY to> default base58-ecoded ed25519 pubkey | base58 encoded BLS multisig | hex-encoded TBLS rootPub | hex-encoded pos-quantum Dilithium or BLISS address
        amount:<KLY to transfer(float)>
        
        Optional:

        rev_t:<if recepient is BLS address - then we need to give a reverse threshold(rev_t = number of members of msig who'se votes can be ignored)>
    }

    */
    TX:async event=>

        typeof event.payload?.amount==='number' && typeof event.payload.to==='string' && event.payload.amount>0 && (!event.payload.rev_t || typeof event.payload.rev_t==='number')
        &&
        await VERIFY_WRAP(event)
    ,

    /*
    
    Payload is

        {
            bytecode:<hexString>,
            lang:<RUST|ASC>,
            constructorParams:[]
        }

    If it's one of SPEC_CONTRACTS (alias define,service deploying,unobtanium mint and so on) the structure will be like this

    {
        bytecode:'',(empty)
        lang:'spec/<name of contract>'
        constructorParams:[]
    }

    */
    CONTRACT_DEPLOY:async event=>
    
        typeof event.payload.bytecode==='string' && (event.payload.lang==='RUST'||event.payload.lang==='ASC'||event.payload.lang.startsWith('spec/')) && Array.isArray(event.payload.constructorParams)
        &&
        await VERIFY_WRAP(event)

    ,

    /*
    
        Payload is

        {

            contractID:<BLAKE3 hashID of contract OR alias of contract(for example, PANDORA(mint unobtanium), ALIAS_BIND and so on)>,
            method:<string method to call>,
            energyLimit:<maximum allowed in KLY to execute contract>,
            params:[] params to pass to function,
            imports:[] imports which should be included to contract instance to call. Example ['default.CROSS-CONTRACT','storage.GET_FROM_ARWEAVE']. As you understand, it's form like <MODULE_NAME>.<METHOD_TO_IMPORT>

        }

    */
    CONTRACT_CALL:async event=>
    
        typeof event.payload.contractID==='string' && event.payload.contractID.length<=256 && typeof event.payload.method==='string' && Array.isArray(event.payload.params) && Array.isArray(event.payload.imports)
        &&
        await VERIFY_WRAP(event)

    ,


    /*
    
        Payload is hexadecimal EVM bytecode
    
    */
    EVM_CALL:async event=>{

        //typeof event.payload==='string' && await VERIFY_WRAP(event)

    },


    /*
    
        To move funds KLY <=> EVM

        Payload is

        {
            to:'K|E', - destination env. E-means "add X KLY from my account on KLY env to EVM env". K-means "send X KLY from my EVM env to KLY env"
            
            _________ Dependent of path, set appropriate address to move funds to _________
            
            address:<20 bytes typical EVM compatible address | other KLY compatible address> | the only one point - if you generate keychain following BIP-44, use 7331 identifier. Details here: https://github.com
            amount:<KLY> - amount in KLY to mint on EVM and burn on KLY or vice versa
        }
    
    
    */
    MIGRATE_BETWEEN_ENV:async event=>{

        typeof event.payload.address==='string'
        &&
        typeof event.payload.amount==='number'
        &&
        event.payload.amount>0

    }

}

