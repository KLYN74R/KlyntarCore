/**
 * 
 * @Vlad@ Chernenko 23.07.-1
 * 
 * 
 *   To test different type of txs
 *   BTW,I've noticed that sequence:
 *   <payload+chain+chainNonce+SID+GUID+localNonce>
 *
 *   looks like OSI packets.Basically-nessesary data for node is SID+GUID+localnonce,
 *   while data requiered by specific chain is payload+chain+chainNonce
 *
 * 
 */


import {SIG} from '../KLY_Utils/utils.js'
import {hash} from 'blake3-wasm'
import fetch from 'node-fetch'
import bls from '../KLY_Utils/signatures/multisig/bls.js'



//___________________________________________ CONSTANTS POOL ___________________________________________



const SYMBIOTE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'//chain on which you wanna send tx

const WORKFLOW_VERSION = 0

const FEE = 5

const TX_TYPES = {

    TX:'TX', // default address <=> address tx
    CONTRACT_DEPLOY:'CONTRACT_DEPLOY',
    CONTRACT_CALL:'CONTRACT_CALL',
    EVM_CALL:'EVM_CALL',
    MIGRATE_TO_EVM:'MIGRATE_TO_EVM'

}

const SIG_TYPES = {
    
    DEFAULT:'D',                    // Default ed25519
    TBLS:'T',                       // TBLS(threshold sig)
    POST_QUANTUM_DIL:'P/D',         // Post-quantum Dilithium(2/3/5,2 used by default)
    POST_QUANTUM_BLISS:'P/B',       // Post-quantum BLISS
    MULTISIG:'M'                    // Multisig BLS
}


//___________________________________________ TEST ACCOUNTS ___________________________________________


// BLS multisig
let user0 = {

    prv:"af837c459929895651315e878f4917c7622daeb522086ec95cfe64fed2496867",
    
    pub:"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta"

}


// Ed25519
let user1 = {

    mnemonic: 'already mad depart absorb song chicken leaf huge goat sock mixture neutral',
    bip44Path: "m/44'/7331'/0'/0'",
    pub: '9FUM4c6w52g7WYbjMDUeUE4SbCG7WoTyt9GQJVn7dZv2',
    prv: 'MC4CAQAwBQYDK2VwBCIEIM6KRecE2f1azYPhPhv2pTn/9rZCtbk1o+KALSHuJ3U9'
}



//___________________________________________ FUNCTIONS ___________________________________________


let GET_ACCOUNT_DATA=async account=>{

    return fetch(`http://localhost:6666/account/${account}`)

    .then(r=>r.json()).catch(_=>{
    
        console.log(_)

        console.log(`Can't get chain level data`)

    })

}


let BLAKE3=v=>hash(v).toString('hex')


let GET_EVENT_TEMPLATE=async(account,txType,sigType,nonce,payload)=>{


    let template = {

        v:WORKFLOW_VERSION,
        creator:account.pub,
        type:txType,
        nonce,
        fee:FEE,
        payload,
        sig:''
    
    }

    template.payload.type=sigType

    if(sigType===SIG_TYPES.DEFAULT){

        template.sig = await SIG(SYMBIOTE_ID+WORKFLOW_VERSION+txType+JSON.stringify(payload)+nonce+FEE,account.prv)

    }else if (sigType===SIG_TYPES.MULTISIG){
        
        template.sig = await bls.singleSig(SYMBIOTE_ID+WORKFLOW_VERSION+txType+JSON.stringify(payload)+nonce+FEE,account.prv)
    
    }

    return template

}



let SEND_EVENT=event=>{

    return fetch('http://localhost:6666/event',

        {
        
            method:'POST',
        
            body:JSON.stringify({symbiote:SYMBIOTE_ID,event})
    
        }

    ).then(r=>r.text()).catch(console.log)

}

//_____________________________ TESTS _____________________________


let accData = await GET_ACCOUNT_DATA(user0.pub)

console.log(accData)

let multisigPayload={

    // Required if the sender is a multisig
    active:user0.pub,
    afk:[],
    
    // Required fields for TX_TYPES.TX
    to:user1.pub,
    amount:1000
}

let event = await GET_EVENT_TEMPLATE(user0,TX_TYPES.TX,SIG_TYPES.MULTISIG,accData.nonce,multisigPayload)

console.log(event)

let status = await SEND_EVENT(event)

console.log(status)