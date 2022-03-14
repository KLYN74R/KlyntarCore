import {hash} from 'blake3-wasm'

import sphincs from 'sphincs'


let BLAKE3=v=>hash(v).toString('hex'),

    getRandomArbitrary=(min, max)=>Math.random() * (max - min) + min




export default {
    
    WINTERITZ:{


        generate:()=>{
            
            let privateKey=[]

            for(let i=0;i<32;i++) privateKey.push(getRandomArbitrary(0,2**32))

            let publicKey=privateKey.map(x=>{

              let init=x+''

              for(let i=0;i<256;i++) init=BLAKE3(init)

              return init

            })

            return {privateKey,publicKey}

        },


        sig:(data,privateKey)=>{

          let bytes=new Uint8Array(hash(data))

          bytes.forEach((byte,index)=>{

            privateKey[index]+=''

            for(let i=0;i<byte;i++) privateKey[index]=BLAKE3(privateKey[index])

          })


          return privateKey//it's signature because we hashed value BYTE times

        },

    
        verify:(publicKey,data,signature)=>{

          
          let bytes=new Uint8Array(hash(data))

          bytes.forEach((byte,index)=>{

            let rest=256-byte

            signature[index]+=''

            for(let i=0;i<rest;i++) signature[index]=BLAKE3(signature[index])

          })


          return publicKey.every((pub,index)=>pub===signature[index])

        }


    },
    
    HORS:{

          generate:()=>{
                
            let privateKey=[]
    
            for(let i=0;i<32;i++) privateKey.push(getRandomArbitrary(0,2**32))
    
            let publicKey=privateKey.map(x=>{
    
              let init=x+''
    
              for(let i=0;i<256;i++) init=BLAKE3(init)
    
              return init
    
            })
    
            return {privateKey,publicKey}
    
        },


        sig:(data,privateKey)=>{
    
          let bytes=new Uint8Array(hash(data))
    
          bytes.forEach((byte,index)=>{
    
            privateKey[index]+=''
    
            for(let i=0;i<byte;i++) privateKey[index]=BLAKE3(privateKey[index])
    
          })
    
    
          return privateKey//it's signature because we hashed value BYTE times
    
        },


        verify:(publicKey,data,signature)=>{
    
          
          let bytes=new Uint8Array(hash(data))
    
          bytes.forEach((byte,index)=>{
    
            let rest=256-byte
    
            signature[index]+=''
    
            for(let i=0;i<rest;i++) signature[index]=BLAKE3(signature[index])
    
          })
    
    
          return publicKey.every((pub,index)=>pub===signature[index])
    
        }
      
    },
    



    BIBA:{

        

    },
    
    XMSS:{},
    
    FALCON:{},
    
    SPHINCS:{

        generate:async()=>{

            let kp=await sphincs.keyPair()

            return {publicKey:Buffer.from(kp.publicKey).toString('base64'),privateKey:Buffer.from(kp.privateKey).toString('base64')}

        },

        sign:async(privateKey,data)=>Buffer.from(await sphincs.signDetached(new Uint8Array(Buffer.from(data,'utf-8')),new Uint8Array(Buffer.from(privateKey,'base64')))).toString('base64'),


        verify:(signature,data,pubKey)=>sphincs.verifyDetached(new Uint8Array(Buffer.from(signature,'base64')),new Uint8Array(Buffer.from(data,'utf-8')),new Uint8Array(Buffer.from(pubKey,'base64'))).catch(e=>false)

    }

}