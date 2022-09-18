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
 *  Test transactions available by hashes:
 *  [
 * 
 *      a3b68ef49cb7e861f6f987b9f2e1b390185a832d0df55dbeab08c78fa86bb210 (user.txt)
 *      85b5bc6e24b2d4fc8ace1e447cae768da7ac55eaee356a44f8ca5fe580f7d941
 *      fd6af6d1bc6a8a3bfa6f176797fe35c526d4295fd63b1a06a490d92452476987
 *      4aaf4b3ddacdd7d97beab960fdd63373015688c08aab1ede95bac773fbd8cd77 (via own node(testnet mode))
 * 
 *      132d0aa6621ac2a8077bebcc72af1087a2b5b6d419a9d71bb8d0f9696965e363 (via node and P2SH_2 -> legacy)
 *      1d8e0386f67899f47c21ba93516caa5c67f412a6aac59f3f4e49c766025d2911 (node -> gateway(+auth) -> RPC call on local interface -> broadcast to network)
 *      50686389ac302d0fa0e863d31feb4e13cf06a07bebce835383dd5ecf2548fb69
 *   
 *      977355b0de9eb252c0c61974ffba1ab5f585b2cd1e998282fdc98c7780c1678c (node -> gateway(+auth) -> RPC call -> createrawtransaction -> signwithwallet ...).Also it's P2SH
 *  ]
 * 
 * 
 *  Mainnet txs:[
 * 
 *      282f44877e0d5d6fca233021c62bec11bd0cc3579be2ba7732a13e33c9abf1b6 useful.txt
 * 
 * ]
 * 
 * 
 * @Build for KLYNTAR symbiotic platform and hostchains
 * 
 */




import {getBlockByIndex} from './btcForksCommon.js'

import {LOG} from '../../../KLY_Utils/utils.js'

import bitlite from 'litecore-lib-v5'//'litecore-lib'

import fetch from 'node-fetch'




export default {

    checkTx:(hostChainHash,blockIndex,klyntarHash)=>{



        let {URL,CONFIRMATIONS,CREDS}=CONFIG.SYMBIOTE.HC_CONFIGS.ltc

        return fetch(URL,{method:'POST',body:JSON.stringify({

            password:CREDS,

            data:{command:'gettx',hash:hostChainHash},
            
            command:`litecoin-cli gettransaction ${hostChainHash}`
        
        })}).then(r=>r.json()).then(tx=>
            
            tx.confirmations>=CONFIRMATIONS
            &&
            fetch(URL,{method:'POST',body:JSON.stringify({

                password:CREDS,

                data:{command:'getdecoded',hash:hostChainHash},

                command:`litecoin-cli decoderawtransaction $(litecoin-cli getrawtransaction ${hostChainHash})`

            })}).then(r=>r.json()).then(tx=>{
                
                //Convert hexademical data from output and get rid of magic bytes
                let data=Buffer.from(tx.vout[0].scriptPubKey.hex,'hex').toString('utf-8').slice(2).split('_')

                return data[0]==blockIndex&&data[1]===klyntarHash

            })

        ).catch(e=>LOG(`Some error has been occured in LTC \x1b[36;1m${e}`,'W'))
        

    },







    sendTx:async(blockIndex,klyntarHash)=>{

        

        let {URL,PUB,PRV,FEE,CREDS}=CONFIG.SYMBIOTE.HC_CONFIGS.ltc,
    
            inputs=[],
            
            //Fetch available from utxo pool
            nodeUtxos=await fetch(URL,{method:'POST',body:JSON.stringify({

                password:CREDS,

                data:{command:'getutxos',address:PUB},
            
                command:'litecoin-cli listunspent'
           
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
            let transaction = new bitlite.Transaction()


            transaction.from(inputs)//Set transaction inputs
  
                .addData(blockIndex+'_'+klyntarHash)//Add payload

                .change(PUB)// Set change address - Address to receive the left over funds after transfer

                .fee(FEE)//Manually set transaction fees: 20 satoshis per byte

                .sign(PRV)// Sign transaction with your private key
            

        
        return fetch(URL,{method:'POST',body:JSON.stringify({

            password:CREDS,

            data:{command:'sendtx',hex:transaction.serialize()},

            command:`litecoin-cli sendrawtransaction ${transaction.serialize()}`
    
        })}).then(r=>r.text()).catch(e=>LOG(`ERROR LTC ${e}`,'W'))

        
    },


    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },



    getBalance:()=>{
      
        let {URL,CREDS,PUB}=CONFIG.SYMBIOTE.HC_CONFIGS.ltc

        return fetch(URL,{method:'POST',body:JSON.stringify({

            password:CREDS,

            data:{command:'getbalance',address:PUB},
            
            command:'litecoin-cli getbalance'
        
        })}).then(r=>r.text()).then(balance=>balance.replace('\n','')).catch(e=>`No data\x1b[31;1m (${e})\x1b[0m`)


    },




    //____________________________________________________________ USED IN TACHYON ____________________________________________________________



    getBlockByIndex:blockIndex=>getBlockByIndex('ltc',blockIndex)

}