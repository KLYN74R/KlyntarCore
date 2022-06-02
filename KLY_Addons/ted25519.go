/*

██╗   ██╗███╗   ██╗██╗███╗   ███╗██████╗ ██╗     ███████╗███╗   ███╗███████╗███╗   ██╗████████╗███████╗██████╗ 
██║   ██║████╗  ██║██║████╗ ████║██╔══██╗██║     ██╔════╝████╗ ████║██╔════╝████╗  ██║╚══██╔══╝██╔════╝██╔══██╗
██║   ██║██╔██╗ ██║██║██╔████╔██║██████╔╝██║     █████╗  ██╔████╔██║█████╗  ██╔██╗ ██║   ██║   █████╗  ██║  ██║
██║   ██║██║╚██╗██║██║██║╚██╔╝██║██╔═══╝ ██║     ██╔══╝  ██║╚██╔╝██║██╔══╝  ██║╚██╗██║   ██║   ██╔══╝  ██║  ██║
╚██████╔╝██║ ╚████║██║██║ ╚═╝ ██║██║     ███████╗███████╗██║ ╚═╝ ██║███████╗██║ ╚████║   ██║   ███████╗██████╔╝
 ╚═════╝ ╚═╝  ╚═══╝╚═╝╚═╝     ╚═╝╚═╝     ╚══════╝╚══════╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═════╝




██████╗  ██████╗     ███╗   ██╗ ██████╗ ████████╗    ██╗   ██╗███████╗███████╗
██╔══██╗██╔═══██╗    ████╗  ██║██╔═══██╗╚══██╔══╝    ██║   ██║██╔════╝██╔════╝
██║  ██║██║   ██║    ██╔██╗ ██║██║   ██║   ██║       ██║   ██║███████╗█████╗  
██║  ██║██║   ██║    ██║╚██╗██║██║   ██║   ██║       ██║   ██║╚════██║██╔══╝  
██████╔╝╚██████╔╝    ██║ ╚████║╚██████╔╝   ██║       ╚██████╔╝███████║███████╗
╚═════╝  ╚═════╝     ╚═╝  ╚═══╝ ╚═════╝    ╚═╝        ╚═════╝ ╚══════╝╚══════╝



*/


package main

import (

    "github.com/coinbase/kryptology/pkg/ted25519/ted25519"

    "encoding/hex"

    "strconv"

    "strings"

    "C"

)


//export generateTED25519
func generateTED25519(T,N C.int) *C.char {

    //Create T/N threshold configs
    config := ted25519.ShareConfiguration{T:int(T),N:int(N)}

    // GenerateSharedKey generates a random key, splits it, and returns the public key, shares, and VSS commitments.
    // func GenerateSharedKey(config *ShareConfiguration) (PublicKey, []*KeyShare, Commitments, error)

    pub, secretShares, commitments, _ := ted25519.GenerateSharedKey(&config)


    //Serialize secret shares and commitments for FVSS

    SHARES:=""
    COMMITMENTS:=""

    for _,singleShare := range secretShares {

        SHARES +="$"+hex.EncodeToString(singleShare.Bytes())

    }

    for _,commitmentProof := range commitments.CommitmentsToBytes() {

        //Per user

        COMMITMENTS +="$"+hex.EncodeToString(commitmentProof)

    }


    return C.CString(hex.EncodeToString(pub.Bytes())+":"+SHARES+":"+COMMITMENTS)

}


//export verifySecretShareTED25519
func verifySecretShareTED25519(T,N C.int,myHexSecretShare,hexCommitments *C.char) *C.char {

    //Create T/N threshold configs
    config := ted25519.ShareConfiguration{T:int(T),N:int(N)}

    //Deserialize my part of secret shares
    mySecretShareBuffer, _ := hex.DecodeString(C.GoString(myHexSecretShare))


    commitments := make([][]byte, int(T))

    for i := range commitments {

    	commitments[i] = make([]byte, 32)

    }

    goStringCommitments:=C.GoString(hexCommitments)

    for i,singleCom := range strings.Split(goStringCommitments, "$"){

        oneCom, _ := hex.DecodeString(singleCom)

        commitments[i]=oneCom

    }


    finalCommitments,_:=ted25519.CommitmentsFromBytes(commitments)

    ok,_:=ted25519.KeyShareFromBytes(mySecretShareBuffer).VerifyVSS(finalCommitments,&config)


    return C.CString(strconv.FormatBool(ok))

}


