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
 *                                                                IMPLEMENTATION OF MONITOR FOR BTC & FORKS TYPE 0(via tracks in OP_RETURN)
 * 
 */


/*

REQUIRED OPTIONS TO USE MONITOR:

    URL:"http://youhostchainnode:<port>", - URL for node which accept RPC, API calls to query data. It might be your own node, NaaS service, "trusted" gateway, your own gateway which take info from several sources and so on

    MODE:"FULL" | "TRUST" - behavior for monitor. FULL - you'll track hostchains on your own, block by block to make sure everything is ok. TRUST - you just ask another "trusted" instance about checkpoints


OPTIONAL

    TARGET:"<address or contract to track>"

*/

import {getBlockByIndex,getTransaction} from '../connectors/btcForksCommon.js'

export default (btcFork) => {

    let configs = CONFIG.SYMBIOTE.MONITORING.HOSTCHAINS[btcFork]

    if(configs.MODE==='FULL'){

        //Check entire blockthread
        setInterval(()=>{

            getBlockByIndex(btcFork,1000000).then(block=>{
    
                block.tx.forEach(async hash=>{
    
                    let tx = await getTransaction(btcFork,hash)
    
                    console.log(tx)
    
                })
    
            })
    
        },3000)
    

    }else if(configs.MODE==='TRUST'){

        //Ask some node(or gateway) about commits to avoid enumerating itself

        setInterval(()=>{})

    }

}