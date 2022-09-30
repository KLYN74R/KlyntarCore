export default class{
    
    constructor(version,creator,eventType,nonce,fee,payload){
    
        this.v=version

        this.c=creator

        this.t=eventType
    
        this.n=nonce
        
        this.f=fee

        this.p=payload

        //this.s=signature
        
    }
    
}