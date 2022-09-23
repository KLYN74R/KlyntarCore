import algosdk from 'algosdk'



export default () => {
    
    let indexer_token = "",
    
    indexer_server = "https://algoindexer.testnet.algoexplorerapi.io",

    indexer_port = 443,

    indexerClient = new algosdk.Indexer(indexer_token,indexer_server,indexer_port)

}