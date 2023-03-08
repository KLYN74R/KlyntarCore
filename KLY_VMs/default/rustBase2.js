import {TextDecoder} from 'util'


let wasm, cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode()


const heap = new Array(128).fill(undefined)

heap.push(undefined, null, true, false);

let heap_next = heap.length




let getObject = idx => heap[idx]

let dropObject = idx => {

    if (idx < 132) return

    heap[idx] = heap_next

    heap_next = idx

}

let takeObject = idx => {

    const ret = getObject(idx)

    dropObject(idx)

    return ret

}

let addHeapObject = obj => {

    if (heap_next === heap.length) heap.push(heap.length + 1)
    
    const idx = heap_next
    
    
    heap_next = heap[idx]

    heap[idx] = obj
    
    
    return idx

}



/**
* @returns {any}
*/
module.exports.send_example_to_js = function() {
    const ret = wasm.send_example_to_js();
    return takeObject(ret);
};

/**
* @param {any} val
* @returns {Promise<any>}
*/
module.exports.receive_example_from_js = function(val) {
    const ret = wasm.receive_example_from_js(addHeapObject(val));
    return takeObject(ret);
};








export default (contractInstance,contractStateChunkAsJsValue,functionName) => {

    wasm=contractInstance
    
    return contractInstance[functionName](contractStateChunkAsJsValue)

}