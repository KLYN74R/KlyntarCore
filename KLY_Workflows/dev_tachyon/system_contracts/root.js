// Will be available in the following releases
// let systemContracts = ['abstractions','aliases','cross_shards_messaging','multistaking','rwx_contract','staking']

export const SYSTEM_CONTRACTS = new Map()

let systemContractsNames = ['staking']




for(let name of systemContractsNames){

    await import(`./${name}.js`).then(contractHandler=>SYSTEM_CONTRACTS.set(name,contractHandler.CONTRACT))

}