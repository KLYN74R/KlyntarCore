import {BLAKE3} from '../../../KLY_Utils/utils.js'



export default class Block{
    
    constructor(eventsSet,index,prevHash){
        
        this.c=CONFIG.SYMBIOTE.PUB//block creator(validator)
        
        this.e=eventsSet//array of events(transactions)
        
        this.i=index
        
        this.p=prevHash
        
        this.sig=''
    
    }
    
    static genHash=(eventsSet,index,prevHash)=>BLAKE3( JSON.stringify(eventsSet) + CONFIG.SYMBIOTE.SYMBIOTE_ID + index + prevHash)

}