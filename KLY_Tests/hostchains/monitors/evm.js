/**
 * 
 * 
 * LINKS:[
 * 
 *         https://web3js.readthedocs.io/en/v1.2.0/web3-eth-contract.html#id36
 *         https://ethereum.stackexchange.com/questions/35997/how-to-listen-to-events-using-web3-v1-0/49472
 *         https://ethereumdev.io/listening-to-new-transactions-happening-on-the-blockchain/
 *  
 * ]
 * 
 * 
*/



import Web3 from 'web3'



//________________________________________________ SIMPLE BLOCK LISTENER ___________________________________________________


// BSC example

const web3 = new Web3('https://data-seed-prebsc-1-s1.binance.org:8545');
let latestKnownBlockNumber = -1;
let blockTime = 5000;

// Our function that will triggered for every block
async function processBlock(blockNumber) {
    console.log("We process block: " + blockNumber)
    latestKnownBlockNumber = blockNumber;
    
    let block = await web3.eth.getBlock(blockNumber);
    console.log("New block :", block)
}

// This function is called every blockTime, check the current block number and order the processing of the new block(s)
async function checkCurrentBlock() {
    const currentBlockNumber = await web3.eth.getBlockNumber()
    console.log("Current blockchain top: " + currentBlockNumber, " | Script is at: " + latestKnownBlockNumber)
    while (latestKnownBlockNumber == -1 || currentBlockNumber > latestKnownBlockNumber) {
        await processBlock(latestKnownBlockNumber == -1 ? currentBlockNumber : latestKnownBlockNumber + 1);
    }
    setTimeout(checkCurrentBlock, blockTime);
}

checkCurrentBlock()






//________________________________________________ CONTRACT LISTENER ___________________________________________________



//BSC example



let ABI=`

[
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "oldHeight",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "newHeight",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "oldHash",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "newHash",
				"type": "string"
			}
		],
		"name": "Change",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "new_height",
				"type": "uint256"
			},
			{
				"internalType": "string",
				"name": "new_hash",
				"type": "string"
			}
		],
		"name": "change",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "symbiote_hash",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "symbiote_height",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]




`,


bytecode='608060405260008055604051806060016040528060408152602001610918604091396002908051906020019061003692919061008a565b5034801561004357600080fd5b5033600160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555061018e565b8280546100969061012d565b90600052602060002090601f0160209004810192826100b857600085556100ff565b82601f106100d157805160ff19168380011785556100ff565b828001600101855582156100ff579182015b828111156100fe5782518255916020019190600101906100e3565b5b50905061010c9190610110565b5090565b5b80821115610129576000816000905550600101610111565b5090565b6000600282049050600182168061014557607f821691505b602082108114156101595761015861015f565b5b50919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b61077b8061019d6000396000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c80632c4b44dd146100515780638da5cb5b1461006f578063c75226ec1461008d578063cbe65ab8146100a9575b600080fd5b6100596100c7565b60405161006691906104b3565b60405180910390f35b610077610155565b6040516100849190610498565b60405180910390f35b6100a760048036038101906100a29190610365565b61017b565b005b6100b1610237565b6040516100be91906104d5565b60405180910390f35b600280546100d490610648565b80601f016020809104026020016040519081016040528092919081815260200182805461010090610648565b801561014d5780601f106101225761010080835404028352916020019161014d565b820191906000526020600020905b81548152906001019060200180831161013057829003601f168201915b505050505081565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16146101d557600080fd5b7fcc26e241f4e440ef33e22a24ba69a606d1ba3c791c30fb05a2b134951361f3826000548360028460405161020d94939291906104f0565b60405180910390a181600081905550806002908051906020019061023292919061023d565b505050565b60005481565b82805461024990610648565b90600052602060002090601f01602090048101928261026b57600085556102b2565b82601f1061028457805160ff19168380011785556102b2565b828001600101855582156102b2579182015b828111156102b1578251825591602001919060010190610296565b5b5090506102bf91906102c3565b5090565b5b808211156102dc5760008160009055506001016102c4565b5090565b60006102f36102ee84610568565b610543565b90508281526020810184848401111561030f5761030e61070e565b5b61031a848285610606565b509392505050565b600082601f83011261033757610336610709565b5b81356103478482602086016102e0565b91505092915050565b60008135905061035f8161072e565b92915050565b6000806040838503121561037c5761037b610718565b5b600061038a85828601610350565b925050602083013567ffffffffffffffff8111156103ab576103aa610713565b5b6103b785828601610322565b9150509250929050565b6103ca816105ca565b82525050565b60006103db826105ae565b6103e581856105b9565b93506103f5818560208601610615565b6103fe8161071d565b840191505092915050565b6000815461041681610648565b61042081866105b9565b9450600182166000811461043b576001811461044d57610480565b60ff1983168652602086019350610480565b61045685610599565b60005b8381101561047857815481890152600182019150602081019050610459565b808801955050505b50505092915050565b610492816105fc565b82525050565b60006020820190506104ad60008301846103c1565b92915050565b600060208201905081810360008301526104cd81846103d0565b905092915050565b60006020820190506104ea6000830184610489565b92915050565b60006080820190506105056000830187610489565b6105126020830186610489565b81810360408301526105248185610409565b9050818103606083015261053881846103d0565b905095945050505050565b600061054d61055e565b9050610559828261067a565b919050565b6000604051905090565b600067ffffffffffffffff821115610583576105826106da565b5b61058c8261071d565b9050602081019050919050565b60008190508160005260206000209050919050565b600081519050919050565b600082825260208201905092915050565b60006105d5826105dc565b9050919050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000819050919050565b82818337600083830152505050565b60005b83811015610633578082015181840152602081019050610618565b83811115610642576000848401525b50505050565b6000600282049050600182168061066057607f821691505b60208210811415610674576106736106ab565b5b50919050565b6106838261071d565b810181811067ffffffffffffffff821117156106a2576106a16106da565b5b80604052505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b600080fd5b600080fd5b600080fd5b600080fd5b6000601f19601f8301169050919050565b610737816105fc565b811461074257600080fd5b5056fea26469706673582212202229cb48e3e1794dd5848e047cce75ee2a25a0f0536650fe07554e163c7be8c064736f6c6343000807003330303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030'



