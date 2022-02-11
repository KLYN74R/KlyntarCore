import {SIG,VERIFY,BLAKE3} from './crypto_utils.js'
import l from 'level'
import fs from 'fs'




let db=l('TEST',{valueEncoding:'json'}),

    CHAIN='ITWn2/DU7ILqLZcYwjPZvovbI4va2bfOcI0tbR9HV54=',

    CHAIN_PRIVATE_KEY='MC4CAQAwBQYDK2VwBCIEIFGzqz6vOsPW8RegGU+JXi/v/q5Wo7sYIodTlbKcmODu',

    defaultTxs=[],securedTxs=[],

    instantBlock={

        c:'IzQ3kPHHW7IEjBl7UMVcdpXRoyfekGqadsBxBnLQ3Ss=',
        d:[],
        s:[],
        n:'CXVfsHNvpuFc6FoHA5D3gfiemLkcyNzNYXuJSgaUQVAz',
        sig:''

    }




//Test duplicates
// sendersPool.forEach(account=>defaultTxs.push({c:account.pub,d:'DELEGATE ADDRESS',n:0}))
// sendersPool.forEach(account=>defaultTxs.push({c:account.pub,d:'DELEGATE ADDRESS',n:1}))
// sendersPool.forEach(account=>defaultTxs.push({c:account.pub,d:'DELEGATE ADDRESS',n:7}))




//!!!
await new Promise((resolve,_reject)=>

    db.createKeyStream().on('data',address=>defaultTxs.push({c:address,d:'ANOTHER ONE',n:19})).on('end',()=>{
    
        instantBlock.d=defaultTxs
        // console.log('TXS SIZE IS -> ',instantBlock.d.length)
        // console.log('TXS -> ',instantBlock.d)
        db.createKeyStream().on('data',address=>defaultTxs.push({c:address,d:'FIN7',n:18})).on('end',()=>{
            resolve()
        })

    })

)

let hash=BLAKE3(JSON.stringify(instantBlock.d) + JSON.stringify(instantBlock.s) + CHAIN)

instantBlock.sig=await SIG(hash,'MC4CAQAwBQYDK2VwBCIEIO92P6igIVKRplDK7LT1k1fUlOgN8kcKH2Osb/dCqv2y')

let controllerBlock={
    c:CHAIN,
    a:[hash],
    i:777,
    p:'',
    sig:''
},

//Cache
ACCOUNTS=new Map(),

BLACKLIST=new Set(),


GET_CHAIN_ACC=addr=>ACCOUNTS.get(addr)||db.get(addr).then(ACCOUNT=>ACCOUNTS.set(addr,{ACCOUNT,NS:new Set(),ND:new Set(),OUT:ACCOUNT.B}).get(addr)).catch(e=>false),



controllerHash=BLAKE3(JSON.stringify(controllerBlock.a) + CHAIN + controllerBlock.i + controllerBlock.p)

controllerBlock.sig=await SIG(controllerHash,CHAIN_PRIVATE_KEY)




let QUANT_CONTROL={EXPORT_COLLAPSE:0,EXPORT_HASH:'',IN_SUPERPOSITION:false,COLLAPSED_HASH:'',COLLAPSED_INDEX:0,SYNC_QUANT:false},




vDLG2=async(from,newDelegate,blockCreator,nonce)=>{

    let sender=GET_CHAIN_ACC(from)

    if(!(BLACKLIST.has(from)||sender.ND.has(nonce))){

        //Imitation of signature verification
        await VERIFY(controllerHash,controllerBlock.sig,CHAIN)

        sender.ACCOUNT.B--
        
        //Make changes only for bigger nonces
        if(sender.ACCOUNT.N<nonce){

            sender.ACCOUNT.D=newDelegate

            sender.ACCOUNT.N=nonce

        }
        
        blockCreator.fees++

    }

},




