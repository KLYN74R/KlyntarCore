let CONTROL = {

    nonce:0,

    ls:'SOME GUID'

},


config=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async bytes=>{

    let body=await BODY(bytes,CONFIG.PAYLOAD_SIZE)

    response.end('')


})



UWS_SERVER

.post('/con',config)