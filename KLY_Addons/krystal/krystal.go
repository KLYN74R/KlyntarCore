package main

// Based on examples at https://github.com/cloudflare/circl/tree/master/kem/kyber

import (

	"fmt"
	"math/rand"
 	"os"
 	"time"

 	"github.com/cloudflare/circl/kem/schemes"

)

func main() {

	meth := "Kyber512"

 	argCount := len(os.Args[1:])

 	if argCount > 0 {
    
		meth = os.Args[1]
 	
	}

 
	scheme := schemes.ByName(meth)
	rand.Seed(time.Now().Unix())

 	var seed [48]byte
 	kseed := make([]byte, scheme.SeedSize())
 	eseed := make([]byte, scheme.EncapsulationSeedSize())
 
	for i := 0; i < 48; i++ {

        seed[i] = byte(rand.Intn(255))
 	
	}


 	pk, sk := scheme.DeriveKeyPair(kseed)
 	ppk, _ := pk.MarshalBinary()
 	psk, _ := sk.MarshalBinary()
 	ct, ss, _ := scheme.EncapsulateDeterministically(pk, eseed)
 	ss2, _ := scheme.Decapsulate(sk, ct)

 	fmt.Printf("Method: %s \n", meth)
 	fmt.Printf("Seed for key exchange: %X\n", seed)

 	fmt.Printf("Public Key (pk) = %X (first 32 bytes)\n", ppk[:32])
 	fmt.Printf("Private key (sk) = %X (first 32 bytes)\n", psk[:32])
 	fmt.Printf("Cipher text (ct) = %X (first 32 bytes)\n", ct[:32])
 	fmt.Printf("\nShared key (Bob):\t%X\n", ss)
 	fmt.Printf("Shared key (Alice):\t%X", ss2)

 	fmt.Printf("\n\nLength of Public Key (pk) = %d bytes \n", len(ppk))
 	fmt.Printf("Length of Secret Key (pk)  = %d  bytes\n", len(psk))
 	fmt.Printf("Length of Cipher text (ct) = %d  bytes\n", len(ct))

}