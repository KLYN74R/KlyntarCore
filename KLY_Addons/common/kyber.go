package main

// Based on examples at https://github.com/cloudflare/circl/tree/master/kem/kyber

import (

	"github.com/cloudflare/circl/kem/schemes"	

	"encoding/hex"

	"math/rand"

	"time"

	"C"

)



//export genKYBER
func genKYBER(schem *C.char,role *C.char) *C.char{

	scheme := schemes.ByName(C.GoString(schem));//Kyber512 by default

	rand.Seed(time.Now().UnixNano())

	//Prepare byte buffers
	//40 bytes - sender, 20-bytes recepient
	

	if C.GoString(role)=="sender" {

		seed := make([]byte,scheme.SeedSize())

		//Fill seed
		rand.Read(seed);

		pk, sk := scheme.DeriveKeyPair(seed);

		pubBytes,_ :=pk.MarshalBinary();

		secretBytes,_ :=sk.MarshalBinary();

		
		return C.CString(hex.EncodeToString(seed)+":"+hex.EncodeToString(pubBytes)+":"+hex.EncodeToString(secretBytes))


	}else {

		seed := make([]byte,scheme.EncapsulationSeedSize())

		//Fill seed
		rand.Read(seed);
		
		return C.CString(hex.EncodeToString(seed))

	}
	
}




//export getSharedKYBERAsSender
func getSharedKYBERAsSender(schem *C.char,hexPrivateKey *C.char,hexCipherText *C.char) *C.char{
	
	scheme := schemes.ByName(C.GoString(schem));//Kyber512 by default

	privBytes, _:=hex.DecodeString(C.GoString(hexPrivateKey));
	
	privK,_ := scheme.UnmarshalBinaryPrivateKey(privBytes);
	
	//Derive Alice(sender,initiator of handshake) keypair(secretkey need only)

	cipherText, _:=hex.DecodeString(C.GoString(hexCipherText));

	shared, _ := scheme.Decapsulate(privK,cipherText);

	return C.CString(hex.EncodeToString(shared));

}	

//export getSharedKYBERAsRecepient
func getSharedKYBERAsRecepient(schem *C.char,hexSeed *C.char,hexSenderPubKey *C.char) *C.char{


	scheme := schemes.ByName(C.GoString(schem));//Kyber512 by default

	senderPubKey, _:=hex.DecodeString(C.GoString(hexSenderPubKey));

	//Bob receive shared via Alice pubkey
	//EncapsulateDeterministically generates a shared key shared for the public
	//key deterministically from the given seed and encapsulates it into
	//a ciphertext cipherText. If unsure, you're better off using Encapsulate()
	pubK,_ := scheme.UnmarshalBinaryPublicKey(senderPubKey);

	seed, _:=hex.DecodeString(C.GoString(hexSeed));

	cipherText, shared, _ := scheme.EncapsulateDeterministically(pubK,seed);
	
	
	return C.CString(hex.EncodeToString(shared)+":"+hex.EncodeToString(cipherText));

}	



func main(){}