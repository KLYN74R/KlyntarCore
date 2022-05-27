//https://asecuritysite.com/shares/ted25519
package main

import (
	"fmt"
	"os"

	"github.com/coinbase/kryptology/pkg/ted25519/ted25519"
)

func main() {

	msg := "Hello 123"

	argCount := len(os.Args[1:])

	if argCount > 0 {
		msg = os.Args[1]
	}
	message := []byte(msg)

	config := ted25519.ShareConfiguration{T: 2, N: 3}
	pub, secretShares, _, _ := ted25519.GenerateSharedKey(&config)

	// Each party generates a nonce and we combine them together into an aggregate one
	noncePub1, nonceShares1, _, _ := ted25519.GenerateSharedNonce(&config, secretShares[0], pub, message)
	noncePub2, nonceShares2, _, _ := ted25519.GenerateSharedNonce(&config, secretShares[1], pub, message)
	noncePub3, nonceShares3, _, _ := ted25519.GenerateSharedNonce(&config, secretShares[2], pub, message)

	nonceShares := []*ted25519.NonceShare{
		nonceShares1[0].Add(nonceShares2[0]).Add(nonceShares3[0]),
		nonceShares1[1].Add(nonceShares2[1]).Add(nonceShares3[1]),
		nonceShares1[2].Add(nonceShares2[2]).Add(nonceShares3[2]),
	}

	noncePub := ted25519.GeAdd(ted25519.GeAdd(noncePub1, noncePub2), noncePub3)

	sig1 := ted25519.TSign(message, secretShares[0], pub, nonceShares[0], noncePub)
	sig2 := ted25519.TSign(message, secretShares[1], pub, nonceShares[1], noncePub)
	sig3 := ted25519.TSign(message, secretShares[2], pub, nonceShares[2], noncePub)

	fmt.Printf("Message: %s\n", msg)
	fmt.Printf("Public key: %x\n", pub.Bytes())

	fmt.Printf("\nThreshold Sig1: %x\n", sig1.Bytes())
	fmt.Printf("Threshold Sig2: %x\n", sig2.Bytes())
	fmt.Printf("Threshold Sig3: %x\n\n", sig3.Bytes())

	sig, _ := ted25519.Aggregate([]*ted25519.PartialSignature{sig1, sig3}, &config)
	fmt.Printf("Rebuild signature with share 1 and 3: %x\n", sig)
	sig, _ = ted25519.Aggregate([]*ted25519.PartialSignature{sig2, sig3}, &config)
	fmt.Printf("Rebuild signature with share 2 and 3: %x\n", sig)

	ok, _ := ted25519.Verify(pub, message, sig)

	if ok {
		fmt.Printf("\nSignature verified")
	} else {
		fmt.Printf("\nSignature unverified")
	}

}