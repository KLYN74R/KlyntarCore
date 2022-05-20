use pqcrypto_falcon::falcon512::{keypair,sign,open};

use pqcrypto_traits::sign::*;

use hex::encode;

use js_sys;


#[no_mangle]
pub extern "C" fn generate_falcon() -> js_sys::Uint8Array {

    let (public_key, secret_key) = keypair();
    
    js_sys::Uint8Array::from(&[PublicKey::as_bytes(&public_key),SecretKey::as_bytes(&secret_key)].concat()[..])
    
}


#[no_mangle]
pub extern "C" fn sign_falcon(raw_private:&[u8],data:&[u8]) -> js_sys::Uint8Array{

    //Derive private key
    let private_key=SecretKey::from_bytes(&raw_private).unwrap();

    let signed_message = sign(&data, &private_key);

    js_sys::Uint8Array::from(SignedMessage::as_bytes(&signed_message))

}

#[no_mangle]
pub extern "C" fn verify_falcon(raw_pubkey:&[u8],signa:&[u8]) -> js_sys::Uint8Array {

    //Derive public key & signed message
    let public_key=PublicKey::from_bytes(&raw_pubkey).unwrap();
    let signed_message=SignedMessage::from_bytes(&signa).unwrap();

    //If verified - the initial signed message will be returned
    js_sys::Uint8Array::from(&open(&signed_message,&public_key).unwrap() as &[u8])


}