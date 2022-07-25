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
 *      https://docs.solana.com/developing/clients/jsonrpc-api
 * 
 * ]
 * 
 * 
 *                                                                IMPLEMENTATION OF MONITOR FOR SOLANA TYPE 0(Memo program interaction)
 * 
 */




import Web3 from '@solana/web3.js'

let {PublicKey,Connection}=Web3,

    monitors=new Map()//to allow to monitor from different endpoints of clusters




// {

//     let unique=[]

//     let {URL,TARGET,COMMITMENT} = CONFIG.SYMBIOTE.WORKFLOW_CHECK.HOSTCHAINS.sol
    
//     //Let's use only unique sources
//     if(!unique.includes(URL)){

//         monitors.set(symbiote,new Connection(URL,COMMITMENT))

//         //Set default responder
//         monitors.get(symbiote).onLogs(new PublicKey(TARGET),logs=>{

//             console.log('Logs on Controller',logs)
         
//         })

//     }else{

//          //Set default responder
//          monitors.get(symbiote).onLogs(new PublicKey(TARGET),logs=>{

//             console.log('Logs on Controller',logs)
         
//         })

//     }

// }