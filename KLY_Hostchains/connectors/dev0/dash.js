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




import {getBlockByIndex} from './btcForksCommon.js'

import {LOG} from '../../../KLY_Utils/utils.js'

import dashcore from '@dashevo/dashcore-lib'

import fetch from 'node-fetch'








export default {


    checkTx:(hostChainHash,blockIndex,klyntarHash)=>{


        let {URL,CONFIRMATIONS,CREDS}=CONFIG.SYMBIOTE.HC_CONFIGS.dash


        return fetch(URL,{method:'POST',body:JSON.stringify({

            password:CREDS,

            data:{command:'gettx',hash:hostChainHash},
            
            command:`dash-cli gettransaction ${hostChainHash}`
        
        })}).then(r=>r.json()).then(tx=>
            
            tx.confirmations>=CONFIRMATIONS
            &&
            fetch(URL,{method:'POST',body:JSON.stringify({

                password:CREDS,

                data:{command:'getdecoded',hash:hostChainHash},

                command:`dash-cli decoderawtransaction $(dash-cli getrawtransaction ${hostChainHash})`

            })}).then(r=>r.json()).then(tx=>{
                
                //Convert hexademical data from output and get rid of magic bytes
                let data=Buffer.from(tx.vout[0].scriptPubKey.hex,'hex').toString('utf-8').slice(2).split('_')

                return data[0]==blockIndex&&data[1]===klyntarHash

            })

        ).catch(e=>LOG(`Some error has been occured in DASH \x1b[36;1m${e}`,'W'))
    

    },




    sendTx:async(blockIndex,klyntarHash)=>{

        
        let {PUB,PRV,URL,FEE,CREDS}=CONFIG.SYMBIOTE.HC_CONFIGS.dash,
            
            inputs=[],
            
            //Fetch available from utxo pool
            nodeUtxos=await fetch(URL,{method:'POST',body:JSON.stringify({

                password:CREDS,

                data:{command:'getutxos',address:PUB},
            
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

            data:{command:'sendtx',hex:transaction.serialize()},

            command:`dash-cli sendrawtransaction ${transaction.serialize()}`
    
        })}).then(r=>r.text()).catch(e=>LOG(`ERROR DASH ${e}`,'W'))


    },


    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },




    getBalance:()=>{


        let {URL,PUB,CREDS}=CONFIG.SYMBIOTE.HC_CONFIGS.dash

        return fetch(URL,{method:'POST',body:JSON.stringify({

            password:CREDS,

            data:{command:'getbalance',address:PUB},
            
            command:'dash-cli getbalance'
        
        })}).then(r=>r.text()).then(balance=>balance.replace('\n','')).catch(e=>`No data\x1b[31;1m (${e})\x1b[0m`)
        
    },


    getBlockByIndex:blockIndex=>getBlockByIndex('dash',blockIndex)

}