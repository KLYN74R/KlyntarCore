import {BLAKE3,GET_GMT_TIMESTAMP} from '../../../KLY_Utils/utils.js'




export default class Block{
    
    constructor(transactionsSet,extraData={}){
        
        this.creator=global.CONFIG.SYMBIOTE.PUB //block creator(validator) Example:7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta

        this.time=GET_GMT_TIMESTAMP() //UTC timestamp (NOTE:in milliseconds)

        this.transactions=transactionsSet //array of transactions,contract calls, services logic,etc.

        this.extraData = extraData //extradata to be added to block. Used mostly to add AGGREGATED_SKIP_PROOF

        this.index=global.SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX //index of block in validator's thread
        
        this.prevHash=global.SYMBIOTE_META.GENERATION_THREAD.PREV_HASH //hash of previous block in validator's thread
        
        this.sig='' //BLS signature of block
    
    }
    
    static genHash=block=>BLAKE3( block.creator + block.time + JSON.stringify(block.transactions) + global.CONFIG.SYMBIOTE.SYMBIOTE_ID + block.index + block.prevHash)

}