/*






*/

//SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;


//______________________________________________________________IMPORT SECTION______________________________________________________________


/**
 * 
 * @title KLYNTAR eth_hostchain@v1.0.0
 * @dev @Vlad@ Chernenko
 * 
 */
 
contract Main {

//______________________________________________________________CONSTANTS POOL______________________________________________________________

    //Initial conditions
    uint256 public symbiote_height=0;
    
    //It's address of Controller at least in first releases
    address public owner;//TODO:decentralize
    
    string public symbiote_hash="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    
    modifier CONTROLLER {
        require(msg.sender==owner);
        _;
    }
    

    
//______________________________________________________________BUILD PROCESS_______________________________________________________________



    constructor(){
        owner=payable(msg.sender);
    }


//_____________________________________________________________MAIN FUNCTIONS_______________________________________________________________

    function change(uint256 new_height,string memory new_hash) CONTROLLER public{
    
        symbiote_height=new_height;

        symbiote_hash=new_hash;
        
    }
      
}



/*



[
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
]


*/