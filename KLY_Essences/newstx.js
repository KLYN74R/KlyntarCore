export default class{
    
    constructor(sender,newsHash,tag,nonce){
    
        this.c=sender
    
        this.h=newsHash

        this.t=tag
    
        this.n=nonce
        //this.s=SIG(newshash+chain+nonce,prv)
    }
}