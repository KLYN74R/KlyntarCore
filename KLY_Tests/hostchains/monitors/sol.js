/**
 * 
 * 
 * 
 * LINKS:[
 * 
 *      https://docs.solana.com/developing/clients/jsonrpc-api
 * 
 * ]
 * 
 */



import Web3 from '@solana/web3.js'


let {Keypair,PublicKey,Connection} = Web3,

    connection = new Connection('https://api.testnet.solana.com', "confirmed"),//or use your own RPC and commitment level(I use <confirmed> as default)

    account = Keypair.fromSecretKey(new Uint8Array([])),//if you want to track your acccounts-you can get PubKey via Private

    PUBKEY = new PublicKey(account.publicKey.toString())//Or decode pubkey from base58 address





/*


👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️
👁️‍🗨️                         Handle logs which specific address left                               👁️‍🗨️
👁️‍🗨️                         Might be user address,program,token,etc.                              👁️‍🗨️
👁️‍🗨️                         Get pubkey via new PublicKey(<ADDRESS IN BASE58>)                     👁️‍🗨️
👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️👁️‍🗨️


*/
connection.onLogs(account.publicKey,(logs,ctx)=>{
  
    console.log('Logs ',logs)//Retrieve useful logs from there
    
    console.log('Ctx ',ctx)//Mostly useless

})