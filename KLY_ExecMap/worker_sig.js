import{createRequire}from'module'
import{parentPort}from'worker_threads'
let{sign}=createRequire(import.meta.url)('nacl-signature')
parentPort.on('message',data=>parentPort.postMessage(sign(data.d,data.k)))//Send to the main thread