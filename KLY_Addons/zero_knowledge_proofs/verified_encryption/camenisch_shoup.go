//https://github.com/coinbase/kryptology/tree/master/pkg/verenc/camshoup#readme
//https://asecuritysite.com/zero/camshoup




package main

import (
	"fmt"
	"math/big"
	"os"

	"github.com/coinbase/kryptology/pkg/verenc/camshoup"
)

var (
	testP  = B10("37313426856874901938110133384605074194791927500210707276948918975046371522830901596065044944558427864187196889881993164303255749681644627614963632713725183364319410825898054225147061624559894980555489070322738683900143562848200257354774040241218537613789091499134051387344396560066242901217378861764936185029")
	testQ  = B10("89884656743115795386465259539451236680898848947115328636715040578866337902750481566354238661203768010560056939935696678829394884407208311246423715319737062188883946712432742638151109800623047059726541476042502884419075341171231440736956555270413618581675255342293149119973622969239858152417678164815053566739")
	testP1 = B10("153739637779647327330155094463476939112913405723627932550795546376536722298275674187199768137486929460478138431076223176750734095693166283451594721829574797878338183845296809008576378039501400850628591798770214582527154641716248943964626446190042367043984306973709604255015629102866732543697075866901827761489")
	testQ1 = B10("66295144163396665403376179086308918015255210762161712943347745256800426733181435998953954369657699924569095498869393378860769817738689910466139513014839505675023358799693196331874626976637176000078613744447569887988972970496824235261568439949705345174465781244618912962800788579976795988724553365066910412859")
)

func B10(s string) *big.Int {
	x, ok := new(big.Int).SetString(s, 10)
	if !ok {
		panic("Couldn't derive big.Int from string")
	}
	return x
}

func main() {

	argCount := len(os.Args[1:])
	val := "1000"
	if argCount > 0 {
		val = os.Args[1]
	}

	fmt.Printf("Message: %s\n", val)

	fmt.Printf("\n=== Generating keys ===\n")
	group, _ := camshoup.NewPaillierGroupWithPrimes(testP, testQ)

	domain := []byte("My Domain")

	ek, dk, _ := camshoup.NewKeys(1, group)

	res1, _ := dk.MarshalBinary()
	fmt.Printf(" Decryption key (first 25 bytes): %x\n", res1[:50])
	res2, _ := ek.MarshalBinary()
	fmt.Printf(" Encryption key (first 25 bytes): %x\n", res2[:50])

	fmt.Printf("\n=== Encrypting data with proof ===\n")
	msg, _ := new(big.Int).SetString(val, 10)

	cs, proof, _ := ek.EncryptAndProve(domain, []*big.Int{msg})

	res3, _ := cs.MarshalBinary()
	fmt.Printf(" Encrypted data (first 25 bytes): %x\n", res3[:50])

	res4, _ := proof.MarshalBinary()
	fmt.Printf(" Proof (first 25 bytes): %x\n", res4[:50])

	rtn := ek.VerifyEncryptProof(domain, cs, proof)

	if rtn != nil {
		fmt.Printf("We have not proven the key\n")
	} else {
		fmt.Printf("We have proven the key\n")
	}

	fmt.Printf("\n=== Let's try with the wrong keys ===\n")
	group, _ = camshoup.NewPaillierGroupWithPrimes(testP, testQ)

	ek2, _, _ := camshoup.NewKeys(1, group)

	_, proof1, _ := ek2.EncryptAndProve(domain, []*big.Int{msg})

	rtn1 := ek.VerifyEncryptProof(domain, cs, proof1)

	if rtn1 != nil {
		fmt.Printf("We have not proven the key\n")
	} else {
		fmt.Printf("We have proven the key\n")
	}

	fmt.Printf("\n=== Now decrypted ciphertext ===\n\n")
	dmsg, _ := dk.Decrypt(domain, cs)



	enc, _ := cs.MarshalBinary()
	fmt.Printf("Encrypted (showing first 25 bytes): %x\n", enc[:50])

	fmt.Printf("Decrypted: %s\n", dmsg[0])

}
