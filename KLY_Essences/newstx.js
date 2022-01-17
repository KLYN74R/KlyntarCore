export default class{
    
    constructor(sender,newsHash,nonce){
    
        this.c=sender
    
        this.h=newsHash
    
        this.n=nonce
        //this.s=SIG(newshash+chain+nonce,prv)
    }
}