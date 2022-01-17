export default class{
    
    constructor(sender,manifest,nonce){
    
        this.c=sender
    
        this.m=manifest//json in base64
    
        this.n=nonce
        //this.s=SIG(this.m+chain+nonce,prv)
    }
}