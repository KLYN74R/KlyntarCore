export default class{
    
    constructor(sender,eventType,nonce,payload){
    
        this.c=sender

        this.t=eventType
    
        this.n=nonce

        this.p=payload

        //this.s=await SIG(JSON.stringify(payload)+symbiote+nonce+eventType)//and signature dependent on type
        
    }
}