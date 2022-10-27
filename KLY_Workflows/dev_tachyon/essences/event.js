export default class{
    
    constructor(version,creator,eventType,nonce,fee,payload){
    
        this.v=version

        this.creator=creator

        this.type=eventType
    
        this.nonce=nonce
        
        this.fee=fee

        this.payload=payload

        //this.sig=signature
        
    }
    
}