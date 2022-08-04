export default class{
    
    constructor(version,sender,eventType,nonce,fee,payload){
    
        this.v=version

        this.c=sender

        this.t=eventType
    
        this.n=nonce
        
        this.f=fee

        this.p=payload

        //this.s=signature
        
    }
}