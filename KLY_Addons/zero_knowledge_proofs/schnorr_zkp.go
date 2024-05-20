//https://github.com/coinbase/kryptology/blob/master/pkg/zkp/schnorr/schnorr.go

package main

import (
	"crypto/rand"
	"fmt"
	"math"
	"os"

	"github.com/coinbase/kryptology/pkg/core/curves"
	"github.com/coinbase/kryptology/pkg/zkp/schnorr"
	"golang.org/x/crypto/sha3"
)

func powInt(x, y int) int {
	return int(math.Pow(float64(x), float64(y)))
}
func main() {

	curve := curves.K256()
	message := "Test"
	name := "K256"

	argCount := len(os.Args[1:])
	if argCount > 0 {
		name = os.Args[1]
	}
	if argCount > 1 {
		message = os.Args[2]
	}
	if name == "K256" {
		curve = curves.K256()
	} else if name == "P256" {
		curve = curves.P256()
	} 

	msgHash := sha3.New256().Sum([]byte(message))

	prover := schnorr.NewProver(curve, nil, msgHash)

	random_seed := curve.Scalar.Random(rand.Reader)

	proof, _ := prover.Prove(random_seed)

	fmt.Printf("Message to prove: %s\n", message)
	fmt.Printf("Curve: %s\n", curve.Name)
	fmt.Printf("\nProof Statement: %x\n", proof.Statement.ToAffineCompressed())
	fmt.Printf("Proof C: %x\n", proof.C.Bytes())
	fmt.Printf("Proof S: %x\n", proof.S.Bytes())

	err := schnorr.Verify(proof, curve, nil, msgHash)

	if err == nil {
		fmt.Printf("ZKP has been proven")
	} else {
		fmt.Printf("ZKP has NOT been proven")
	}

	fmt.Printf("\n\n== Now trying the wrong message ==")
	message = "Not correct!"
	msgHash = sha3.New256().Sum([]byte(message))
	proof, _ = prover.Prove(random_seed)

	err = schnorr.Verify(proof, curve, nil, msgHash)

	if err == nil {
		fmt.Printf("\nIncorrect hash is proven with incrrect message (bad) ")
	} else {
		fmt.Printf("\nZKP has NOT been proven with incorrect message (good)")
	}

}
