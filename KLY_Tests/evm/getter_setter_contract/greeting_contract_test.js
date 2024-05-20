/*

This is the test related to KLY-EVM. The goals are:

[+] Test deployment of simple contract which has set/get method with greeting (tx:0xbde38478290d8bb33ffef8150d8745e69733c2512b0293303a3f179367f3a632,contract:0x2538FB9F06e2482727Da7B9E94a589AEE0c5c0F6)
[+] Test set method
[+] Test get method
[+] Test how eth_call works


*/


import {Transaction} from '@ethereumjs/tx'
import {Common} from '@ethereumjs/common'
import Web3 from 'web3'


//___________________________________ CONSTANTS POOL ___________________________________


const web3 = new Web3('http://localhost:7331/kly_evm_rpc')

// KLY-EVM
const common = Common.custom({name:'KLYNTAR',networkId:7331,chainId:7331},'merge')

// EVM account

const evmAccount0 = {

    address:'0x4741c39e6096c192Db6E1375Ff32526512069dF5',
    privateKey:Buffer.from('d86dd54fd92f7c638668b1847aa3928f213db09ccda19f1a5f2badeae50cb93e','hex')

}




let DEPLOY_CONTRACT=async()=>{

    let INITIAL_GREETING = 'Hello VladArtem'
    
    let GREET_CONTRACT = new web3.eth.Contract([{"inputs":[{"internalType":"string","name":"_greeting","type":"string"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"greet","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"string","name":"_greeting","type":"string"}],"name":"setGreeting","outputs":[],"stateMutability":"nonpayable","type":"function"}]);
    
    let GREETER_ABI = GREET_CONTRACT.deploy({
    
        data: '0x60806040523480156200001157600080fd5b506040516200081238038062000812833981810160405281019062000037919062000185565b80600090805190602001906200004f92919062000057565b50506200035a565b82805462000065906200026b565b90600052602060002090601f016020900481019282620000895760008555620000d5565b82601f10620000a457805160ff1916838001178555620000d5565b82800160010185558215620000d5579182015b82811115620000d4578251825591602001919060010190620000b7565b5b509050620000e49190620000e8565b5090565b5b8082111562000103576000816000905550600101620000e9565b5090565b60006200011e6200011884620001ff565b620001d6565b9050828152602081018484840111156200013d576200013c6200033a565b5b6200014a84828562000235565b509392505050565b600082601f8301126200016a576200016962000335565b5b81516200017c84826020860162000107565b91505092915050565b6000602082840312156200019e576200019d62000344565b5b600082015167ffffffffffffffff811115620001bf57620001be6200033f565b5b620001cd8482850162000152565b91505092915050565b6000620001e2620001f5565b9050620001f08282620002a1565b919050565b6000604051905090565b600067ffffffffffffffff8211156200021d576200021c62000306565b5b620002288262000349565b9050602081019050919050565b60005b838110156200025557808201518184015260208101905062000238565b8381111562000265576000848401525b50505050565b600060028204905060018216806200028457607f821691505b602082108114156200029b576200029a620002d7565b5b50919050565b620002ac8262000349565b810181811067ffffffffffffffff82111715620002ce57620002cd62000306565b5b80604052505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b600080fd5b600080fd5b600080fd5b600080fd5b6000601f19601f8301169050919050565b6104a8806200036a6000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c8063a41368621461003b578063cfae321714610057575b600080fd5b61005560048036038101906100509190610234565b610075565b005b61005f61008f565b60405161006c91906102b6565b60405180910390f35b806000908051906020019061008b929190610121565b5050565b60606000805461009e9061038c565b80601f01602080910402602001604051908101604052809291908181526020018280546100ca9061038c565b80156101175780601f106100ec57610100808354040283529160200191610117565b820191906000526020600020905b8154815290600101906020018083116100fa57829003601f168201915b5050505050905090565b82805461012d9061038c565b90600052602060002090601f01602090048101928261014f5760008555610196565b82601f1061016857805160ff1916838001178555610196565b82800160010185558215610196579182015b8281111561019557825182559160200191906001019061017a565b5b5090506101a391906101a7565b5090565b5b808211156101c05760008160009055506001016101a8565b5090565b60006101d76101d2846102fd565b6102d8565b9050828152602081018484840111156101f3576101f2610452565b5b6101fe84828561034a565b509392505050565b600082601f83011261021b5761021a61044d565b5b813561022b8482602086016101c4565b91505092915050565b60006020828403121561024a5761024961045c565b5b600082013567ffffffffffffffff81111561026857610267610457565b5b61027484828501610206565b91505092915050565b60006102888261032e565b6102928185610339565b93506102a2818560208601610359565b6102ab81610461565b840191505092915050565b600060208201905081810360008301526102d0818461027d565b905092915050565b60006102e26102f3565b90506102ee82826103be565b919050565b6000604051905090565b600067ffffffffffffffff8211156103185761031761041e565b5b61032182610461565b9050602081019050919050565b600081519050919050565b600082825260208201905092915050565b82818337600083830152505050565b60005b8381101561037757808201518184015260208101905061035c565b83811115610386576000848401525b50505050565b600060028204905060018216806103a457607f821691505b602082108114156103b8576103b76103ef565b5b50919050565b6103c782610461565b810181811067ffffffffffffffff821117156103e6576103e561041e565b5b80604052505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b600080fd5b600080fd5b600080fd5b600080fd5b6000601f19601f830116905091905056fea2646970667358221220ee086db17b9935ab1056a79216d15ae890d4139b7fef9d426b520bf9d2c425a464736f6c63430008070033', 
        arguments:[INITIAL_GREETING]
   
    }).encodeABI()

    
    
    web3.eth.getTransactionCount(evmAccount0.address,async(err,txCount)=>{
			
        if(err) return

        // Build a transaction
        let txObject = {

            from:evmAccount0.address,

            nonce:web3.utils.toHex(txCount),
    
            //Set enough limit and price for gas
            gasLimit: web3.utils.toHex(800000),
    
            gasPrice: web3.utils.toHex(web3.utils.toWei('10','gwei')),
            
            //Set contract bytecode
            data:GREETER_ABI

        }


        //Choose custom network
        let tx = Transaction.fromTxData(txObject,{common}).sign(evmAccount0.privateKey)

        let raw = '0x' + tx.serialize().toString('hex')

        // console.log('Transaction(HEX) ———> ',raw)

        //Broadcast the transaction
        web3.eth.sendSignedTransaction(raw, (err, txHash) => console.log(err?`Oops,some has been occured ${err}`:`Success ———> ${txHash}`))


    })

}


// DEPLOY_CONTRACT()


let GET_TX_RECEIPT_TO_GET_CONTRACT_ADDRESS=async()=>{

    let receipt = await web3.eth.getTransactionReceipt('0xabc67e4868cb3a90acc39a48ce381e11cbde0a19df7b30b58eb14898edf5713c')

    console.log('Receipt is ',receipt)

}

// await GET_TX_RECEIPT_TO_GET_CONTRACT_ADDRESS()


let SET_GREETING=async()=>{

    // Set another greeting

    const nextGreeting = `The third greeting`

    let GREET_CONTRACT = new web3.eth.Contract([{"inputs":[{"internalType":"string","name":"_greeting","type":"string"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"greet","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"string","name":"_greeting","type":"string"}],"name":"setGreeting","outputs":[],"stateMutability":"nonpayable","type":"function"}]);


    web3.eth.getTransactionCount(evmAccount0.address,async(err,txCount)=>{
			
        if(err) return

        // Build a transaction
        let txObject = {

            from:evmAccount0.address,

            to:'0x49Fb5FccD2f0Cf7764B4A469669C2d400006d203', // our contract address

            nonce:web3.utils.toHex(txCount),
    
            //Set enough limit and price for gas
            gasLimit: web3.utils.toHex(200000),
    
            gasPrice: web3.utils.toHex(web3.utils.toWei('10','gwei')),
            
            data:GREET_CONTRACT.methods.setGreeting(nextGreeting).encodeABI()

        }


        //Choose custom network
        let tx = Transaction.fromTxData(txObject,{common}).sign(evmAccount0.privateKey)


        let raw = '0x' + tx.serialize().toString('hex')

        console.log('Transaction(HEX) ———> ',raw)

        //Broadcast the transaction
        web3.eth.sendSignedTransaction(raw,(err,txHash) => console.log(err?`Oops,some has been occured ${err}`:`Success ———> ${txHash}`))


    })


}


// SET_GREETING()


let GET_GREETING=async()=>{

    let contractAddress = '0x400F246244d67F1654B7939C330a46e4bd9e4186'

    let GREET_CONTRACT = new web3.eth.Contract([{"inputs":[{"internalType":"string","name":"_greeting","type":"string"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"greet","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"string","name":"_greeting","type":"string"}],"name":"setGreeting","outputs":[],"stateMutability":"nonpayable","type":"function"}],contractAddress);

    console.log('Current greeting is: ',await GREET_CONTRACT.methods.greet().call())
    
}


// GET_GREETING()


let SET_GREETING_IN_SANDBOX=async()=>{

    // The sense is to test that eth_call will be executed successfully, but state won't be changed

    let contractAddress = '0x400F246244d67F1654B7939C330a46e4bd9e4186'

    let GREET_CONTRACT = new web3.eth.Contract([{"inputs":[{"internalType":"string","name":"_greeting","type":"string"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"greet","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"string","name":"_greeting","type":"string"}],"name":"setGreeting","outputs":[],"stateMutability":"nonpayable","type":"function"}],contractAddress);

    console.log('Current greeting is: ',await GREET_CONTRACT.methods.setGreeting('This is the new value for greeting: Hola').call())
    
}


// SET_GREETING_IN_SANDBOX()



let ESTIMATE_GAS_FOR_GREETING_SET=async()=>{

    // The sense is to test that eth_call will be executed successfully, but state won't be changed

    let contractAddress = '0x400F246244d67F1654B7939C330a46e4bd9e4186'

    let GREET_CONTRACT = new web3.eth.Contract([{"inputs":[{"internalType":"string","name":"_greeting","type":"string"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"greet","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"string","name":"_greeting","type":"string"}],"name":"setGreeting","outputs":[],"stateMutability":"nonpayable","type":"function"}],contractAddress);

    let gasAmount = await GREET_CONTRACT.methods.setGreeting('aaaaaaaaaaaaaaaaaaaaaaaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').estimateGas({from:evmAccount0.address});
    
    console.log('Required gas amount is :',gasAmount)
    
}


// ESTIMATE_GAS_FOR_GREETING_SET()