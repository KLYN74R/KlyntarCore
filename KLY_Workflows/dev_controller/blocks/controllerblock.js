import {BLAKE3} from '../../../KLY_Utils/utils.js'



export default class ControllerBlock{
    
    constructor(instantBlocksArr){
        
        this.c=CONFIG.SYMBIOTE.PUB
        
        this.a=instantBlocksArr//array of InstantBlocks' hashes
        
        this.i=SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX//index of block.Need for indexation in DB only
        
        this.p=SYMBIOTE_META.GENERATION_THREAD.PREV_HASH
        
        this.sig=''
    
    }
    
    static genHash=(instantArray,index,prevHash)=>BLAKE3( JSON.stringify(instantArray) + CONFIG.SYMBIOTE.SYMBIOTE_ID + index + prevHash)

}