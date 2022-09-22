/**
 * ________________________________________________________________KLYNTAR_________________________________________________________________
 * 
 * @Vlad@ Chernenko 24.07.-1
 * 
 * 
 * 
 * 
 * We can generate also via bitcore-lib or bitcoin-lib
 * 
 * Test transactions available by hashes:
 * [
 *    1ff8f7a5e828661ca6a29caea9b9eaac5eda9510387f39c10e0bd5945756abb1, (NOT ACCEPTED)
 *    0425a2da0ec20e82882ce3e11ffb05460f4b33ddad6f7682b79c7d6a96eaa1df,
 *    cbe42d16bff97caec05ceeec8667f65393394e5434f21105a3d2beaae5deef29,
 *    52a8fcb2b596f8305c100613d5a2fb1c25df28ba00dfc65392d9bb118e715fda (update useful.txt)
 * ]
 * 
 * 
 * MAINNET COMMIT -> 5645cf4d2615fd7f9659b8e78b45aca0eb762fc4182256e66297bce27b8e8aec (NOT ACCEPTED)
 * 
 *                   8e51fbd60e41be6930a32227126daab3d6390dea30fdfa6ec77674228228bceb
 * 
 * 
 * 
 * ____________________________________________________Alternative(via BLock.io API)__________________________________________________
 * 
 * 
 * 
 * 
 * import BlockIo from 'block_io'
 * 
 * P.S:Useful link which helped me to solve one problem -> https://github.com/bitpay/bitcore/issues/1247
 *     We can generate also via bitcore-lib or bitcoin-lib 
 * 
 * 
 * 
 * 
 * 
 * 
 * @Build for KLYNTAR symbiotic platform and hostchains
 * 
 */


import {getBlockByIndex,checkCommit,makeCommit,getBalance,getTransaction} from './btcForksCommon.js'

import bitdoge from 'bitcore-doge-lib'




export default {
    
    checkCommit:(hostChainHash,blockIndex,klyntarHash)=>checkCommit('doge',hostChainHash,blockIndex,klyntarHash),


    makeCommit:(blockIndex,klyntarHash)=>makeCommit(bitdoge.Transaction,'doge',blockIndex,klyntarHash),
    

    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },


    getBalance:()=>getBalance('doge'),


    getBlockByIndex:blockIndex=>getBlockByIndex('doge',blockIndex),

    getTransaction:txHash=>getTransaction('doge',txHash)
    

}