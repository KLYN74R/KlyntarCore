import Web3 from 'web3'

let web3 = new Web3('http://localhost:7331/kly_evm_rpc')

// web3.eth.getChainId().then(console.log).catch(e=>console.log(e))

// web3.eth.getBalance('0x4741c39e6096c192Db6E1375Ff32526512069dF5').then(console.log).catch(e=>console.log(e))

// web3.eth.getCoinbase().then(console.log).catch(e=>console.log(e))

// web3.eth.getGasPrice().then(console.log).catch(e=>console.log(e))

// web3.eth.getNodeInfo().then(console.log).catch(e=>console.log(e))

// web3.eth.getHashrate().then(console.log).catch(e=>console.log(e))

// web3.eth.getTransactionCount('0x4741c39e6096c192Db6E1375Ff32526512069dF5').then(console.log).catch(e=>console.log(e))


let web3_2 = new Web3('http://localhost:8545')


// web3_2.eth.getCode('0x15ecf34ECDb72bAfd3DbA990D01E20338681f6dE').then(console.log).catch(e=>console.log(e))

web3_2.eth.getTransaction('0x1eb42042f70eb6234080fcddd556f6a07d29fb8f3c4c586456e35ba156ae41c0').then(console.log).catch(e=>console.log(e))

// web3_2.eth.getTransactionReceipt('0x1eb42042f70eb6234080fcddd556f6a07d29fb8f3c4c586456e35ba156ae41c0').then(console.log).catch(e=>console.log(e))

// web3_2.eth.getBlock(10000).then(console.log).catch(e=>console.log(e))