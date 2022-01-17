import {BLAKE3} from '../KLY_Space/utils.js'

export default class InstantBlock{
    
    constructor(chain,deflt,secured){
        
        this.c=CONFIG.CHAINS[chain].PUB
        
        this.d=deflt//delegs,controllerStart,txs,hashes of newstxs,news to save in blockchain in full form...
        
        this.s=secured//sdelegs,stxs...
        
        this.n=chain//need to forward block when we receive it
        
        this.sig=''
    
    }
    
    static genHash=(chain,deflt,secur,creator)=>BLAKE3( JSON.stringify(deflt) + JSON.stringify(secur) + chain + creator)

}