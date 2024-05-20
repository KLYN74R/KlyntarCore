//https://github.com/coinbase/kryptology/tree/master/pkg/verenc/camshoup#readme
//

package main

import (
	"fmt"

	"os"

	"github.com/coinbase/kryptology/pkg/core/curves"
	"github.com/coinbase/kryptology/pkg/verenc/elgamal"
)

func main() {

	argCount := len(os.Args[1:])
	val := "hello"
	if argCount > 0 {
		val = os.Args[1]
	}

	domain := []byte("MyDomain")

	k256 := curves.K256()
	ek, dk, _ := elgamal.NewKeys(k256)

	msgBytes := []byte(val)

	cs, proof, _ := ek.VerifiableEncrypt(msgBytes, &elgamal.EncryptParams{
		Domain:          domain,
		MessageIsHashed: true,
		GenProof:        true,
		ProofNonce:      domain,
	})

	fmt.Printf("=== ElGamal Verifiable Encryption ===\n")
	fmt.Printf("Input text: %s\n", val)
	fmt.Printf("=== Generating keys ===\n")
	res1, _ := ek.MarshalBinary()
	fmt.Printf("Public key %x\n", res1)
	res2, _ := dk.MarshalBinary()
	fmt.Printf("Private key %x\n", res2)
	fmt.Printf("=== Encrypting and Decrypting ===\n")
	res3, _ := cs.MarshalBinary()
	fmt.Printf("\nCiphertext: %x\n", res3)
	dbytes, _, _ := dk.VerifiableDecryptWithDomain(domain, cs)
	fmt.Printf("\nDecrypted: %s\n", dbytes)

	fmt.Printf("\n=== Checking proof===\n")
	rtn := ek.VerifyDomainEncryptProof(domain, cs, proof)
	if rtn == nil {
		fmt.Printf("Encryption has been verified\n")
	} else {
		fmt.Printf("Encryption has NOT been verified\n")
	}

	fmt.Printf("=== Now we will try with the wrong proof ===\n")
	ek2, _, _ := elgamal.NewKeys(k256)
	cs, proof2, _ := ek2.VerifiableEncrypt(msgBytes, &elgamal.EncryptParams{
		Domain:          domain,
		MessageIsHashed: true,
		GenProof:        true,
		ProofNonce:      domain,
	})

	rtn = ek.VerifyDomainEncryptProof(domain, cs, proof2)
	if rtn == nil {
		fmt.Printf("Encryption has been verified\n")
	} else {
		fmt.Printf("Encryption has NOT been verified\n")
	}

}