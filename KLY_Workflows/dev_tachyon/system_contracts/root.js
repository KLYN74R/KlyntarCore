global.SYSTEM_CONTRACTS=new Map()

// Will be available in the following releases
// let systemContracts = ['aliases','mintUnobtanium','deployService','stakingPool','rwxContract']

let systemContracts = ['staking_pool']

for(let name of systemContracts){

    await import(`./${name}.js`).then(contract=>global.SYSTEM_CONTRACTS.set(name,contract.CONTRACT))

}