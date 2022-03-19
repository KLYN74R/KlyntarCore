package main

import (

    "github.com/cloudflare/circl/dh/csidh"

    "encoding/hex"

    "crypto/rand"

    "C"

)

var rng = rand.Reader




//export genCSIDH
func genCSIDH()*C.char{

    var priv csidh.PrivateKey
    var pub  csidh.PublicKey


    csidh.GeneratePrivateKey(&priv,rng)
    csidh.GeneratePublicKey(&pub,&priv,rng)

    //Create buffers to export creds
    exprtPub:= make([]byte,64);
    exprtPriv:= make([]byte,37);

    //Make export
    pub.Export(exprtPub);
    priv.Export(exprtPriv);

    return C.CString(hex.EncodeToString(exprtPub)+":"+hex.EncodeToString(exprtPriv))

}



//export getCSIDH
func getCSIDH(friendPub *C.char,myPrivate *C.char)*C.char{

    friendPubBytes,_:=hex.DecodeString(C.GoString(friendPub));
    myPrivBytes,_:=hex.DecodeString(C.GoString(myPrivate));

    var derivedPub csidh.PublicKey
    var derivedPriv csidh.PrivateKey

    //Common shared secret
    var secret [64]byte

    derivedPub.Import(friendPubBytes);
    derivedPriv.Import(myPrivBytes);

    csidh.DeriveSecret(&secret,&derivedPub,&derivedPriv,rng)

    return C.CString(hex.EncodeToString(secret[:]))

}


func main() {}