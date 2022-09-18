import fetch from 'node-fetch'




let REQUEST_TO_NODE = async (btcFork,command,params)=>{

    let {URL,CREDS}=CONFIG.SYMBIOTE.HC_CONFIGS[btcFork]

    return fetch(URL,{

        method:'POST',
    
        headers:{
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + Buffer.from(CREDS,'utf8').toString('base64')
        },
    
        body:JSON.stringify({
    
            jsonrpc:"1.0",
            method:command,
            params
            
        })
    
    }).then(r=>r.json()).then(r=>r.result)

}




export let getBlockByIndex = async (btcFork,blockIndex) =>

    REQUEST_TO_NODE(btcFork,'getblockhash',[blockIndex]).then(
    
        blockHash => REQUEST_TO_NODE('getblock',[blockHash])
    
    )