vTX2=async(from,to,amount,blockCreator,nonce)=>{

    let sender=GET_CHAIN_ACC(from),
    
    recipient=GET_CHAIN_ACC(to)||{ACCOUNT:{B:0,N:0,D:''}}//default empty account.Note-here without NonceSet and NonceDuplicates,coz it's only recipient,not spender.If it was spender,we've noticed it on sift process
    
    
    if(!(BLACKLIST.has(from)||sender.ND.has(nonce))){

        //Imitation of signature verification
        await VERIFY(controllerHash,controllerBlock.sig,CHAIN)

        sender.ACCOUNT.B-=1+amount
        
        recipient.ACCOUNT.B+=amount

        sender.ACCOUNT.N<nonce&&(sender.ACCOUNT.N=nonce)
    
        blockCreator.fees++

    }

},



vCR2=async(from,blockCreator,nonce)=>{
    
    //Добавить проверку--->если в делегатах есть некий узел,то отминусовать у делегата ставку(чтоб не нарушать стейкинг)

    let sender=GET_CHAIN_ACC(from)

    if(!(BLACKLIST.has(from)||sender.ND.has(nonce))){

        //Imitation of signature verification
        await VERIFY(controllerHash,controllerBlock.sig,CHAIN)

        sender.ACCOUNT.B-=10000

        sender.ACCOUNT.N<nonce&&(sender.ACCOUNT.N=nonce)//update maximum
    
        blockCreator.fees++

    }

},




vNTX2=async(from,newsHash,blockCreator,nonce)=>{
        
    let sender=GET_CHAIN_ACC(from)

    if(newsHash.length===64 && !(BLACKLIST.has(from)||sender.ND.has(nonce))){

        //Imitation of signature verification
        await VERIFY(controllerHash,controllerBlock.sig,CHAIN)

        sender.ACCOUNT.B--

        sender.ACCOUNT.N<nonce&&(sender.ACCOUNT.N=nonce)
    
        blockCreator.fees++

    }
    
},




