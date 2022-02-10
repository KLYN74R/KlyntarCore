import {BLAKE3} from '../KLY_Space/utils.js'

export default class InstantBlock{
    
    constructor(symbiote,deflt,secured){
        
        this.c=CONFIG.SYMBIOTES[symbiote].PUB
        
        this.d=deflt//delegs,controllerStart,txs,hashes of newstxs,news to save in blockchain in full form...
        
        this.s=secured//sdelegs,stxs...
        
        this.n=symbiote//need to forward block when we receive it
        
        this.sig=''
    
    }
    
    static genHash=(symbiote,default_txs,secured_txs,creator)=>BLAKE3( JSON.stringify(default_txs) + JSON.stringify(secured_txs) + symbiote + creator)

}