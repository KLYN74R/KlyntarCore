export default class{
    
    constructor(sender,delegate,tag,nonce){
    
        this.c=sender
    
        this.d=delegate

        this.t=tag
    
        this.n=nonce
        
        //this.s=SIG(delegate+chain+nonce,prv)
    
    }
}
