package main

import (
	kyber512 "github.com/cloudflare/circl/pke/kyber/kyber512" //we will use 512

	"encoding/hex"

	"C"
)

//export genKYBER_PKE
func genKYBER_PKE() *C.char {

	pubKey, privKey, _ := kyber512.GenerateKey(nil)

	//Prepare buffers
	pubBuf := make([]byte, kyber512.PublicKeySize)
	privBuf := make([]byte, kyber512.PrivateKeySize)

	//Serialize to byte[]
	pubKey.Pack(pubBuf)
	privKey.Pack(privBuf)

	return C.CString(hex.EncodeToString(pubBuf) + ":" + hex.EncodeToString(privBuf))

}

//export genKYBER_PKE_ENCRYPT
func genKYBER_PKE_ENCRYPT(hexPubKey *C.char, hexPlainText *C.char) *C.char {

	//______________________________ Prepare public key ______________________________

	pubKeyBuffer, _ := hex.DecodeString(C.GoString(hexPubKey))

	pubKey := kyber512.PublicKey{} //create empty

	pubKey.Unpack(pubKeyBuffer) //unpack bytes

	//_______________________________ Prepare buffers ________________________________

	plainBuf, _ := hex.DecodeString(C.GoString(hexPlainText)) //Up to 32 bytes(kyber512.PlaintextSize) payload

	seedBuf := make([]byte, kyber512.EncryptionSeedSize)

	//Prepare buffer for cipherText
	ct := make([]byte, kyber512.CiphertextSize)

	pubKey.EncryptTo(ct, plainBuf, seedBuf)

	return C.CString(hex.EncodeToString(ct))

}

//export genKYBER_PKE_DECRYPT
func genKYBER_PKE_DECRYPT(hexPrivateKey *C.char, hexCipherText *C.char) *C.char {

	//______________________________ Prepare prviate key ______________________________

	privateKeyBuffer, _ := hex.DecodeString(C.GoString(hexPrivateKey))

	privKey := kyber512.PrivateKey{} //create empty

	privKey.Unpack(privateKeyBuffer) //unpack bytes

	//_______________________________ Prepare buffers ________________________________

	plainBuf := make([]byte, kyber512.PlaintextSize) // 32bytes buffer

	cipherTextBuffer, _ := hex.DecodeString(C.GoString(hexCipherText))

	privKey.DecryptTo(plainBuf, cipherTextBuffer)

	return C.CString(hex.EncodeToString(plainBuf))

}

func main() {}
