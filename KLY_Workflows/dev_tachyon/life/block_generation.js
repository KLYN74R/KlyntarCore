import {BLOCKCHAIN_DATABASES, EPOCH_METADATA_MAPPING, NODE_METADATA, WORKING_THREADS} from '../blockchain_preparation.js'

import {getUserAccountFromState} from '../common_functions/state_interactions.js'

import {signEd25519} from '../../../KLY_Utils/utils.js'

import {blockLog} from '../common_functions/logging.js'

import {CONFIGURATION} from '../../../klyn74r.js'

import Block from '../structures/block.js'


import Web1337 from 'web1337'




let web1337 = new Web1337({

    chainID:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    workflowVersion:0,
    nodeURL:'http://localhost:7332'
    
});



export let startBlockGenerationThread=async()=>{

    await generateBlocksPortion()

    setTimeout(startBlockGenerationThread,WORKING_THREADS.APPROVEMENT_THREAD.NETWORK_PARAMETERS.BLOCK_TIME)
 
}


let getTransactionsFromMempool = () => NODE_METADATA.MEMPOOL.splice(0,WORKING_THREADS.APPROVEMENT_THREAD.NETWORK_PARAMETERS.TXS_LIMIT_PER_BLOCK)


let mockTestPairs = {

    // Ed25519 keypairs

    "9GQ46rqY238rk2neSwgidap9ww5zbAN4dyqyC7j5ZnBK": "MC4CAQAwBQYDK2VwBCIEILdhTMVYFz2GP8+uKUA+1FnZTEdN8eHFzbb8400cpEU9",
    "6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE": "MC4CAQAwBQYDK2VwBCIEIJT7NA/u+Df874H2DFRbyg43LpJwlhcRsS3Bv8/FUIZN",
    "GUbYLN5NqmRocMBHqS183r2FQRoUjhx1p5nKyyUBpntQ": "MC4CAQAwBQYDK2VwBCIEILjvmDeOmyg1/VG2VKQTzsv6lkIizQpjmRsdfEEIHHU8",
    "3JAeBnsMedzxjCMNWQYcAXtwGVE9A5DBQyXgWBujtL9R": "MC4CAQAwBQYDK2VwBCIEIDteWfNev7NOlNmwP8Irwg5miWKoErYGV+UU5VrFgYev",
    "EGU4u3Anwahbtbx8F1ZZgFQSg2u49EkrkqMERT9r3q1o": "MC4CAQAwBQYDK2VwBCIEICVoiHLIICxjcuWQzq1vTLGJmaiU9fAOLEYKB9ZQR8TN",


    // BLS keypairs

    "0xb2ec32c9d7216163790ba3628a6a6b5a12db457c933b1f4627775b6dae468636233c6ad9931a8ef848a58353e60d33dd":"3981d303762bd2016644021e95052c50cb0916470a7eb36205bb12b97913523a",
    "0x8f079049121d5e2ae885bdc6581df9fb68eab94a7aa3ae54bfe1d1ac35aceefbb202f656b0c1b56d64583630612a9970":"53f9079e2bcda99737d1024564ff422a18fcaf931059a3da76646dbbba85874b",
};


let postQuantumBlissKeypair = {

    pubKey: '0012d71baf1524047e13c5006d00cf0cc3123e0ffe00941dda123a1c1806b50d261b660da60414067b13220793131b1d87099d0571175e0884092512c80d4308ab074e090502220c3519001ac10aad1126085e1c270cf815dc10dc04b508931a870b6619e0067e10cf0a7f1c3b04841452174400fc08ed0507040d1d39176b025b06d317e90057145017090e3907201dd50818020e0e74003504400a1a182c14f609f6117902981367191104050add14bd0b031af10c3e02a1160003011a5b137d00c8167b04521c4b1b9016250aeb01b7038d10a818da144406c91bca1b33195e0fd20930193e0dfa11f20f340da50b1215b51d21197c11060de009eb0c8201fb14110be00ec503bd065207a70953132d1a38115b153507da0a3e01290c8016af1d2c18a417100c1508cc112f146a130c013b014704471dbc02c20038013415621985124419ae10a501170eb70e6d0b220ee405ef17ff1c9b0dce0a1f07a204cf1b7b18b9013a0bdc00af187d169e050e0c201b5915c709b011db11170b06159b1cbe03691d860d00028d187d0e61074a1673027a047f16281bac0cfd09a00a62050c07ee1058020e006407de0adc1036136b10b417eb1b12155919b105f60b1d0bde0a57127b0007087d150c11690b7800930f1e16ec19ac0b8d1d7e1b0f02321c90148d1a47075a091113c9159e051113b403b5063001d3186e13b211c70d20',
    privateKey: 'ba17dd98afb6dc1d13e4aed164d318d7921722f54e26496e1bc347213f0bd77230bf2b59676e7c346b155b660067ffb044a01dcc588ac2b6eb196bda8f981a70',
    address: '4218fb0aaace62c4bfafbdd9adb05b99a9bf1a33eeae074215a51cb644b9a85c'

}


