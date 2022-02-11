import {BLAKE3} from '../KLY_Space/utils.js'

export default class InstantBlock{
    
    constructor(symbiote,eventsSet){
        
        this.c=CONFIG.SYMBIOTES[symbiote].PUB

        this.e=eventsSet
                
        this.s=symbiote//need to forward block when we receive it
        
        this.sig=''
    
    }
    
    static genHash=(creator,eventsSet,symbiote)=>BLAKE3( creator + JSON.stringify(eventsSet) + symbiote)

}