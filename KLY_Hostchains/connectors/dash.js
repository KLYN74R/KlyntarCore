/**
 * ________________________________________________________________KLYNTAR_________________________________________________________________
 * 
 * @Vlad@ Chernenko 18.08.-1
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * TXS:[
 * 
 *      TESTNET:[
 * 
 *                dee7a4c2961c23cb8f73cfcc73bb98a6bbdfc062bc14c37d6e27e9fbd9f034fc (useful.txt)
 *                d7bd1f63294008bd802073635725e7f8b184f65604fc223d9c9a083ebaaac629
 *                4f9d0506b4e9328cca58b14194035215d5bd6b32e45c3af5667e41ebec52e54f
 *                cc1d182a4dda762cc3588d9e977ef40c5b1e79fbb5120537abd8bd91a61f3897 (via own node)
 *                ff7ddbb3d86803388c9537b96237a325caea7bf3ea4e8cb28641675131e53351 (via own node)
 *                61bdbf0c4149f8a0da4d8b79985868f4fde6b431068716a767f31641c3f66c28 (via node + gateway)
 *                1ae5869cf082361a01e60654992e646da44486549260bbecaf489320c0a2e6d2 (get UTXOs from node)
 * 
 *      ]
 * 
 * ]
 * 
 * 
 * Links:[
 * 
 * https://github.com/dashevo/dashcore-lib
 * https://github.com/dashevo/dashcore-lib/blob/master/docs/examples.md
 * https://github.com/BlockchainCommons/Learning-Bitcoin-from-the-Command-Line/blob/master/03_3_Setting_Up_Your_Wallet.md
 * 
 * 
 * ]
 * 
 * 
 * @Build for KLYNTAR symbiotic platform and hostchains
 *
 * */




import dashcore from '@dashevo/dashcore-lib'

import{LOG}from'../../KLY_Space/utils.js'

import fetch from 'node-fetch'




export default {


    checkTx:(hostChainHash,blockIndex,klyntarHash,chain)=>{


        let {PROVIDER_TYPE,URL,CONFIRMATIONS,CREDS}=CONFIG.CHAINS[chain].HC_CONFIGS.dash



        if(PROVIDER_TYPE==='NODE'){

            return fetch(URL,{method:'POST',body:JSON.stringify({

                password:CREDS,
                
                command:`dash-cli gettransaction ${hostChainHash}`
            
            })}).then(r=>r.json()).then(tx=>
                
                tx.confirmations>=CONFIRMATIONS
                &&
                fetch(URL,{method:'POST',body:JSON.stringify({

                    password:CREDS,
    
                    command:`dash-cli decoderawtransaction $(dash-cli getrawtransaction ${hostChainHash})`

                })}).then(r=>r.json()).then(tx=>{
                    
                    //Convert hexademical data from output and get rid of magic bytes
                    let data=Buffer.from(tx.vout[0].scriptPubKey.hex,'hex').toString('utf-8').slice(2).split('_')

                    return data[0]==blockIndex&&data[1]===klyntarHash

                })

            ).catch(e=>LOG(`Some error has been occured in DASH \x1b[36;1m${e}`,'W'))
            

        }else if(PROVIDER_TYPE==='API'){

            
            return fetch(`https://chain.so/api/v2/get_tx_outputs/DASHTEST/${hostChainHash}/0`).then(r=>r.json()).then(v=>{
        
                if(v.status==='success'){

                    let data=Buffer.from(v.data.outputs.script.slice(10),'hex').toString('utf8').split('_')

                    return data[0]==blockIndex&&data[1]===klyntarHash//== coz data[1] will be string
        
                }

            }).catch(e=>false)
    

        }


    },




    sendTx:async(chainId,blockIndex,klyntarHash)=>{

        
        let {PUB,PRV,PROVIDER_TYPE,URL,FEE,CREDS}=CONFIG.CHAINS[chainId].HC_CONFIGS.dash
        

        if(PROVIDER_TYPE==='NODE'){

            
            let inputs=[],
            
            //Fetch available from utxo pool
            nodeUtxos=await fetch(URL,{method:'POST',body:JSON.stringify({

                password:CREDS,
                command:'dash-cli listunspent'
           
            })}).then(r=>r.text()).then(obj=>JSON.parse(obj).filter(utxo=>utxo.address===PUB))


            //Try to get UTXOs from node
            nodeUtxos.forEach(output=>{
     
                let utxo = {}

                utxo.satoshis = Math.floor(Number(output.amount) * 100000000)
                utxo.script = output.scriptPubKey
                utxo.address = output.address
                utxo.txId = output.txid
                utxo.outputIndex = output.vout
            
                inputs.push(utxo)
        
            })


    
            //Create empty instance...
            let transaction = new dashcore.Transaction()


            transaction.from(inputs)//Set transaction inputs
  
                .addData(blockIndex+'_'+klyntarHash)//Add payload

                .change(PUB)// Set change address - Address to receive the left over funds after transfer

                .fee(FEE)//Manually set transaction fees: 20 satoshis per byte

                .sign(PRV)// Sign transaction with your private key
            

            
            return fetch(URL,{method:'POST',body:JSON.stringify({

                password:CREDS,
                command:`dash-cli sendrawtransaction ${transaction.serialize()}`
    
            })}).then(r=>r.text()).catch(e=>LOG(`ERROR DASH ${e}`,'W'))



        }else if(PROVIDER_TYPE==='API'){

            // let utxos = await fetch(`https://sochain.com/api/v2/get_tx_unspent/${NETWORK}/${PUB}`).then(r=>r.json()),
    
            //     inputs = []
    

       
            // utxos.data.txs.forEach(async input => {
             
            //     let utxo = {}
           

            //     utxo.satoshis = Math.floor(Number(input.value) * 100_000_000)
           
            //     utxo.script = input.script_hex
           
            //     utxo.address = utxos.data.address
           
            //     utxo.txId = input.txid
           
            //     utxo.outputIndex = input.output_no
                
                
            //     inputs.push(utxo)
     
            // })

       
     
            // let transaction = new dashcore.Transaction()
             
            //     .from(inputs)

            //     .addData(blockIndex+'_'+klyntarHash)
            
            //     .change(PUB)
                
            //     .fee(FEE)
            
            //     .sign(PRV)
        


            // return fetch(`https://sochain.com/api/v2/send_tx/${NETWORK}`,{
            
            //     method: "POST",
                    
            //     data:{tx_hex:transaction.serialize()}
                
            // }).then(r=>r.json()).then(r=>r.data.txid)

        }

    },

    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },


    getBalance:symbiote=>{


        let {PROVIDER_TYPE,URL,PUB,CREDS}=CONFIG.CHAINS[symbiote].HC_CONFIGS.dash

        
        if(PROVIDER_TYPE==='NODE'){

            return fetch(URL,{method:'POST',body:JSON.stringify({

                password:CREDS,
                
                command:'dash-cli getbalance'
            
            })}).then(r=>r.text()).then(balance=>balance.replace('\n','')).catch(e=>`No data\x1b[31;1m (${e})\x1b[0m`)
            

        }else if(PROVIDER_TYPE==='API'){

            return fetch(`https://sochain.com/api/v2/get_address_balance/DASHTEST/${PUB}`)
    
                    .then(r=>r.json())
                            
                    .then(info=>info.data.confirmed_balance)
                            
                    .catch(e=>`No data\x1b[31;1m (${e})\x1b[0m`)

        }

    }

}