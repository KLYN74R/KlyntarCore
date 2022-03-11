package main

import (

        "github.com/LoCCS/bliss/sampler"

        "github.com/LoCCS/bliss"

        "encoding/hex"

        "strconv"

        "C"

)





//export generate
func generate() *C.char {

    seed := make([]byte,sampler.SHA_512_DIGEST_LENGTH)

    for i := 0; i < len(seed); i++ {
            seed[i] = byte(i % 8)
    }
    
	entropy, _ := sampler.NewEntropy(seed);
    
	prv, _ := bliss.GeneratePrivateKey(0,entropy);
    
	pub := prv.PublicKey();
	


	return C.CString(hex.EncodeToString(pub.Encode())+":"+hex.EncodeToString(seed))

}




//export sign
func sign(message *C.char,seedStr *C.char) *C.char{


	//Decode msg an seed => entropy => privateKey
    msg := []byte(C.GoString(message));

    sid,_:=hex.DecodeString(C.GoString(seedStr));

    seed := []byte(sid);//uint8/byte array

    entropy, _ := sampler.NewEntropy(seed);

    key, _ := bliss.GeneratePrivateKey(0, entropy);


	//Gen signature
	sig, _ := key.Sign(msg,entropy);

    return C.CString(hex.EncodeToString(sig.Encode()))

}




//export verify
func verify(message *C.char,pubKey *C.char,sig *C.char) *C.char {

	//Decode msg an publicKey
    msg := []byte(C.GoString(message));

    pk,_:=hex.DecodeString(C.GoString(pubKey));

    publicKey, _:=bliss.DecodePublicKey(pk);


	//Decode signature
    sg,_:=hex.DecodeString(C.GoString(sig));

    signature, _:=bliss.DecodeSignature(sg);

    
	//verification itself	
	_, err := publicKey.Verify(msg,signature);

	return C.CString(strconv.FormatBool(err == nil))

}


func main() {}