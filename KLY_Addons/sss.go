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
        var t uint32 = uint32(2)
        var n uint32 = uint32(3)
        argCount := len(os.Args[1:])
        curve := curves.ED25519()

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
                curve = getCurve(curvetype)
        }

        scheme, _ := sharing.NewShamir(t, n, curve)

        shares, _ := scheme.Split(curve.NewScalar().Hash([]byte(msg)), crand.Reader)

        fmt.Printf("== Shamir Secret Shares ===\n")
        fmt.Printf("Curve: %s\n", curve.Name)
        fmt.Printf("== Secret shares == %d from %d ===\n", t, n)
        for _, s := range shares {
                fmt.Printf("%x\n", s.Bytes())

        }
        fmt.Printf("\n=================\n")

        mysecret := curve.NewScalar().Hash([]byte(msg))

        fmt.Printf("Message: %s\n", msg)
        fmt.Printf("\nOriginal Hash: %x\n\n", mysecret.Bytes())

        secret, err := scheme.Combine(shares...)
        if err == nil {
                fmt.Printf("Recorded Hash with all the shares: %x\n", secret.Bytes())
        } else {
                fmt.Printf("Cannot recover with all shares\n")
        }

        secret, err = scheme.Combine(shares[0])
        if err == nil {
                fmt.Printf("Recorded Hash with one share: %x\n", secret.Bytes())
        } else {
                fmt.Printf("Cannot recover with one share\n")
        }

        secret, err = scheme.Combine(shares[0], shares[1])
        if err == nil {
                fmt.Printf("Recorded Hash with two shares: %x\n", secret.Bytes())
        } else {
                fmt.Printf("Cannot recover with two shares\n")
        }

}