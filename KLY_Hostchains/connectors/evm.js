import{LOG}from'../../KLY_Space/utils.js'

import{Transaction}from'ethereumjs-tx'

import Common from 'ethereumjs-common'

import Web3 from 'web3'




export default class {

    constructor(chainId,ticker){

        let {URL,PUB,GAS_LIMIT,GAS_PRICE,AMOUNT,TO,NET,CHAIN_ID,HARDFORK} = CONFIG.CHAINS[chainId].HC_CONFIGS[ticker]
        
        this.web3=new Web3(URL)
        
        this.TICKER=ticker
        this.PUB=PUB
        this.PRV=''//firstly we decrypt it
        this.GAS_LIMIT=GAS_LIMIT
        this.GAS_PRICE=GAS_PRICE
        this.AMOUNT=AMOUNT
        this.TO=TO
        this.COMMON=Common.default.forCustomChain(NET,{networkId:CHAIN_ID,chainId:CHAIN_ID},HARDFORK)
        this.HARDFORK=HARDFORK
        
    }


    checkTx=(hostChainHash,blockIndex,klyntarHash)=>
        
        this.web3.eth.getTransaction(hostChainHash).then(tx=>{
        
            if(tx!==null){
        
                let data=Buffer.from(tx.input.slice(2),'hex').toString('utf8').split('_')

                return data[0]==blockIndex&&data[1]===klyntarHash

            }

        }).catch(e=>false)




    sendTx=(_chain,blockIndex,klyntarHash)=>new Promise((resolve,reject)=>{

        this.web3.eth.getTransactionCount(this.PUB,(err,txCount)=>{
    
            err&&reject(err)
    

            // Build a transaction
            let txObject = {
            
                nonce: this.web3.utils.toHex(txCount),
                to: this.TO,
                value: this.web3.utils.toHex(this.web3.utils.toWei(this.AMOUNT, 'ether')),
                gasLimit: this.web3.utils.toHex(this.GAS_LIMIT),
                gasPrice: this.web3.utils.toHex(this.web3.utils.toWei(this.GAS_PRICE, 'gwei')),
    
                //Set payload in hex
                data:'0x'+Buffer.from(blockIndex+'_'+klyntarHash,'utf8').toString('hex')
        
            }
    
    
            //Note-choose "scope"(Ropsten testnet in this case)
            let tx = new Transaction(txObject,{common:this.COMMON})
    
            //Sign the transaction
            tx.sign(this.PRV)
             
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
        
            balance=this.web3.utils.fromWei(await this.web3.eth.getBalance(this.PUB).catch(e=>{err=`No data\x1b[31;1m (${e})\x1b[0m`; return '0'}),'ether')

        return err||balance
    
    }

}