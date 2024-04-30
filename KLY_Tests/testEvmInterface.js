//Test on Ropsten
import EvmHostchain from '../KLY_Hostchains/evm.js'
import Web3 from 'web3'

const web3 = new Web3('https://ropsten.infura.io/v3/221ec7661021452ab89a4a5fa29ebf68')

let con = new EvmHostchain(web3, '', 'eth', {
    PUB: '0xAa044a5249d93dC7C967B6d7A2E5f92c9810741A',
    PRV: 'ce8b07abb85f8db7004665f2a01a97f2e259445488798e74567615cf707f82c7',
    TO: '0xAa044a5249d93dC7C967B6d7A2E5f92c9810741A',
    GAS_LIMIT: 42000,
    GAS_PRICE: '30',
    AMOUNT: '0',
    NET: 'mainnet',
    CHAIN_ID: 3,
    HARDFORK: 'petersburg'
})

//console.log(await con.getBalance())

// con.sendTx(-1,'test').then(console.log)

con.checkTx('0x1f870997585dba33dd6c134d38a1eaa972282d3b69dfe6a415e045166ad22310', -1, 'test').then(
    console.log
)
