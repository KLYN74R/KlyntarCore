let elliptic_1 = require("elliptic"),

    bn = require('bn.js'),
    
    ec = new elliptic_1.ec('secp256k1'),

    {sign,verify,link,RingSign} = require('.'),
    
    {Wallet} = require("ethers"),


    
    serializeRingSigtoHex=ringSig=>{

        ringSig.I=ringSig.I.encode('hex')
        ringSig.C=ringSig.C.toBuffer().toString('hex')
        ringSig.S=ringSig.S.map(x=>x.toBuffer().toString('hex'))
        ringSig.M=Buffer.from(ringSig.M).toString('hex')
        ringSig.Ring=ringSig.Ring.map(pub=>pub.getPublic().encode('hex'))

        return Buffer.from(JSON.stringify(ringSig),'utf-8').toString('hex')                  

    }


    let deserializeRingSig=ringSig=>{

        ringSig.I=ec.keyFromPublic(ringSig.I,'hex').getPublic()
        ringSig.C=new bn(ringSig.C,'hex')
        ringSig.S=ringSig.S.map(x=>new bn(x,'hex'))
        ringSig.M=new Uint8Array(Buffer.from(ringSig.M,'hex'))

        let hexKeys=ringSig.Ring.map(pub=>'0x'+pub)

        ringSig.Ring=ringSig.Ring.map(pub=>ec.keyFromPublic(pub,'hex'))


        return [hexKeys,ringSig]

    }

module.exports={sign,verify,link,Wallet,serializeRingSigtoHex,deserializeRingSig}