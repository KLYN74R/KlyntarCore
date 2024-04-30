/*
         __.,,------.._
      ,'"   _      _   "`.
     /.__, ._  -=- _"`    Y
    (.____.-.`      ""`   j
     VvvvvvV`.Y,.    _.,-'       ,     ,     ,
        Y    ||,   '"\         ,/    ,/    ./
        |   ,'  ,     `-..,'_,'/___,'/   ,'/   ,
   ..  ,;,,',-'"\,'  ,  .     '     ' ""' '--,/    .. ..
 ,'. `.`---'     `, /  , Y -=-    ,'   ,   ,. .`-..||_|| ..
ff\\`. `._        /f ,'j j , ,' ,   , f ,  \=\ Y   || ||`||_..
l` \` `.`."`-..,-' j  /./ /, , / , / /l \   \=\l   || `' || ||...
 `  `   `-._ `-.,-/ ,' /`"/-/-/-/-"'''"`.`.  `'.\--`'--..`'_`' || ,
            "`-_,',  ,'  f    ,   /      `._    ``._     ,  `-.`'//         ,
          ,-"'' _.,-'    l_,-'_,,'          "`-._ . "`. /|     `.'\ ,       |
        ,',.,-'"          \=) ,`-.         ,    `-'._`.V |       \ // .. . /j
        |f\\               `._ )-."`.     /|         `.| |        `.`-||-\\/
        l` \`                 "`._   "`--' j          j' j          `-`---'
         `  `                     "`,-  ,'/       ,-'"  /
                                 ,'",__,-'       /,, ,-'
                                 Vvv'            VVv'

Art by Philip Kaulfuss => https://www.asciiart.eu/space/aliens


Links:

Microsoft SEAL
Pailer
https://docs.morfix.io/
https://medium.com/@s0l0ist/homomorphic-encryption-for-web-apps-b615fb64d2a2
https://github.com/morfix-io/node-seal/blob/main/FULL-EXAMPLE.md
https://github.com/mindfreakthemon/node-hcrypt
https://www.npmjs.com/package/paillier-bignum
https://github.com/juanelas/paillier-bignum/blob/HEAD/example.js



*/

import SEAL from 'node-seal'

const seal = await SEAL()
const schemeType = seal.SchemeType.bfv
const securityLevel = seal.SecurityLevel.tc128
const polyModulusDegree = 4096
const bitSizes = [36, 36, 37]
const bitSize = 20

const parms = seal.EncryptionParameters(schemeType)

// Set the PolyModulusDegree
parms.setPolyModulusDegree(polyModulusDegree)

// Create a suitable set of CoeffModulus primes
parms.setCoeffModulus(seal.CoeffModulus.Create(polyModulusDegree, Int32Array.from(bitSizes)))

// Set the PlainModulus to a prime of bitSize 20.
parms.setPlainModulus(seal.PlainModulus.Batching(polyModulusDegree, bitSize))

const context = seal.Context(
    parms, // Encryption Parameters
    true, // ExpandModChain
    securityLevel // Enforce a security level
)

if (!context.parametersSet()) {
    throw new Error(
        'Could not set the parameters in the given context. Please try different encryption parameters.'
    )
}

const encoder = seal.BatchEncoder(context)
const keyGenerator = seal.KeyGenerator(context)
const publicKey = keyGenerator.createPublicKey()
const secretKey = keyGenerator.secretKey()
const encryptor = seal.Encryptor(context, publicKey)
const decryptor = seal.Decryptor(context, secretKey)
const evaluator = seal.Evaluator(context)

// Create data to be encrypted
const operand0 = Int32Array.from([1, -10, 3, 4, 5, 99, 64064])

const operand1 = Int32Array.from([10, 7, -3, 24, 1005, 777, 122])

let anotherOp = Int32Array.from([3, 3, -3, 7, 7, 3, 7])

//Encode the Array
const encodedOperand0 = encoder.encode(operand0)

const encodedOperand1 = encoder.encode(operand1)

console.log('Plain ', encodedOperand0)

const encodedOperandAnother = encoder.encode(anotherOp)

// Encrypt the PlainText
const cipherText0 = encryptor.encrypt(encodedOperand0)

const cipherText1 = encryptor.encrypt(encodedOperand1)

const anotherCipher = encryptor.encrypt(encodedOperandAnother)

let cipherString = cipherText0.saveArray()

console.log('Cipher ', cipherString)

// const tes = encryptor.encrypt().loadArray(cipherString)

// Add the CipherText to itself and store it in the destination parameter (itself)
//evaluator.add(cipherText0,cipherText1,cipherText0) // Op (A), Op (B), Op (Dest)

evaluator.sub(cipherText0, cipherText1, cipherText0)

evaluator.sub(cipherText0, anotherCipher, cipherText0)

// Or create return a new cipher with the result (omitting destination parameter)
// const cipher2x = evaluator.add(cipherText, cipherText)

// Decrypt the CipherText
const decryptedPlainText = decryptor.decrypt(cipherText0)

console.log('DecPlain ', decryptedPlainText)

// Decode the PlainText
const decodedArray = encoder.decode(decryptedPlainText)
console.log('decodedArray', decodedArray)

let arr = seal.CipherText() //.loadArray(context,cipherString)

arr.loadArray(context, cipherString)

console.log('After transport ', arr.saveArray())
