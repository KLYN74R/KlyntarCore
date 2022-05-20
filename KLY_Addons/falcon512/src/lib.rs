use pqcrypto_falcon::falcon512::{keypair,sign,open};

use pqcrypto_traits::sign::*;

use hex::encode;




#[no_mangle]
pub extern "C" fn genKeys(){

    println!("Hello, world!");

    let message = vec![0, 1, 2, 3, 4, 5];
    let (pk, sk) = keypair();
    
    println!("Public => {:?}",encode(&PublicKey::as_bytes(&pk)));
    println!("\n\nSecret => {:?}",encode(&SecretKey::as_bytes(&sk)));

    let sm = sign(&message, &sk);

    println!("\n\nSignature => {:?}",encode(&SignedMessage::as_bytes(&sm)));

    let verifiedmsg = open(&sm, &pk).unwrap();

    println!("\n\nVerified => {:?}",verifiedmsg);

}