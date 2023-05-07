/*

Links:[


    Docs:

    https://docs.solana.com/developing/runtime-facilities/programs
    https://www.quicknode.com/guides/web3-sdks/how-to-send-a-transaction-on-solana-using-javascript
    https://docs.solana.com/cli/deploy-a-program

    
    GitHub:
    
    https://gist.github.com/beautyfree/8d6d6bd80e4dc81911cffca946b14641
    https://gist.github.com/fukaoi/61a29aac0717fce4219c86165780efcd


    
    
    Explorers:

    https://explorer.solana.com/
    https://solanabeach.io/
    
]



Testnet txs pool:[


    3uzxu2cRLEeLXegveu2wd1kwLricVuRWw5pGnD8HZTDBVd2xrqv4ENGxESBh7SjoYe7cqaPd2HezdYQ5BS2DrjkU - init test

    4Ku7YF2WBrtjQc7e9nNX86mzPiniqt5MR3Giq2sSr8YrSWhFV6GtyV3y5v673HcA8Pn9Hhe4tMbc3Eg3BSFbiS5Q - useful.txt + test of retrieving account from private key

]


Mainnet txs pool:[


    4QvwRiBQzCBo5p8NZNgNpjVje8kYMTG7a3RcXxh1nC83TpAsrv2mrFdPZNnCTthv6fiU2wkujY7EqY3WqQzZUde4 - transfer
    36cs4bjKZJNcTsMA8N6Bz8mm2yBUX5WvcT74oT3Pn2sD6cMGprRQvmYVdPGQJmrnHPDrypJYkT9Zg6UHw4vuPssT - useful.txt.commit
    2TZZsLb7LRVpqhoHr7FXYfEH4gXz6MeKWcbe3DdLTxTLYvPWea3VGp6GiaRENyu2ptEoRcH2jJp2FMjRtQ9ApDd5 - staking

]


*/




import {LOG} from '../../../KLY_Utils/utils.js'

import Web3 from '@solana/web3.js'

import Base58 from 'base-58'



let {TransactionInstruction,Transaction,Keypair} = Web3



/**
 * 
 * ________________Add separate thread of connection for each symbiote________________
 * 
 * 
 */

let connection,

    {URL,COMMITMENT}=global.CONFIG.SYMBIOTE.CONNECTOR
         

if(configs) connection=new Web3.Connection(URL,COMMITMENT)




export default {


    checkCommit:(hostChainSig,blockIndex,klyntarHash)=>
    
        connection.getTransaction(hostChainSig).then(tx=>{
        
            //In default case we'll have track as the first instruction of tx
            let [index,hash]=Buffer.from(Base58.decode(tx.transaction.message.instructions[0].data)).toString('utf-8').split('_')
        
            return index==blockIndex && hash===klyntarHash

        }).catch(e=>LOG(`Some error has been occured in SOL \x1b[36;1m${e}`,'W')),




    makeCommit:(blockIndex,klyntarHash)=>{

        //PRV-private key in Base64
        let {PRV,PROGRAM,COMMITMENT}=global.CONFIG.SYMBIOTE.CONNECTOR,

            account=Keypair.fromSecretKey(new Uint8Array(Buffer.from(PRV,'base64'))),


            instruction = new TransactionInstruction({
    
                keys:[],
            
                programId:PROGRAM,
            
                data:Buffer.from(blockIndex+'_'+klyntarHash,'utf8'),
          
            })
      


        return Web3.sendAndConfirmTransaction(
            
            connection,
            
            new Transaction().add(instruction), [account], {skipPreflight:true,commitment:COMMITMENT}
            
        ).catch(e=>
            
            LOG(`Some error has been occured in SOL \x1b[36;1m${e}`,'W')
            
        )
 
        
    },


    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    },


    getBlock:blockIndex=>{},



    getBalance:async()=>{

        let {PRV}=global.CONFIG.SYMBIOTE.CONNECTOR,

            pub=Keypair.fromSecretKey(new Uint8Array(Buffer.from(PRV,'base64'))).publicKey

        return connection.then(lamparts=>lamparts/10**9).catch(e=>{
            
            LOG(`Some error has been occured in SOL \x1b[36;1m${e}`,'W')
            
            return '0'

        })

    }


}