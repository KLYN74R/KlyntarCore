import {VERIFY} from './crypto_utils.js'




let keyPair={

    pub: 'c1Wa6Rt6JukE9XqBH8XUnohNq968zhW//t246ADU1dI=',
    prv: 'MC4CAQAwBQYDK2VwBCIEIB45oWCfOEh867lV0uYU+DAsqIutK11HiUZipv00o0xY'

},

sig='RFInhZQfzWW12RJzhy8apzVUYrqeOdZhNW8q9kxmY7w11coHQSTugaHVtt50yzyfS74vXWkZQARbDvh1WsxvAg==',

acc={B:0},




changeBalance=value=>new Promise(async r=>{
    
    await VERIFY('SomeHash',sig,keyPair.pub)
    
    setTimeout(()=>{ acc.B+=value ; r() })
    
}),


between=(min, max)=>Math.floor(Math.random() * (max - min) + min),


promises=[],vals=[]




for(let i=0;i<100000;i++) vals.push(between(-10,10))

for(let i=0;i<100000;i++) promises.push(changeBalance(vals[i]))




await Promise.all(promises).then(arr=>console.log('Length is -> ',arr.length,'and balance is ',acc.B))

console.log('Is ok and no race condition ->',vals.reduce((sum,elem)=>sum+elem)===acc.B)