import {BLAKE3} from '../KLY_Space/utils.js'
import {symbiotes} from '../klyn74r.js'

export default class ControllerBlock{
    
    constructor(chain,instantBlocksArr){
        
        this.c=CONFIG.CHAINS[chain].PUB
        
        this.a=instantBlocksArr//array of InstantBlocks' hashes
        
        this.i=symbiotes.get(chain).GENERATION_THREAD.NEXT_INDEX//index of block.Need for indexation in DB only
        
        this.p=symbiotes.get(chain).GENERATION_THREAD.PREV_HASH
        
        this.sig=''
    
    }
    
    static genHash=(chain,instantArray,index,prevHash)=>BLAKE3( JSON.stringify(instantArray) + chain + index + prevHash)

}