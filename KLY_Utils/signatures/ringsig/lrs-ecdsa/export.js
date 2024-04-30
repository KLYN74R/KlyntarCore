/*

████████╗██╗  ██╗ █████╗ ███╗   ██╗██╗  ██╗    ██╗   ██╗ ██████╗ ██╗   ██╗
╚══██╔══╝██║  ██║██╔══██╗████╗  ██║██║ ██╔╝    ╚██╗ ██╔╝██╔═══██╗██║   ██║
   ██║   ███████║███████║██╔██╗ ██║█████╔╝      ╚████╔╝ ██║   ██║██║   ██║
   ██║   ██╔══██║██╔══██║██║╚██╗██║██╔═██╗       ╚██╔╝  ██║   ██║██║   ██║
   ██║   ██║  ██║██║  ██║██║ ╚████║██║  ██╗       ██║   ╚██████╔╝╚██████╔╝
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝       ╚═╝    ╚═════╝  ╚═════╝ 
                                                                          
                                                                          
                                                                          
                                                                        
                                                                          
 ██████╗ ██╗   ██╗ ██████╗  ██████╗██████╗  ██████╗ ███╗   ██╗██╗         
██╔═══██╗██║   ██║██╔═══██╗██╔════╝██╔══██╗██╔═══██╗████╗  ██║██║         
██║██╗██║██║   ██║██║   ██║██║     ██║  ██║██║   ██║██╔██╗ ██║██║         
██║██║██║╚██╗ ██╔╝██║   ██║██║     ██║  ██║██║   ██║██║╚██╗██║██║         
╚█║████╔╝ ╚████╔╝ ╚██████╔╝╚██████╗██████╔╝╚██████╔╝██║ ╚████║██║         
 ╚╝╚═══╝   ╚═══╝   ╚═════╝  ╚═════╝╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═╝ 


Source https://gitlab.com/vocdoni/lrs-ecdsa/



Public key => Address
import publicKeyToAddress from 'ethereum-public-key-to-address';
console.log(publicKeyToAddress('0x04fdb05804ddd0d419ec8a234a63e9e0d6edd2e45c03cba186cce9eb5263ece145a362e01f4065c92134c4ce148aace40dbf26bf18089f5d82e5ec49314663f1b1'))

*/

let elliptic_1 = require('elliptic'),
    bn = require('bn.js'),
    ec = new elliptic_1.ec('secp256k1'),
    { sign, verify, link } = require('.'),
    { Wallet } = require('ethers'),
    serializeRingSigtoHex = ringSig => {
        ringSig.I = ringSig.I.encode('hex')
        ringSig.C = ringSig.C.toBuffer().toString('hex')
        ringSig.S = ringSig.S.map(x => x.toBuffer().toString('hex'))
        ringSig.M = Buffer.from(ringSig.M).toString('hex')
        ringSig.Ring = ringSig.Ring.map(pub => pub.getPublic().encode('hex'))

        return Buffer.from(JSON.stringify(ringSig), 'utf-8').toString('hex')
    }

let deserializeRingSig = ringSig => {
    ringSig.I = ec.keyFromPublic(ringSig.I, 'hex').getPublic()
    ringSig.C = new bn(ringSig.C, 'hex')
    ringSig.S = ringSig.S.map(x => new bn(x, 'hex'))
    ringSig.M = new Uint8Array(Buffer.from(ringSig.M, 'hex'))

    let hexKeys = ringSig.Ring.map(pub => '0x' + pub)

    ringSig.Ring = ringSig.Ring.map(pub => ec.keyFromPublic(pub, 'hex'))

    return [hexKeys, ringSig]
}

module.exports = { sign, verify, link, Wallet, serializeRingSigtoHex, deserializeRingSig }
