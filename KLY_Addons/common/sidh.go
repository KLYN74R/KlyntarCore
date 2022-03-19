package main

import (
    "bytes"
    "crypto/rand"
    "fmt"
    "github.com/cloudflare/circl/dh/sidh"

)

func main() {


    prvA := sidh.NewPrivateKey(sidh.Fp503, sidh.KeyVariantSidhA)
    pubA := sidh.NewPublicKey(sidh.Fp503, sidh.KeyVariantSidhA)

    prvB := sidh.NewPrivateKey(sidh.Fp503, sidh.KeyVariantSidhB)
    pubB := sidh.NewPublicKey(sidh.Fp503, sidh.KeyVariantSidhB)


    prvA.Generate(rand.Reader)
    prvA.GeneratePublicKey(pubA)

    prvB.Generate(rand.Reader)
    prvB.GeneratePublicKey(pubB)

    fmt.Printf("Alice private: %x\nAlice public: %x\n", *prvA, *pubA)
    fmt.Printf("Bob private: %x\nBob public: %x\n", *prvB, *pubB)

    ssA := make([]byte, prvA.SharedSecretSize())
    ssB := make([]byte, prvA.SharedSecretSize())


    prvA.DeriveSecret(ssA[:], pubB)


    prvB.DeriveSecret(ssB[:], pubA)

    fmt.Printf("\nAlice shared: %x\nBob shared: %x %t\n", ssA,ssB,bytes.Equal(ssA, ssB))

}