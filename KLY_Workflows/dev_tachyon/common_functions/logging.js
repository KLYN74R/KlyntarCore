import {WORKING_THREADS} from '../blockchain_preparation.js'

import {COLORS} from '../../../KLY_Utils/utils.js'

import {CONFIGURATION} from '../../../klyn74r.js'












//Function for pretty output the information about verification thread(VT)
export let VT_STATS_LOG = (epochFullID,shardContext) => {


    if(WORKING_THREADS.VERIFICATION_THREAD.VT_FINALIZATION_STATS[shardContext]){


        let {currentLeaderOnShard,index,hash} = WORKING_THREADS.VERIFICATION_THREAD.VT_FINALIZATION_STATS[shardContext]


        console.log(COLORS.TIME_COLOR,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})`,COLORS.CYAN,'Local VERIFICATION_THREAD state is',COLORS.CLEAR)
    
        console.log('\n')
            
        console.log(` \u001b[38;5;168m│\x1b[33m  Epoch:\x1b[36;1m`,`${epochFullID}`,COLORS.CLEAR)
    
        console.log(` \u001b[38;5;168m│\x1b[33m  SID:\x1b[36;1m`,`${shardContext}:${(WORKING_THREADS.VERIFICATION_THREAD.SID_TRACKER[shardContext]-1)}`,COLORS.CLEAR)
    
        console.log(` \u001b[38;5;168m│\x1b[33m  Current Leader:\x1b[36;1m`,currentLeaderOnShard,COLORS.CLEAR)
    
        console.log(` \u001b[38;5;168m│\x1b[33m  Block index and hash in current epoch:\x1b[36;1m`,index+' : '+hash,COLORS.CLEAR)
    
        console.log('\n')    

    }

}




//Function just for pretty output about information on symbiote
export let BLOCKLOG=(msg,hash,block,epochIndex)=>{


    if(CONFIGURATION.NODE_LEVEL.DAEMON_LOGS){

        let preColor = msg.includes('accepted') ? '\x1b[31m' : '\x1b[32m'

        console.log(COLORS.TIME_COLOR,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})`,COLORS.CYAN,msg,COLORS.CLEAR)

        console.log('\n')
        
        console.log(` ${preColor}│\x1b[33m  ID:\x1b[36;1m`,epochIndex+':'+block.creator+':'+block.index,COLORS.CLEAR)

        console.log(` ${preColor}│\x1b[33m  Hash:\x1b[36;1m`,hash,COLORS.CLEAR)

        console.log(` ${preColor}│\x1b[33m  Txs:\x1b[36;1m`,block.transactions.length,COLORS.CLEAR)

        console.log(` ${preColor}│\x1b[33m  Time:\x1b[36;1m`,new Date(block.time).toString(),COLORS.CLEAR)
    
        console.log('\n')

    }

}