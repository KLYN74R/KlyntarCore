/**
 * ________________________________________________________________KLYNTAR_________________________________________________________________
 * 
 * @Vlad@ Chernenko 24.07.-1
 * 
 * 
 * 
 * 
 * We can generate also via bitcore-lib or bitcoin-lib
 * 
 * Test transactions available by hashes:
 * [
 *    1ff8f7a5e828661ca6a29caea9b9eaac5eda9510387f39c10e0bd5945756abb1, (NOT ACCEPTED)
 *    0425a2da0ec20e82882ce3e11ffb05460f4b33ddad6f7682b79c7d6a96eaa1df,
 *    cbe42d16bff97caec05ceeec8667f65393394e5434f21105a3d2beaae5deef29,
 *    52a8fcb2b596f8305c100613d5a2fb1c25df28ba00dfc65392d9bb118e715fda (update useful.txt)
 * ]
 * 
 * 
 * MAINNET COMMIT -> 5645cf4d2615fd7f9659b8e78b45aca0eb762fc4182256e66297bce27b8e8aec (NOT ACCEPTED)
 * 
 *                   8e51fbd60e41be6930a32227126daab3d6390dea30fdfa6ec77674228228bceb
 * 
 * 
 * 
 * ____________________________________________________Alternative(via BLock.io API)__________________________________________________
 * 
 * 
 * 
 * 
 * import BlockIo from 'block_io'
 * 
 * P.S:Useful link which helped me to solve one problem -> https://github.com/bitpay/bitcore/issues/1247
 *     We can generate also via bitcore-lib or bitcoin-lib 
 * 
 * 
 * 
 * 
 * 
 * 
 * @Build for KLYNTAR symbiotic platform and hostchains
 * 
 */




import bitdoge from 'bitcore-doge-lib'

import fetch from 'node-fetch'




export default {

    checkTx:(hostChainHash,blockIndex,klyntarHash,chain)=>{

        let {URL,CONFIRMATIONS,CREDS}=CONFIG.CHAINS[chain].HC_CONFIGS.doge


        return fetch(URL,{method:'POST',body:JSON.stringify({

            password:CREDS,

            data:{command:'gettx',hash:hostChainHash},
            
            command:`doge-cli gettransaction ${hostChainHash}`
        
        })}).then(r=>r.json()).then(tx=>
            
            tx.confirmations>=CONFIRMATIONS
            &&
            fetch(URL,{method:'POST',body:JSON.stringify({

                password:CREDS,

                data:{command:'getdecoded',hash:hostChainHash},

                command:`doge-cli decoderawtransaction $(doge-cli getrawtransaction ${hostChainHash})`

            })}).then(r=>r.json()).then(tx=>{
                
                //Convert hexademical data from output and get rid of magic bytes
                let data=Buffer.from(tx.vout[0].scriptPubKey.hex,'hex').toString('utf-8').slice(2).split('_')

                return data[0]==blockIndex&&data[1]===klyntarHash

            })

        ).catch(e=>LOG(`Some error has been occured in DOGE \x1b[36;1m${e}`,'W'))
    

    },




    sendTx:async(chainId,blockIndex,klyntarHash)=>{

        
        let {PUB,PRV,URL,FEE,CREDS}=CONFIG.CHAINS[chainId].HC_CONFIGS.doge,
            
            inputs=[],
            
            //Fetch available from utxo pool
            nodeUtxos=await fetch(URL,{method:'POST',body:JSON.stringify({

                password:CREDS,

                data:{command:'getutxos',address:PUB},
            
                command:'doge-cli listunspent'
           
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

            command:`doge-cli sendrawtransaction ${transaction.serialize()}`
    
        })}).then(r=>r.text()).catch(e=>LOG(`ERROR DOGE ${e}`,'W'))


    },


    
    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },




    getBalance:symbiote=>{


        let {URL,PUB,CREDS}=CONFIG.CHAINS[symbiote].HC_CONFIGS.doge

        return fetch(URL,{method:'POST',body:JSON.stringify({

            password:CREDS,

            data:{command:'getbalance',address:PUB},
            
            command:'doge-cli getbalance'
        
        })}).then(r=>r.text()).then(balance=>balance.replace('\n','')).catch(e=>`No data\x1b[31;1m (${e})\x1b[0m`)
        
    }


}