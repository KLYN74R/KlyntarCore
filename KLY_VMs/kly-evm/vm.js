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








export let VM = {

    /*
    
        Implementation here
    
    */
    
}