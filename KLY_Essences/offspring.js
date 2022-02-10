export default class{
    
    constructor(sender,manifest,tag,nonce){
    
        this.c=sender
    
        this.m=manifest//json in base64

        this.t=tag
    
        this.n=nonce
        //this.s=SIG(this.m+symbiote+nonce,prv)
    }
}