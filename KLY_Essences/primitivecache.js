export default class{

    constructor(maxSize){

        this.max = maxSize
        
        this.cache = new Map()
    
    }

    get(key){
        
        let item = this.cache.get(key)
        
        if(item){

            //Set to the beginning of map
            this.cache.delete(key)
            
            this.cache.set(key,item)
        
        }
        
        return item

    }

    set(key,val){

        this.cache.has(key) ? this.cache.delete(key) : this.cache.size == this.max && this.cache.delete(this.cache.keys().next().value)

        this.cache.set(key,val)
        
    }

}