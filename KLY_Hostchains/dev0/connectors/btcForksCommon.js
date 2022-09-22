import fetch from 'node-fetch'




//________________________________________________________________ "PRIVATE" common messages ________________________________________________________________


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





/*

Returned object

{
  hash: '9d61a739b99ffb3d850db57af34f1da621628e9e7dc9ddf7718fa4a276ee056c',
  confirmations: 536622,
  strippedsize: 389,
  size: 425,
  weight: 1592,
  height: 2000000,
  version: 536870912,
  versionHex: '20000000',
  merkleroot: 'f90b4fee5dbe376787fc36933f2ed058ddbccc65f55891df00c5357090dd0bdf',
  tx: [
    'f90b4fee5dbe376787fc36933f2ed058ddbccc65f55891df00c5357090dd0bdf'
  ],
  time: 1629823127,
  mediantime: 1629822616,
  nonce: 1476395008,
  bits: '1e018980',
  difficulty: 0.002541257283890565,
  chainwork: '000000000000000000000000000000000000000000000000004a7fb8d57169eb',
  nTx: 1,
  previousblockhash: '474d8ae8375185f2e97753b336d02df5f987bea509f9e045118087c963db77fe',
  nextblockhash: '3a43933ed7420a0d477569e018575116c0ece4917fd9d9155a5c1032af093531'
}

*/

export let getBlockByIndex = async (btcFork,blockIndex) =>

    REQUEST_TO_NODE(btcFork,'getblockhash',[blockIndex]).then(
    
        blockHash => REQUEST_TO_NODE(btcFork,'getblock',[blockHash])
    
    )




export let checkCommit = (btcFork,hostChainHash,blockIndex,klyntarHash) => {

    return REQUEST_TO_NODE(btcFork,'getrawtransaction',[hostChainHash]).then(
    
        rawTxObject => REQUEST_TO_NODE(btcFork,'decoderawtransaction',[rawTxObject]).then(tx=>{

            //Convert hexademical data from output and get rid of magic bytes
            let data=Buffer.from(tx.vout[0].scriptPubKey.hex,'hex').toString('utf-8').slice(2).split('_')

            return data[0]==blockIndex&&data[1]===klyntarHash  

        })
    
    ).catch(e=>LOG(`Some error has been occurred in ${btcFork} when getting tx by hash\x1b[36;1m${e}`,'W'))

}




export let makeCommit=async(TxClassInstance,btcFork,blockIndex,klyntarHash)=>{


    let {PUB,PRV,FEE}=CONFIG.SYMBIOTE.HC_CONFIGS[btcFork],
        
        inputs=[],        
        
        //Fetch available from utxo pool
        nodeUtxos=await REQUEST_TO_NODE(btcFork,'listunspent').then(
            
            utxos => utxos.filter(utxo=>utxo.address===PUB) //to get inputs for address format
            
        )

        
        //Try to get UTXOs from node
        nodeUtxos.forEach(output=>{
 
            let utxo = {}

            utxo.satoshis = Math.floor(Number(output.amount) * 100000000)
            utxo.script = output.scriptPubKey
            utxo.address = PUB
            utxo.txId = output.txid
            utxo.outputIndex = output.vout
        
            inputs.push(utxo)
    
        })


    //Create empty instance...
    let transaction = new TxClassInstance()


    transaction.from(inputs)//Set transaction inputs

        .addData(blockIndex+'_'+klyntarHash)//Add payload

        .change(PUB)// Set change address - Address to receive the left over funds after transfer

        .fee(FEE)//Manually set transaction fees: 20 satoshis per byte

        .sign(PRV)// Sign transaction with your private key

        
    return REQUEST_TO_NODE(btcFork,'sendrawtransaction',[transaction.serialize()]).catch(e=>LOG(`Can't make commit in ${btcFork}\n${e}`,'W'))
    

}




export let getBalance = btcFork => REQUEST_TO_NODE(btcFork,'getbalance',[]).catch(e=>`No data\x1b[31;1m (${e})\x1b[0m`)




export let getTransaction = (btcFork,txHash) => {

    REQUEST_TO_NODE(btcFork,'getrawtransaction',[txHash]).then(
    
        rawTxObject => REQUEST_TO_NODE(btcFork,'decoderawtransaction',[rawTxObject])
    
    ).catch(e=>LOG(`Some error has been occurred in ${btcFork} when getting tx by hash\x1b[36;1m${e}`,'W'))

}