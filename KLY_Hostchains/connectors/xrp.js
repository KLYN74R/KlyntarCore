/**
 * ________________________________________________________________KLYNTAR_________________________________________________________________
 * 
 *  @Vlad@ Chernenko 23.07.-1
 *  
 * 
 * 
 * TXS:
 * [
 * 
 *        PAYMENTS:[
 *                   
 *                   EF0024AE11BB07D0D0AE1FB310A0AEADFE6A42B911654F6232C6725E31336FE9
 *                   0F93A0CD09F96EB0C9A2A64FF4AB82729E8DFB14848C8C6C674EC59765E6147C
 *                   F5CFCC21C3FAEB73A34D4AE7B3A5724006E1E04786423F251E78B0FA13EE922F
 *                   C012334D51F2A67FFF50F95DAD8B0791558736C330E5E49BB87CFC5B8BF81E18
 *                   95E67C16A0B777147718459B0D1CF1296C58EB563D668DF5C709035E74C0273E
 *                   D65AB93FAF7D73E2C739AEF8103C6906BECB1B0F50E3F72232430509B852ADAC
 *                   
 * 
 *                   Hostchain:
 *                   3F25124214D73013C6FB25BA73C8B0BDC8F1A61E731066FA345D72C5204B7133 683th
 *                   6A1D88C54EC26419A2274518E2FCE5E4946879972E1FEDA02C7471386E9D35BA 724th
 *                   ...
 *                 
 *              ]
 * 
 * 
 * ]
 * 
 * 
 * Links:[
 * 
 *      https://testnet.xrpl.org/transactions/EF0024AE11BB07D0D0AE1FB310A0AEADFE6A42B911654F6232C6725E31336FE9/detailed
 *      https://s.altnet.rippletest.net:51234 - via HTTPS
 *      https://github.com/ripple/ripple-lib/tree/develop/docs/samples
 * ]
 * _______________________________________________________________WAYS________________________________________________________________
 * 
 *  @Build for KLYNTAR symbiotic platform and hostchains
 * 
 */

import{RippleAPI} from 'ripple-lib'



let connections=new Map()

Object.keys(CONFIG.CHAINS).forEach(
    
    symbiote => {

        let server=CONFIG.CHAINS[symbiote].HC_CONFIGS.xrp?.URL
        
        if(server) connections.set(symbiote,new RippleAPI({server}))

    }
    
)




export default {

    checkTx:(hostChainHash,blockIndex,klyntarHash,chain)=>

        connections.get(chain).connect().then(()=>
        
            connections.get(chain).getTransaction(hostChainHash).then(async tx=>{
            
                if(tx.outcome.result==='tesSUCCESS'){
                
                    await connections.get(chain).disconnect()

                    let data=tx.specification.memos[0].data.split('_')
                
                    return data[0]==blockIndex&&data[1]===klyntarHash
            
                }

            })
        
        ).catch(e=>false)
    
    ,



    
    sendTx:async(chainId,blockIndex,klyntarHash)=>

        connections.get(chainId).connect().then(async()=>{

            
            let {PUB,PRV,AMOUNT,TO,MAX_LEDGER_VERSION_OFFSET} = CONFIG.CHAINS[chainId].HC_CONFIGS.xrp,

            
                //0st script in config means MEMO transaction
                preparedTx = await connections.get(chainId).prepareTransaction({

                    "TransactionType": "Payment",
                    "Account": PUB,
                    "Amount": connections.get(chainId).xrpToDrops(AMOUNT),
                    "Destination":TO,//Choose another our address
                    "Memos": [
                        {
                            "Memo": {
                                //Add payload to ledger
                                "MemoData": Buffer.from(blockIndex+'_'+klyntarHash,'utf8').toString('hex')
                            }
                        }
                    ],
                },{"maxLedgerVersionOffset":MAX_LEDGER_VERSION_OFFSET}),
        
        
                //Sign the transaction
                signed = connections.get(chainId).sign(preparedTx.txJSON,PRV),
        
                txID = signed.id,
        
                tx_blob = signed.signedTransaction,
        
            
                //Final operations
                result = await connections.get(chainId).submit(tx_blob)
        
            await connections.get(chainId).disconnect()

            return txID//[txID,result.resultCode]       

        }).catch(e=>false)
        
    ,


    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },


    getBalance:async symbiote=>{

        let balance=await connections.get(symbiote).connect().then(()=>
      
            connections.get(symbiote).getAccountInfo(CONFIG.CHAINS[symbiote].HC_CONFIGS.xrp.PUB).then(acc=>acc.xrpBalance)
        
        ).catch(e=>`No data\x1b[31;1m (${e})\x1b[0m`)

        await connections.get(symbiote).disconnect()

        return balance

    }

}