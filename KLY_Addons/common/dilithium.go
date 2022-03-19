package main


import (

        "github.com/cloudflare/circl/sign/dilithium"

        "encoding/hex"

        "strconv"

        "C"

)


var modename string = "Dilithium2"; // Dilithium2-AES Dilithium3 Dilithium3-AES Dilithium5 Dilithium5-AES

var mode = dilithium.ModeByName(modename);


//export genDIL
func genDIL() *C.char {

	pk, sk, _ := mode.GenerateKey(nil);

	return C.CString(string(hex.EncodeToString(pk.Bytes())+":"+hex.EncodeToString(sk.Bytes())))

}


//export signDIL
func signDIL(message *C.char,privKey *C.char) *C.char{
        
        privateKey, _:=hex.DecodeString(C.GoString(privKey));

	msg := []byte(C.GoString(message));
    
	return C.CString(hex.EncodeToString(mode.Sign(mode.PrivateKeyFromBytes(privateKey), msg)))

}


//export verifyDIL
func verifyDIL(message *C.char,pubKey *C.char,sig *C.char) *C.char {

	msg := []byte(C.GoString(message));

        publicKey, _:=hex.DecodeString(C.GoString(pubKey));

        signature, _:=hex.DecodeString(C.GoString(sig));
	
	return C.CString(strconv.FormatBool(mode.Verify(mode.PublicKeyFromBytes(publicKey), msg, signature)))

}


func main() {}
