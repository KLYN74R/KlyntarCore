import {BLAKE3, GET_GMT_TIMESTAMP} from '../../../KLY_Utils/utils.js'




export default class Block{
    
    constructor(eventsSet){
        
        this.creator=CONFIG.SYMBIOTE.PUB //block creator(validator) Example:7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta

        this.time=GET_GMT_TIMESTAMP() //UTC timestamp

        this.events=eventsSet //array of events(transactions,contract calls, services logic,etc.)

        this.index=SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX //index of block in validator's thread
        
        this.prevHash=SYMBIOTE_META.GENERATION_THREAD.PREV_HASH //hash of previous block in validator's thread
        
        this.sig='' //BLS signature of block
    
    }
    
    static genHash=block=>BLAKE3( block.creator + block.time + JSON.stringify(block.events) + CONFIG.SYMBIOTE.SYMBIOTE_ID + block.index + block.prevHash)

}