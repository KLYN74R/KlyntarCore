global.SPECIAL_CONTRACTS=new Map()

// Will be available in the following releases
// let specContracts = ['aliases','mintUnobtanium','deployService','stakingPool','rwxContract']

let specContracts = ['stakingPool']

for(let name of specContracts){

    await import(`./${name}.js`).then(contract=>SPECIAL_CONTRACTS.set(name,contract.CONTRACT))

}