let generateBatchOfMockTransactionsAndPushToMempool = async shardID => {

    const recipient = 'Cw4MjAsm5gRQh7JaiYXvJ9kzgt5xemhe1789kvcXY1Pz';


    for(let [pubKey,privateKey] of Object.entries(mockTestPairs)){

        const from = pubKey;

        const myPrivateKey = privateKey;

        let nonce = await getUserAccountFromState(shardID+':'+pubKey).then(acc=>{

            return acc.nonce

        })

        nonce++

        const fee = 0.03;

        const amountInKLY = 2;

        let signedTx

        let payload = {

            to: recipient,

            amount: amountInKLY,

            touchedAccounts: [pubKey, recipient]

        }

        if(pubKey.startsWith('0x')){

            payload.active = pubKey
            
            payload.afk = []
            
            let singleSig = web1337.signDataForMultisigTransaction(shardID,'TX',privateKey,nonce,fee,payload)

            let signature = singleSig

            signedTx = await web1337.createMultisigTransaction(from,'TX',signature,nonce,fee,payload)

        } else {

            signedTx = await web1337.createEd25519Transaction(shardID,'TX',from,myPrivateKey,nonce,fee,payload);

        }

        console.log(`TXID is => `,web1337.blake3(signedTx.sig))

        NODE_METADATA.MEMPOOL.push(signedTx)
    }

    // Also, for tests, create tx with PQC account

    const from = postQuantumBlissKeypair.address;

    const myPrivateKey = postQuantumBlissKeypair.privateKey;

    let nonce = await getUserAccountFromState(shardID+':'+from).then(acc=>{

        return acc.nonce

    })


    nonce++

    const fee = 0.03;

    const amountInKLY = 2;

    
    let payload = {

        to: recipient,

        amount: amountInKLY,

        touchedAccounts: [from, recipient]

    }

    let signedPqcTx = await web1337.createPostQuantumTransaction(shardID,'TX','bliss',from,myPrivateKey,nonce,fee,payload)

    console.log(`PQC TXID is => `,web1337.blake3(signedPqcTx.sig))

    NODE_METADATA.MEMPOOL.push(signedPqcTx)

}




let generateBlocksPortion = async() => {

    let epochHandler = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH
    
    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let epochIndex = epochHandler.id

    let currentEpochMetadata = EPOCH_METADATA_MAPPING.get(epochFullID)


    if(!currentEpochMetadata) return


    //_________________ No sense to generate blocks more in case we haven't approved the previous ones _________________

    let proofsGrabber = currentEpochMetadata.TEMP_CACHE.get('PROOFS_GRABBER')

    let shouldntGenerateNextBlock = WORKING_THREADS.GENERATION_THREAD.nextIndex > proofsGrabber.acceptedIndex+1

    if(proofsGrabber && WORKING_THREADS.GENERATION_THREAD.epochFullId === epochFullID && shouldntGenerateNextBlock) return


    // Safe "if" branch to prevent unnecessary blocks generation

    if(CONFIGURATION.NODE_LEVEL.BLOCK_GENERATOR_MODE){

        generateBatchOfMockTransactionsAndPushToMempool('shard_0')

        // Check if <epochFullID> is the same in APPROVEMENT_THREAD and in GENERATION_THREAD

        if(WORKING_THREADS.GENERATION_THREAD.epochFullId !== epochFullID){

            // And nullish the index & hash in generation thread for new epoch

            WORKING_THREADS.GENERATION_THREAD.nextIndex = 0

            WORKING_THREADS.GENERATION_THREAD.prevHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'


            WORKING_THREADS.GENERATION_THREAD.epochFullId = epochFullID

            WORKING_THREADS.GENERATION_THREAD.epochIndex = epochIndex


    
        }

        let extraData = {}

        /*

        _________________________________________GENERATE PORTION OF BLOCKS___________________________________________
    
        Here we check how many transactions(events) we have locally and generate as many blocks as it's possible
    
        */

        let numberOfBlocksToGenerate = Math.ceil(NODE_METADATA.MEMPOOL.length / WORKING_THREADS.APPROVEMENT_THREAD.NETWORK_PARAMETERS.TXS_LIMIT_PER_BLOCK)


        //_______________________________________FILL THE BLOCK WITH EXTRA DATA_________________________________________

        // 0. Add the extra data to block from configs(it might be your note, for instance)

        extraData.rest = {...CONFIGURATION.NODE_LEVEL.EXTRA_DATA_TO_BLOCK}


        if(numberOfBlocksToGenerate===0) numberOfBlocksToGenerate++

        let atomicBatch = BLOCKCHAIN_DATABASES.BLOCKS.batch()


        for(let i=0;i<numberOfBlocksToGenerate;i++){

            let blockCandidate = new Block(getTransactionsFromMempool(),extraData,WORKING_THREADS.GENERATION_THREAD.epochFullId)
                            
            let hash = Block.genHash(blockCandidate)
    
    
            blockCandidate.sig = await signEd25519(hash,CONFIGURATION.NODE_LEVEL.PRIVATE_KEY)
                
            blockLog(`New block generated`,hash,blockCandidate,WORKING_THREADS.GENERATION_THREAD.epochIndex)
    
    
            WORKING_THREADS.GENERATION_THREAD.prevHash = hash
     
            WORKING_THREADS.GENERATION_THREAD.nextIndex++
        
            // BlockID has the following format => epochID(epochIndex):Ed25519_Pubkey:IndexOfBlockInCurrentEpoch
            let blockID = WORKING_THREADS.GENERATION_THREAD.epochIndex+':'+CONFIGURATION.NODE_LEVEL.PUBLIC_KEY+':'+blockCandidate.index
    
            // Store block locally
            atomicBatch.put(blockID,blockCandidate)
               
        }
    
        // Update the GENERATION_THREAD after all
        atomicBatch.put('GT',WORKING_THREADS.GENERATION_THREAD)
    
        await atomicBatch.write()
    
    }

}