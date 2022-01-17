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

//https://chain.so/api/v2/get_tx_outputs/DOGE/6f47f0b2e1ec762698a9b62fa23b98881b03d052c9d8cb1d16bb0b04eb3b7c5b/0
    checkTx:(chainId,hostChainHash,blockIndex,klyntarHash)=>{

        let {URL,TOKEN}=CONFIG.CHAINS[chainId].HC_CONFIGS.doge,        
        
        return fetch(`${URL}/tx/${hostChainHash}`).then(r=>r.json()).then(v=>{
        
            if(v.status==='success'){

                let data=Buffer.from(v.data.outputs.script.slice(10),'hex').toString('utf8').split('_')

                return data[0]==blockIndex&&data[1]===klyntarHash//== coz data[1] will be string
        
            }
        
        }).catch(e=>false)

    },

    sendTx:async(chainId,blockIndex,klyntarHash)=>{
    
        let {URL,PUB,PRV}=CONFIG.CHAINS[chainId].HC_CONFIGS.doge,
        
            inputCount = 0,
    
            utxos = await fetch(`${URL}/utxos/${PUB}`).then(r=>r.json()),

            inputs = []
   
    
        utxos.data.txs.forEach(async input => {
        
            let utxo = {}
      
            utxo.satoshis = Math.floor(Number(input.value) * 100000000)
        
            utxo.script = input.script_hex
        
            utxo.address = utxos.data.address
        
            utxo.txId = input.txid
        
            utxo.outputIndex = input.output_no
    
            inputCount ++
            
            inputs.push(utxo)

        })
  


        let transaction = new bitdoge.Transaction()
        
            .from(inputs)
        
            .addData(blockIndex+'_'+klyntarHash)//Set our payload
        
            .change(PUB)
        
            .fee(1926668)
        
            .sign(PRV)

   
        //Finally-send transaction
        return fetch(`${URL}/send`,{
        
            method: "POST",
                
            data:{hex:transaction.serialize()}
            
        }).then(r=>r.json()).then(r=>r.data.txid)
    
    },

    
    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },


    getBalance:symbiote=>fetch(`${CONFIG.CHAINS[symbiote].URL}/balance/${CONFIG.CHAINS[symbiote].HC_CONFIGS.btc.PUB}`)
    
                            .then(r=>r.json())
                            
                            .then(info=>info.data.confirmed_balance)
                            
                            .catch(e=>'No data')
}