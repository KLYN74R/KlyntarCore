package main

import (
	"fmt"
	"os"

	"github.com/google/keytransparency/core/crypto/vrf/p256"
)

func main() {

	k, pk := p256.GenerateKey()

	d1 := "This is a test"
	d2 := "This is not a test"

	argCount := len(os.Args[1:])
	if argCount > 0 {
		d1 = os.Args[1]
	}
	if argCount > 1 {
		d2 = os.Args[2]
	}

	m1 := []byte(d1)
	m2 := []byte(d2)

	index1, proof1 := k.Evaluate(m1)
	index2, proof2 := k.Evaluate(m2)

	fmt.Printf("== Creation of proofs ===\n")
	fmt.Printf("Data: [%s] Index: %x Proof: %x\n", m1, index1, proof1)
	fmt.Printf("Data: [%s] Index: %x Proof: %x\n", m2, index2, proof2)

	fmt.Printf("\n== Verfication of proofs ===\n")
	newindex1, _ := pk.ProofToHash(m1, proof1)
	fmt.Printf("Result 1: %x\n", newindex1)
	if index1 == newindex1 {
		fmt.Printf("Proven\n")
	}

	newindex2, _ := pk.ProofToHash(m2, proof2)
	fmt.Printf("Result 2: %x\n", newindex2)
	if index2 == newindex2 {
		fmt.Printf("Proven\n")
	}

}