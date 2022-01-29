/**
 * 
 * 
 * .           ..         .           .       .           .           .
      .         .            .          .       .
            .         ..xxxxxxxxxx....               .       .             .
    .             MWMWMWWMWMWMWMWMWMWMWMWMW                       .
              IIIIMWMWMWMWMWMWMWMWMWMWMWMWMWMttii:        .           .
 .      IIYVVXMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWxx...         .           .
     IWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMx..
   IIWMWMWMWMWMWMWMWMWBY%ZACH%AND%OWENMWMWMWMWMWMWMWMWMWMWMWMWMx..        .
    ""MWMWMWMWMWM"""""""".  .:..   ."""""MWMWMWMWMWMWMWMWMWMWMWMWMWti.
 .     ""   . `  .: . :. : .  . :.  .  . . .  """"MWMWMWMWMWMWMWMWMWMWMWMWMti=
        . .   :` . :   .  .'.' '....xxxxx...,'. '   ' ."""YWMWMWMWMWMWMWMWMWMW+
     ; . ` .  . : . .' :  . ..XXXXXXXXXXXXXXXXXXXXx.    `     . "YWMWMWMWMWMWMW
.    .  .  .    . .   .  ..XXXXXXXXWWWWWWWWWWWWWWWWXXXX.  .     .     """""""
        ' :  : . : .  ...XXXXXWWW"   W88N88@888888WWWWWXX.   .   .       . .
   . ' .    . :   ...XXXXXXWWW"    M88N88GGGGGG888^8M "WMBX.          .   ..  :
         :     ..XXXXXXXXWWW"     M88888WWRWWWMW8oo88M   WWMX.     .    :    .
           "XXXXXXXXXXXXWW"       WN8888WWWWW  W8@@@8M    BMBRX.         .  : :
  .       XXXXXXXX=MMWW":  .      W8N888WWWWWWWW88888W      XRBRXX.  .       .
     ....  ""XXXXXMM::::. .        W8@889WWWWWM8@8N8W      . . :RRXx.    .
         ``...'''  MMM::.:.  .      W888N89999888@8W      . . ::::"RXV    .  :
 .       ..'''''      MMMm::.  .      WW888N88888WW     .  . mmMMMMMRXx
      ..' .            ""MMmm .  .       WWWWWWW   . :. :,miMM"""  : ""`    .
   .                .       ""MMMMmm . .  .  .   ._,mMMMM"""  :  ' .  :
               .                  ""MMMMMMMMMMMMM""" .  : . '   .        .
          .              .     .    .                      .         .
.                                         .          .         .


 * LINKS:[
 * 
 *      https://docs.solana.com/developing/clients/jsonrpc-api
 * 
 * ]
 * 
 */




import Web3 from '@solana/web3.js'

let {Keypair,PublicKey}=Web3,
 
connection = new Web3.Connection('https://api.testnet.solana.com', "confirmed"),
    

    account = Keypair.fromSecretKey(new Uint8Array([
     
        247, 232,  89, 246, 163, 7,  88, 188, 117, 117, 233,
        50, 250, 146, 249, 221,  10,  67, 118,  49, 194,  96,
        247, 109, 159, 146,  19, 200, 127,   7, 155,  52, 109,
        153,  94,  32, 123, 142,  19,  21,  42,  28, 148, 229,
        234, 243, 233, 183, 137, 176,  73, 163, 180, 240, 247,
        52, 253, 236, 102,  39, 244, 121,  16, 235
     
    ])),
 
    PUBKEY=new PublicKey(account.publicKey.toString())
 
 


// console.log(account.publicKey)
// console.log(PUBKEY)
 
 
//Handle logs which specific address left
connection.onLogs(account.publicKey,logs=>{
    
    console.log('Logs on 1',logs)
 
})


connection.onLogs(new PublicKey('DctKyjEtYc1JE99oJ9qaZvWj35ViTUe7L79dr5gEqBxM'),logs=>{
    
    console.log('Logs on 2',logs)
 
})
