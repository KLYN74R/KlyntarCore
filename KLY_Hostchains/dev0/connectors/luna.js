/*

██╗███╗   ███╗██████╗ ██╗     ███████╗███╗   ███╗███████╗███╗   ██╗████████╗███████╗██████╗ 
██║████╗ ████║██╔══██╗██║     ██╔════╝████╗ ████║██╔════╝████╗  ██║╚══██╔══╝██╔════╝██╔══██╗
██║██╔████╔██║██████╔╝██║     █████╗  ██╔████╔██║█████╗  ██╔██╗ ██║   ██║   █████╗  ██║  ██║
██║██║╚██╔╝██║██╔═══╝ ██║     ██╔══╝  ██║╚██╔╝██║██╔══╝  ██║╚██╗██║   ██║   ██╔══╝  ██║  ██║
██║██║ ╚═╝ ██║██║     ███████╗███████╗██║ ╚═╝ ██║███████╗██║ ╚████║   ██║   ███████╗██████╔╝
╚═╝╚═╝     ╚═╝╚═╝     ╚══════╝╚══════╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═════╝


@via https://patorjk.com/software/taag/   STYLE:ANSI Shadow


Txs pool:[

    2F719B52B18469CCA358911A9E8C7B5615BB4A1F29C9E6A87548CBAFC3805DFC - receive from faucet
    80BA9A17F9CF8ADE90896761451D5A80DB1DAAAEF249BC62DB43BE04D735720D - transfer 0.001 Luna to 2nd account with memo of block 6897 on kNULL chain

]





Links:[


    https://finder.terra.money - Explorer 0
    https://faucet.terra.money/ - Faucet
    https://terra.stake.id/#/ - Explorer 1
    https://terra-money.github.io/terra.js/ - micro docs
    https://docs.terra.money/SDKs/Terra-js/Smart-contracts.html - for future TYPEs of interaction with hostchain
    https://github.com/terra-money/terra.js/wiki/WebSockets

]

*/


import {LCDClient,MsgSend,MnemonicKey} from '@terra-money/terra.js'

import {LOG} from '../../../KLY_Utils/utils.js'





/**
 * 
 * ________________Add separate thread of connection for each symbiote________________
 * 
 * 
 */
let connection,

    {URL,CHAIN_ID}=CONFIG.SYMBIOTE.CONNECTOR
         
if(configs) connection=new LCDClient({URL,chainID:CHAIN_ID})




export default {


    checkCommit:async(hostChainHash,blockIndex,klyntarHash)=>{
      
        let tx=await connection.tx.txInfo(hostChainHash).then(data=>data.tx).catch(e=>false)

        if(tx){

            let [index,hash]=tx.body.memo.split('_')
                
            return index==blockIndex && hash===klyntarHash

        }

    },

    


    makeCommit:(blockIndex,klyntarHash)=>{

        let {MNEMONIC,TO,AMOUNT}=CONFIG.SYMBIOTE.CONNECTOR,

            account=new MnemonicKey({mnemonic:MNEMONIC}),

            send = new MsgSend(account.accAddress,TO,{uluna:AMOUNT}),

            terra=connection,

            wallet=terra.wallet(account)




        return wallet.createAndSignTx({
    
            msgs: [send],
    
            memo: blockIndex+'_'+klyntarHash,

        }).then(tx=>
            
            terra.tx.broadcast(tx)
            
        ).then(result=>result.txhash).catch(e=>LOG(`Some error has been occured in LUNA \x1b[36;1m${e}`,'W'))

    },
  

    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },

    getBlock:blockIndex=>{},

    
    getBalance:async()=>connection.bank.balance(symbiote).then(bal=>bal[0].toAmino()[0].amount/10**6)
}