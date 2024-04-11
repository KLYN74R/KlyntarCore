import SEAL from 'node-seal'


;(async () => {

        // Using CommonJS for RunKit
        const seal = await SEAL()
    
        const schemeType = seal.SchemeType.ckks
        // const schemeType = seal.SchemeType.bfv
        const securityLevel = seal.SecurityLevel.tc128
        const polyModulusDegree = 4096
        // const bitSizes = [36, 36, 37]
        const bitSizes = [46,16,46]
        const bitSize = 20
    
        const encParms = seal.EncryptionParameters(schemeType)
    
    // Set the PolyModulusDegree
        encParms.setPolyModulusDegree(polyModulusDegree)
    
    // Create a suitable set of CoeffModulus primes
        encParms.setCoeffModulus(
            seal.CoeffModulus.Create(polyModulusDegree, Int32Array.from(bitSizes))
        )
    
    // Create a new Context
        const context = seal.Context(
            encParms, // Encryption Parameters
            true, // ExpandModChain
            securityLevel // Enforce a security level
        )
    
        if (!context.parametersSet()) {
            throw new Error(
                'Could not set the parameters in the given context. Please try different encryption parameters.'
            )
        }
    
    // Create a new KeyGenerator (creates a new keypair internally)
        const keyGenerator = seal.KeyGenerator(context)
    
        const secretKey = keyGenerator.secretKey()
        const publicKey = keyGenerator.createPublicKey()
  
    
    // Create an Evaluator which will allow HE functions to execute
        const evaluator = seal.Evaluator(context)
    
    // Or a CKKSEncoder (only CKKS SchemeType)
        const encoder = seal.CKKSEncoder(context)
    
    // Create an Encryptor to encrypt PlainTexts
        const encryptor = seal.Encryptor(context, publicKey)
    
    // Create a Decryptor to decrypt CipherTexts
        const decryptor = seal.Decryptor(context, secretKey)
    
        const plainTextA = encoder.encode(Float64Array.from([1.0, 2.0, 3.0]),Math.pow(2,20)) //what is the scale factor here?
    
        const result = encoder.decode(plainTextA) //why is plainTextA void here?
        console.log('test result', result)
    
        // Encrypt a PlainText
        const cipherTextA = encryptor.encrypt(plainTextA)
    
    // Add CipherText B to CipherText A and store the sum in a destination CipherText
        const cipherTextD = seal.CipherText()
    
        evaluator.add(cipherTextA, cipherTextA, cipherTextD)
    
        // Decrypt a CipherText
        const plainTextD = decryptor.decrypt(cipherTextD)
    
        const decoded = encoder.decode(plainTextD)
    
        console.log("len decoded", decoded.length)
        console.log('decoded', decoded)
    

  })()