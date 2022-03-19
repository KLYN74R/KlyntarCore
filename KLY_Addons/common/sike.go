package main

import (
    "bytes"
    "crypto/rand"
    "fmt"
    "github.com/cloudflare/circl/dh/sidh"

)

func main() {



    prvA := sidh.NewPrivateKey(sidh.Fp503, sidh.KeyVariantSike)
    pubA := sidh.NewPublicKey(sidh.Fp503, sidh.KeyVariantSike)

    prvB := sidh.NewPrivateKey(sidh.Fp503, sidh.KeyVariantSike)
    pubB := sidh.NewPublicKey(sidh.Fp503, sidh.KeyVariantSike)

    prvA.Generate(rand.Reader)
    prvA.GeneratePublicKey(pubA)

    prvB.Generate(rand.Reader)
    prvB.GeneratePublicKey(pubB)

    fmt.Printf("Alice private: %x\nAlice public: %x\n", *prvA, *pubA)
    fmt.Printf("Bob private: %x\nBob public: %x\n", *prvB, *pubB)


    var kem = sidh.NewSike503(rand.Reader)

    ct := make([]byte, kem.CiphertextSize())
    ssE := make([]byte, kem.SharedSecretSize())
    ssD := make([]byte, kem.SharedSecretSize())

    kem.Encapsulate(ct, ssE, pubB)

    kem.Decapsulate(ssD, prvB, pubB, ct)
    fmt.Printf("%t\n", bytes.Equal(ssE, ssD))


    kem.Encapsulate(ct, ssE, pubA)
    kem.Decapsulate(ssD, prvA, pubA, ct)


    fmt.Printf("\nAlice shared: %x\nBob shared: %x \nEqual: %t\n", ssE,ssD,bytes.Equal(ssE, ssD))

}