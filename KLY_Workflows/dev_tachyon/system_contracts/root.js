export const SYSTEM_CONTRACTS = new Map()

export const EPOCH_EDGE_SYSTEM_CONTRACTS = new Map()

let systemContractsNames = ['abstractions','cross_shards_messaging','multistaking','rwx_contract','furnace','dao_voting','staking']


for(let name of systemContractsNames){

    await import(`./contracts/${name}.js`).then(contractHandler=>SYSTEM_CONTRACTS.set(name,contractHandler.CONTRACT))

}