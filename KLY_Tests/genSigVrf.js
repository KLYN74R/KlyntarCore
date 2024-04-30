/**
 *
 * @Vlad@ Chernenko 23.07.-1
 *
 *
 * Test to check signature and verification process and also execution time
 * NOTE:It's not terminal results-real life situations will give us the other assumption
 * But testing different algorithms in the same cases-the best & fastest was Ed25519
 *
 *
 */
import { SIG, VERIFY } from './crypto_utils.js'

let PUB = 'J+tMlJexrc5bwof9oIpKiRxQy84VmZhMfdIJa53GSY4=',
    PRV = 'MC4CAQAwBQYDK2VwBCIEIBc2AtpetI8q97G6kkrbNd7kaCRfZfqqwk69glbxklu/',
    dataToSign =
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    dataToSign2 = 'eqw5w6s4df5s4df5s4gd5v4d5b4fd5gwe4f5f5s7gweer57wefdfg22fzx00wer3refkPOKP<dsalf',
    sig = await SIG(dataToSign, PRV),
    sig2 = await SIG(dataToSign2, PRV),
    arr = []

let obj = {
    c: 'EHYLgeLygJM21grIVDPhPgXZiTBF1xvl5p7lOapZ534=',
    d: 'FROM_HELL',
    n: 495506,
    s: 'JhMTYwYVgg3f6VropzJxhuKehtULYt67xBBVQ32+3UPxx9zVUe13xzcXdqPht13k3pBk+c44k6x/OMMXQqNqCA=='
}

console.log(
    await VERIFY(
        '',
        '66CbNMz7JM6oYA1CWCk3MwsMR22FyS9lyhuRWpPD/GVwAJ1HsCLtQ/MgEQ6snzhSBrNvWGwtuKfjq1kF73r/AQ==',
        ''
    )
)

// console.log('SIG is ',sig)
// console.log('SIG2 is ',sig2)

// for(let i=0;i<150000;i++){
//     arr.push(VERIFY(dataToSign,sig,PUB))
//     arr.push(VERIFY(dataToSign2,sig2,PUB))
// }

// console.log('Start verification')
// console.time('Time for two 300k ed25519')
// await Promise.all(arr)//.then(a=>console.log('ARR',a.length))
// console.timeEnd('Time for two 300k ed25519')

// let arr3=[],data3='76434f2s4dsd4sdg4fg4dfdf24gsd 4f24ds f2gds2 a2fs4df sd54fs2df4sd2f',sig3=await SIG(data3,PRV)

// console.log('SIG is ',sig3)

// for(let i=0;i<300000;i++) arr3.push(VERIFY(data3,sig3,PUB))

// console.log('Start verification')
// console.time('Time for one 300k ed25519')
// await Promise.all(arr3)//.then(a=>console.log('ARR',a.length))
// console.timeEnd('Time for one 300k ed25519')
