import splToken from '@solana/spl-token'

import web3 from '@solana/web3.js'



//Create connection to devnet
const connection = new web3.Connection(web3.clusterApiUrl("devnet"));

//Generate keypair and airdrop 1000000000 Lamports (1 SOL)
const myKeypair = web3.Keypair.fromSecretKey(new Uint8Array(Buffer.from('9+hZ9qMHWLx1deky+pL53QpDdjHCYPdtn5ITyH8HmzRtmV4ge44TFSoclOXq8+m3ibBJo7Tw9zT97GYn9HkQ6w==','base64')))

//await connection.requestAirdrop(myKeypair.publicKey,1000000000);



// console.log('Solana public address: ' + myKeypair.publicKey.toBase58());

// console.log(splToken.TOKEN_PROGRAM_ID.toBase58())



//set timeout to account for airdrop finalization


// setTimeout(async function(){ 
//     //create mint

//     let mint;
//     let myToken;

//     mint = await splToken.Token.createMint(connection, myKeypair, myKeypair.publicKey, null, 9, splToken.TOKEN_PROGRAM_ID)

//     console.log('mint public address: ' + mint.publicKey.toBase58());

//     //get the token accont of this solana address, if it does not exist, create it
//     myToken = await mint.getOrCreateAssociatedAccountInfo(
//         myKeypair.publicKey
//     )
//     console.log('token public address: ' + myToken.address.toBase58());
//     //minting 100 new tokens to the token address we just created
//     await mint.mintTo(myToken.address, myKeypair.publicKey, [], 1000000000);
//     console.log('done');


// }, 20000);


import {TOKEN_PROGRAM_ID} from '@solana/spl-token'
import {PublicKey} from '@solana/web3.js'



//PubKey of Associated Token Program https://explorer.solana.com/address/ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
let SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),

    YOUR_DEFAULT_SOL_ADDRESS='8Yq9pShNeX2TRiQkYy9wtwkGkuvg6hMaABTtF4bABHwy',

    TOKEN_ADDRESS='FegNAjg6qb62G6qaZGq8BQ5Lb8JyLcN2Xt6TRtfWgsS7',


findAssociatedTokenAddress=async(address,tokenAddress)=>
    
    PublicKey.findProgramAddress(
        [
            new PublicKey(address).toBuffer(),//your default Solana address to transform to Associated token address(ATA)
            
            TOKEN_PROGRAM_ID.toBuffer(),//address of token program
            
            new PublicKey(tokenAddress).toBuffer(),//address of token
        
        ],SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    
    ).then(result=>result[0])




console.log(`Associated Token Address for token ${TOKEN_ADDRESS} => ${(await findAssociatedTokenAddress(YOUR_DEFAULT_SOL_ADDRESS,TOKEN_ADDRESS)).toBase58()}`)




// import * as web3 from '@solana/web3.js';
// import * as splToken from '@solana/spl-token';


// splToken.
 
//  const getProvider = async () => {
//     if ("solana" in window) {
//       const provider = window.solana;
//       if (provider.isPhantom) {
//         console.log("Is Phantom installed?  ", provider.isPhantom);
//         return provider;
//       }
//     } else {
//       window.open("https://www.phantom.app/", "_blank");
//     }
//   };

// const mintingTest = async () => {
//     const phantomProvider = await getProvider();
//     const mintRequester = await phantomProvider.publicKey;
//     console.log("Public key of the mint Requester: ", mintRequester.toString());

//     //To connect to the mainnet, write mainnet-beta instead of devnet
//     const connection = new web3.Connection(
//       web3.clusterApiUrl('devnet'),
//       'confirmed',
//     );

//     //This fromWallet is your minting wallet, that will actually mint the tokens
//     var fromWallet = web3.Keypair.generate();
     
//     // Associate the mintRequester with this wallet's publicKey and privateKey
//     // This is basically the credentials that the mintRequester (creator) would require whenever they want to mint some more tokens
//    // Testing the parameters of the minting wallet
   
//     console.log("Creator's Minting wallet public key: ",fromWallet.publicKey.toString());
//     console.log(fromWallet.secretKey.toString());
    
//     // Airdrop 1 SOL to the minting wallet to handle the minting charges
//     var fromAirDropSignature = await connection.requestAirdrop(
//       fromWallet.publicKey,
//       web3.LAMPORTS_PER_SOL,
//     );

//     await connection.confirmTransaction(fromAirDropSignature);
//     console.log("Airdropped (transferred) 1 SOL to the fromWallet to carry out minting operations");

//     // This createMint function returns a Promise <Token>
//     let mint = await splToken.Token.createMint(
//       connection,
//       fromWallet,
//       fromWallet.publicKey,
//       null,
//       6, // Number of decimal places in your token
//       splToken.TOKEN_PROGRAM_ID,
//     );

//     // getting or creating (if doens't exist) the token address in the fromWallet address
//     // fromTokenAccount is essentially the account *inside* the fromWallet that will be able to handle the              new token that we just minted
//     let fromTokenAccount = await mint.getOrCreateAssociatedAccountInfo(
//       fromWallet.publicKey,
//     );

//     // getting or creating (if doens't exist) the token address in the toWallet address
//     // toWallet is the creator: the og mintRequester
//     // toTokenAmount is essentially the account *inside* the mintRequester's (creator's) wallet that will be able to handle the new token that we just minted
//     let toTokenAccount = await mint.getOrCreateAssociatedAccountInfo(
//       mintRequester,
//     );
    
//     // // Minting 1 token
//     await mint.mintTo(
//       fromTokenAccount.address,
//       fromWallet.publicKey,
//       [],
//       1000000 // 1 followed by decimals number of 0s // You'll ask the creator ki how many decimals he wants in his token. If he says 4, then 1 token will be represented as 10000
//     );
    
//     console.log("Initial mint successful");

    
//     // This transaction is sending of the creator tokens(tokens you just created) from their minting wallet to their Phantom Wallet
//     var transaction = new web3.Transaction().add(
//       splToken.Token.createTransferInstruction(
//         splToken.TOKEN_PROGRAM_ID,
//         fromTokenAccount.address,
//         toTokenAccount.address,
//         fromWallet.publicKey,
//         [],
//         1000000, // This is transferring 1 token, not 1000000 tokens
//       ),
//     );
        
//     var signature = await web3.sendAndConfirmTransaction(
//       connection,
//       transaction,
//       [fromWallet],
//       {commitment: 'confirmed'},
//     );

//     const creatorTokenAddress = mint.publicKey;
//     const creatorTokenAddressString = mint.publicKey.toString();

//     console.log("SIGNATURE: ", signature); //Signature is basically like the paying party signs a transaction with their key.
//     console.log("Creator Token Address: ", creatorTokenAddressString);
//     console.log("Creator Minting Wallet Address: ", mint.payer.publicKey.toString());
    
//     let creatorTokenBalance = await toTokenAccount.amount;
//     console.log("Creator's Token Balance: ", creatorTokenBalance);
//   };