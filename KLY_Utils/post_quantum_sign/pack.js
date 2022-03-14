import {hash} from 'blake3-wasm'



//__________________________________________________________________________ BIBA __________________________________________________________________________


let BLAKE3=v=>hash(v).toString('hex'),

    getRandomArbitrary=(min, max)=>Math.random() * (max - min) + min,

    bins=BigInt(2**10),

    message='SIGN ME BABY',

    privat=getRandomArbitrary(1,2**32),

    bintarget=BigInt(`0x${BLAKE3(message+privat)}`) % bins


console.log('Bintarget is ',bintarget)

let bintest=-1,count=1


while(bintest!=bintarget){

    bintest=BigInt(`0x${BLAKE3(message+count)}`) % bins
    
    count++

    console.log(bintest)

}


console.log('Found at ',bintest,' = ',bintarget)
console.log('Count ',count-1)



console.log("Bob's private key: ",privat)
console.log("Bob's sign value: ",count-1)