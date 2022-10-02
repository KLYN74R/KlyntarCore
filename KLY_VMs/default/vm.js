/*

██╗  ██╗██╗  ██╗   ██╗███╗   ██╗████████╗ █████╗ ██████╗     ██╗   ██╗███╗   ███╗
██║ ██╔╝██║  ╚██╗ ██╔╝████╗  ██║╚══██╔══╝██╔══██╗██╔══██╗    ██║   ██║████╗ ████║
█████╔╝ ██║   ╚████╔╝ ██╔██╗ ██║   ██║   ███████║██████╔╝    ██║   ██║██╔████╔██║
██╔═██╗ ██║    ╚██╔╝  ██║╚██╗██║   ██║   ██╔══██║██╔══██╗    ╚██╗ ██╔╝██║╚██╔╝██║
██║  ██╗███████╗██║   ██║ ╚████║   ██║   ██║  ██║██║  ██║     ╚████╔╝ ██║ ╚═╝ ██║
╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝      ╚═══╝  ╚═╝     ╚═╝
                                                                                 

Here will be the implementation of VM for KLYNTAR to allow workflows to import it and use in code

*/



import CROSS_CONTRACT from './modules/crossContractCall.js'

import loader from '@assemblyscript/loader'

import metering from 'wasm-metering'

import EXECUTE from './rustBase.js'



let {TYPE,FUNCTION_NAME,MODULE_NAME}=CONFIG.VM.METERING


export let VM = {

    //Function to create a contract instance from WASM bytecode with injected metering function 
    bytesToMeteredContract:async (contractBuffer,energyLimit)=>{

        //Modify contract to inject metering functions
        let prePreparedContractBytecode = metering.meterWASM(contractBuffer,{
    
            meterType: TYPE,
            
            fieldStr: FUNCTION_NAME,
        
            moduleStr: MODULE_NAME,
        
            //And cost table to meter energy usage by opcodes price
            costTable: CONFIG.VM.ENERGY_TABLE,
        
        })

        //Prepare pointer to contract metadata to track changes in energy changes
        let contractMetadata = {

            energyLimit,
            energyUsed:0

        }

        //Inject metering function
        let contractInstance = await loader.instantiate(prePreparedContractBytecode,{

            metering: {
                
                energyUse: energy => {
                    
                    contractMetadata.energyUsed += energy
            
                    if (contractMetadata.energyUsed > contractMetadata.energyLimit) throw new Error('No more energy')
          
                }
            
            },

            CROSS_CONTRACT //* 02.10.2022  - add cross-contract abilities for KLYNTAR VM
        
        }).then(contract=>contract.exports)

        return {contractInstance,contractMetadata} //return instance and pointer to metadata to track energy changes
        
    },



 
    callContract:(contractInstance,contractMetadata,serializedContractStateChunk,functionName,type)=>{

        contractMetadata.energyUsed=0 //make null before call contract

        let result

        if(type==='RUST'){

            result = EXECUTE(contractInstance,serializedContractStateChunk,functionName)

        }else if(type==='ASC'){

            let pointerToChunk = contractInstance.__newString(serializedContractStateChunk);

                result = contractInstance.__getString(contractInstance[functionName](pointerToChunk))

        }

        return {result,contractMetadata}

    },

}