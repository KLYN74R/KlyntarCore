//https://github.com/ameba23/dkg/blob/master/example.js


import * as dkg from './tbls_index.js'
import blsA from 'bls-wasm'

await blsA.init()

export default {

      generateTBLS:(threshold,myPubId,pubKeysArr)=>{

          let signers=pubKeysArr.map(id => {

              const sk = new blsA.SecretKey()
        
              sk.setHashOf(Buffer.from([id]))
        
              return {id:sk,recievedShares:[],arrId:id}
        
          })

        //Вот процесс генерации для участников - они могут это делать приватно у себя
        //Generation process - signers can do it privately on theirs machines
        const {verificationVector,secretKeyContribution} = dkg.generateContribution(blsA,signers.map(x=>x.id),threshold)
      
        //To transfer over network in hex
        //Verification vector можем публиковать - для каждого в группе. Только запоминать порядок индексов
        let serializedVerificationVector=verificationVector.map(x=>x.serializeToHexStr())
        let serializedSecretKeyContribution=secretKeyContribution.map(x=>x.serializeToHexStr())

        //console.log('Verification Vector SERIALIZE ', serArr.map(x=>blsA.deserializeHexStrToPublicKey(x)))
        //console.log('SecretKey contribution SERIALIZE ', secKeyArr.map(x=>blsA.deserializeHexStrToSecretKey(x)))
        console.log('\n\n==================== RESULT ====================\n')

        let jsonVerificationVector=JSON.stringify(serializedVerificationVector),
    
            serializedId=signers[pubKeysArr.indexOf(myPubId)].id.serializeToHexStr()



        console.log(`Send this verification vector to all group members => ${jsonVerificationVector}`)
        console.log(`\n\nSend this secret shares to appropriate user(one per user)`)
        serializedSecretKeyContribution.forEach((share,index)=>{

            console.log(`To user ${index} => ${share}`)

        })

        //console.log(`\n\nYour creds ${JSON.stringify(signers[pubKeysArr.indexOf(myPubId)])}`)
        console.log(`\n\nYour ID ${serializedId}`)

        console.log('\nP.S:Stored to <filepath>.json')
        return JSON.stringify({
        
            verificationVector:serializedVerificationVector,
            secretShares:serializedSecretKeyContribution,
            id:serializedId
        
        })

    },

    
    verifyShareTBLS:(hexMyId,hexSomeSignerSecretKeyContribution,hexSomeSignerVerificationVector)=>{
        
        //Deserialize at first from hex
        let someSignerSecretKeyContribution=blsA.deserializeHexStrToSecretKey(hexSomeSignerSecretKeyContribution)
        
        let someSignerVerificationVector=hexSomeSignerVerificationVector.map(x=>blsA.deserializeHexStrToPublicKey(x))
        let myId = blsA.deserializeHexStrToSecretKey(hexMyId)
    

        // Теперь когда нужный член групы получил этот secret sk,то он проверяет его по VSS с помощью verification vector of the sender и сохраняет его если всё ок
        const isVerified = dkg.verifyContributionShare(blsA,myId,someSignerSecretKeyContribution,someSignerVerificationVector)
     
        if(!isVerified) console.log(`\n\n\x1b[31mInvalid\x1b[0m share received from user with verification vector ${hexSomeSignerVerificationVector}`)
        else console.log(`\n\nShare ${hexSomeSignerSecretKeyContribution} is \x1b[32mvalid\x1b[0m - please,store it`) 
     
        return isVerified
        //Store shares somewhere with information who send(which id) has sent this share for you
    
    },    


    
    
    /**
     *   ## Derive public TBLS key from verification vectors of signers sides 
     *
     *   @param {Array<Array<string>>} hexVerificationVectors array of serialized verification vectors e.g. [ [hex1,hex2], [hex3,hex4], ...] where [hexA,hexB] - some verification vector 
     * 
     */
    deriveGroupPubTBLS:hexVerificationVectors=>{

        console.log(hexVerificationVectors.map(subArr=>

            subArr.map(x=>blsA.deserializeHexStrToPublicKey(x))

        ))

        const groupVvec = dkg.addVerificationVectors(hexVerificationVectors.map(subArr=>

            subArr.map(x=>blsA.deserializeHexStrToPublicKey(x))

        ))
        
        const groupPublicKey = groupVvec[0].serializeToHexStr()

        console.log(`Group TBLS pubKey is ${groupPublicKey}`)
        //blsA.deserializeHexStrToPublicKey(groupsPublicKey.serializeToHexStr())// - to deserialize

        return groupPublicKey

    },



    /*

    На вход поступают данные вида

    {

        hexMyId - id из первоначального массива signers из generateTBLS
        sharedPayload:[
            {
                verificationVector://VV of signer1 - array of hex values
                secretKeyShare://share received from signer1 - hex value
            },
            {
                verificationVector://VV of signer2
                secretKeyShare://share received from signer2
            },
            ...,
            {
                verificationVector://VV of signerN
                secretKeyShare://share received from signerN

            }
        ]

    }

*/
    signTBLS:(hexMyId,sharedPayload,message)=>{

        //Derive group TBLS secret key for this signer
        let groupSecret=dkg.addContributionShares(

            sharedPayload

                .map(x=>x.secretKeyShare)//get only secretshare part
                .map(hexValue=>blsA.deserializeHexStrToSecretKey(hexValue))

        )

        console.log(`\n\nDerived group secret ${groupSecret.serializeToHexStr()}`)

        //The rest of t signers do the same with the same message

        return JSON.stringify({sigShare:groupSecret.sign(message).serializeToHexStr(),id:hexMyId})

    },


    
    /*

        signaturesArray - [ {sigShare:signedShareA,id:hexIdA}, {sigShare:signedShareB,id:hexIdB},... {sigShare:signedShareX,id:hexIdX} ]

    */
    buildSignature:signaturesArray=>{

        //Now join signatures by t signers
        const groupsSig = new blsA.Signature()

        let sigs=[],signersIds=[]

        signaturesArray.forEach(x=>{

            sigs.push(blsA.deserializeHexStrToSignature(x.sigShare))

            signersIds.push(blsA.deserializeHexStrToSecretKey(x.id))

        })

        groupsSig.recover(sigs,signersIds)

        console.log('Signature', groupsSig.serializeToHexStr())
    
        //blsA.deserializeHexStrToSignature(groupsSig.serializeToHexStr())

        return groupsSig.serializeToHexStr()

    },

    verifyTBLS:(hexGroupPubKey,hexSignature,signedMessage)=>{


        let groupPubKey=blsA.deserializeHexStrToPublicKey(hexGroupPubKey),

            verified=groupPubKey.verify(blsA.deserializeHexStrToSignature(hexSignature),signedMessage)


        return verified

    }

}