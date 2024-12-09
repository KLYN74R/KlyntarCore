import {blake3Hash, getUtcTimestamp} from '../../../KLY_Utils/utils.js'

import {BLOCKCHAIN_GENESIS, CONFIGURATION} from '../../../klyn74r.js'

import {WORKING_THREADS} from '../blockchain_preparation.js'




export default class Block{
    
    constructor(shardID,transactionsSet,extraData,epochFullID){
        
        this.creator = CONFIGURATION.NODE_LEVEL.PUBLIC_KEY // block creator(validator|pool) Example: 9GQ46rqY238rk2neSwgidap9ww5zbAN4dyqyC7j5ZnBK

        this.time = getUtcTimestamp() // (NOTE:in milliseconds)

        this.epoch = epochFullID

        this.transactions = transactionsSet // array of transactions,contract calls, services logic,etc.

        this.extraData = extraData || {} // extradata to be added to block

        this.index = WORKING_THREADS.GENERATION_THREAD.perShardData[shardID].nextIndex // index of block in validator's thread
        
        this.prevHash = WORKING_THREADS.GENERATION_THREAD.perShardData[shardID].prevHash // hash of previous block in validator's thread
        
        this.sig = '' // Ed25519 signature of block
    
    }
    
    static genHash = block => blake3Hash( block.creator + block.time + JSON.stringify(block.transactions) + BLOCKCHAIN_GENESIS.NETWORK_ID + block.epoch + block.index + block.prevHash)

}