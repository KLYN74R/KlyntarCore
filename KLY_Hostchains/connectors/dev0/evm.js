import {LOG} from '../../../KLY_Utils/utils.js'

import {Transaction} from 'ethereumjs-tx'

import Common from 'ethereumjs-common'

import pkg from '@ethereumjs/tx'

import Web3 from 'web3'

const {FeeMarketEIP1559Transaction} = pkg




export default class {

    constructor(symbiote,ticker){

        let {URL,PUB,GAS_LIMIT,GAS_PRICE,AMOUNT,TO,NET,CHAIN_ID,HARDFORK} = CONFIG.SYMBIOTES[symbiote].HC_CONFIGS[ticker]
        
        this.web3=new Web3(URL)
        
        this.TICKER=ticker
        this.PUB=PUB
        this.PRV=''//firstly we decrypt it
        this.GAS_LIMIT=GAS_LIMIT
        this.GAS_PRICE=GAS_PRICE
        this.AMOUNT=AMOUNT
        this.TO=TO
        this.CHAIN_ID=CHAIN_ID
        this.HARDFORK=HARDFORK

        if(this.HARDFORK==='london'){

            this.COMMON=Common.default.forCustomChain(NET,{networkId:CHAIN_ID,chainId:CHAIN_ID,hardfork:HARDFORK})
        
            this.MAX_FEE_PER_GAS=CONFIG.SYMBIOTES[symbiote].HC_CONFIGS[ticker].MAX_FEE_PER_GAS
            
            this.MAX_PRIORITY_FEE_PER_GAS=CONFIG.SYMBIOTES[symbiote].HC_CONFIGS[ticker].MAX_PRIORITY_FEE_PER_GAS

        }else this.COMMON=Common.default.forCustomChain(NET,{networkId:CHAIN_ID,chainId:CHAIN_ID},HARDFORK)
        
    }


    checkTx=(hostChainHash,blockIndex,klyntarHash)=>
        
        this.web3.eth.getTransaction(hostChainHash).then(tx=>{
        
            if(tx!==null){
        
                let data=Buffer.from(tx.input.slice(2),'hex').toString('utf8').split('_')

                return data[0]==blockIndex&&data[1]===klyntarHash

            }

        }).catch(e=>false)




    sendTx=(_symbiote,blockIndex,klyntarHash)=>new Promise((resolve,reject)=>{

        this.web3.eth.getTransactionCount(this.PUB,(err,txCount)=>{
    
            err&&reject(err)
    
            let tx//external variable

            // Build a transaction to to the hardfork
            if(this.HARDFORK==='london'){

                let web3Utils=this.web3.utils

                // Build a transaction
                const rawTx = {
                    "to"                    :   this.TO,
                    "gasLimit"              :   web3Utils.toHex(this.GAS_LIMIT),
                    "maxFeePerGas"          :   web3Utils.toHex(web3Utils.toWei( this.MAX_FEE_PER_GAS , 'gwei' ) ),
                    "maxPriorityFeePerGas"  :   web3Utils.toHex(web3Utils.toWei( this.MAX_PRIORITY_FEE_PER_GAS , 'gwei' ) ),
                    "value"                 :   web3Utils.toHex(web3Utils.toWei(this.AMOUNT, 'ether')),
                    "data"                  :   '0x'+Buffer.from(blockIndex+'_'+klyntarHash,'utf8').toString('hex'),
                    "nonce"                 :   web3Utils.toHex(txCount),
                    "chainId"               :   `0x${this.CHAIN_ID.toString(16)}`,
                    "accessList"            :   [],
                    "type"                  :   "0x02"
                }

                // Creating a new transaction
                tx = FeeMarketEIP1559Transaction.fromTxData( rawTx , { chain:this.COMMON } );

                //Sign the transaction
                tx=tx.sign(this.PRV)
            
            }else{

                let txObject = {
            
                    nonce: this.web3.utils.toHex(txCount),
                    to: this.TO,
                    value: this.web3.utils.toHex(this.web3.utils.toWei(this.AMOUNT, 'ether')),
                    gasLimit: this.web3.utils.toHex(this.GAS_LIMIT),
                    gasPrice: this.web3.utils.toHex(this.web3.utils.toWei(this.GAS_PRICE, 'gwei')),
        
                    //Set payload in hex
                    data:'0x'+Buffer.from(blockIndex+'_'+klyntarHash,'utf8').toString('hex')
            
                }
        
        
                tx = new Transaction(txObject,{common:this.COMMON})
        
                //Sign the transaction
                tx.sign(this.PRV)
            
            }
             
            let raw = '0x' + tx.serialize().toString('hex')
    
        
            //Broadcast the transaction
            this.web3.eth.sendSignedTransaction(raw,(err,txHash)=>err?reject(err):resolve(txHash)).catch(e=>reject(false))
    
        }).catch(e=>reject(e))


    }).catch(e=>{
    
        LOG(`Error with push to \x1b[32;1m[\x1b[36;1m${this.TICKER}\x1b[32;1m] \x1b[36;1m${e}`,'W')

        return false

    })


    //Only for Controller(at least in first releases)
    changeManifest=manifest=>{

    }

    getBalance=async()=>{

        let err,
        
            balance=this.web3.utils.fromWei(await this.web3.eth.getBalance(this.PUB).catch(e=>{
                
                err=`No data\x1b[31;1m (${e})\x1b[0m`
                
                return '0'
            
            }),'ether')

        return err||balance
    
    }

}