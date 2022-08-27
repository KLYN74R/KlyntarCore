import {BLAKE3} from '../../../KLY_Utils/utils.js'



export default class Block{
    
    constructor(eventsSet,validatorsStuff){
        
        this.c=CONFIG.SYMBIOTE.PUB //block creator(validator) Example:7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta

        this.e=eventsSet //array of events(transactions)
        
        this.v=validatorsStuff //arry of validators related stuff. For example, sync flags to ressuect validators

        this.i=SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX //index of block in validator's thread
        
        this.p=SYMBIOTE_META.GENERATION_THREAD.PREV_HASH //hash of previous block in validator's thread
        
        this.sig='' //BLS signature of block
    
    }
    
    static genHash=(creator,eventsSet,validatorsStuff,index,prevHash)=>BLAKE3( creator + JSON.stringify(eventsSet) + JSON.stringify(validatorsStuff) + CONFIG.SYMBIOTE.SYMBIOTE_ID + index + prevHash)

}