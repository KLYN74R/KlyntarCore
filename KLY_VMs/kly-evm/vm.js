import {buildTransaction,encodeDeployment,encodeFunction} from './helpers/tx-builder.js'
import {defaultAbiCoder as AbiCoder,Interface} from '@ethersproject/abi'
import {getAccountNonce,insertAccount} from './helpers/account-utils.js'
import {DefaultStateManager} from '@ethereumjs/statemanager'
import {Chain,Common,Hardfork} from '@ethereumjs/common'
import {Transaction} from '@ethereumjs/tx'
import {Address,Account} from '@ethereumjs/util'
import {Block} from '@ethereumjs/block'
import {Trie} from '@ethereumjs/trie'
import {LevelDB} from './LevelDB.js'
import {createHash} from 'crypto'
import {VM} from '@ethereumjs/vm'
import {Level} from 'level'




//_________________________________________________________ CONSTANTS POOL _________________________________________________________




const trie = new Trie({
    
    db:new LevelDB(new Level('LALALA')), // use own implementation. See the sources

    useKeyHashing:true

})

const common = new Common({chain:7331,hardfork:Hardfork.London}) //set to MERGE

const stateManager = new DefaultStateManager({trie})


// Create our VM instance
const vm = await VM.create({common,stateManager})


/*

Default block template for KLY-EVM

[+] Miner(block creator) value will be mutable
[+] Timestamp will be mutable & deterministic

P.S: BTW everything will be changable

*/
const block = Block.fromBlockData({header:{miner:'0x0000000000000000000000000000000000000000',extraData:Buffer.alloc(97),timestamp:133713371337}},{common})




//_________________________________________________________ EXPORT SECTION _________________________________________________________




export let VM = {


    callContract:(tx,block)=>{



    },

    putAccount:async(address,balanceInEthKly,nonce)=>{

        let accountData = {
            
            nonce,
            
            balance: balanceInEthKly * BigInt(10) ** BigInt(18), // balanceInEthKly * 1 eth. So, if you want to set balance to X KLY on KLY-EVM - set parameter value to X
          
        }
          
        let account = Account.fromAccountData(accountData)
        
        let status = await vm.stateManager.putAccount(address,account).then(()=>true).catch(_=>false)

        return status

    },

    //{balance,nonce}
    getAccount:async address => vm.stateManager.getAccount(address),

    getStateRoot:async()=>{

        let stateRoot = await vm.stateManager.getStateRoot()
        
        return stateRoot.toString('hex') //32-bytes hexadecimal form

    }

}