export default class{
    
    constructor(sender,recipient,amount,tag,nonce){
    
        this.c=sender
    
        this.r=recipient
    
        this.a=amount
    
        this.t=tag
    
        this.n=nonce
        //this.s=SIG(this.r+tag+amount+chain+nonce,prv)
    }
}