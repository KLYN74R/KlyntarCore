import { buildTransaction, encodeDeployment, encodeFunction } from './helpers/tx-builder.js'
import { defaultAbiCoder as AbiCoder, Interface } from '@ethersproject/abi'
import { getAccountNonce, insertAccount } from './helpers/account-utils.js'
import { DefaultStateManager } from '@ethereumjs/statemanager'
import { Chain, Common, Hardfork } from '@ethereumjs/common'
import { Transaction } from '@ethereumjs/tx'

import { Address } from '@ethereumjs/util'
import { Block } from '@ethereumjs/block'
import {Trie} from '@ethereumjs/trie'
import {LevelDB} from './LevelDB.js'

import {createHash} from 'crypto'
import {VM} from '@ethereumjs/vm'

import { Level } from 'level'




const trie = new Trie({
    
    db:new LevelDB(new Level('./PUT_TEST')),

    useKeyHashing:true

})


const common = new Common({ chain: Chain.Rinkeby, hardfork: Hardfork.Istanbul })


const stateManager = new DefaultStateManager({trie})

const vm = await VM.create({ common,stateManager })



export let VM = {

    /*
    
        Implementation here

        Only callContract function because EVM has full own logic
    
    */
    callContract:(tx,block)=>{}
    
}