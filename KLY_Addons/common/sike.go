package main

import (
	
	"github.com/cloudflare/circl/dh/sidh"
    
	"encoding/hex"

	"crypto/rand"

	"C"

)



//export genSIKE
func genSIKE() *C.char{
	
    prv := sidh.NewPrivateKey(sidh.Fp503, sidh.KeyVariantSike)
    pub := sidh.NewPublicKey(sidh.Fp503, sidh.KeyVariantSike)

    prv.Generate(rand.Reader)
    prv.GeneratePublicKey(pub)

	prvKeyBytes := make([]byte,prv.Size())
	pubKeyBytes := make([]byte,pub.Size())

	prv.Export(prvKeyBytes)
	pub.Export(pubKeyBytes)

	return C.CString(hex.EncodeToString(pubKeyBytes)+":"+hex.EncodeToString(prvKeyBytes))	

}




//export encSIKE
func encSIKE(friendPubHex *C.char,myPrivateHex *C.char)*C.char{

	//________________ IMPORT MY CREDENTIALS _____________________

	myPrv := sidh.NewPrivateKey(sidh.Fp503, sidh.KeyVariantSike)
    myPub := sidh.NewPublicKey(sidh.Fp503, sidh.KeyVariantSike)

	//Prepare buffer to import private key
	prvKeyBytes,_:=hex.DecodeString(C.GoString(myPrivateHex))

	myPrv.Import(prvKeyBytes)
	myPrv.GeneratePublicKey(myPub)

	//______________ RECOVER FRIEND'S PUBKEY ____________________

    friendPub := sidh.NewPublicKey(sidh.Fp503, sidh.KeyVariantSike)

	friendPubKeyBytes,_:=hex.DecodeString(C.GoString(friendPubHex))

	friendPub.Import(friendPubKeyBytes)


	//_________ PREPARATION TO GET COMMON SECRET ________________

	// Initialize internal KEM structures
	var kem = sidh.NewSike503(rand.Reader)

	//Prepare empty buffers
    cipherText := make([]byte, kem.CiphertextSize())
    secret := make([]byte, kem.SharedSecretSize())


    kem.Encapsulate(cipherText,secret,friendPub)

	return C.CString(hex.EncodeToString(secret)+":"+hex.EncodeToString(cipherText))

}



//export decSIKE
func decSIKE(friendPubHex *C.char,myPrivateHex *C.char,cipherTextHex *C.char)*C.char{

	//________________ IMPORT MY CREDENTIALS _____________________

	myPrv := sidh.NewPrivateKey(sidh.Fp503, sidh.KeyVariantSike)
    myPub := sidh.NewPublicKey(sidh.Fp503, sidh.KeyVariantSike)

	//Prepare buffer to import private key
	prvKeyBytes,_:=hex.DecodeString(C.GoString(myPrivateHex))

	myPrv.Import(prvKeyBytes)
	myPrv.GeneratePublicKey(myPub)

	//______________ RECOVER FRIEND'S PUBKEY ____________________

    friendPub := sidh.NewPublicKey(sidh.Fp503, sidh.KeyVariantSike)

	friendPubKeyBytes,_:=hex.DecodeString(C.GoString(friendPubHex))

	friendPub.Import(friendPubKeyBytes)


	//_________ PREPARATION TO GET COMMON SECRET ________________

	// Initialize internal KEM structures
	var kem = sidh.NewSike503(rand.Reader)

	//Prepare empty buffers
    cipherText,_:=hex.DecodeString(C.GoString(cipherTextHex))

    secret := make([]byte, kem.SharedSecretSize())

    kem.Decapsulate(secret,myPrv,myPub,cipherText)

	return C.CString(hex.EncodeToString(secret))

}

func main() {}