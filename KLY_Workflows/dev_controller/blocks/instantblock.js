import {BLAKE3} from '../../../KLY_Utils/utils.js'

export default class InstantBlock{
    
    constructor(eventsSet){
        
        this.c=CONFIG.SYMBIOTE.PUB

        this.e=eventsSet
        
        this.sig=''
    
    }
    
    static genHash=(creator,eventsSet)=>BLAKE3( creator + JSON.stringify(eventsSet) + CONFIG.SYMBIOTE.SYMBIOTE_ID)

}