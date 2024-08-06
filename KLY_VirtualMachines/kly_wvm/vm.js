/*

██╗  ██╗██╗  ██╗   ██╗███╗   ██╗████████╗ █████╗ ██████╗     ██╗    ██╗██╗   ██╗███╗   ███╗
██║ ██╔╝██║  ╚██╗ ██╔╝████╗  ██║╚══██╔══╝██╔══██╗██╔══██╗    ██║    ██║██║   ██║████╗ ████║
█████╔╝ ██║   ╚████╔╝ ██╔██╗ ██║   ██║   ███████║██████╔╝    ██║ █╗ ██║██║   ██║██╔████╔██║
██╔═██╗ ██║    ╚██╔╝  ██║╚██╗██║   ██║   ██╔══██║██╔══██╗    ██║███╗██║╚██╗ ██╔╝██║╚██╔╝██║
██║  ██╗███████╗██║   ██║ ╚████║   ██║   ██║  ██║██║  ██║    ╚███╔███╔╝ ╚████╔╝ ██║ ╚═╝ ██║
╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝     ╚══╝╚══╝   ╚═══╝  ╚═╝     ╚═╝
                                                                                 

Here will be the implementation of VM for KLYNTAR to allow workflows to import it and use in code

*/




import ContractInstance from './rustBase.js'




export let VM = {

    //Function to create a contract instance from WASM bytecode with injected metering function 
    bytesToMeteredContract:async(contractBytecodeAsBuffer,gasLimit,extraModules)=>{

        let contract = new ContractInstance(extraModules,contractBytecodeAsBuffer)

        let contractHandlerWithMetadata = await contract.setUpContract(gasLimit) // return instance and pointer to metadata to track gas changes => {contractInstance,contractMetadata}

        return contractHandlerWithMetadata
        
    },


    /**
     * 
     *  
     * @param {*} contractInstance - WASM contract instance with injected modules e.g. "metering" and another extra functionality 
     * @param {*} contractMetadata - handler for gas used metering
     * @param {Object} params - object that we should pass to contract
     * @param {*} functionName - function name of contract that we should call
     * @param {'RUST'|'ASC'} contractLang
     * @returns 
     */
    callContract:(contractInstance,contractMetadata,params,functionName,contractLang)=>{

        let result

        if(contractLang==='RUST'){

            result = contractInstance[functionName](params)

        }else if(contractLang==='ASC'){

            let pointerToChunk = contractInstance.__newString(params);

            result = contractInstance.__getString(contractInstance[functionName](pointerToChunk))

        }

        // Returns result as JSON

        return {result,contractMetadata}

    },

}