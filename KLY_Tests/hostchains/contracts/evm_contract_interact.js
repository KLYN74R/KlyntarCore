/*

Example of primitive EVM compatible contracts



LINKS:[

	https://www.edureka.co/blog/ethereum-smart-contract-deployment-web3/
	https://medium.com/0xcode/interacting-with-smart-contracts-using-web3-js-part-ii-c1ef7566d1c5	
	https://cryptomarketpool.com/deploy-a-smart-contract-to-the-polygon-network/
	https://ethereum.stackexchange.com/questions/47426/call-contract-function-signed-on-client-side-web3-js-1-0


]



*/




//Create this in REMIX or elesewhere
//Can be published by symbiote issuer via link in OFFSPRING_CREATION TRANSACTION to site or social medio(Telegram,onion service etc.)
let ABI=`[
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
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
]`



//bytecode='6080604052600080556040518060600160405280604081526020016107f0604091396002908051906020019061003692919061008a565b5034801561004357600080fd5b5033600160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555061018e565b8280546100969061012d565b90600052602060002090601f0160209004810192826100b857600085556100ff565b82601f106100d157805160ff19168380011785556100ff565b828001600101855582156100ff579182015b828111156100fe5782518255916020019190600101906100e3565b5b50905061010c9190610110565b5090565b5b80821115610129576000816000905550600101610111565b5090565b6000600282049050600182168061014557607f821691505b602082108114156101595761015861015f565b5b50919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b6106538061019d6000396000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c80632c4b44dd146100515780638da5cb5b1461006f578063c75226ec1461008d578063cbe65ab8146100a9575b600080fd5b6100596100c7565b60405161006691906103f3565b60405180910390f35b610077610155565b60405161008491906103d8565b60405180910390f35b6100a760048036038101906100a29190610325565b61017b565b005b6100b16101f7565b6040516100be9190610415565b60405180910390f35b600280546100d490610520565b80601f016020809104026020016040519081016040528092919081815260200182805461010090610520565b801561014d5780601f106101225761010080835404028352916020019161014d565b820191906000526020600020905b81548152906001019060200180831161013057829003601f168201915b505050505081565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16146101d557600080fd5b8160008190555080600290805190602001906101f29291906101fd565b505050565b60005481565b82805461020990610520565b90600052602060002090601f01602090048101928261022b5760008555610272565b82601f1061024457805160ff1916838001178555610272565b82800160010185558215610272579182015b82811115610271578251825591602001919060010190610256565b5b50905061027f9190610283565b5090565b5b8082111561029c576000816000905550600101610284565b5090565b60006102b36102ae84610455565b610430565b9050828152602081018484840111156102cf576102ce6105e6565b5b6102da8482856104de565b509392505050565b600082601f8301126102f7576102f66105e1565b5b81356103078482602086016102a0565b91505092915050565b60008135905061031f81610606565b92915050565b6000806040838503121561033c5761033b6105f0565b5b600061034a85828601610310565b925050602083013567ffffffffffffffff81111561036b5761036a6105eb565b5b610377858286016102e2565b9150509250929050565b61038a816104a2565b82525050565b600061039b82610486565b6103a58185610491565b93506103b58185602086016104ed565b6103be816105f5565b840191505092915050565b6103d2816104d4565b82525050565b60006020820190506103ed6000830184610381565b92915050565b6000602082019050818103600083015261040d8184610390565b905092915050565b600060208201905061042a60008301846103c9565b92915050565b600061043a61044b565b90506104468282610552565b919050565b6000604051905090565b600067ffffffffffffffff8211156104705761046f6105b2565b5b610479826105f5565b9050602081019050919050565b600081519050919050565b600082825260208201905092915050565b60006104ad826104b4565b9050919050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000819050919050565b82818337600083830152505050565b60005b8381101561050b5780820151818401526020810190506104f0565b8381111561051a576000848401525b50505050565b6000600282049050600182168061053857607f821691505b6020821081141561054c5761054b610583565b5b50919050565b61055b826105f5565b810181811067ffffffffffffffff8211171561057a576105796105b2565b5b80604052505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b600080fd5b600080fd5b600080fd5b600080fd5b6000601f19601f8301169050919050565b61060f816104d4565b811461061a57600080fd5b5056fea2646970667358221220be6a7ed17db7feefe564ae602a12a6ce9039f06fbc7b26cf7fb79e8eeb80373364736f6c6343000807003330303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030'



