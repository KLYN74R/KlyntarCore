import loader from '@assemblyscript/loader'

import metering from 'wasm-metering'

import {TextDecoder} from 'util'



let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })

let {TYPE,FUNCTION_NAME,MODULE_NAME}=global.CONFIG.VM.METERING

let cachedTextEncoder = new TextEncoder('utf-8')



let encodeString = () => {

    if(typeof cachedTextEncoder.encodeInto === 'function'){

        return (arg,view) => cachedTextEncoder.encodeInto(arg, view)

    }else{

        return (arg,view) => {

            const buf = cachedTextEncoder.encode(arg)
            
            view.set(buf)
            
            return {
                
                read: arg.length,
                
                written: buf.length
            
            }

        }

    }

}


let isLikeNone = x => x === undefined || x === null


export default class ContractInstance {

    constructor(extraImports,bytecode){

        this.imports = {

            __wbindgen_placeholder__:{

                //_______________________________ Required _______________________________

                __wbg_call_9495de66fdbe016b:this.__wbg_call_9495de66fdbe016b,
                
                __wbindgen_is_undefined:this.__wbindgen_is_undefined,

                __wbg_stringify_029a979dfb73aa17:this.__wbg_stringify_029a979dfb73aa17,

                __wbindgen_object_drop_ref:this.__wbindgen_object_drop_ref,

                __wbg_parse_3ac95b51fc312db8:this.__wbg_parse_3ac95b51fc312db8,

                __wbg_new_9d3a9ce4282a18a8:this.__wbg_new_9d3a9ce4282a18a8,

                __wbindgen_string_get:this.__wbindgen_string_get,

                __wbg_resolve_fd40f858d9db1a04:this.__wbg_resolve_fd40f858d9db1a04,
                
                __wbindgen_throw:this.__wbindgen_throw,

                __wbg_then_f753623316e2873a:this.__wbg_then_f753623316e2873a,

                __wbindgen_cb_drop:this.__wbindgen_cb_drop,

                __wbg_then_ec5db6d509eb475f:this.__wbg_then_ec5db6d509eb475f,

                __wbindgen_closure_wrapper1032:this.__wbindgen_closure_wrapper1032,


                //________________________________ Extra _________________________________

                ...extraImports

            }

        }
        this.heap = new Array(128).fill(undefined)
        this.wasm = bytecode
        this.WASM_VECTOR_LEN=0
        this.cachedUint8Memory0 = null
        this.cachedInt32Memory0 = null

        // Initial push
        this.heap.push(undefined, null, true, false)

        this.heap_next = this.heap.length 
        
    }

    setUpContract = async gasLimit => {


        //Modify contract to inject metering functions
        let prePreparedContractBytecode = metering.meterWASM(this.wasm,{
    
            meterType:TYPE,
            
            fieldStr:FUNCTION_NAME,
        
            moduleStr:MODULE_NAME,
        
            //And cost table to meter gas usage by opcodes price
            costTable:global.CONFIG.VM.GAS_TABLE,
        
        })


        //Prepare pointer to contract metadata to track changes in gas changes
        let contractMetadata = {

            gasLimit: gasLimit,
            gasBurned:0

        }


        //Inject metering function
        let contractInstance = await loader.instantiate(prePreparedContractBytecode,{

            metering: {
                
                burnGas: gasAmount => {
                    
                    contractMetadata.gasBurned += gasAmount
            
                    if (contractMetadata.gasBurned > contractMetadata.gasLimit) throw new Error(`No more gas => Limit:${contractMetadata.gasLimit}        |       Burned:${contractMetadata.gasBurned}`)
          
                }
            
            },

            ...this.imports
        
        }).then(contract=>contract.exports)

        
        this.wasm = contractInstance.exports

        return {contractInstance:this.wasm,contractMetadata}

    }

    getObject = idx => this.heap[idx]

    getUint8Memory0 = () => {

        if (this.cachedUint8Memory0 === null || this.cachedUint8Memory0.byteLength === 0) {
            
            this.cachedUint8Memory0 = new Uint8Array(this.wasm.memory.buffer)
        
        }

        return this.cachedUint8Memory0
    
    }

    getInt32Memory0 = () => {

        if (this.cachedInt32Memory0 === null || this.cachedInt32Memory0.byteLength === 0) {
    
            this.cachedInt32Memory0 = new Int32Array(this.wasm.memory.buffer)
    
        }
    
        return this.cachedInt32Memory0
   
    }
    
    passStringToWasm0 = (arg, malloc, realloc) => {

        if (realloc === undefined) {

            let buf = cachedTextEncoder.encode(arg),

                ptr = malloc(buf.length)

            this.getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf)

            this.WASM_VECTOR_LEN = buf.length

            return ptr
        
        }

        let len = arg.length, 

            ptr = malloc(len),

            mem = this.getUint8Memory0(),

            offset = 0


        for (; offset < len; offset++) {

            const code = arg.charCodeAt(offset)

            if (code > 0x7F) break

            mem[ptr + offset] = code
        
        }

        if (offset !== len) {

            if (offset !== 0) arg = arg.slice(offset)

            ptr = realloc(ptr, len, len = offset + arg.length * 3)

            let view = this.getUint8Memory0().subarray(ptr + offset, ptr + len), ret = encodeString(arg, view)

            offset += ret.written
        }

        this.WASM_VECTOR_LEN = offset

