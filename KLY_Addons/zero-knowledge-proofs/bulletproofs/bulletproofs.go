//https://asecuritysite.com/zero/ecc_bullet


package main

import (
	crand "crypto/rand"
	"fmt"
	"math"
	"os"
	"strconv"

	"github.com/coinbase/kryptology/pkg/bulletproof"
	"github.com/coinbase/kryptology/pkg/core/curves"
	"github.com/gtank/merlin"
)

func powInt(x, y int) int {
	return int(math.Pow(float64(x), float64(y)))
}
func main() {

	curve := curves.ED25519()
	n := 8
	v_val := 320
	argCount := len(os.Args[1:])
	if argCount > 0 {
		n, _ = strconv.Atoi(os.Args[1])
	}
	if argCount > 1 {
		v_val, _ = strconv.Atoi(os.Args[2])
	}

	prover, _ := bulletproof.NewRangeProver(n, []byte("rangeDomain"), []byte("ippDomain"), *curve)

	v := curve.Scalar.New(v_val)
	gamma := curve.Scalar.Random(crand.Reader)
	g := curve.Point.Random(crand.Reader)
	h := curve.Point.Random(crand.Reader)
	u := curve.Point.Random(crand.Reader)
	transcript := merlin.NewTranscript("test")
	proof, _ := prover.Prove(v, gamma, n, g, h, u, transcript)

	fmt.Printf("v=%d, n=%d\n", v_val, n)
	fmt.Printf("Range between 0 and %d\n", powInt(2, n))

	fmt.Printf("Proof is %x\n", proof)

	if proof != nil {
		fmt.Printf("It has been proven!")
	} else {
		fmt.Printf("It has NOT been proven!")
	}

}