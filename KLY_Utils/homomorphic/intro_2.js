import SEAL from 'node-seal'


// ;(async () => {

//         // Using CommonJS for RunKit
//         const seal = await SEAL()
    
//         const schemeType = seal.SchemeType.ckks
//         // const schemeType = seal.SchemeType.bfv
//         const securityLevel = seal.SecurityLevel.tc128
//         const polyModulusDegree = 4096
//         // const bitSizes = [36, 36, 37]
//         const bitSizes = [46,16,46]
//         const bitSize = 20
    
//         const encParms = seal.EncryptionParameters(schemeType)
    
//     // Set the PolyModulusDegree
//         encParms.setPolyModulusDegree(polyModulusDegree)
    
//     // Create a suitable set of CoeffModulus primes
//         encParms.setCoeffModulus(
//             seal.CoeffModulus.Create(polyModulusDegree, Int32Array.from(bitSizes))
//         )
    
//     // Create a new Context
//         const context = seal.Context(
//             encParms, // Encryption Parameters
//             true, // ExpandModChain
//             securityLevel // Enforce a security level
//         )
    
//         if (!context.parametersSet()) {
//             throw new Error(
//                 'Could not set the parameters in the given context. Please try different encryption parameters.'
//             )
//         }
    
//     // Create a new KeyGenerator (creates a new keypair internally)
//         const keyGenerator = seal.KeyGenerator(context)
    
//         const secretKey = keyGenerator.secretKey()
//         const publicKey = keyGenerator.createPublicKey()
  
    
//     // Create an Evaluator which will allow HE functions to execute
//         const evaluator = seal.Evaluator(context)
    
//     // Or a CKKSEncoder (only CKKS SchemeType)
//         const encoder = seal.CKKSEncoder(context)
    
//     // Create an Encryptor to encrypt PlainTexts
//         const encryptor = seal.Encryptor(context, publicKey)
    
//     // Create a Decryptor to decrypt CipherTexts
//         const decryptor = seal.Decryptor(context, secretKey)
    
//         const plainTextA = encoder.encode(Float64Array.from([1.0, 2.0, 3.0]),Math.pow(2,20)) //what is the scale factor here?
    
//         const result = encoder.decode(plainTextA) //why is plainTextA void here?
//         console.log('test result', result)
    
//         // Encrypt a PlainText
//         const cipherTextA = encryptor.encrypt(plainTextA)
    
//     // Add CipherText B to CipherText A and store the sum in a destination CipherText
//         const cipherTextD = seal.CipherText()
    
//         evaluator.add(cipherTextA, cipherTextA, cipherTextD)
    
//         // Decrypt a CipherText
//         const plainTextD = decryptor.decrypt(cipherTextD)
    
//         const decoded = encoder.decode(plainTextD)
    
//         console.log("len decoded", decoded.length)
//         console.log('decoded', decoded)


//         homomorphicOperations();

//         subtractOperations();
    

//   })()



async function homomorphicOperations() {
  
    const sealInstance = await SEAL();


  const schemeType = sealInstance.SchemeType.bfv;
  const securityLevel = sealInstance.SecurityLevel.tc128;
  const polyModulusDegree = 4096;
  const bitSizes = [36, 36, 37];
  const bitSize = 20;

  const parms = sealInstance.EncryptionParameters(schemeType);
  parms.setPolyModulusDegree(polyModulusDegree);
  parms.setCoeffModulus(
    sealInstance.CoeffModulus.Create(polyModulusDegree, Int32Array.from(bitSizes))
  );
  parms.setPlainModulus(
    sealInstance.PlainModulus.Batching(polyModulusDegree, bitSize)
  );

  const context = sealInstance.Context(parms, true, securityLevel);


  const keyGenerator = sealInstance.KeyGenerator(context);
  const publicKey = keyGenerator.createPublicKey();
  const secretKey = keyGenerator.secretKey();
  const relinKeys = keyGenerator.createRelinKeys();


  const encryptor = sealInstance.Encryptor(context, publicKey);
  const evaluator = sealInstance.Evaluator(context);
  const decryptor = sealInstance.Decryptor(context, secretKey);

  const encoder = sealInstance.BatchEncoder(context);
  const plainText1 = encoder.encode(Int32Array.from([5]));
  const plainText2 = encoder.encode(Int32Array.from([3]));


  let cipherText1 = encryptor.encrypt(plainText1);
  let cipherText2 = encryptor.encrypt(plainText2);

  console.log('=================== CipherText  ')
  console.log(cipherText1)

  console.log('=================== Serialized CipherText  ')
  
  let serializedText = cipherText1.save()
  
  console.log(serializedText)

  console.log('================== Deserialized CipherText ')

  let deserializedText = sealInstance.CipherText();

  deserializedText.load(context,serializedText)

  console.log(deserializedText)

  cipherText1 = deserializedText


  const sum = sealInstance.CipherText();
  evaluator.add(cipherText1, cipherText2, sum);

  const product = sealInstance.CipherText();
  evaluator.multiply(cipherText1, cipherText2, product);
  //evaluator.relinearizeInplace(product, relinKeys);

  const decryptedSum = decryptor.decrypt(sum);
  const decryptedProduct = decryptor.decrypt(product);


  const decodedSum = encoder.decode(decryptedSum);
  const decodedProduct = encoder.decode(decryptedProduct);

  console.log('Sum:', decodedSum[0]);     
  console.log('Product:', decodedProduct[0]); 
}


