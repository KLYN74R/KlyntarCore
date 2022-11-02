export let DEFAULT = {

    CONTRACT_CALL:(contractID,params)=>{
        
    },

    EVENT_EMIT:(eventID,payload) => {

        //Store, share and do everything with event. Also, use contract ID (BLAKE3 hash of raw bytes) to identify the event issuer
        //Payload might be everything you need

    },

    MULTISIG:()=>{},

    PQC_SIG:()=>{},

    TBLS_SIG:()=>{},

    ED25519:()=>{},

    EVM_CALL:()=>{}

}