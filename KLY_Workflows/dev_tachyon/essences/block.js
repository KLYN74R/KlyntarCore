import {BLAKE3,GET_GMT_TIMESTAMP} from '../../../KLY_Utils/utils.js'




export default class Block{
    
    constructor(transactionsSet,extraData={},epochFullID){
        
        this.creator = global.CONFIG.SYMBIOTE.PUB // block creator(validator|pool) Example: 9GQ46rqY238rk2neSwgidap9ww5zbAN4dyqyC7j5ZnBK

        this.time = GET_GMT_TIMESTAMP() // UTC timestamp (NOTE:in milliseconds)

        this.epoch = epochFullID

        this.transactions = transactionsSet // array of transactions,contract calls, services logic,etc.

        this.extraData = extraData // extradata to be added to block. Used mostly to add <aggregatedSkipProof>

        this.index = global.SYMBIOTE_META.GENERATION_THREAD.nextIndex //index of block in validator's thread
        
        this.prevHash = global.SYMBIOTE_META.GENERATION_THREAD.prevHash //hash of previous block in validator's thread
        
        this.sig = '' // Ed25519 signature of block
    
    }
    
    static genHash = block => BLAKE3( block.creator + block.time + JSON.stringify(block.transactions) + global.GENESIS.SYMBIOTE_ID + block.epoch + block.index + block.prevHash)

}