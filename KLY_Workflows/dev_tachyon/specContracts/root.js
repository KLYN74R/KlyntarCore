global.SPECIAL_CONTRACTS=new Map()


let specContracts = ['aliases','mintUnobtanium','deployService','stakingPool']

for(let name of specContracts){

    await import(`./${name}.js`).then(contract=>SPECIAL_CONTRACTS.set(name,contract.CONTRACT))

}