//export generateNonceSharesTED25519
func generateNonceSharesTED25519(T,N C.int,hexReceivedSecretShare,hexCommonPub,message *C.char) *C.char {

        //Create T/N threshold configs
        config := ted25519.ShareConfiguration{T:int(T),N:int(N)}

        //Deserialize byte buffers
        receivedSecretShareBuffer, _ := hex.DecodeString(C.GoString(hexReceivedSecretShare))


        //Deserialize common(general) pubkey
        commonPubBuffer, _ := hex.DecodeString(C.GoString(hexCommonPub))

        pubKey, _ := ted25519.PublicKeyFromBytes(commonPubBuffer)

        //Bytebuffer of message
        msg, _ := hex.DecodeString(C.GoString(message))

        noncePub, nonceShares, nonceCommitments, _ := ted25519.GenerateSharedNonce(&config, ted25519.KeyShareFromBytes(receivedSecretShareBuffer), pubKey, msg)


        //Serialize secret shares and commitments for FVSS

    NONCE_SHARES:=""
    NONCE_COMMITMENTS:=""

    for _,singleShare := range nonceShares {

        NONCE_SHARES +="$"+hex.EncodeToString(singleShare.Bytes())

    }

    for _,commitmentProof := range nonceCommitments.CommitmentsToBytes() {

        //Per user

        NONCE_COMMITMENTS +="$"+hex.EncodeToString(commitmentProof)

    }

        return C.CString(hex.EncodeToString(noncePub.Bytes())+":"+NONCE_SHARES+":"+NONCE_COMMITMENTS)

}


//export subsignTED25519
func subsignTED25519(hexSecretShare,hexNonceShares,hexNoncePubKeys,hexGeneralPubKey,message *C.char) *C.char {


        //Deserialize secret share byte buffer received by you initially(1st communications round)
        receivedSecretShareBuffer, _ := hex.DecodeString(C.GoString(hexSecretShare))

        //Deserialize common(general) pubkey
        commonPubBuffer, _ := hex.DecodeString(C.GoString(hexGeneralPubKey))
        pubKey, _ := ted25519.PublicKeyFromBytes(commonPubBuffer)

        //Bytebuffer of message
        msg, _ := hex.DecodeString(C.GoString(message))


        //------------------------Циклы по hexNonceShares,hexNoncePubKeys для того чтоб собрать шары и публичный ключ------------------------

        var myNonceShare *ted25519.NonceShare

        goStringNonceShares:=C.GoString(hexNonceShares)

        //Agregate my nonceShares received from other participants
        for i,singleCom := range strings.Split(goStringNonceShares,"$"){

            subBuffer, _ := hex.DecodeString(singleCom)//32 bytes buffer

            if i == 0 {

                myNonceShare=ted25519.NonceShareFromBytes(subBuffer)

            }else{

                myNonceShare.Add(ted25519.NonceShareFromBytes(subBuffer))

            }

        }




        //------------------------------Agregate noncePubkeys------------------------------

        var myNoncePub ted25519.PublicKey

        goStringNoncePubKeys:=C.GoString(hexNoncePubKeys)

        for i,singleCom := range strings.Split(goStringNoncePubKeys,"$"){

            subBuffer, _ := hex.DecodeString(singleCom)//32 bytes buffer

            subPubKey, _ := ted25519.PublicKeyFromBytes(subBuffer)


            if i == 0 {

                myNoncePub=subPubKey

            }else{

                    
                myNoncePub=ted25519.GeAdd(myNoncePub,subPubKey)

			}

        }

        return C.CString(hex.EncodeToString(ted25519.TSign(msg,ted25519.KeyShareFromBytes(receivedSecretShareBuffer),pubKey,myNonceShare,myNoncePub).Bytes()))

	}


//export aggregateSignaturesTED25519
func aggregateSignaturesTED25519(T,N C.int,hexSubSignatures *C.char) *C.char {


    //https://github.com/coinbase/kryptology/blob/269410e1b06b43da82caf28cf99cb8c0c140b65d/pkg/ted25519/ted25519/partialsig.go#L19

    //Create T/N threshold configs
    config := ted25519.ShareConfiguration{T:int(T),N:int(N)}

    goStringSubSigns:=C.GoString(hexSubSignatures)

	subSigArr := make([]*ted25519.PartialSignature, int(T))

    for i,singleSubSig := range strings.Split(goStringSubSigns,"$"){

        metaToRecover:=strings.Split(singleSubSig,"*")
    
        index, _ := hex.DecodeString(metaToRecover[0])

        subBuffer, _ := hex.DecodeString(metaToRecover[1])

        subSigArr[i]=ted25519.NewPartialSignature(index[0],subBuffer)

    }


    //Build noncePub from all subPubs
    //noncePub := ted25519.GeAdd(ted25519.GeAdd(noncePub1, noncePub2), noncePub3)

    //Build full signature from subsignatures
    sig, _ := ted25519.Aggregate(subSigArr,&config)

    return C.CString(hex.EncodeToString(sig))

}


//export verifyTED25519
func verifyTED25519(hexCommonPub,hexMessage,hexAggregatedSignature *C.char) *C.char {

 	//Deserialize common(general) pubkey
 	commonPubBuffer, _ := hex.DecodeString(C.GoString(hexCommonPub))

	pubKey, _ := ted25519.PublicKeyFromBytes(commonPubBuffer)

	//Bytebuffer of message
	msg, _ := hex.DecodeString(C.GoString(message))

	//Bytebuffer of signature
	signa, _ := hex.DecodeString(C.GoString(hexAggregatedSignature))

	
	//Check
	ok, err := ted25519.Verify(pubKey, msg, signa)


	return C.CString(strconv.FormatBool(err == nil))

}


func main(){}