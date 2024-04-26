import {BLOCKCHAIN_GENESIS, CONFIGURATION} from '../../../klyn74r.js'

import {BLAKE3, GET_UTC_TIMESTAMP} from '../../../KLY_Utils/utils.js'

import {WORKING_THREADS} from '../blockchain_preparation.js'




export default class Block{
    
    constructor(transactionsSet,extraData={},epochFullID){
        
        this.creator = CONFIGURATION.NODE_LEVEL.PUBLIC_KEY // block creator(validator|pool) Example: 9GQ46rqY238rk2neSwgidap9ww5zbAN4dyqyC7j5ZnBK

        this.time = GET_UTC_TIMESTAMP() // (NOTE:in milliseconds)

        this.epoch = epochFullID

        this.transactions = transactionsSet // array of transactions,contract calls, services logic,etc.

        this.extraData = extraData // extradata to be added to block. Used mostly to add <leaderRotationProofs>

        this.index = WORKING_THREADS.GENERATION_THREAD.nextIndex // index of block in validator's thread
        
        this.prevHash = WORKING_THREADS.GENERATION_THREAD.prevHash // hash of previous block in validator's thread
        
        this.sig = '' // Ed25519 signature of block
    
    }
    
    static genHash = block => BLAKE3( block.creator + block.time + JSON.stringify(block.transactions) + BLOCKCHAIN_GENESIS.SYMBIOTE_ID + block.epoch + block.index + block.prevHash)

}