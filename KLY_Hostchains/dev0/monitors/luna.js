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
 *      https://github.com/terra-money/terra.js/wiki/WebSockets
 *      https://docs.terra.money/index.html
 * 
 * ]
 * 
 * 
 *                                                                IMPLEMENTATION OF MONITOR FOR LUNA TYPE 0(via tracks in txs)
 * 
 */




import { LocalTerra, WebSocketClient } from '@terra-money/terra.js';

const wsclient = new WebSocketClient('ws://bombay-lcd.terra.dev/websocket');
 
const terra = new LocalTerra();
 
let count = 0;

wsclient.subscribe('NewBlock',{},_=>{
  
    console.log(count)

    count += 1
 
    if (count === 3) wsclient.destroy()

})


//Subscribe to events
wsclient.subscribe('Tx',{'message.action':'send'},data=>{
  
    console.log('Send occured!');
    console.log(data.value);
 
});