import {Transaction} from 'ethereumjs-tx' 
import Common from 'ethereumjs-common'





// // POLYGON RPC nodes,your NaaS provider or own node
// let web3 = new Web3('https://data-seed-prebsc-1-s1.binance.org:8545'),

// 	//Set your credentials
// 	myAddress='0x4741c39e6096c192Db6E1375Ff32526512069dF5',privateKey = Buffer.from('d86dd54fd92f7c638668b1847aa3928f213db09ccda19f1a5f2badeae50cb93e','hex'),

// 	contractAddress='0xab574afa4fca42b1ebf06f19d5b25b2ab72369b8',

//   common = Common.default.forCustomChain('mainnet',{networkId:97,chainId:97},'petersburg'),

//   //Contract instance
// 	contract = new web3.eth.Contract(JSON.parse(ABI),contractAddress),//Basic contract

//     //Get data from smart contract
//     GET_SYMBIOTE_DATA=async()=>{

//         console.log('Height ',await contract.methods.symbiote_height().call())
        
//         console.log('Hash ',await contract.methods.symbiote_hash().call())

//     },

// 	//Create new contract
// 	CREATE_CONTRACT=()=>{

// 		web3.eth.getTransactionCount(myAddress,(err,txCount) => {
			
//     		if(err) return

//     		// Build a transaction
//     		let txObject = {

//         		nonce: web3.utils.toHex(txCount),
        
//         		//value: web3.utils.toHex(web3.utils.toWei('0','ether')),
        


// 				//Set enough limit and price for gas
//         		gasLimit: web3.utils.toHex(800000),
        
//         		gasPrice: web3.utils.toHex(web3.utils.toWei('10','gwei')),
				
//         		//Set contract bytecode
//         		data: `0x${bytecode}`
    
//     		}


// 		    //Choose custom network
//     		let tx = new Transaction(txObject,{common})

// 		    //Sign the transaction
//     		tx.sign(privateKey)




// 		    let raw = '0x' + tx.serialize().toString('hex')

//     		console.log('Transaction(HEX) ———> ',raw)

// 		    //Broadcast the transaction
//     		web3.eth.sendSignedTransaction(raw, (err, txHash) => console.log(err?`Oops,some has been occured ${err}`:`Success ———> ${txHash}`))

// 		})


// 	},


// 	//To call single method and update current height and hash
// 	CHANGE_SYMBIOTE_STATE=(newIndex,newHash)=>{

// 		web3.eth.getTransactionCount(myAddress,(err,txCount) => {
			
//     		if(err) return

//     		// Build a transaction
//     		let txObject = {

//         		nonce: web3.utils.toHex(txCount),
        
//         		//value: web3.utils.toHex(web3.utils.toWei('0','ether')),
//                 to:contractAddress,


// 				//Set enough limit and price for gas
//         		gasLimit: web3.utils.toHex(800000),
        
//         		gasPrice: web3.utils.toHex(web3.utils.toWei('10','gwei')),
				
//         		//Set contract bytecode
//         		data: contract.methods.change(newIndex,newHash).encodeABI()
    
//     		}


// 		    //Choose custom network
//     		let tx = new Transaction(txObject,{common})

// 		    //Sign the transaction
//     		tx.sign(privateKey)




// 		    let raw = '0x' + tx.serialize().toString('hex')

//     		console.log('Transaction(HEX) ———> ',raw)

// 		    //Broadcast the transaction
//     		web3.eth.sendSignedTransaction(raw, (err, txHash) => console.log(err?`Oops,some has been occured ${err}`:`Success ———> ${txHash}`))

// 		})



// 	}





//GET_SYMBIOTE_DATA()

//CHANGE_SYMBIOTE_STATE(1,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')


//CREATE_CONTRACT()




//Past events
// let result=await contract.getPastEvents('Change',{fromBlock:15093222})

// console.log(result)
