import {TextEncoder} from 'util'


let wasm, WASM_VECTOR_LEN = 0, cachedUint8Memory0 = new Uint8Array(), cachedTextEncoder = new TextEncoder('utf-8')



let getUint8Memory0 = () => {

    if (cachedUint8Memory0.byteLength === 0) cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer)
    
    return cachedUint8Memory0

},

encodeString = () => {

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

},

passStringToWasm0=(arg, malloc, realloc) => {

    if (realloc === undefined) {

        let buf = cachedTextEncoder.encode(arg),
            
            ptr = malloc(buf.length)
        
        getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf)
        
        WASM_VECTOR_LEN = buf.length
        
        return ptr
    
    }

    let len = arg.length, 
    
        ptr = malloc(len),

        mem = getUint8Memory0(),

        offset = 0


    for (; offset < len; offset++) {

        const code = arg.charCodeAt(offset)
        
        if (code > 0x7F) break
        
        mem[ptr + offset] = code
    
    }

    if (offset !== len) {

        if (offset !== 0) arg = arg.slice(offset)
        
        ptr = realloc(ptr, len, len = offset + arg.length * 3)
        
        let view = getUint8Memory0().subarray(ptr + offset, ptr + len), ret = encodeString(arg, view)

        offset += ret.written
    }

    WASM_VECTOR_LEN = offset

    return ptr

}



export default (contractInstance,serializedContractStateChunk,functionName) => {

    wasm=contractInstance

    const ptr0 = passStringToWasm0(serializedContractStateChunk, contractInstance.__wbindgen_malloc, contractInstance.__wbindgen_realloc)
    
    const len0 = WASM_VECTOR_LEN
    
    return contractInstance[functionName](ptr0, len0)

}