        return ptr

    }

    dropObject = idx => {

        if (idx < 132) return
    
        this.heap[idx] = this.heap_next
 
        this.heap_next = idx
    
    }


    takeObject = idx => {

        const ret = this.getObject(idx)
        
        this.dropObject(idx)
        
        return ret
    
    }


    getStringFromWasm0 = (ptr, len) => cachedTextDecoder.decode(this.getUint8Memory0().subarray(ptr, ptr + len))


    makeMutClosure = (arg0,arg1,dtor,f) => {

        const state = { a: arg0, b: arg1, cnt: 1, dtor }
        
        const real = (...args) => {
        
            // First up with a closure we increment the internal reference
            // count. This ensures that the Rust closure environment won't
            // be deallocated while we're invoking it.
        
            state.cnt++
        
            const a = state.a
        
            state.a = 0
        
            try {
        
                return f(a, state.b, ...args)
        
            } finally {
        
                if (--state.cnt === 0) {
        
                    this.wasm.__wbindgen_export_2.get(state.dtor)(a,state.b)
    
                } else {
        
                    state.a = a
        
                }
        
            }
        
        }
 
        real.original = state
    
        return real
 
    }


    addHeapObject = obj => {
        
        if (this.heap_next === this.heap.length) this.heap.push(this.heap.length + 1)
        
        const idx = this.heap_next
        
        this.heap_next = this.heap[idx]
    
        this.heap[idx] = obj

        return idx

    }

    __wbg_adapter_XXX = (arg0, arg1, arg2) => {
    
        this.wasm._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h4f14a7dea6bdf9dd(arg0, arg1, this.addHeapObject(arg2))
    
    }

    handleError = (f, args) => {
        
        try {
    
            return f.apply(this,args);
    
        } catch (e) {
    
            this.wasm.__wbindgen_exn_store(this.addHeapObject(e))
    
        }
    
    }

    __wbg_adapter_X(arg0, arg1, arg2, arg3) {
        
        this.wasm.wasm_bindgen__convert__closures__invoke2_mut__hb6099109a8545842(arg0, arg1, this.addHeapObject(arg2), this.addHeapObject(arg3))
    
    }

    __wbg_call_9495de66fdbe016b=(...args)=>{

        return this.handleError((arg0, arg1, arg2)=>{

            const ret = this.getObject(arg0).call(this.getObject(arg1),this.getObject(arg2))
            
            return this.addHeapObject(ret)
    
        },args)
    
    }

    __wbindgen_is_undefined = arg0 => {
    
        const ret = this.getObject(arg0) === undefined
    
        return ret
    
    }


    __wbg_stringify_029a979dfb73aa17=(...args)=>{
        
        return this.handleError(arg0 => {
            
            const ret = JSON.stringify(this.getObject(arg0))
            
            return this.addHeapObject(ret)
    
        },args) 
    
    }
    
    
    __wbindgen_object_drop_ref = arg0 => {

        this.takeObject(arg0)
    
    }
    
    __wbg_parse_3ac95b51fc312db8=(...args)=>{
        
        return this.handleError((arg0, arg1)=>{
            
            const ret = JSON.parse(this.getStringFromWasm0(arg0,arg1))
            
            return this.addHeapObject(ret)
        
        
        },args)
    
    }
    
    __wbg_new_9d3a9ce4282a18a8 = (arg0, arg1) => {
    
        try {

            var state0 = {a: arg0, b: arg1}

            var cb0 = (arg0, arg1) => {

                const a = state0.a

                state0.a = 0

                try {

                    return this.__wbg_adapter_X(a, state0.b, arg0, arg1)

                } finally {

                    state0.a = a

                }

            }

            const ret = new Promise(cb0)

            return this.addHeapObject(ret)
 
        } finally {
 
            state0.a = state0.b = 0
 
        }
 
    }
    
    
    __wbindgen_string_get=(arg0, arg1)=>{

        const obj = this.getObject(arg1)
        
        const ret = typeof(obj) === 'string' ? obj : undefined
        
        var ptr0 = isLikeNone(ret) ? 0 : this.passStringToWasm0(ret,this.wasm.__wbindgen_malloc,this.wasm.__wbindgen_realloc)

        var len0 = this.WASM_VECTOR_LEN
        
        this.getInt32Memory0()[arg0 / 4 + 1] = len0
        this.getInt32Memory0()[arg0 / 4 + 0] = ptr0
    
    }
    
    
    __wbg_resolve_fd40f858d9db1a04 = arg0 => {

        const ret = Promise.resolve(this.getObject(arg0))
        
        return this.addHeapObject(ret)
    
    }
    
    __wbindgen_throw = (arg0, arg1) => {

        throw new Error(this.getStringFromWasm0(arg0,arg1))
    
    }
    
    
    __wbg_then_f753623316e2873a = (arg0, arg1, arg2) => {

        const ret = this.getObject(arg0).then(this.getObject(arg1),this.getObject(arg2))
        
        return this.addHeapObject(ret)
    
    }
    
    __wbindgen_cb_drop = arg0 => {

        const obj = this.takeObject(arg0).original
        
        if (obj.cnt-- == 1) {
            
            obj.a = 0
            
            return true
        
        }

        const ret = false
        
        return ret
    
    }
    
    __wbg_then_ec5db6d509eb475f = (arg0,arg1) => {

        const ret = this.getObject(arg0).then(this.getObject(arg1))
     
        return this.addHeapObject(ret)
    
    }
    
    
    
    //-------------------- DIFFERENT
    
    __wbindgen_closure_wrapper1032 = (arg0, arg1, arg2) => {

        const ret = this.makeMutClosure(arg0, arg1, 43, this.__wbg_adapter_XXX)
    
        return this.addHeapObject(ret)
    
    }
    
}