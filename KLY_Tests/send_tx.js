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


// KEYPAIR={

//     pub: 'FASj1powx5qF1J6MRmx1PB7NQp5mENYEukhyfaWoqzL9',
//     prv: 'MC4CAQAwBQYDK2VwBCIEICwEjxQThyf3yfw+F9L4SRGcu/LgXrgppd1wb5PCIY6k'

// },

import {SIG} from '../KLY_Utils/utils.js'
import {hash} from 'blake3-wasm'
import fetch from 'node-fetch'


let alice={ alias:'alice',pub: "GzmZ9AnRnFb2uMnn514phewbarpeg7EgWU6vXpNVTiZy", prv: "MC4CAQAwBQYDK2VwBCIEIOrT3U7lyb5V35P9nLhFeKuxHveQm2dNmX1GJynlNuNj" }


let bob={ alias:'bob',pub: "HPaoAvk1SLynMgc1woFkc4GkFe25YcHPtYF14FEpV9SW", prv: "MC4CAQAwBQYDK2VwBCIEIHSBKMn6NpoadXz8DEzOSNK9aapptkcGajgNh65xgqLv" },


BLAKE3=v=>hash(v).toString('hex'),

//Choose the role
SENDER=bob,
RECEPIENT=alice,

symbiote='FASj1powx5qF1J6MRmx1PB7NQp5mENYEukhyfaWoqzL9',//chain on which you wanna send tx



chainNonce=await fetch(`http://localhost:11111/account/${symbiote}/${SENDER.pub}`)

.then(r=>r.json()).then(data=>{

    console.log(data)

    return data.N+1

}).catch(e=>{
    
    console.log(`Can't get chain level data`)

}),//nonce on appropriate chain



//Changable values
payload={
    r:RECEPIENT.pub,
    a:4
},


WORKFLOW_VERSION = "0.1.0",
FEE=5,
PAYLOAD_TYPE='TX',

event={
    v:WORKFLOW_VERSION,
    c:SENDER.pub,
    t:PAYLOAD_TYPE,
    n:chainNonce,
    p:payload,
    f:FEE,
    s:await SIG(symbiote+WORKFLOW_VERSION+PAYLOAD_TYPE+JSON.stringify(payload)+chainNonce+FEE,SENDER.prv)
}

await fetch(`http://localhost:11111/account/${symbiote}/${SENDER.pub}`).then(r=>r.text()).then(x=>console.log(`Account state for SENDER(${SENDER.alias}) =>`,x))
await fetch(`http://localhost:11111/account/${symbiote}/${RECEPIENT.pub}`).then(r=>r.text()).then(x=>console.log(`Account state for RECEPIENT(${RECEPIENT.alias}) =>`,x))




//Send
// await fetch('http://localhost:11111/event',

//     {
        
//         method:'POST',
        
//         body:JSON.stringify({symbiote,event})
    
//     }

// ).then(r=>r.text()).then(x=>console.log('DefaultTx =>',x))
