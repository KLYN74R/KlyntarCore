package main

import (
	crand "crypto/rand"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/coinbase/kryptology/pkg/core/curves"
	"github.com/coinbase/kryptology/pkg/sharing"
)

func getCurve(t string) *curves.Curve {
	s := strings.ToLower(t)
	if s == "ed25519" {
		return (curves.ED25519())
	} else if s == "k256" {
		return (curves.K256())
	} else if s == "p256" {
		return (curves.P256())
	} else if s == "pallas" {
		return (curves.PALLAS())
	}
	return curves.ED25519()

}

func main() {

	msg := "Hello"
	var t uint32 = uint32(3)
	var n uint32 = uint32(5)

	testCurve := curves.ED25519()

	argCount := len(os.Args[1:])

	if argCount > 0 {
		msg = os.Args[1]
	}
	if argCount > 1 {
		val, err := strconv.Atoi(os.Args[2])
		if err == nil {
			t = uint32(val)
		}
	}
	if argCount > 2 {
		val, err := strconv.Atoi(os.Args[3])
		if err == nil {
			n = uint32(val)
		}
	}
	if argCount > 3 {
		curvetype := os.Args[4]
		testCurve = getCurve(curvetype)
	}

	scheme, _ := sharing.NewFeldman(t, n, testCurve)

	secret :=make([]byte,32)//testCurve.Scalar.Hash([]byte(msg))

	fmt.Printf("=== Feldman Verifiable Secret Shares ===\n")
	fmt.Printf("Curve: %s\n", testCurve.Name)
	fmt.Printf("\nMessage: %s\nScheme: %d from %d\nOriginal secret: %x\n", msg, t, n, secret.Bytes())

	fmt.Printf("\nSplitting shares:\n")
	verifiers, shares, _ := scheme.Split(secret, crand.Reader)

	for _, s := range shares {
		rtn := verifiers.Verify(s)
		if rtn == nil {
			fmt.Printf(" Share %d: %x [Valid]\n", s.Id, s.Bytes())
		}

	}

	fmt.Printf("\nNow combining with all the shares ...\n")

	rSecret, err := scheme.Combine(shares...)

	if err == nil {
		fmt.Printf("Recovered secret: %x\n", rSecret.Bytes())
	} else {
		fmt.Printf("Cannot recover from all shares\n")
	}

	fmt.Printf("\nNow combining with two shares ...\n")
	rSecret, err = scheme.Combine(shares[0], shares[1])

	if err == nil {
		fmt.Printf("Recovered secret: %x\n", rSecret.Bytes())
		fmt.Printf("\nNow combining with two shares ...\n")
	} else {
		fmt.Printf("Cannot recover from two shares\n")
	}

	fmt.Printf("\nNow combining with three shares ...\n")
	rSecret, err = scheme.Combine(shares[0], shares[1], shares[2])

	if err == nil {
		fmt.Printf("Recovered secret: %x\n", rSecret.Bytes())
	} else {
		fmt.Printf("Cannot recover from three shares\n")
	}

}