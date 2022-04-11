//CONTROL_SID
//CONTROL_PRV_KEY
export default {

    nonce:0,

    ls:'SOME GUID',

    config:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async bytes=>{

        let body=await BODY(bytes,CONFIG.PAYLOAD_SIZE)

    
    })

}
    