import {Transaction} from 'ethereumjs-tx' 
import Common from 'ethereumjs-common'
import Web3 from 'web3'



// POLYGON RPC nodes,your NaaS provider or own node
let web3 = new Web3('https://rpc-mumbai.maticvigil.com/'),

	//Set your credentials
	myAddress='0x4741c39e6096c192Db6E1375Ff32526512069dF5',privateKey = Buffer.from('d86dd54fd92f7c638668b1847aa3928f213db09ccda19f1a5f2badeae50cb93e','hex'),

	contractAddress='0x580A8F649A9a6373240428AB868ce4A4209A6820',

    common = Common.default.forCustomChain('mainnet',{networkId:80001,chainId:80001},'petersburg'),

    //Contract instance
	contract = new web3.eth.Contract(JSON.parse(ABI),contractAddress),//Basic contract

     //Get data from smart contract
	 GET_SYMBIOTE_DATA=async()=>{

        console.log('Height ',await contract.methods.symbiote_height().call())
        
        console.log('Hash ',await contract.methods.symbiote_hash().call())

    },

	//Create new contract
	CREATE_CONTRACT=()=>{

		web3.eth.getTransactionCount(myAddress,(err,txCount) => {
			
    		if(err) return

    		// Build a transaction
    		let txObject = {

        		nonce: web3.utils.toHex(txCount),
        
        		//value: web3.utils.toHex(web3.utils.toWei('0','ether')),
        


				//Set enough limit and price for gas
        		gasLimit: web3.utils.toHex(800000),
        
        		gasPrice: web3.utils.toHex(web3.utils.toWei('10','gwei')),
				
        		//Set contract bytecode
        		data: `0x${bytecode}`
    
    		}


		    //Choose custom network
    		let tx = new Transaction(txObject,{common})

		    //Sign the transaction
    		tx.sign(privateKey)




		    let raw = '0x' + tx.serialize().toString('hex')

    		console.log('Transaction(HEX) ———> ',raw)

		    //Broadcast the transaction
    		web3.eth.sendSignedTransaction(raw, (err, txHash) => console.log(err?`Oops,some has been occured ${err}`:`Success ———> ${txHash}`))

		})


	},


	//To call single method and update current height and hash
	CHANGE_SYMBIOTE_STATE=(newIndex,newHash)=>{

		web3.eth.getTransactionCount(myAddress,(err,txCount) => {
			
    		if(err) return

    		// Build a transaction
    		let txObject = {

        		nonce: web3.utils.toHex(txCount),
        
        		//value: web3.utils.toHex(web3.utils.toWei('0','ether')),
                to:contractAddress,


				//Set enough limit and price for gas
        		gasLimit: web3.utils.toHex(800000),
        
        		gasPrice: web3.utils.toHex(web3.utils.toWei('10','gwei')),
				
        		//Set contract bytecode
        		data: contract.methods.change(newIndex,newHash).encodeABI()
    
    		}


		    //Choose custom network
    		let tx = new Transaction(txObject,{common})

		    //Sign the transaction
    		tx.sign(privateKey)




		    let raw = '0x' + tx.serialize().toString('hex')

    		console.log('Transaction(HEX) ———> ',raw)

		    //Broadcast the transaction
    		web3.eth.sendSignedTransaction(raw, (err, txHash) => console.log(err?`Oops,some has been occured ${err}`:`Success ———> ${txHash}`))

		})



	}





// GET_SYMBIOTE_DATA()