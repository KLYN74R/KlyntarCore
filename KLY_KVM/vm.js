//Here will be the implementation of VM for KLYNTAR to allow workflows to import it and use in code

import loader from '@assemblyscript/loader'

import metering from 'wasm-metering'

import fs from 'fs'




//Path to configs for KLYNTAR VM is usually defined in <SYMBIOTE_DIR>/CONFIGS/symbiote.json and usually it's <SYMBIOTE_DIR>/CONFIGS/vm.json

let vmConfigs = JSON.parse(fs.readFileSync('./configsTemplate.json')),

    energyTable = JSON.parse(fs.readFileSync(vmConfigs.METERING_COST_TABLE_PATH))




export let VM = {

    //Function to create a contract instance from WASM bytecode with injected metering function 
    bytesToMeteredContract:async contractBuffer=>{

        let prePreparedContractBytecode = metering.meterWASM(contractBuffer,{
    
            meterType: vmConfigs.METERING.TYPE,
            
            fieldStr: vmConfigs.METERING.FUNCTION_NAME,
        
            moduleStr:vmConfigs.METERING.MODULE_NAME,
        
        
            //And cost table to meter energy usage by opcodes price
            costTable:energyTable,
        
        })

        let contractMetadata = {

            energyLimit:9000000,
            energyUsed:0

        }

        let contractInstance = await loader.instantiate(prePreparedContractBytecode,{

            'metering': {
                
                'energyUse': energy => {
                    
                    contractMetadata.energyUsed += energy
            
                    if (energyUsed > contractMetadata.energyLimit) throw new Error('No more energy')
          
                }
            
            }
        
        }).then(contract=>contract.exports)

        return {contractInstance,contractMetadata}
        
    },




    callContract:async(contractInstance,contractMetadata,functionName,params)=>{

        contractMetadata.energyUsed=0 //make null before call contract

        let result = contractInstance[functionName](...params)

        return {result,contractMetadata}

    },

}