/**
 * ________________________________________________________________KLYNTAR_________________________________________________________________
 * 
 * @Vlad@ Chernenko 18.08.-1
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 *  Test transactions available by hashes:
 *  [
 * 
 *      a3b68ef49cb7e861f6f987b9f2e1b390185a832d0df55dbeab08c78fa86bb210 (user.txt)
 *      85b5bc6e24b2d4fc8ace1e447cae768da7ac55eaee356a44f8ca5fe580f7d941
 *      fd6af6d1bc6a8a3bfa6f176797fe35c526d4295fd63b1a06a490d92452476987
 *      4aaf4b3ddacdd7d97beab960fdd63373015688c08aab1ede95bac773fbd8cd77 (via own node(testnet mode))
 * 
 *      132d0aa6621ac2a8077bebcc72af1087a2b5b6d419a9d71bb8d0f9696965e363 (via node and P2SH_2 -> legacy)
 *      1d8e0386f67899f47c21ba93516caa5c67f412a6aac59f3f4e49c766025d2911 (node -> gateway(+auth) -> RPC call on local interface -> broadcast to network)
 *      50686389ac302d0fa0e863d31feb4e13cf06a07bebce835383dd5ecf2548fb69
 *   
 *      977355b0de9eb252c0c61974ffba1ab5f585b2cd1e998282fdc98c7780c1678c (node -> gateway(+auth) -> RPC call -> createrawtransaction -> signwithwallet ...).Also it's P2SH
 *  ]
 * 
 * 
 *  Mainnet txs:[
 * 
 *      282f44877e0d5d6fca233021c62bec11bd0cc3579be2ba7732a13e33c9abf1b6 useful.txt
 * 
 * ]
 * 
 * 
 * @Build for KLYNTAR symbiotic platform and hostchains
 * 
 */




import {getBlockByIndex,checkCommit,makeCommit,getBalance} from './btcForksCommon.js'

import bitlite from 'litecore-lib-v5'//'litecore-lib'




export default {
    
    checkCommit:(hostChainHash,blockIndex,klyntarHash)=>checkCommit('ltc',hostChainHash,blockIndex,klyntarHash),


    makeCommit:(blockIndex,klyntarHash)=>makeCommit(bitlite.Transaction,'ltc',blockIndex,klyntarHash),
    

    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },


    getBalance:()=>getBalance('ltc'),

    //____________________________________________________________ USED IN TACHYON ____________________________________________________________

    getBlockByIndex:blockIndex=>getBlockByIndex('ltc',blockIndex)
    

}