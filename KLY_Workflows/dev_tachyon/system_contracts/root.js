// Will be available in the following releases
// let systemContracts = ['aliases','mintUnobtanium','deployService','stakingPool','rwxContract']

export const SYSTEM_CONTRACTS = new Map()

let systemContractsNames = ['staking_pool']




for(let name of systemContractsNames){

    await import(`./${name}.js`).then(contractHandler=>SYSTEM_CONTRACTS.set(name,contractHandler.CONTRACT))

}