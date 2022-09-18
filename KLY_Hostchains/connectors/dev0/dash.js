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
 * TXS:[
 * 
 *      TESTNET:[
 * 
 *                dee7a4c2961c23cb8f73cfcc73bb98a6bbdfc062bc14c37d6e27e9fbd9f034fc (useful.txt)
 *                d7bd1f63294008bd802073635725e7f8b184f65604fc223d9c9a083ebaaac629
 *                4f9d0506b4e9328cca58b14194035215d5bd6b32e45c3af5667e41ebec52e54f
 *                cc1d182a4dda762cc3588d9e977ef40c5b1e79fbb5120537abd8bd91a61f3897 (via own node)
 *                ff7ddbb3d86803388c9537b96237a325caea7bf3ea4e8cb28641675131e53351 (via own node)
 *                61bdbf0c4149f8a0da4d8b79985868f4fde6b431068716a767f31641c3f66c28 (via node + gateway)
 *                1ae5869cf082361a01e60654992e646da44486549260bbecaf489320c0a2e6d2 (get UTXOs from node)
 * 
 *      ]
 * 
 * ]
 * 
 * 
 * Links:[
 * 
 * https://github.com/dashevo/dashcore-lib
 * https://github.com/dashevo/dashcore-lib/blob/master/docs/examples.md
 * https://github.com/BlockchainCommons/Learning-Bitcoin-from-the-Command-Line/blob/master/03_3_Setting_Up_Your_Wallet.md
 * 
 * 
 * ]
 * 
 * 
 * @Build for KLYNTAR symbiotic platform and hostchains
 *
 * */




import {getBlockByIndex,checkCommit,makeCommit,getBalance} from './btcForksCommon.js'

import dashcore from '@dashevo/dashcore-lib'




export default {
    
    checkCommit:(hostChainHash,blockIndex,klyntarHash)=>checkCommit('dash',hostChainHash,blockIndex,klyntarHash),


    makeCommit:(blockIndex,klyntarHash)=>makeCommit(dashcore.Transaction,'dash',blockIndex,klyntarHash),
    

    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },


    getBalance:()=>getBalance('dash'),


    getBlockByIndex:blockIndex=>getBlockByIndex('dash',blockIndex)
    

}