/**
 * ________________________________________________________________KLYNTAR_________________________________________________________________
 * 
 * @Vlad@ Chernenko 22.08.-1
 * 
 * 
 * 
 * 
 *     
 *       
 *          FAUCET:https://www.trongrid.io/shasta
 *          EXPLORER:https://tronscan.org
 *       
 *      TXS[
 *       
 *           ae678b9c80a8c867f930f51d4d865b8441ea62397c44a4b0efd2f8b16f1150dc TEST("IF OKKEY")
 *           4497ea47483c1f59e38b8f876c836dedfb09bb78111d0f23984cc3800c4b6953 useful.txt
 *           572d765c51eb227bd3543e154c99d7579ad0fad07d56bf4cb996a6c89e51e023
 *           8ee440d7943dc90c17ad6c36b75ca84be20b084d881ce48b861f9ffcfd20a1ac
 *           5ca0204f1cff47c9b1f75625028939d21810d8675bbfc041a077745436405775
 *           4619df217a9a639c0f72fb4063001d62534b6af18fa4bed08e512cc7002a8d87
 * 
 *          Hostchain:
 *          82c8988b7910d903270255f60802f62023b3c053951b4a1c144f83818dd226dc 683th commit of kNULL chain
 *          f940c751670ddc80d0af31e797145dd7743b5eb1fa5e88ea780bd7c1a08b1fae 724th commit of kNULL
 *          ...
 * 
 *       ]
 * 
 * 
 * 
 * @Build for KLYNTAR symbiotic platform and hostchains
 * 
 */




import TronWeb from 'tronweb'




export default {

    checkCommit:(hostChainHash,blockIndex,klyntarHash)=>{

        let {URL,PRV}=global.CONFIG.SYMBIOTE.CONNECTOR,
        
            HttpProvider = TronWeb.providers.HttpProvider,
            
            solidityNode = new HttpProvider(URL),
            
            eventServer = new HttpProvider(URL),

            fullNode = new HttpProvider(URL)

   
        return new TronWeb(fullNode, solidityNode, eventServer,PRV)
        
        .trx
        
        .getTransaction(hostChainHash).then(tx=>{
            
            let data=Buffer.from(tx.raw_data.data,'hex').toString('utf8').split('_')

            return data[0]==blockIndex&&data[1]===klyntarHash

        }).catch(e=>false)
        

    },



    
    makeCommit:async(blockIndex,klyntarHash)=>{

        let {PRV,AMOUNT,TO,URL} = global.CONFIG.SYMBIOTE.CONNECTOR,
                    


            HttpProvider = TronWeb.providers.HttpProvider,
            
            solidityNode = new HttpProvider(URL),
            
            eventServer = new HttpProvider(URL),

            fullNode = new HttpProvider(URL),



            tronWeb = new TronWeb(fullNode,solidityNode,eventServer,PRV),
            


            unSignedTxn = await tronWeb.transactionBuilder.sendTrx(TO,AMOUNT),

            unSignedTxnWithNote = await tronWeb.transactionBuilder.addUpdateData(unSignedTxn,blockIndex+'_'+klyntarHash,'utf8'),

            signedTxn = await tronWeb.trx.sign(unSignedTxnWithNote),

            ret = await tronWeb.trx.sendRawTransaction(signedTxn)


        return ret.txid//return hash of transaction
        
    },


    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },

    getBlock:blockIndex=>{},

    getBalance:()=>{

        let {URL,PUB,PRV}=global.CONFIG.SYMBIOTE.CONNECTOR,

            HttpProvider = TronWeb.providers.HttpProvider,
            
            solidityNode = new HttpProvider(URL),
            
            eventServer = new HttpProvider(URL),

            fullNode = new HttpProvider(URL), 



            tronWeb = new TronWeb(fullNode, solidityNode, eventServer,PRV)
        


        return tronWeb.trx.getAccount(PUB).then(acc=>acc.balance/10**6).catch(e=>`No data\x1b[31;1m (${e})\x1b[0m`)
    
    }

}