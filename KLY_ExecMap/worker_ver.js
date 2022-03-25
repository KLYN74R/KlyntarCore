import{createRequire}from'module'
import{parentPort}from'worker_threads'
let{verify}=createRequire(import.meta.url)('nacl-signature')
parentPort.on('message',data=>parentPort.postMessage(verify(data.d,data.sig,data.k)))