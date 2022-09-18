/**
 * ________________________________________________________________KLYNTAR_________________________________________________________________
 * 
 * @Vlad@ Chernenko 23.07.-1
 * 
 * 
 * 
 * Test transactions available by hashes:
 * 
 * [
 *     P2FPKH(With OP_RETURN):
 *        [
 *            62958cddd8bcf340150de6217282b4a778a3221a2be0bc8615948bc2343e3b2f
 *            1d3f6a32a35cdeb3fe688f59fe7849206963c75b4e71b21730c9d8c881944422
 *            8ca0b6780cbd212ed9d1b7ac051889f5bd8caf9ea946e385cdf6fab599a6fef0 (CUSTOM SCRIPT)
 *            874856f9977c2a27a2d29cd596b529b1a4763c6c26f2fa440c80e5b7e899a059 (update useful.txt)
 *            fe9fa8b7a8f88f4f8d4688ae9d7416cfa29b690806a794939ba6b212722b7b85 (XSS)
 *            9c777dbf4c1f73e9bb819dd8a81d8f52f1e35c07995489135de92798a73dfbc9 (WRONG CUSTOM SCRIPT)
 *            72f931a38560ee17a303a9db1cb02945c33b1fe330d83672e2e45f04d525c076 (with OP_DROP custom scriptPubKey and "48656c6c6f" as scriptSig(word "Hello" in hex))
 * 
 *        ]
 *        
 * 
 *     P2FSH(With hash in RIPEMD160):
 *        [
 *            842cf48fd71d39aa12bb912ec8b1f78fe0172555ff0d6f4ef7803bef3f821e51 
 *            e7e2db368cb75d2abeaf5b6b38ffbf1fa78c9d257bd5f67265ac2f288903772b (2 P2SH outputs with sha256 hash-we push 20 bytes to first output and 12(with 8 bytes padding))
 *            31f6c7b61747ae0aaf635bb80af27dcc018cf6f1667939f30649968f0e9daeea
 *            aeb0c43f2295723eeae79c2a16efc078b01b651ae278094c14bed5b2352100a8
 *        ]
 *     
 *    P2WPKH
 *      [
 *          6c3444f74541c24196c387463995f744d57d162d51643d18b66fce8a947aa8d2
 *          d208d2a1657a34d8da940868478760b6d48b3935ae1350ba08cf3a411fdc840b IN
 *          bf7656435fb0f5d1eb8267ebaafc89a98c68091a6ff180c3224bf36f87266272 OUT
 *          0abcafaceb08d504e2413aaf06cbaf5045747330743b13adaa30fbd8493e9fe2
 *          b43cede8cb0cfbe5b4f96cc5a37c0e35f8a153b65844899058681b0a9880015a OP_RETURN
 *          df4e9b50c4117d8a4c3f614a4bcbe093045f686b25dae5d0df728d7946aee054
 *          32f2b6268c156c26704be561b596d622c00cb876ee511dba784ae1a4ac58234d
 *      ]
 * 
 *     *Also via OP_DROP
 * 
 *     Custom(1 2 OP_ADD) -> a0c3af390ce7f11246ee33761c4f0910707eac6d9cbd938322ae4c0ed04afcd2
 *        
 * ]
 * 
 * 
 * 
 * !!!NOTE -> При отправке с P2SH выходом трансформирует в P2SH адрес согласно скрипту  
 * mv4rnyY3Su5gjcDNzbMLKBQkBicCtHUtFB ---> 2MsTfHVNsg4hNGTSoZJoEiFuaVnjkoMM2gS (1 tx availalbe by hash 842cf48fd71d39aa12bb912ec8b1f78fe0172555ff0d6f4ef7803bef3f821e51)
 * 
 * HASH160(5cad5bdf2078d8fe80769085dfc0f591f5ca972d73ca793d20f78a6d7c87bb5f) = 025a1bae3fe75c2ec4be7aeda19187d9c145bf19 (P2FSH)
 * 
 * 
 * 
 *  
 * Commited ideas(useful.txt file) -> 0899582ead384ebe440842f57cbe5a1d481dc848b464404eee2aa2ebbb9d7b70
 * 
 * Useful links
 * 
 * [
 *      https://github.com/bitpay/bitcore
 *      file:///C:/Users/Acer/Downloads/101-Article%20Text-613-1-10-20180403.pdf (local)
 *      https://github.com/Blockstream/esplora/blob/master/API.md (another API)
 *      https://testnet.bitcoinexplorer.org/api/docs (API)
 *      https://mempool.space/testnet/api (API)
 *      https://blockstream.info/ (API)
 *      https://chain.so/api/v2/get_tx_outputs/BTCTEST/b43cede8cb0cfbe5b4f96cc5a37c0e35f8a153b65844899058681b0a9880015a
 * ] 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * *******************************************************************************************************************************
 *                                                                                                                               *
 * Another providers txs(use them for test to redundancy)                                                                        *
 * 77680abc1880f9a2da94b08b1b7a00b1c3a4de8520dbaa8d48e59799552bf432 (https://testnet-api.smartbit.com.au/v1/blockchain/pushtx)   *
 *                                                                                                                               *
 * *******************************************************************************************************************************
 * 
 * 
 * 
 * @Build for KLYNTAR symbiotic platform and hostchains
 * 
 * 
*/




