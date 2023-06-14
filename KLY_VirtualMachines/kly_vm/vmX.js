/*

██╗  ██╗██╗  ██╗   ██╗███╗   ██╗████████╗ █████╗ ██████╗     ██╗   ██╗███╗   ███╗
██║ ██╔╝██║  ╚██╗ ██╔╝████╗  ██║╚══██╔══╝██╔══██╗██╔══██╗    ██║   ██║████╗ ████║
█████╔╝ ██║   ╚████╔╝ ██╔██╗ ██║   ██║   ███████║██████╔╝    ██║   ██║██╔████╔██║
██╔═██╗ ██║    ╚██╔╝  ██║╚██╗██║   ██║   ██╔══██║██╔══██╗    ╚██╗ ██╔╝██║╚██╔╝██║
██║  ██╗███████╗██║   ██║ ╚████║   ██║   ██║  ██║██║  ██║     ╚████╔╝ ██║ ╚═╝ ██║
╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝      ╚═══╝  ╚═╝     ╚═╝
                                                                                 

Here will be the implementation of VM for KLYNTAR to allow workflows to import it and use in code

*/


import ContractInstance from './rustBaseX.js'


export let VM = {

    //Function to create a contract instance from WASM bytecode with injected metering function 
    bytesToMeteredContract:async(contractBytecodeAsBuffer,energyLimit,extraModules)=>{

        let contract = new ContractInstance(extraModules,contractBytecodeAsBuffer)

        let contractHandler = await contract.setUpContract(energyLimit) //return instance and pointer to metadata to track energy changes => {contractInstance,contractMetadata}

        return contractHandler
        
    },


    /**
     * 
     *  
     * @param {*} contractInstance - WASM contract instance with injected modules e.g. "metering" and another extra functionality 
     * @param {*} contractMetadata - handler for energy used metering
     * @param {Object} params - object that we should pass to contract
     * @param {*} functionName - function name of contract that we should call
     * @param {'RUST'|'ASC'} type
     * @returns 
     */
    callContract:async(contractInstance,contractMetadata,params,functionName,type)=>{

        contractMetadata.energyUsed=0 //make null before call contract

        let result

        if(type==='RUST'){

            result = await contractInstance.wasm[functionName](params)

        }else if(type==='ASC'){

            let pointerToChunk = contractInstance.__newString(params);

            result = contractInstance.__getString(contractInstance[functionName](pointerToChunk))

        }

        return {result,contractMetadata}

    },

}