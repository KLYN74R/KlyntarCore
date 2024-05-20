package main

import 
( 
	"github.com/consensys/gnark/cs"
	"github.com/consensys/gnark/cs/groth16"
    "fmt"
	"os"
	"strconv"
)

func main() {
    // create root constraint system
    circuit := cs.New()

    // declare secret and public inputs
    x := circuit.SECRET_INPUT("x")
    y := circuit.PUBLIC_INPUT("y")


   //  x^2+ax+b. 
    xval:= -3
    yval:= 0
    a:=-2
    b:=-15


	  argCount := len(os.Args[1:])

    if (argCount>1) {xval,_= strconv.Atoi(os.Args[1])}
    if (argCount>2) {yval,_= strconv.Atoi(os.Args[2])}
    if (argCount>3) {a,_= strconv.Atoi(os.Args[3])}
    if (argCount>4) {b,_= strconv.Atoi(os.Args[4])}

    fmt.Printf("%d =x^3 + (%d) x + (%d) when x= %d\n\n",yval,a,b,xval)

    x3 := circuit.MUL(x, x)
    x2 := circuit.MUL(a, x)
    circuit.MUSTBE_EQ(y, circuit.ADD(x3, x2, b))
    

//    circuit.Write("cubic.r1cs")


  good := cs.NewAssignment()
  good.Assign(cs.Secret, "x", xval)
  expectedY := cs.Element(yval)
  good.Assign(cs.Public, "y", expectedY)


    //.. circuit definition
    r1cs := cs.NewR1CS(&circuit)
    
    var pk groth16.ProvingKey
    var vk groth16.VerifyingKey
    

    groth16.Setup(r1cs, &pk, &vk)
    
   	public := cs.NewAssignment()
	  public.Assign(cs.Public, "y", yval)


    proof, err1 := groth16.Prove(r1cs, &pk, good)

    if (err1==nil) {
      fmt.Print("Proof: ",proof)
     } else {
          fmt.Print("No proof!")
           return
       }
      

    res,err2:= groth16.Verify(proof, &vk, public)
    if (err2==nil) { fmt.Print("\nVerified: ",res) }
}
