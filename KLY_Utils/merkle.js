
import {hash} from 'blake3-wasm'


let BLAKE3=v=>hash(v).toString('hex')




export default class MerkleTree {

	constructor() { this.root = [] }


    createTree(hashesList) {
        
        this.root.unshift(hashesList)
        
        this.root.unshift(hashesList.map(t=>t))

        while (this.root[0].length > 1){
    
            let temp = []
    
            for (let index = 0; index < this.root[0].length; index += 2) {
    
                if (index < this.root[0].length - 1 && index % 2 == 0) temp.push(BLAKE3(this.root[0][index] + this.root[0][index + 1]))
    
                else temp.push(this.root[0][index])
    
            }
        
            this.root.unshift(temp)
        
        }

    }



    verify(findHash){
  
        let position = this.root.slice(-1)[0].findIndex(hash=>hash===findHash)
   
        if(position){

            for (let index = this.root.length - 2; index > 0; index--){

                let neighbour = null
      
                if (position % 2 == 0) {
        
                    neighbour = this.root[index][position + 1]
        
                    position = Math.floor((position) / 2)
        
                    findHash = BLAKE3(findHash + neighbour)
            
                }else {
                
                    
                    neighbour = this.root[index][position - 1]
                    
                    position = Math.floor((position - 1) / 2)
                    
                    findHash = BLAKE3(neighbour + findHash)
            
                }

            }
    
            return findHash == this.root[0][0]
  
        } else return false

    }


}