homomorphicOperations()



async function subtractOperations() {


  const sealInstance = await SEAL();

    const schemeType = sealInstance.SchemeType.bfv;
    const securityLevel = sealInstance.SecurityLevel.tc128;
    const polyModulusDegree = 4096;
    const bitSizes = [36, 36, 37];
    const bitSize = 20;
  
    const parms = sealInstance.EncryptionParameters(schemeType);
    parms.setPolyModulusDegree(polyModulusDegree);
    parms.setCoeffModulus(
      sealInstance.CoeffModulus.Create(polyModulusDegree, Int32Array.from(bitSizes))
    );
    parms.setPlainModulus(
      sealInstance.PlainModulus.Batching(polyModulusDegree, bitSize)
    );
  
    const context = sealInstance.Context(parms, true, securityLevel);

    // Key creating
  const keyGenerator = sealInstance.KeyGenerator(context);
  const publicKey = keyGenerator.createPublicKey();
  const secretKey = keyGenerator.secretKey();

    // Ciphertext of 2 vars
    const encoder = sealInstance.BatchEncoder(context);
    const plainText1 = encoder.encode(Int32Array.from([10]));
    const plainText2 = encoder.encode(Int32Array.from([3]));
  
    const encryptor = sealInstance.Encryptor(context, publicKey);
    const cipherText1 = encryptor.encrypt(plainText1);
    const cipherText2 = encryptor.encrypt(plainText2);
  
    // Sum
    const difference = sealInstance.CipherText();
    const evaluator = sealInstance.Evaluator(context);
    evaluator.sub(cipherText1, cipherText2, difference);

    // Decrypt
    const decryptor = sealInstance.Decryptor(context, secretKey);
    const decryptedDifference = decryptor.decrypt(difference);
    const decodedDifference = encoder.decode(decryptedDifference);
    
    console.log('Difference:', decodedDifference[0]); // Difference: 7
  }
  
  // subtractOperations();



async function findHomomorphicMax() {
  const sealInstance = await SEAL();
  const parms = sealInstance.EncryptionParameters(sealInstance.SchemeType.bfv);
  parms.setPolyModulusDegree(4096);
  parms.setCoeffModulus(sealInstance.CoeffModulus.Create(4096, Int32Array.from([30, 30, 31])));
  parms.setPlainModulus(sealInstance.PlainModulus.Batching(4096, 20));

  const context = sealInstance.Context(parms, true, sealInstance.SecurityLevel.tc128);
  const keyGenerator = sealInstance.KeyGenerator(context);
  const publicKey = keyGenerator.createPublicKey();
  const secretKey = keyGenerator.secretKey();
  const encryptor = sealInstance.Encryptor(context, publicKey);
  const evaluator = sealInstance.Evaluator(context);
  const decryptor = sealInstance.Decryptor(context, secretKey);
  const encoder = sealInstance.BatchEncoder(context);

  const x = encoder.encode(Int32Array.from([10]));
  const y = encoder.encode(Int32Array.from([20]));
  const cipherX = encryptor.encrypt(x);
  const cipherY = encryptor.encrypt(y);

  // Пример арифметической манипуляции для поиска максимума
  // Внимание: Этот код не будет работать без дополнительной логики для определения знака
  const delta = sealInstance.CipherText();
  evaluator.sub(cipherX, cipherY, delta);


  // Ваш код для вычисления маски на основе знака delta

  // Предполагаем, что маска уже вычислена (здесь требуется гомоморфное сравнение)
  // const mask = ...;

  // Вычисление max с использованием маски
  // const cipherMax = sealInstance.CipherText();
  // evaluator.multiply(cipherX, mask, cipherMax);
  // evaluator.multiply(cipherY, sealInstance.PlainText(1 - mask), temp);
  // evaluator.add(cipherMax, temp, cipherMax);

  // Расшифровка для демонстрации
  // const decryptedMax = decryptor.decrypt(cipherMax);
  // const decodedMax = encoder.decode(decryptedMax);
  // console.log('Max:', decodedMax[0]);
}

// findHomomorphicMax();
