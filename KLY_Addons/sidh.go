package main

import (

    "github.com/cloudflare/circl/dh/sidh"

    "crypto/rand"

    "encoding/hex"

    "C"
)



//export genSIDH
func genSIDH(keyType *C.char) *C.char{

    var keyTyp sidh.KeyVariant;

    if(C.GoString(keyType)=="A"){

        keyTyp=sidh.KeyVariantSidhA

    }else {
        keyTyp=sidh.KeyVariantSidhB
    }


    prv := sidh.NewPrivateKey(sidh.Fp503,keyTyp)
    pub := sidh.NewPublicKey(sidh.Fp503,keyTyp)

    prv.Generate(rand.Reader)
    prv.GeneratePublicKey(pub)

    prvKeyBytes := make([]byte,prv.Size())
    pubKeyBytes := make([]byte,pub.Size())

    prv.Export(prvKeyBytes)
    pub.Export(pubKeyBytes)

    return C.CString(hex.EncodeToString(pubKeyBytes)+":"+hex.EncodeToString(prvKeyBytes))

}



//export getSIDH
func getSIDH(myKeyType *C.char,friendPubHex *C.char,myPrivateHex *C.char) *C.char{


    var myType,friendType sidh.KeyVariant;

    if(C.GoString(myKeyType)=="A"){

        myType=sidh.KeyVariantSidhA
        friendType=sidh.KeyVariantSidhB

    }else {

        myType=sidh.KeyVariantSidhB
        friendType=sidh.KeyVariantSidhA

    }


    //________________ IMPORT MY CREDENTIALS _____________________

    myPrv := sidh.NewPrivateKey(sidh.Fp503, myType)
    myPub := sidh.NewPublicKey(sidh.Fp503, myType)

    //Prepare buffer to import private key
    prvKeyBytes,_:=hex.DecodeString(C.GoString(myPrivateHex))

    myPrv.Import(prvKeyBytes)
    myPrv.GeneratePublicKey(myPub)

    //______________ RECOVER FRIEND'S PUBKEY ____________________

    friendPub := sidh.NewPublicKey(sidh.Fp503,friendType)

    friendPubKeyBytes,_:=hex.DecodeString(C.GoString(friendPubHex))

    friendPub.Import(friendPubKeyBytes)


    //____________________ GET SECRET ___________________________


    secret := make([]byte, myPrv.SharedSecretSize())

    myPrv.DeriveSecret(secret[:],friendPub)

    return C.CString(hex.EncodeToString(secret))

}

func main() {}