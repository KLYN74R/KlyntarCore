








import UWS from 'uWebSockets.js'
import request from 'request'
import l from 'level'
import fs from 'fs'



let {connection}=JSON.parse(fs.readFileSync(PATH_RESOLVE('config.json'))),//basic configuration data

    BODY=(bytes,limit)=>new Promise(r=>r(bytes.byteLength<=limit&&JSON.parse(Buffer.from(bytes)))).catch(e=>e),
    
    users=l('GATEWAY_USERS'),//db where you can store hostchain-dependent users e.g. your organization,API users,etc.

    CHECK_USER=token=>users.get(token).catch(e=>false),//simple verification via token(Infura-like).Add extra logic(logging,limits(no),etc.)

    headers={'content-type': 'text/plain;'}








//Start gateway
UWS.App()




//To get the pure transaction to check commit of symbiote on appropriate hostchain,number of confirmations and another data
.post('/tx',a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async data=>{

    let auth=await BODY(data,100000)

    if(await CHECK_USER(auth.token)){

        
        request({
            
            url: connection,
            method: "POST",
            headers: headers,
            body: `{"jsonrpc":"1.0","method":"getrawtransaction","params":["${auth.hash}",true]}`
        
        },(error,response,body)=>a.end(!error && response.statusCode == 200?body:'Wrong query'))


    }else a.end('Wrong creds')
    

}))



//To get an array of utxos for specific address
.post('/utxos',a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async data=>{

    
    let auth=await BODY(data,100000)

    if(auth.password===password){

        client.getUnspentTransactionOutputs().then(tx=>a.end(tx)).catch(e=>a.end(JSON.stringify(e)))

    }else a.end('Wrong creds')
    

}))



//To accept sended txs and broadcast to network
.post('/send',a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async data=>{

    
    let auth=await BODY(data,100000)

    //May add some extensions & proposals
    if(await CHECK_USER(auth.token)){

        request({
            
            url: connection,
            method: "POST",
            headers: headers,
            body: `{"jsonrpc":"1.0","method":"sendrawtransaction","params":["${auth.hex_tx}"]}`
        
        },(error,response,body)=>a.end(!error && response.statusCode == 200?body:'Wrong query'))


    }else a.end('Wrong creds')
    
    

}))




//To accept sended txs and broadcast to network
.post('/balance',a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async data=>{

    
    let auth=await BODY(data,100000)

    //May add some extensions & proposals
    if(await CHECK_USER(auth.token)){

        //here get an address

        request({
            
            url: connection,
            method: "POST",
            headers: headers,
            body: `{"jsonrpc":"1.0","method":"getbalance","params":[]}`
        
        },(error,response,body)=>a.end(!error && response.statusCode == 200?body:'Wrong query'))


    }else a.end('Wrong creds')
    
    

}))


.get('/health',a=>a.end('1'))


.listen(2339,ok=>console.log(`Gateway started on 2339 port`))