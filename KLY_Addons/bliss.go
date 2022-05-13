/*


                Links:

https://github.com/LoCCS/bliss/search?q=entropy
https://github.com/LoCCS/bliss


*/

package main

import (
	"github.com/LoCCS/bliss/sampler"

	"github.com/LoCCS/bliss"

	"encoding/hex"

	"math/rand"

	"strconv"

	"time"

	"C"
)

//export genBLISS
func genBLISS() *C.char {

	rand.Seed(time.Now().UnixNano())

	seed := make([]byte, sampler.SHA_512_DIGEST_LENGTH)

	rand.Read(seed)

	entropy, _ := sampler.NewEntropy(seed)

	prv, _ := bliss.GeneratePrivateKey(0, entropy)

	pub := prv.PublicKey()

	return C.CString(hex.EncodeToString(pub.Encode()) + ":" + hex.EncodeToString(seed))

}

//export signBLISS
func signBLISS(message *C.char, seedStr *C.char) *C.char {

	//Decode msg an seed => entropy => privateKey
	msg := []byte(C.GoString(message))

	sid, _ := hex.DecodeString(C.GoString(seedStr))

	seed := []byte(sid) //uint8/byte array

	entropy, _ := sampler.NewEntropy(seed)

	key, _ := bliss.GeneratePrivateKey(0, entropy)

	//Gen signature
	sig, _ := key.Sign(msg, entropy)

	return C.CString(hex.EncodeToString(sig.Encode()))

}

//export verifyBLISS
func verifyBLISS(message *C.char, pubKey *C.char, sig *C.char) *C.char {

	//Decode msg an publicKey
	msg := []byte(C.GoString(message))

	pk, _ := hex.DecodeString(C.GoString(pubKey))

	publicKey, _ := bliss.DecodePublicKey(pk)

	//Decode signature
	sg, _ := hex.DecodeString(C.GoString(sig))

	signature, _ := bliss.DecodeSignature(sg)

	//Verification itself
	_, err := publicKey.Verify(msg, signature)

	return C.CString(strconv.FormatBool(err == nil))

}

func main() {}
