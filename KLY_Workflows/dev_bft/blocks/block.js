import {BLAKE3} from '../../../KLY_Utils/utils.js'



export default class Block{
    
    constructor(eventsSet){
        
        this.c=CONFIG.SYMBIOTE.PUB//block creator(validator)
        
        this.e=eventsSet//array of events(transactions)
        
        this.i=SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX//index of block.Need for indexation in DB only
        
        this.p=SYMBIOTE_META.GENERATION_THREAD.PREV_HASH
        
        this.sig=''
    
    }
    
    static genHash=(eventsSet,index,prevHash)=>BLAKE3( JSON.stringify(eventsSet) + CONFIG.SYMBIOTE.SYMBIOTE_ID + index + prevHash)

}