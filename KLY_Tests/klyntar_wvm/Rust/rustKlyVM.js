import {VM} from '../../../KLY_VMs/default/vm.js'

import fs from 'fs'


/*
Contract has such function

    getCoords(JSON'ed Point object) -> [number sum,number gasBurned]

*/

let bytes = fs.readFileSync('./test.wasm')

let {contractInstance,contractMetadata} = await VM.bytesToMeteredContract(bytes,900000)

let exampleJSON = JSON.stringify({alias1:"Cool",alias2:"KLY",x:1337,y:777})

let result = VM.callContract(contractInstance,contractMetadata,exampleJSON,'getCoordsSum','RUST')

console.log('(1) Execution result ',result)

let attempt2 = JSON.stringify({alias1:"Cool",alias2:"KLYKLYKLY",x:1337,y:result.result})

let result2 = VM.callContract(contractInstance,contractMetadata,attempt2,'getCoordsSum','RUST')

console.log('(2) Execution result ',result2)


//Must be error because of lack of gas
try{
    
    let attempt2 = JSON.stringify({alias1:"Cool",alias2:"KLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLYKLY",x:1337,y:result.result})

    let result2 = VM.callContract(contractInstance,contractMetadata,attempt2,'getCoordsSum','RUST')



}catch(e){

    console.log(e.message)//No more gas

}

let perform = JSON.stringify({alias1:"Cool",alias2:"KLYKLYKLY",x:1337,y:result.result})

console.time('PERFORMANCE')

for(let i=0;i<200000;i++){

    VM.callContract(contractInstance,contractMetadata,perform,'getCoordsSum','RUST')

}
console.timeEnd('PERFORMANCE')