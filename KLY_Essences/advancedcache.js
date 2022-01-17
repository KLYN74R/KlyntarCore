export default class{

    constructor(max,db){
        
        this.max=max
        this.cache=new Map()
        
        this.stoplist=new Set()//add addresses which are going to be written to db due to cache shift
        this.debounce=new Set()//to prevent spam by debouncing operations for account
        
        this.db=db//source database instance(e.g space)

    }

    async get(addr){
        
        //Get account if account is NOT in debounce zone or in stoplist
        //Even if address in buffer zone to be commited to db-anyway we have separate set "debounce" which prevents spam
        let acc = !(this.debounce.has(addr) || this.stoplist.has(addr)) && (this.cache.get(addr) || await this.db.get(addr).catch(e=>false))
        
        if (acc) {
            
            //Set to the beginning of map
            this.cache.delete(addr)
            this.cache.set(addr,acc)
            
            //If limit-add to DEBOUNCE set for a while
            acc.N%CONFIG.DEBOUNCE_MODULUS===0 && (this.debounce.add(addr),setTimeout(()=>this.debounce.delete(addr),CONFIG.DEBOUNCE_TIME))

        }
        
        return acc

    }

    set(addr,acc){

        //acc.N++

        //Refresh key
        if (this.cache.has(addr)) this.cache.delete(addr)
        
        //Some complex process
        else if (this.cache.size == this.max){
            
            let oldKey=this.cache.keys().next().value,data=this.cache.get(oldKey)

            this.stoplist.add(oldKey)
            
            this.cache.delete(oldKey)
            
            this.db.put(oldKey,data).then(()=>this.stoplist.delete(oldKey))
        
        }
        
        this.cache.set(addr,acc)

    }

} 