import fetch from 'node-fetch'

export default class{

    constructor(max,db){
        
        this.max=max
        this.cache=new Map()

        this.db=db//source database instance of LevelDB

    }

    async get(key){
        
        //Get account if account is NOT in debounce zone or in stoplist
        //Even if address in buffer zone to be commited to db-anyway we have separate set "debounce" which prevents spam
        let value = this.cache.get(key) || await this.db.get(key).catch(_=>false)


        if(!value){

            let stuff = await fetch(global.CONFIG.SYMBIOTE.GET_STUFF_URL+`/stuff/${key}`,{agent:global.FETCH_HTTP_AGENT}).then(r=>r.json()).catch(_=>false)

            if(stuff){
    
                this.db.put(key,stuff).catch(_=>{})

                value=stuff
        
            }     

        }
        
        
        if (value) {
            
            //Set to the beginning of map
            this.cache.delete(key)
            
            this.cache.set(key,value)

        }
        
        return value

    }

    set(key,value){

        //Refresh key
        if (this.cache.has(key)) this.cache.delete(key)
        
        else if (this.cache.size == this.max){
            
            let oldKey=this.cache.keys().next().value
                        
            this.cache.delete(oldKey)
        
        }
        
        this.cache.set(key,value)

    }

} 