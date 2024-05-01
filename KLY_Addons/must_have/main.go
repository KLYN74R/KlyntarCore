/*


                Links:

https://github.com/LoCCS/bliss/search?q=entropy
https://github.com/LoCCS/bliss


*/

package main

import (
	"crypto/ed25519"
	"syscall/js"

	"github.com/btcsuite/btcutil/base58"
	"github.com/cloudflare/circl/sign/dilithium"

	"github.com/LoCCS/bliss/sampler"

	"github.com/LoCCS/bliss"

	"encoding/base64"
	"encoding/hex"

	"math/rand"

	"time"
)

//______________________________ Dilithium ______________________________

var modename string = "Dilithium5" // Dilithium2-AES Dilithium3 Dilithium3-AES Dilithium5 Dilithium5-AES

var mode = dilithium.ModeByName(modename)

func generateDilithiumKeypair(this js.Value, args []js.Value) interface{} {

	publicKey, privateKey, _ := mode.GenerateKey(nil)

	return hex.EncodeToString(publicKey.Bytes()) + ":" + hex.EncodeToString(privateKey.Bytes())

}

/*
0 - privateKey
1 - message
*/
func generateDilithiumSignature(this js.Value, args []js.Value) interface{} {

	privateKeyAsBytes, _ := hex.DecodeString(args[0].String())

	msg := []byte(args[1].String())

	return hex.EncodeToString(mode.Sign(mode.PrivateKeyFromBytes(privateKeyAsBytes), msg))

}

/*
0 - message that was signed
1 - pubKey
2 - signature
*/
func verifyDilithiumSignature(this js.Value, args []js.Value) interface{} {

	msg := []byte(args[0].String())

	publicKeyAsBytes, _ := hex.DecodeString(args[1].String())

	signatureAsBytes, _ := hex.DecodeString(args[2].String())

	return mode.Verify(mode.PublicKeyFromBytes(publicKeyAsBytes), msg, signatureAsBytes)

}

//________________________________ BLISS ________________________________

func generateBlissKeypair(this js.Value, args []js.Value) interface{} {

	rand.Seed(time.Now().UnixNano())

	seed := make([]byte, sampler.SHA_512_DIGEST_LENGTH)

	rand.Read(seed)

	entropy, _ := sampler.NewEntropy(seed)

	prv, _ := bliss.GeneratePrivateKey(0, entropy)

	pub := prv.PublicKey()

	return hex.EncodeToString(pub.Encode()) + ":" + hex.EncodeToString(seed)

}

/*
0 - privateKey
1 - message
*/
func generateBlissSignature(this js.Value, args []js.Value) interface{} {

	// Decode msg an seed => entropy => privateKey

	sid, _ := hex.DecodeString(args[0].String())

	msg := []byte(args[1].String())

	seed := []byte(sid) // uint8/byte array

	entropy, _ := sampler.NewEntropy(seed)

	key, _ := bliss.GeneratePrivateKey(0, entropy)

	// Generate signature
	sig, _ := key.Sign(msg, entropy)

	return hex.EncodeToString(sig.Encode())

}

/*
0 - message
1 - publicKey
2 - signature
*/
func verifyBlissSignature(this js.Value, args []js.Value) interface{} {

	// Decode msg and publicKey
	msg := []byte(args[0].String())

	publicKeyAsBytes, _ := hex.DecodeString(args[1].String())

	publicKey, _ := bliss.DecodePublicKey(publicKeyAsBytes)

	// Decode signature
	signatureAsBytes, _ := hex.DecodeString(args[2].String())

	signature, _ := bliss.DecodeSignature(signatureAsBytes)

	//Verification itself
	_, err := publicKey.Verify(msg, signature)

	return err == nil

}

/*

0 - private key in hex
1 - msg to sign

*/

func generateEd25519Signature(this js.Value, args []js.Value) interface{} {

	privateKeyAsBytes, _ := hex.DecodeString(args[0].String())

	msgAsBytes := []byte(args[1].String())

	privateKeyFromSeed := ed25519.NewKeyFromSeed(privateKeyAsBytes)

	return base64.StdEncoding.EncodeToString(ed25519.Sign(privateKeyFromSeed, msgAsBytes))

}

/*
0 - message that was signed
1 - pubKey
2 - signature
*/
func verifyEd25519Signature(this js.Value, args []js.Value) interface{} {

	// Decode msg and publicKey
	msgAsBytes := []byte(args[0].String())

	publicKeyAsBytes := base58.Decode(args[1].String())

	signature, _ := base64.StdEncoding.DecodeString(args[2].String())

	return ed25519.Verify(publicKeyAsBytes, msgAsBytes, signature)

}

func main() {

	js.Global().Set("generateDilithiumKeypair", js.FuncOf(generateDilithiumKeypair))

	js.Global().Set("generateDilithiumSignature", js.FuncOf(generateDilithiumSignature))

	js.Global().Set("verifyDilithiumSignature", js.FuncOf(verifyDilithiumSignature))

	js.Global().Set("generateBlissKeypair", js.FuncOf(generateBlissKeypair))

	js.Global().Set("generateBlissSignature", js.FuncOf(generateBlissSignature))

	js.Global().Set("verifyBlissSignature", js.FuncOf(verifyBlissSignature))

	js.Global().Set("generateEd25519Signature", js.FuncOf(generateEd25519Signature))

	js.Global().Set("verifyEd25519Signature", js.FuncOf(verifyEd25519Signature))

	<-make(chan bool)

}
