import {VM} from '../../../KLY_VirtualMachines/kly_evm/vm.js'
import fetch from 'node-fetch'
import fs from 'fs'

let bytes = fs.readFileSync('./test.wasm')

console.log(bytes)

let {contractInstance,contractMetadata} = await VM.bytesToMeteredContract(bytes,9000000,{

    network_module:{

        logMyIP:()=>{

            console.log('Energy before call "logMyIP" ',contractMetadata)

            console.log('127.0.0.1 - Welcome home ;)')

            //Let's change manually

            contractMetadata.gasBurned+=10_000_00

            console.log('Energy after manual manipulation ',contractMetadata)            

        },

        getMyIP:()=>{
            
            fetch('https://api.myip.com').then(r=>r.json()).then(ipResult=>console.log(ipResult))

            return contractInstance.__newString("127.0.0.1")

        }

    }

})

console.log('Energy before call "getQwerty" ',contractMetadata)

console.log(contractInstance.__getString(
    
        contractInstance.getQwerty(
            
            contractInstance.__newString('LOL')
            
        )
        
    )
    
)

console.log('Energy after all ',contractMetadata)

let finalString = contractInstance.getConcat(contractInstance.__newString("YOUR IP => "))

console.log(contractInstance.__getString(finalString))

console.log('Energy after real last time ',contractMetadata)