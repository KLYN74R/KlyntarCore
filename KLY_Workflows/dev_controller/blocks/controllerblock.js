import {BLAKE3} from '../../../KLY_Utils/utils.js'
import {symbiotes} from '../utils.js'

export default class ControllerBlock{
    
    constructor(symbiote,instantBlocksArr){
        
        this.c=CONFIG.SYMBIOTE.PUB
        
        this.a=instantBlocksArr//array of InstantBlocks' hashes
        
        this.i=symbiotes.get(symbiote).GENERATION_THREAD.NEXT_INDEX//index of block.Need for indexation in DB only
        
        this.p=symbiotes.get(symbiote).GENERATION_THREAD.PREV_HASH
        
        this.sig=''
    
    }
    
    static genHash=(symbiote,instantArray,index,prevHash)=>BLAKE3( JSON.stringify(instantArray) + symbiote + index + prevHash)

}