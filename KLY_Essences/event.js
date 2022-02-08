export default class{
    
    constructor(sender,eventType,nonce,payload){
    
        this.c=sender

        this.t=eventType
    
        this.n=nonce

        this.p=payload

        //this.s=SIG(this.r+tag+amount+chain+nonce,prv)
        
    }
}