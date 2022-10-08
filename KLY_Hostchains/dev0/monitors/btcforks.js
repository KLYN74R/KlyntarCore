/**
 * 
 * 
 *                                                            * .           ..         .           .       .           .           .
 *                                                                 .         .            .          .       .
 *                                                                       .         ..xxxxxxxxxx....               .       .             .
 *                                                               .             MWMWMWWMWMWMWMWMWMWMWMWMW                       .
 *                                                                         IIIIMWMWMWMWMWMWMWMWMWMWMWMWMWMttii:        .           .
 *                                                            .      IIYVVXMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWxx...         .           .
 *                                                                IWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMx..
 *                                                              IIWMWMWMWMWMWMWMWMWBY%ZACH%AND%OWENMWMWMWMWMWMWMWMWMWMWMWMWMx..        .
 *                                                               ""MWMWMWMWMWM"""""""".  .:..   ."""""MWMWMWMWMWMWMWMWMWMWMWMWMWti.
 *                                                            .     ""   . `  .: . :. : .  . :.  .  . . .  """"MWMWMWMWMWMWMWMWMWMWMWMWMti=
 *                                                                   . .   :` . :   .  .'.' '....xxxxx...,'. '   ' ."""YWMWMWMWMWMWMWMWMWMW+
 *                                                                ; . ` .  . : . .' :  . ..XXXXXXXXXXXXXXXXXXXXx.    `     . "YWMWMWMWMWMWMW
 *                                                           .    .  .  .    . .   .  ..XXXXXXXXWWWWWWWWWWWWWWWWXXXX.  .     .     """""""
 *                                                                   ' :  : . : .  ...XXXXXWWW"   W88N88@888888WWWWWXX.   .   .       . .
 *                                                              . ' .    . :   ...XXXXXXWWW"    M88N88GGGGGG888^8M "WMBX.          .   ..  :
 *                                                                    :     ..XXXXXXXXWWW"     M88888WWRWWWMW8oo88M   WWMX.     .    :    .
 *                                                                      "XXXXXXXXXXXXWW"       WN8888WWWWW  W8@@@8M    BMBRX.         .  : :
 *                                                             .       XXXXXXXX=MMWW":  .      W8N888WWWWWWWW88888W      XRBRXX.  .       .
 *                                                                ....  ""XXXXXMM::::. .        W8@889WWWWWM8@8N8W      . . :RRXx.    .
 *                                                                    ``...'''  MMM::.:.  .      W888N89999888@8W      . . ::::"RXV    .  :
 *                                                            .       ..'''''      MMMm::.  .      WW888N88888WW     .  . mmMMMMMRXx
 *                                                                 ..' .            ""MMmm .  .       WWWWWWW   . :. :,miMM"""  : ""`    .
 *                                                              .                .       ""MMMMmm . .  .  .   ._,mMMMM"""  :  ' .  :
 *                                                                          .                  ""MMMMMMMMMMMMM""" .  : . '   .        .
 *                                                                     .              .     .    .                      .         .
 *                                                           .                                         .          .         .
 *           
 * 
 * 👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️                                                
 *
 * LINKS:[
 * 
 *      https://developer.bitcoin.org/reference/rpc/
 * 
 * ]
 * 
 * 
 *                                                                IMPLEMENTATION OF MONITOR FOR BTC & FORKS TYPE 0(via checkpoints in OP_RETURN)
 * 
 */



/*

!REQUIRED OPTIONS TO USE MONITOR:

    ?URL:"http://youhostchainnode:<port>", - URL for node which accept RPC, API calls to query data. It might be your own node, NaaS service, "trusted" gateway, your own gateway which take info from several sources and so on

    ?MODE:"PARANOIC" | "TRUST" - behavior for monitor. PARANOIC - you'll track hostchains on your own, block by block to make sure everything is ok. TRUST - you just ask another "trusted" instance about checkpoints

    ?CREDS:"Vlad:Password" - string with BasicAuth creds, token or smth like this

    ?START_FROM:13371337 - height to start to monitor from

    ?FIRST_BLOCK_FIND_STEP:30 - step to find first block of the day to track changes in quorum


*/

import {getBlockByIndex,getTransaction,getBestBlockHash,getBlockByHash} from '../connectors/btcForksCommon.js'

import {LOG} from '../../../KLY_Utils/utils.js'




let FIND_FIRST_BLOCK_OF_DAY = async btcFork => {

    let startOfDay = new Date()
        
    startOfDay.setUTCHours(0,0,0,0)

    let dayStartTimestampInSeconds=startOfDay.getTime()/1000,

        bestBlock = await getBlockByHash('ltc',await getBestBlockHash('ltc',true),true).catch(e=>false),

        step = CONFIG.SYMBIOTE.MONITORS[btcFork].FIRST_BLOCK_FIND_STEP,

        candidateIndex = bestBlock.height - step



    if(candidateIndex<0) candidateIndex = 0
    
    //Go through the chain from the top block to the latest block yesterday(UTC)

    while(true){

        let candidate = await getBlockByIndex('ltc',candidateIndex,true).catch(e=>console.log('ERR ',e))

        if(candidate.time>=dayStartTimestampInSeconds){

            if(candidateIndex===0) return candidate //if even the initial block(0 in probably all the cryptos,at least in EVM compatible) was generated today - no sense to assume that there is earlier blocks

            candidateIndex-=step

            if(candidateIndex<0) candidateIndex = 0

        }else{

            let possibleIndex = candidate.height

            //Start another reversed cycle to find really first block
            while(true){

                let block = await getBlockByIndex('ltc',possibleIndex,true).catch(e=>false)

                if(block.time>=dayStartTimestampInSeconds) return block
                
                else possibleIndex++

            }

        }

    }

}




export default (btcFork) => {

    let configs = CONFIG.SYMBIOTE.MONITORS[btcFork]

    if(configs.MODE==='PARANOIC'){

        FIND_FIRST_BLOCK_OF_DAY(btcFork).then(block=>console.log(block))

        setInterval(()=>{

            console.log(SYMBIOTE_META.VERIFICATION_THREAD)

        },3000)

    }else if(configs.MODE==='TRUST'){

        //Ask some node(or gateway) about commits to avoid enumerating itself

        setInterval(()=>{

            console.log(SYMBIOTE_META.VERIFICATION_THREAD)

        },3000)

    }

}