/*

@Vlad@ Chernenko

*/


//You can also provide DDoS protection & WAFs & Caches & Advanced filters here

import {getAccountFromState} from '../common_functions/state_interactions.js'

import {verifyBasedOnSigTypeAndVersion} from './txs_verifiers.js'




let verifyWrap=async (tx,originShard)=>{

    let creatorAccount = await getAccountFromState(originShard+':'+tx.creator)

    let result = await verifyBasedOnSigTypeAndVersion(tx,creatorAccount,originShard).catch(()=>false)

    
    if(result){
        
        return {
            
            v:tx.v,
            fee:tx.fee,
            creator:tx.creator,
            type:tx.type,
            nonce:tx.nonce,
            payload:tx.payload,
            sig:tx.sig
        
        }

    }else return false

}




export let TXS_FILTERS = {

    
    /*
    
    Payload

    {
        to:<address to send KLY to> default base58-ecoded ed25519 pubkey | base58 encoded BLS multisig | hex-encoded TBLS rootPub | hex-encoded pos-quantum Dilithium or BLISS address
        amount:<KLY to transfer(float)>
        
        Optional:

        rev_t:<if recepient is BLS address - then we need to give a reverse threshold(rev_t = number of members of msig who'se votes can be ignored)>
    }

    */
    TX:async (tx,originShard) => {

        return  typeof tx.payload?.amount==='number' && typeof tx.payload.to==='string' && tx.payload.amount>0 && (!tx.payload.rev_t || typeof tx.payload.rev_t==='number')
                &&
                await verifyWrap(tx,originShard)

    },

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
        lang:'system/<name of contract>'
        constructorParams:[]
    }

    */
    WVM_CONTRACT_DEPLOY:async (tx,originShard) => {

        return  typeof tx.payload?.bytecode==='string' && (tx.payload.lang==='RUST'||tx.payload.lang==='ASC'||tx.payload?.lang?.startsWith('system/')) && Array.isArray(tx.payload.constructorParams)
                &&
                await verifyWrap(tx,originShard)

    },

    /*
    
        Payload is

        {

            contractID:<BLAKE3 hashID of contract OR alias of contract(for example, PANDORA(mint unobtanium), ALIAS_BIND and so on)>,
            method:<string method to call>,
            gasLimit:<maximum allowed in KLY to execute contract>,
            params:[] params to pass to function,
            imports:[] imports which should be included to contract instance to call. Example ['default.CROSS-CONTRACT','storage.GET_FROM_ARWEAVE']. As you understand, it's form like <MODULE_NAME>.<METHOD_TO_IMPORT>

        }

    */
    WVM_CALL:async (tx,originShard) => {

        return  typeof tx.payload?.contractID==='string' && tx.payload.contractID.length<=512 && typeof tx.payload.method==='string' && Array.isArray(tx.payload.params) && Array.isArray(tx.payload.imports)
                &&
                await verifyWrap(tx,originShard)

    }

}

