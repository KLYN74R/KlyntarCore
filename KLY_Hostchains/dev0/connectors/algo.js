/*

 ██████╗ ██████╗ ███╗   ███╗██╗███╗   ██╗ ██████╗     ███████╗ ██████╗  ██████╗ ███╗   ██╗             
██╔════╝██╔═══██╗████╗ ████║██║████╗  ██║██╔════╝     ██╔════╝██╔═══██╗██╔═══██╗████╗  ██║             
██║     ██║   ██║██╔████╔██║██║██╔██╗ ██║██║  ███╗    ███████╗██║   ██║██║   ██║██╔██╗ ██║             
██║     ██║   ██║██║╚██╔╝██║██║██║╚██╗██║██║   ██║    ╚════██║██║   ██║██║   ██║██║╚██╗██║             
╚██████╗╚██████╔╝██║ ╚═╝ ██║██║██║ ╚████║╚██████╔╝    ███████║╚██████╔╝╚██████╔╝██║ ╚████║    ██╗██╗██╗
 ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝     ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝    ╚═╝╚═╝╚═╝



@via https://patorjk.com/software/taag/   STYLE:ANSI Shadow


Links:[

    
    https://developer.algorand.org/docs/
    https://developer.algorand.org/docs/run-a-node/reference/relay/
    https://developer.algorand.org/docs/sdks/javascript/
    https://testnet.algoexplorer.io/
    https://github.com/algorand/go-algorand


]


Testnet txs pool:[


    AFVFITWEGXXQOQG7WYVZFIJZ3HE4OG5LV2HT3O7STOWPWFUM4IVA - transfer 1 Algo to 2nd account with note of block 6897 on kNULL chain
    HSLP3PI6D7M6CYEKJ7TF4PMCTOZJCGIXQLTGNDD77U6W3NCI25TA - useful.txt commit


]

*/


import algosdk from 'algosdk'


export default {


    checkCommit:(hostChainHash,blockIndex,klyntarHash)=>{

    },

    makeCommit:(blockIndex,klyntarHash)=>{
        
    },


    //Only for Controller(at least in first releases)
    changeManifest:manifest=>{

    }
}