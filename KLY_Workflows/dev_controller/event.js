export default class{
    
    constructor(sender,eventType,nonce,fee,payload){
    
        this.c=sender

        this.t=eventType
    
        this.n=nonce
        
        this.f=fee

        this.p=payload

        //this.s=await SIG(JSON.stringify(payload)+symbiote+nonce+eventType)
        
    }
}