import {getBlockByIndex} from './btcForksCommon.js'

import {LOG} from '../../../KLY_Utils/utils.js'

import bitcore from 'bitcore-lib'

import fetch from 'node-fetch'








export default {
    
    checkTx:(hostChainHash,blockIndex,klyntarHash)=>{


        let {URL,CONFIRMATIONS,CREDS}=CONFIG.SYMBIOTE.HC_CONFIGS.btc


        return fetch(URL,{method:'POST',body:JSON.stringify({

            password:CREDS,

            data:{command:'gettx',hash:hostChainHash},
            
            command:`bitcoin-cli gettransaction ${hostChainHash}`
        
        })}).then(r=>r.json()).then(tx=>
            
            tx.confirmations>=CONFIRMATIONS
            &&
            fetch(URL,{method:'POST',body:JSON.stringify({

                password:CREDS,

                data:{command:'getdecoded',hash:hostChainHash},

                command:`bitcoin-cli decoderawtransaction $(bitcoin-cli getrawtransaction ${hostChainHash})`

            })}).then(r=>r.json()).then(tx=>{
                
                //Convert hexademical data from output and get rid of magic bytes
                let data=Buffer.from(tx.vout[0].scriptPubKey.hex,'hex').toString('utf-8').slice(2).split('_')

                return data[0]==blockIndex&&data[1]===klyntarHash

            })

        ).catch(e=>LOG(`Some error has been occured in BTC \x1b[36;1m${e}`,'W'))
        

    },




    sendTx:async(blockIndex,klyntarHash)=>{
        
        
        let {URL,PUB,PRV,FEE,CREDS}=CONFIG.SYMBIOTE.HC_CONFIGS.btc,
        
            inputs=[],
            


            //Fetch available from utxo pool
            nodeUtxos=await fetch(URL,{method:'POST',body:JSON.stringify({

                password:CREDS,
                
                data:{command:'getutxos',address:PUB},
                
                command:'bitcoin-cli listunspent'
           
            })})    .then(r=>r.text())      
        
                    .then(
                        
                        obj => JSON.parse(obj).filter(utxo=>utxo.address===PUB)//do it coz bitcoin daemon can return utxos from your another addresses of wallet
                    
                    )



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
        let transaction = new bitcore.Transaction()


        transaction.from(inputs)//Set transaction inputs
  
            .addData(blockIndex+'_'+klyntarHash)//Add payload

            .change(PUB)// Set change address - Address to receive the left over funds after transfer

            .fee(FEE)//Manually set transaction fees: 20 satoshis per byte

            .sign(PRV)// Sign transaction with your private key
            

        
        return fetch(URL,{method:'POST',body:JSON.stringify({

            password:CREDS,
            
            data:{command:'sendtx',hex:transaction.serialize()},

            command:`bitcoin-cli sendrawtransaction ${transaction.serialize()}`
    
        })}).then(r=>r.text()).catch(e=>LOG(`ERROR BTC ${e}`,'W'))


    },
    

    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },


    getBalance:()=>{

      
        let {URL,PUB}=CONFIG.SYMBIOTE.HC_CONFIGS.btc

        return fetch(URL,{method:'POST',body:JSON.stringify({

            password:CREDS,

            data:{command:'getbalance',address:PUB},

            command:'bitcoin-cli getbalance'
        
        })}).then(r=>r.text()).then(balance=>balance.replace('\n','')).catch(e=>`No data\x1b[31;1m (${e})\x1b[0m`)

    },


    getBlockByIndex:blockIndex=>getBlockByIndex('btc',blockIndex)
    

}