verifyControllerBlock=async controllerBlock=>{

    console.log('START VERIFY')


    let chain=controllerBlock.c


    if(await VERIFY(controllerHash,controllerBlock.sig,chain)){



        let sendersAccounts=[],txsToSift=new Map(),rewardBox=new Map()

        txsToSift.set(hash,{d:instantBlock.d,s:instantBlock.s})

        rewardBox.set(hash,{creator:instantBlock.c,fees:0})


        txsToSift.forEach(txsSet=>{
            
            ['d','s'].forEach(type=>
                
                txsSet[type].forEach(tx=>sendersAccounts.push(GET_CHAIN_ACC(tx.c)))

            )
                
            
            sendersAccounts.push(GET_CHAIN_ACC(instantBlock.c))

        })
        
        rewardBox.forEach(reference=>sendersAccounts.push(GET_CHAIN_ACC(reference.creator)))

        //Now cache has all accounts and ready for the next cycle
        await Promise.all(sendersAccounts.splice(0))






        txsToSift.forEach(txsSet=>
            
            ['d','s'].forEach(type=>
        
                txsSet[type].forEach(tx=>{

                    //O(1)
                    if(!BLACKLIST.has(tx.c)){
                    
                        let acc=GET_CHAIN_ACC(tx.c),spend=1+(tx.a||tx.m&&10000||0);
                 
                        (tx.n<=acc.ACCOUNT.N||acc.NS.has(tx.n))?acc.ND.add(tx.n):acc.NS.add(tx.n);
        
                        (acc.OUT-=spend)<0&&BLACKLIST.add(tx.c)
    
                    }    
            
                })    
            
            )

        )


        let txsPromises=[]

        txsToSift.forEach(txsSet=>{
                
            txsSet.d.forEach(obj=>{
                
                if(obj.a) txsPromises.push(vTX2(obj.c,obj.r,obj.a,rewardBox.get(hash),obj.n))
                    
                else if(obj.h) txsPromises.push(vNTX2(obj.c,obj.h,rewardBox.get(hash),obj.n))
            
                else if(obj.d) txsPromises.push(vDLG2(obj.c,obj.d,rewardBox.get(hash),obj.n))
                
                else if(obj.m) txsPromises.push(vCR2(obj.c,rewardBox.get(hash),obj.n))
                
            })
                
            txsSet.s.forEach(obj=>{
                
                if(obj.a) txsPromises.push(vTX2(obj.c,obj.r,obj.t,obj.a,'IzQ3kPHHW7IEjBl7UMVcdpXRoyfekGqadsBxBnLQ3Ss=',chain,obj.n))
                    
                else if(obj.h) txsPromises.push(vNTX2(obj.c,obj.h,instantAddress,chain,obj.n))
            
                else if(obj.d) txsPromises.push(vDLG2(obj.c,obj.d,'IzQ3kPHHW7IEjBl7UMVcdpXRoyfekGqadsBxBnLQ3Ss=',obj.n))
                
                else if(obj.m) txsPromises.push(vCR2(obj.c,obj.m,instantAddress,chain,obj.n))
                
            })

        })

        await Promise.all(txsPromises.splice(0))

        //console.log(ACCOUNTS)
        let controller=await GET_CHAIN_ACC(CHAIN)

        
        rewardBox.forEach(reference=>{
        
            console.log('ALL -> ',reference.fees)

            let acc=GET_CHAIN_ACC(reference.creator),
                
                toInstant=reference.fees*0.8//80% of block to generator
                
            acc.ACCOUNT.B+=toInstant
            
            console.log('To instant -> ',reference.creator,'->',toInstant)
            
            controller.ACCOUNT.B+=reference.fees-toInstant
            
            console.log('To controller -> ',CHAIN,'->',reference.fees-toInstant)

        })


        //----------------------------------------------------------------------------------------------------------------------


        let promises=[]

        
        ACCOUNTS.forEach((acc,addr)=>
            
            promises.push(db.put(addr,acc.ACCOUNT))
        
        )



        //Set some atomic confirmations here before commit state of accounts
        QUANT_CONTROL.SYNC_QUANT=true
        


        fs.writeFileSync('ac.json',JSON.stringify(QUANT_CONTROL))

        await Promise.all(promises.splice(0)).then(async arr=>{
            
            try{
                
                QUANT_CONTROL.COLLAPSED_INDEX=controllerBlock.i
                
                QUANT_CONTROL.COLLAPSED_HASH=controllerHash//for InstantGenerators we do it here

                QUANT_CONTROL.SYNC_QUANT=false//make it false again to sign that we can move on to the next block


                //If error will be here we'll have SYNC_QUANT=true in file
                fs.writeFileSync('ac.json',JSON.stringify(QUANT_CONTROL))

            }catch(e){
            
                console.log('ERROR')
        
                process.exit(107)

            }

        }).catch(e=>{
            
            console.log('PROBLEM')
            
            process.exit(108)
        
        })

    }

}


//for(let i=0;i<100_000;i++) db.put('HcrAYq0tbp1FonOS2sEIT6bt4f8YcC4+sy6bQ0aU7Rs='+i,{B:1000,N:0,D:'ZZZZZZ'})

//db.createReadStream({limit:10}).on('data',console.log)
// console.time('A')
// await verifyControllerBlock(controllerBlock)
// console.timeEnd('A')
//983 18

// db.get('ITWn2/DU7ILqLZcYwjPZvovbI4va2bfOcI0tbR9HV54=').then(console.log)
// db.get('IzQ3kPHHW7IEjBl7UMVcdpXRoyfekGqadsBxBnLQ3Ss=').then(console.log)

/*

{ B: 60485, N: 507, D: 'DELEGATE ADDRESS' }
{ B: 1642030, N: 507, D: 'DELEGATE ADDRESS' }


{ B: 80485, N: 507, D: 'DELEGATE ADDRESS' } + 20 000
{ B: 1722030, N: 507, D: 'DELEGATE ADDRESS' } + 80 000

*/

//console.log('BLACKLIST IS ',BLACKLIST)