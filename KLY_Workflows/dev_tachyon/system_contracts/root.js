export const SYSTEM_CONTRACTS = new Map()

export const EPOCH_EDGE_SYSTEM_CONTRACTS = new Map()

let systemContractsNames = ['abstractions','cross_shards_messaging','multistaking','rwx_contract','furnace']

let epochEdgeSystemContracts = ['dao_voting','staking']



for(let name of systemContractsNames){

    await import(`./default/${name}.js`).then(contractHandler=>SYSTEM_CONTRACTS.set(name,contractHandler.CONTRACT))

}


for(let name of epochEdgeSystemContracts){

    await import(`./epoch_edge_only/${name}.js`).then(contractHandler=>EPOCH_EDGE_SYSTEM_CONTRACTS.set(name,contractHandler.CONTRACT))

}