//https://asecuritysite.com/zero/zproof2

package main

import (
	"fmt"
	"os"

	"github.com/coinbase/kryptology/pkg/core/curves"
)

func main() {

	msg := "Hello"
	argCount := len(os.Args[1:])

	if argCount > 0 {
		msg = os.Args[1]
	}

	curve := curves.BLS12381(&curves.PointBls12381G1{})
	var seed [32]byte

	sk := curve.Scalar.Hash(seed[:])
	acc := curve.Scalar.Point().Generator()

	fmt.Printf("Curve: %s", curve.Name)

	element := curve.Scalar.Hash([]byte(msg))

	fmt.Printf("\nAccumulator (initialisation): \n%x\n%x\n", acc.ToAffineUncompressed()[0:48], acc.ToAffineUncompressed()[48:])
	fmt.Printf(" Message to add: %x", msg)
	fmt.Printf(" Hash to add: %x", element.Bytes())

	/// Add
	val := element.Add(sk)
	acc = acc.Mul(val)

	fmt.Printf("\nAccumulator (after adding): \n%x\n%x\n", acc.ToAffineUncompressed()[0:48], acc.ToAffineUncompressed()[48:])

	// remove
	val = element.Add(sk) // y + sk
	y, _ := val.Invert()  // 1/(y+sk)
	acc = acc.Mul(y)

	fmt.Printf("\nAccumulator (after deletion): \n%x\n%x\n", acc.ToAffineUncompressed()[0:48], acc.ToAffineUncompressed()[48:])

}