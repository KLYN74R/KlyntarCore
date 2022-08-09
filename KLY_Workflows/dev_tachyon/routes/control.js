let CONTROL = {

    nonce:0,

    ls:'SOME GUID'

},


config=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async bytes=>{

    let body=await BODY(bytes,CONFIG.PAYLOAD_SIZE)

    a.end('')


})



UWS_SERVER

.post('/con',config)