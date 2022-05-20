package main

import (
	
	kyber512 "github.com/cloudflare/circl/pke/kyber/kyber512"//we will use 512

	"encoding/hex"
	"C"
)



//export genKYBER_PKE 
func genKYBER_PKE() {

	pubKey, privKey, _ := kyber512.GenerateKey(nil)

	//Prepare buffers
	pubBuf := make([]byte, kyber512.PublicKeySize)
	privBuf := make([]byte, kyber512.PrivateKeySize)

	//Serialize to byte[]
	pubKey.Pack(pubBuf)
	privKey.Pack(privBuf)

	return C.CString(hex.EncodeToString(pubKey)+":"+hex.EncodeToString(privKey))

}

//export genKYBER_PKE_ENCRYPT
func genKYBER_PKE_ENCRYPT() {

}

//export genKYBER_PKE_DECRYPT
func genKYBER_PKE_DECRYPT() {

}


	pubKey, privKey, _ := kyber512.GenerateKey(nil)

	pubBuf := make([]byte, kyber512.PublicKeySize)

	privBuf := make([]byte, kyber512.PrivateKeySize)

	pubKey.Pack(pubBuf)
	privKey.Pack(privBuf)

	// fmt.Println("Pub ", hex.EncodeToString(pubBuf))
	// fmt.Println("\n\n Prv ", hex.EncodeToString(privBuf))

	//////////////////////////////////// ENCRYPTION TEST ///////////////////////////

	plainBuf := make([]byte, kyber512.PlaintextSize)
	plainBuf[0] = 13
	seedBuf := make([]byte, kyber512.EncryptionSeedSize)
	ct := make([]byte, kyber512.CiphertextSize)

	pubKey.EncryptTo(ct, plainBuf, seedBuf)

	// fmt.Println("\n\n Encrypted via PubKey ", hex.EncodeToString(ct))

	//////////////////////////////////// DECRYPTION TEST ///////////////////////////

	privKey.DecryptTo(plainBuf, ct)
	// fmt.Println("\n\n Decrypted via PrivKey ", hex.EncodeToString(plainBuf))

func main() {}
