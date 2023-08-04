/*


                Links:

https://github.com/LoCCS/bliss/search?q=entropy
https://github.com/LoCCS/bliss


*/

package main

import (
	"github.com/cloudflare/circl/sign/dilithium"

	"github.com/LoCCS/bliss/sampler"

	"github.com/LoCCS/bliss"

	"encoding/hex"

	"syscall/js"

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

	privateKey, _ := hex.DecodeString(args[0].String())

	msg := []byte(args[1].String())

	return hex.EncodeToString(mode.Sign(mode.PrivateKeyFromBytes(privateKey), msg))

}

/*

0 - message that was signed
1 - pubKey
2 - signature

*/
func verifyDilithiumSignature(this js.Value, args []js.Value) interface{} {

	msg := []byte(args[0].String())

	publicKey, _ := hex.DecodeString(args[1].String())

	signature, _ := hex.DecodeString(args[2].String())

	return mode.Verify(mode.PublicKeyFromBytes(publicKey), msg, signature)

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

	//Decode msg an seed => entropy => privateKey

	sid, _ := hex.DecodeString(args[0].String())

	msg := []byte(args[1].String())

	seed := []byte(sid) // uint8/byte array

	entropy, _ := sampler.NewEntropy(seed)

	key, _ := bliss.GeneratePrivateKey(0, entropy)

	//Gen signature
	sig, _ := key.Sign(msg, entropy)

	return hex.EncodeToString(sig.Encode())

}

/*

0 - message
1 - publicKey
2 - signature

*/
func verifyBlissSignature(this js.Value, args []js.Value) interface{} {

	//Decode msg an publicKey
	msg := []byte(args[0].String())

	hexEncodedPublicKey, _ := hex.DecodeString(args[1].String())

	publicKey, _ := bliss.DecodePublicKey(hexEncodedPublicKey)

	//Decode signature
	decodedSignature, _ := hex.DecodeString(args[2].String())

	signature, _ := bliss.DecodeSignature(decodedSignature)

	//Verification itself
	_, err := publicKey.Verify(msg, signature)

	return err == nil

}

func main() {

	js.Global().Set("generateDilithiumKeypair", js.FuncOf(generateDilithiumKeypair))

	js.Global().Set("generateDilithiumSignature", js.FuncOf(generateDilithiumSignature))

	js.Global().Set("verifyDilithiumSignature", js.FuncOf(verifyDilithiumSignature))

	js.Global().Set("generateBlissKeypair", js.FuncOf(generateBlissKeypair))

	js.Global().Set("generateBlissSignature", js.FuncOf(generateBlissSignature))

	js.Global().Set("verifyBlissSignature", js.FuncOf(verifyBlissSignature))

	<-make(chan bool)

}
