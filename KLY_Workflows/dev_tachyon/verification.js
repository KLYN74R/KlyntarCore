import {GET_ACCOUNT_ON_SYMBIOTE,BLOCKLOG,VERIFY,GET_STUFF, SIG} from './utils.js'

import {LOG,SYMBIOTE_ALIAS,BLAKE3} from '../../KLY_Utils/utils.js'

import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import MESSAGE_VERIFIERS from './messagesVerifiers.js'

import Block from './essences/block.js'

import fetch from 'node-fetch'

import Base58 from 'base-58'




global.GETTING_BLOCK_FROM_NETWORK_PROCESS=false




//_____________________________________________________________EXPORT SECTION____________________________________________________________________




export let



//blocksAndProofs - array like this [{b:blockX,p:Proof_for_blockX}, {b:blockY,p:Proof_for_blockY}, ...]
PERFORM_BLOCK_MULTISET=blocksAndProofs=>{

    blocksAndProofs.forEach(
            
        //blockAndProof - {b:<block object>,p:<proof object>}
        async blockAndProof => {
    
            let {b:block,p:bftProof} = blockAndProof,
    
                blockHash=Block.genHash(block.c,block.e,block.v,block.i,block.p)
    
            if(await VERIFY(blockHash,block.sig,block.c)){
    
                SYMBIOTE_META.BLOCKS.put(block.c+":"+block.i,block).catch(e=>{})
    
            }
    
            if(bftProof) SYMBIOTE_META.VALIDATORS_PROOFS.put(block.c+":"+block.i,bftProof).catch(e=>{})
    
        }
    
    )

    //Reset flag
    GETTING_BLOCK_FROM_NETWORK_PROCESS=false

},




/*

? Initially we ask blocks from CONFIG.SYMBIOTE.GET_MULTI node. It might be some CDN service, special API, private fast node and so on

We need to send an array of block IDs e.g. [Validator1:1337,Validator2:1337,Validator3:1337,Validator1337:1337, ... ValidatorX:2294]

*/

GET_BLOCKS_FOR_FUTURE = () => {

    //Set locker
    global.GETTING_BLOCK_FROM_NETWORK_PROCESS=true


    let blocksIDs=[],

        currentValidators=SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS,
    
        limitedPool = currentValidators.slice(0,CONFIG.SYMBIOTE.GET_MULTIPLY_BLOCKS_LIMIT)

    
    if(CONFIG.SYMBIOTE.GET_MULTIPLY_BLOCKS_LIMIT>currentValidators.length){

        let perValidator = Math.floor(CONFIG.SYMBIOTE.GET_MULTIPLY_BLOCKS_LIMIT/currentValidators.length)

        for(let index=0;index<perValidator;index++){

            for(let validator of currentValidators){

                if(validator===CONFIG.SYMBIOTE.PUB) continue

                blocksIDs.push(validator+":"+(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[validator].INDEX+index))

            }

        }


    }else{

        //If number of validators is bigger than our configurated limit to ask in advance blocks, then we ask 1 block per validator(according to VERIFICATION_THREAD state)
        for(let validator of limitedPool) blocksIDs.push(validator+":"+(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[validator].INDEX+1))

    }    


    let blocksIDsInJSON = JSON.stringify(blocksIDs)

    console.log('Going to ask ',blocksIDs)
 
    fetch(CONFIG.SYMBIOTE.GET_MULTI+`/multiplicity`,{
    
        method:'POST',
    
        body: blocksIDsInJSON
    
    
    }).then(r=>r.json()).then(PERFORM_BLOCK_MULTISET).catch(async error=>{
        
        LOG(`Some problem when load multiplicity of blocks on \x1b[32;1m${SYMBIOTE_ALIAS()}\n${error}`,'I')
    
        LOG(`Going to ask for blocks from the other nodes(\x1b[32;1mGET_MULTI\x1b[36;1m node is \x1b[31;1moffline\x1b[36;1m or another error occured)`,'I')

        //Combine all nodes we know about and try to find block there
        let allVisibleNodes=[...CONFIG.SYMBIOTE.BOOTSTRAP_NODES,...SYMBIOTE_META.NEAR]


        for(let url of allVisibleNodes){

            let itsProbablyArrayOfBlocksAndProofs=await fetch(url+'/multiplicity',{method:'POST',body:blocksIDsInJSON}).then(r=>r.json()).catch(e=>false)

            if(itsProbablyArrayOfBlocksAndProofs){

                PERFORM_BLOCK_MULTISET(itsProbablyArrayOfBlocksAndProofs)

                break
                
            }

        }

        //Reset flag
        GETTING_BLOCK_FROM_NETWORK_PROCESS=false

    })

},




GET_BLOCKS_FOR_FUTURE_WRAPPER = async() => {

    !GETTING_BLOCK_FROM_NETWORK_PROCESS //if flag is not disabled - then we still find blocks in another thread
    &&
    await GET_BLOCKS_FOR_FUTURE()

    setTimeout(GET_BLOCKS_FOR_FUTURE_WRAPPER,CONFIG.SYMBIOTE.GET_BLOCKS_FOR_FUTURE_TIMEOUT)

},




//Make all advanced stuff here-check block locally or ask from "GET_BLOCKS_URL" node for new blocks
//If no answer - try to find blocks somewhere else

GET_BLOCK = (blockCreator,index) => {

    let blockID=blockCreator+":"+index

    
    return SYMBIOTE_META.BLOCKS.get(blockID).catch(e=>

        fetch(CONFIG.SYMBIOTE.GET_BLOCKS_URL+`/block/`+blockCreator+":"+index)
    
        .then(r=>r.json()).then(block=>{
    
            let hash=Block.genHash(block.c,block.e,block.v,block.i,block.p)
                
            if(typeof block.e==='object'&&typeof block.p==='string'&&typeof block.sig==='string' && block.i===index && block.c === blockCreator){
    
                BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m  fetched  \x1b[31m——│`,'S',hash,48,'\x1b[31m',block)

                SYMBIOTE_META.BLOCKS.put(blockID,block)
    
                return block
    
            }
    
        }).catch(async error=>{
    
            LOG(`No block \x1b[36;1m${blockCreator+":"+index}\u001b[38;5;3m for symbiote \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m ———> ${error}`,'W')
    
            LOG(`Going to ask for blocks from the other nodes(\x1b[32;1mGET_BLOCKS_URL\x1b[36;1m node is \x1b[31;1moffline\x1b[36;1m or another error occured)`,'I')
    
            //Combine all nodes we know about and try to find block there
            let allVisibleNodes=[CONFIG.SYMBIOTE.GET_MULTI,...CONFIG.SYMBIOTE.BOOTSTRAP_NODES,...SYMBIOTE_META.NEAR]
            
    
            for(let url of allVisibleNodes){

                if(url===CONFIG.SYMBIOTE.MY_HOSTNAME) continue
                
                let itsProbablyBlock=await fetch(url+`/block/`+blockID).then(r=>r.json()).catch(e=>false)
                
                if(itsProbablyBlock){
    
                    let hash=Block.genHash(itsProbablyBlock.c,itsProbablyBlock.e,itsProbablyBlock.v,itsProbablyBlock.i,itsProbablyBlock.p)
                
                    if(typeof itsProbablyBlock.e==='object'&&typeof itsProbablyBlock.p==='string'&&typeof itsProbablyBlock.sig==='string' && itsProbablyBlock.i===index && itsProbablyBlock.c===blockCreator){
    
                        BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m  fetched  \x1b[31m——│`,'S',hash,48,'\x1b[31m',itsProbablyBlock)

                        SYMBIOTE_META.BLOCKS.put(blockID,itsProbablyBlock).catch(e=>{})
    
                        return itsProbablyBlock
    
                    }
    
                }
    
            }
            
        })
    
    )

},




START_TO_FIND_PROOFS_FOR_BLOCK = async blockID => {


    let promises = [],

        proofRef = SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.get(blockID) || {V:{}}


    //If it was aggregated proof and failed verification - then prepare empty template to start new iteration to find proofs
    if(proofRef.A) proofRef={V:{}}


    if(CONFIG.SYMBIOTE.GET_VALIDATORS_PROOFS_URL){

        fetch(CONFIG.SYMBIOTE.GET_VALIDATORS_PROOFS_URL+`/validatorsproofs/`+blockID).then(r=>r.json()).then(
            
            proof => proof.A && SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.set(blockID,proof)
        
        ).catch(_=>{})

    }else{



        //0. Initially,try to get pubkey => node_ip binding 
        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.forEach(
        
            pubKey => promises.push(GET_STUFF(pubKey).then(
            
                url => ({pubKey,pureUrl:url.payload.url})
            
            ))
    
        )

                
        let validatorsUrls = await Promise.all(promises.splice(0)).then(array=>array.filter(Boolean))

        
        //Try to find proofs
        for(let validatorHandler of validatorsUrls){

            //No sense to ask someone whose proof we already have or get the answer from node in blacklist
            if(proofRef.V[validatorHandler.pubKey] || CONFIG.SYMBIOTE.BLACKLISTED_NODES.includes(validatorHandler.pureUrl)) continue

            fetch(validatorHandler.pureUrl+`/validatorsproofs/`+blockID).then(r=>r.json()).then(
            
                proof =>{

                    if(proof.A){

                        SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.set(blockID,proof)
                
                    }else if(proof.S){

                        proofRef.V[validatorHandler.pubKey]=proof.S
                    
                        SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.set(blockID,proofRef)
                    
                    }

                }
            
            ).catch(_=>{})

        }

    }

    //* Probably add queries to other nodes
    //! In the worst case
    
    // for(let url of allVisibleNodes){

    //     let itsProbablyProofs=await fetch(url+`/validatorsproofs/`+blockID).then(r=>r.json()).catch(e=>false)
        
    //     if(itsProbablyProofs){            

    //         SYMBIOTE_META.VALIDATORS_PROOFS.put(blockID,itsProbablyProofs).catch(e=>false)                

    //     }

    // }

},




/*

This is the function where we check the agreement from validators to understand what we should to do

Algorithm:

[+] 0. Initially,we should check if proofs from validators for block with BLOCK_ID have no <skipPoint>

        * skipPoint - is a hash of verification thread to know when we should skip and don't verify block of some validator. We'll check this block later, after validator return to game 



[+] 1. If skipPoint presents in proofs and majority of validators agree with this, then we compare the skipPoint with the current hash of VERIFICATION_THREAD (VERIFICATION_THREAD.CHECKSUM)

It they are equal - then we can skip the block and mark current validator as offline(ACTIVE:false)



[+] 2. If no skipPoint present and majority agree with this - we can securely verify the block following order of VERIFICATION_THREAD


*/
CHECK_BFT_PROOFS_FOR_BLOCK = async (blockId,blockHash) => {




    let proofs = SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.get(blockId) || await SYMBIOTE_META.VALIDATORS_PROOFS.get(blockId).catch(e=>false),

        //We should skip the block in case when skipPoint exsists in validators proofs and it equal to checksum of VERIFICATION_THREAD state
        shouldSkip = proofs.P && BLAKE3(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA)) === proofs.P




    //Optimization stuff
    if(blockId===CONFIG.SYMBIOTE.SKIP_BFT_PROOFS.POINT) CONFIG.SYMBIOTE.SKIP_BFT_PROOFS.ACTIVATE=false
    
    if(CONFIG.SYMBIOTE.SKIP_BFT_PROOFS.ACTIVATE) return {bftProofsIsOk:true,shouldSkip}




    if(proofs){

        
    /*    
        __________________________ Check if (2/3)*N+1 validators have voted to accept this block on this thread or skip and continue after some state of VERIFICATION_THREAD __________________________
        
        Proofs - it's object with the following structure

        {
            ? skipPoint:<BLAKE3 HASH OF VERIFICATION_THREAD WHEN WE SHOULD SKIP THIS BLOCK>

            + votes:{

                [<Validator1_BLS_PubKey>]:<Validator1_BLS_Signature>,
                [<Validator2_BLS_PubKey>]:<Validator2_BLS_Signature>,
                
                ...

                [<Validator3_BLS_PubKey>]:<Validator3_BLS_Signature>,

            }

            ? a:<AGGREGATED or NOT>
            
        }

        
    ███    ██  ██████  ████████ ███████ 
    ████   ██ ██    ██    ██    ██      
    ██ ██  ██ ██    ██    ██    █████   
    ██  ██ ██ ██    ██    ██    ██      
    ██   ████  ██████     ██    ███████ 
                                    
                                    
    
    1. If we have 2 properties and the second is A(aggregated) - then it's case when the first property-value pair - aggregated BLS pubkey & signature of validators and second property - array of AFK validators
    
    2. Otherwise - we have raw version of proofs like previously shown(where string "Check if (2/3)*N+1 validators...")

        
    */




        let bftProofsIsOk=false, // so optimistically
    
            {V:votes,S:skipPoint} = proofs,

            aggregatedValidatorsPublicKey = SYMBIOTE_META.STUFF_CACHE.get('VALIDATORS_AGGREGATED_PUB') || Base58.encode(await bls.aggregatePublicKeys(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.map(Base58.decode))),

            metadataToVerify = skipPoint ? (skipPoint+":"+blockId) : (blockId+":"+blockHash),

            validatorsWhoVoted = Object.keys(votes),

            isAggregatedBranch = true

 


        if (proofs.A && validatorsWhoVoted.length===1){

            /*

                In this case, structure looks like this

                {
                    V:{

                        "AggregatedPubKey as property name":<Signature as value>

                    }                   
                    A:[Pub1,Pub2,Pub3] //array of AFK validators
                }

                Example:

                {
                    
                    V:{

                        "6E4t37dNa7oasEHbHBUZ2QiY67pY9fAPNAATT1TZBG9DULuhZJADswySonHEGQc7nT":"pj7Fg0WIegALdbCGZXFG/Xoa5nbHaFpYqlZfA3/qtUt51WQ/jPlvIdpYwnDQca0WEx2CalDiHJqRekHn6VQ9THRh4NWpfKeB5rIT+89+8QeXZl7UpjUJ61ce84JxmbXg"

                    },
                    
                    A:["7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta","7Wnx41FLF6Pp2vEeigTtrU5194LTyQ9uVq4xe48XZScxpaRjkjSi8oPbQcUVC2LYUT"]
                
                }
        
                If we have 2 properties where the first one is BLS aggregated pubkey of validators(as property name) and aggregated signature as value
                
                the second pair is array - then it's case when the
            
                *    First object - aggregated BLS pubkeys & signatures of validators
            
                *    Second object - array of AFK validators        
        
            */
    
            let validatorsNumber=SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length,

                majority = Math.floor(validatorsNumber*(2/3))+1


            //Check if majority is not bigger than number of validators. It possible when there is small number of validators

            majority = majority > validatorsNumber ? validatorsNumber : majority


            bftProofsIsOk = (validatorsNumber-proofs.A.length)>=majority && await VERIFY(metadataToVerify,votes[validatorsWhoVoted[0]],validatorsWhoVoted[0])

    
        }else{

            isAggregatedBranch = false
        
            //3. Otherwise - we have raw version of proofs
            // In this case we need to through the proofs,make sure that majority has voted for the same version of proofs(agree/disagree, skip/verify and so on)
            let votesPromises = []

            
            for(let singleValidator in votes){

                votesPromises.push(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(singleValidator)
                &&
                VERIFY(metadataToVerify,votes[singleValidator],singleValidator).then(isOk=>isOk&&singleValidator))

            }

            let validatorsWithVerifiedSignatures = await Promise.all(votesPromises).then(
                
                array => array.filter(Boolean) //delete useless / unverified stuff
                
            ).catch(e=>false)




            let validatorsNumber=SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length,

                majority = Math.floor(validatorsNumber*(2/3))+1,

                pureSignatures = []
            

            //Check if majority is not bigger than number of validators. It possible when there is small number of validators
            majority = majority > validatorsNumber ? validatorsNumber : majority


            validatorsWithVerifiedSignatures.forEach(
                        
                validator => pureSignatures.push(Buffer.from(votes[validator],'base64'))
                    
            )

                        
            if(validatorsWithVerifiedSignatures.length===validatorsNumber){

                //If 100% of validators approve this block - OK,accept it and aggregate data
                let aggregatedSignature = Buffer.from(await bls.aggregateSignatures(pureSignatures)).toString('base64')

                let aggregatedProof = {V:{[aggregatedValidatorsPublicKey]:aggregatedSignature},A:[]}

                //And store proof locally
                await SYMBIOTE_META.VALIDATORS_PROOFS.put(blockId,aggregatedProof).catch(e=>{})

                bftProofsIsOk=true


            }else if(validatorsWithVerifiedSignatures.length>=majority){
                
                let aggregatedSignature = Buffer.from(await bls.aggregateSignatures(pureSignatures)).toString('base64')

                //If more than 2/3*N + 1 have voted for block - then ok,but firstly we need to do some extra operations(aggregate to less size,delete useless data and so on)

                //Firstly - find AFK validators
                let pubKeysOfAFKValidators = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.filter(pubKey=>!validatorsWithVerifiedSignatures.includes(pubKey)),
                
                     aggregatedPubKeyOfVoters = Base58.encode(await bls.aggregatePublicKeys(validatorsWithVerifiedSignatures.map(Base58.decode))),

                    aggregatedProof = {
                        
                        V:{
                            
                            [aggregatedPubKeyOfVoters]:aggregatedSignature
                        
                        },
                        
                        A:pubKeysOfAFKValidators
                    
                    }



                //And store proof locally
                await SYMBIOTE_META.VALIDATORS_PROOFS.put(blockId,aggregatedProof).catch(e=>{})

                bftProofsIsOk=true

            }else{

                LOG(`Currently,less than majority have voted for block \x1b[32;1m${blockId} \x1b[36;1m(\x1b[31;1mvotes/majority/validators\x1b[36;1m => \x1b[32;1m${validatorsWithVerifiedSignatures.length}/${majority}/${validatorsNumber}\x1b[36;1m)`,'I')

                START_TO_FIND_PROOFS_FOR_BLOCK(blockId)

            }

       
        }

        
        if(!bftProofsIsOk && isAggregatedBranch) START_TO_FIND_PROOFS_FOR_BLOCK(blockId) //run

        if(bftProofsIsOk) SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.delete(blockId)

        //Finally - return results
        return {bftProofsIsOk,shouldSkip}

    
    }else{

        //Let's find proofs over the network asynchronously
        START_TO_FIND_PROOFS_FOR_BLOCK(blockId)
 
        return {bftProofsIsOk:false}
    
    }

},




START_TO_COUNT_COMMITMENTS=async()=>{


    //++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    //Go through validators commitments about what to do and check if we already have a majority to generate votes to SKIP or to APPROVE   +
    //++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


    //If we track the progress - then no sense to do smth - in this case counting commitments and create a proofs
    if(SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT!==BLAKE3(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA))) return


    //Firstly,check if we have enough votes to at least one of variant, so compare number of commitments grabbed from other validators 
    
    let majority = Math.floor(2/3*SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length)+1,
    
        validatorsWithVerifiedSignaturesWhoVotedToSkip = Object.keys(SYMBIOTE_META.PROGRESS_CHECKER.SKIP_PROOFS),

        skipPoints = SYMBIOTE_META.PROGRESS_CHECKER.SKIP_COMMITMENTS,

        approvePoints = SYMBIOTE_META.PROGRESS_CHECKER.APPROVE_COMMITMENTS,

        stillNoVoted = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length - (skipPoints+approvePoints)


    //Check if majority is not bigger than number of validators. It possible when there is small number of validators
    majority = majority > SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length ? SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length : majority



    //The case when we know for sure that commitments sharing ceremony failed and no solution for SKIP or APPROVE
    //This mean that we shouldn't create skip proofs because some honest validators will send the blocks for us & other validators and the rest of nodes
    if(skipPoints+stillNoVoted<majority && approvePoints+stillNoVoted<majority){

        LOG(`Ceremony done. Wait for block & proofs \x1b[31;1m(S:${skipPoints} | A:${approvePoints})`,'I')

        //Make it null to allow our node to generate proofs for block in "/validatorsproofs" route
        SYMBIOTE_META.PROGRESS_CHECKER.BLOCK_TO_SKIP=''

    }


    if(SYMBIOTE_META.PROGRESS_CHECKER.SKIP_COMMITMENTS>=majority || SYMBIOTE_META.PROGRESS_CHECKER.APPROVE_COMMITMENTS>=majority){


        if(validatorsWithVerifiedSignaturesWhoVotedToSkip.length>=majority){

            LOG(`Going to aggregate \x1b[34;1mSKIP_PROOFS\x1b[32;1m, because majority voted for skip`,'S')

            //Aggregate proofs and push to VALIDATORS_PROOFS_CACHE with appropriate form

            let aggregatedSignature='',

                validatorsMetadataHash = SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT,
                
                blockID = SYMBIOTE_META.PROGRESS_CHECKER.BLOCK_TO_SKIP
                
            /*

                In this case, structure should looks like this

                {
                    V:{

                        "AggregatedPubKey as property name":<Signature as value>

                    }                   
                    A:[Pub1,Pub2,Pub3] //array of AFK validators,

                    P:<skipPoint => verificationThreadChecksum>
                }

                Example:

                {
                    
                    V:{

                        "6E4t37dNa7oasEHbHBUZ2QiY67pY9fAPNAATT1TZBG9DULuhZJADswySonHEGQc7nT":"pj7Fg0WIegALdbCGZXFG/Xoa5nbHaFpYqlZfA3/qtUt51WQ/jPlvIdpYwnDQca0WEx2CalDiHJqRekHn6VQ9THRh4NWpfKeB5rIT+89+8QeXZl7UpjUJ61ce84JxmbXg"

                    },
                    
                    A:["7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta","7Wnx41FLF6Pp2vEeigTtrU5194LTyQ9uVq4xe48XZScxpaRjkjSi8oPbQcUVC2LYUT"],

                    P:
                
                }
        
                If we have 2 properties where the first one is BLS aggregated pubkey of validators(as property name) and aggregated signature as value
                
                the second pair is array - then it's case when the
            
                *    First object - aggregated BLS pubkeys & signatures of validators
            
                *    Second object - array of AFK validators





                ==========================================================

                Single proof look like this

                {
                    V:<Validator's pubkey>

                    P:<SKIP_POINT => Hash of VERIFICATION_THREAD>

                    B:<BLOCK_ID>

                    S:<Signature => SIG(SKIP_POINT+":"+BLOCK_ID)>

                }
        
        
            */        

            let pureSignatures = []


            validatorsWithVerifiedSignaturesWhoVotedToSkip.forEach(pubKey=>{

                pureSignatures.push(Buffer.from(SYMBIOTE_META.PROGRESS_CHECKER.SKIP_PROOFS[pubKey].S,'base64'))

            })
            

            aggregatedSignature = Buffer.from(await bls.aggregateSignatures(pureSignatures)).toString('base64')
        
        
            if(validatorsWithVerifiedSignaturesWhoVotedToSkip.length===SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length){

                //If 100% of validators approve this block - OK,accept it and aggregate data

                let aggregatedValidatorsPublicKey = SYMBIOTE_META.STUFF_CACHE.get('VALIDATORS_AGGREGATED_PUB') || Base58.encode(await bls.aggregatePublicKeys(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.map(Base58.decode)))

                let aggregatedProof = {V:{[aggregatedValidatorsPublicKey]:aggregatedSignature},A:[],P:validatorsMetadataHash}


                //And store proof locally
                await SYMBIOTE_META.VALIDATORS_PROOFS.put(blockID,aggregatedProof).catch(e=>{})


            }else {
            
                //Firstly - find AFK validators
                let pubKeysOfAFKValidators = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.filter(pubKey=>!validatorsWithVerifiedSignaturesWhoVotedToSkip.includes(pubKey)),
        
                    aggregatedPubKeyOfVoters = Base58.encode(await bls.aggregatePublicKeys(validatorsWithVerifiedSignaturesWhoVotedToSkip.map(Base58.decode))),

                    aggregatedProof = {
                    
                        V:{
                        
                            [aggregatedPubKeyOfVoters]:aggregatedSignature
                    
                        },
                    
                        A:pubKeysOfAFKValidators,

                        P:validatorsMetadataHash
                
                    }


                //And store proof locally
                await SYMBIOTE_META.VALIDATORS_PROOFS.put(blockID,aggregatedProof).catch(e=>{})
            
            }

            return
        
        }

        //! Make SYMBIOTE_META.PROGRESS_CHECKER.ACTIVE = false after all to activate checker function again
        //* ✅And make SKIP_COMMITMENTS and APPROVE_COMMITMENTS zero

        if(SYMBIOTE_META.PROGRESS_CHECKER.SKIP_COMMITMENTS>=majority){

            //Here we create proof to skip the block

            /*
            
                Proof is object

                {
                    V:<Validator's pubkey>

                    P:<SKIP_POINT => Hash of VERIFICATION_THREAD>

                    B:<BLOCK_ID>

                    S:<Signature => SIG(SKIP_POINT+":"+BLOCK_ID)>

                }
            
            */

            let myProof = {

                V:CONFIG.SYMBIOTE.PUB,
                
                P:SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT,

                B:SYMBIOTE_META.PROGRESS_CHECKER.BLOCK_TO_SKIP,

                S:await SIG(SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT+":"+SYMBIOTE_META.PROGRESS_CHECKER.BLOCK_TO_SKIP)

            }


            SYMBIOTE_META.PROGRESS_CHECKER.SKIP_PROOFS[CONFIG.SYMBIOTE.PUB]=myProof


            myProof = JSON.stringify(myProof)

            //And share our "skip" proof among other validators & nodes

            let promises = []

            //0. Initially,try to get pubkey => node_ip binding 
            SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.forEach(
        
                pubKey => promises.push(GET_STUFF(pubKey).then(
            
                    url => ({pubKey,pureUrl:url.payload.url})
                    
                ))
    
            )
    
            
            let validatorsUrls = await Promise.all(promises.splice(0)).then(array=>array.filter(Boolean))
            
            LOG(`Going to share proofs to skip.\x1b[34;1mSKIP_COMMITMENTS/MAJORITY\x1b[36;1m ratio is \x1b[34;1m${SYMBIOTE_META.PROGRESS_CHECKER.SKIP_COMMITMENTS}/${majority}`,'I')

            for(let validatorHandler of validatorsUrls){

                if(SYMBIOTE_META.PROGRESS_CHECKER.SKIP_PROOFS[validatorHandler.pubKey]) continue

                fetch(validatorHandler.pureUrl+'/shareskipproofs',{

                    method:'POST',
    
                    body:myProof
    
                }).then(res=>res.json()).then(
                    
                    async counterProof => {

                        let isOK =

                            SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT===counterProof.P //we can vote to skip only if we have the same "stop" point
                            &&
                            SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(counterProof.V) //if prover is validator
                            &&
                            await VERIFY(counterProof.P+":"+counterProof.B,counterProof.S,counterProof.V) //check signature finally

                        
                        if(isOK) SYMBIOTE_META.PROGRESS_CHECKER.SKIP_PROOFS[counterProof.V]=counterProof

                    }
                    
                ).catch(e=>{})

            }


            setTimeout(START_TO_COUNT_COMMITMENTS,CONFIG.SYMBIOTE.COUNT_COMMITMENTS_TO_SKIP_INTERVAL)


        } //If majority have voted for approving block - then just find proofs and do nothing
        else{

            LOG(`Block \x1b[37;1m${SYMBIOTE_META.PROGRESS_CHECKER.BLOCK_TO_SKIP}\x1b[36;1m will be approved.\x1b[34;1mAPPROVE_COMMITMENTS/MAJORITY\x1b[36;1m ratio is \x1b[34;1m${SYMBIOTE_META.PROGRESS_CHECKER.APPROVE_COMMITMENTS}/${majority}`,'I')

            //Make it null to allow our node to generate proofs for block in "/validatorsproofs" route
            SYMBIOTE_META.PROGRESS_CHECKER.BLOCK_TO_SKIP=''

        }

    }else {

        //Re-send commitments to validators whose votes we still don't have

        let promises = []

        //0. Initially,try to get pubkey => node_ip binding 
        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.forEach(
    
            pubKey => promises.push(GET_STUFF(pubKey).then(
        
                url => ({pubKey,pureUrl:url.payload.url})
                
            ))

        )

        
        let validatorsUrls = await Promise.all(promises.splice(0)).then(array=>array.filter(Boolean)), 
        
            myCommitmentInJSON = JSON.stringify(SYMBIOTE_META.PROGRESS_CHECKER.COMMITMENTS[CONFIG.SYMBIOTE.PUB])
        
        LOG(`Going to share \x1b[34;1mSKIP_COMMITMENTS\x1b[36;1m. Current progress stats is (\x1b[31;1mskip/approve/validators\x1b[36;1m => \x1b[32;1m${SYMBIOTE_META.PROGRESS_CHECKER.SKIP_COMMITMENTS}/${SYMBIOTE_META.PROGRESS_CHECKER.APPROVE_COMMITMENTS}/${SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length}\x1b[36;1m)`,'I')
        
        for(let validatorHandler of validatorsUrls){

            if(SYMBIOTE_META.PROGRESS_CHECKER.COMMITMENTS[validatorHandler.pubKey]) continue

            fetch(validatorHandler.pureUrl+`/commitments`,
            
                {
                    method:'POST',
            
                    body:myCommitmentInJSON
                }

            ).then(r=>r.json()).then(
    
                async counterCommitment => {

                    //If everything is OK and validator was stopped on the same point - in this case we receive the same <Commitment> object from validator

                    /*
                
                        Commitment is object like

                           {
                                V:<Validator who sent this message to you>,
                                P:<Hash of VERIFICATION_THREAD>,
                                B:<BlockID>
                                D:<Desicion true/false> - skip or not. If vote to skip - then true, otherwise false
                                S:<Signature of commitment e.g. SIG(P+B+D)>
                
                            }

                    */

                    if(await VERIFY(SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT+":"+SYMBIOTE_META.PROGRESS_CHECKER.BLOCK_TO_SKIP+":"+(counterCommitment.M || ""),counterCommitment.S,validatorHandler.pubKey)){

                        //If signature is OK - we can store this commitment locally

                        if(!SYMBIOTE_META.PROGRESS_CHECKER.COMMITMENTS[validatorHandler.pubKey]){

                            SYMBIOTE_META.PROGRESS_CHECKER.COMMITMENTS[validatorHandler.pubKey]=counterCommitment

                            counterCommitment.M ? SYMBIOTE_META.PROGRESS_CHECKER.SKIP_COMMITMENTS++ : SYMBIOTE_META.PROGRESS_CHECKER.APPROVE_COMMITMENTS++    

                        }

                    }

                }
    
        
            ).catch(e=>{})


        }


        setTimeout(START_TO_COUNT_COMMITMENTS,CONFIG.SYMBIOTE.COUNT_COMMITMENTS_TO_SKIP_INTERVAL)

    }

},




//Function to make time-by-time checkups if VERIFICATION_THREAD is in progress and validator(if your node is a validator)
//Should start preparation to skip blocks of another dormant validator

PROGRESS_CHECKER=async()=>{

    let shouldSkipIteration = 
    
        SYMBIOTE_META.PROGRESS_CHECKER.ACTIVE //If we already "wait" for commitments - skip checker iteration
        &&
        SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT===BLAKE3(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA)) //We shouldn't start another session if our VERIFICATION_THREAD works normally and have a progress since previous iteration
        &&
        !SYMBIOTE_META.PROGRESS_CHECKER.FIRST_CHECK_AFTER_START //But if it's first iteration after node launch - then we shoudn't skip following logic 



    if(shouldSkipIteration) return




    
    if(SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT===BLAKE3(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA))){


        SYMBIOTE_META.PROGRESS_CHECKER.ACTIVE=true //to avoid running PROGRESS_CHECKER function next time when we still don't get consensus about some point

        SYMBIOTE_META.PROGRESS_CHECKER.FIRST_CHECK_AFTER_START=false //once we start this procedure - it's the signal that it's not our first procedure since you run the node instance

        
        LOG('Still no progress(hashes are equal). Going to initiate \x1b[32;1m<SKIP_VALIDATOR>\u001b[38;5;3m procedure','W')


        /*
        
            ██     ██  ██████  ██████  ██   ██     ██     ██ ██ ████████ ██   ██      ██████  ██████  ████████ ██ ███    ███ ██ ███████ ███████ ██████  ███████ 
            ██     ██ ██    ██ ██   ██ ██  ██      ██     ██ ██    ██    ██   ██     ██    ██ ██   ██    ██    ██ ████  ████ ██    ███  ██      ██   ██ ██      
            ██  █  ██ ██    ██ ██████  █████       ██  █  ██ ██    ██    ███████     ██    ██ ██████     ██    ██ ██ ████ ██ ██   ███   █████   ██████  ███████ 
            ██ ███ ██ ██    ██ ██   ██ ██  ██      ██ ███ ██ ██    ██    ██   ██     ██    ██ ██         ██    ██ ██  ██  ██ ██  ███    ██      ██   ██      ██ 
             ███ ███   ██████  ██   ██ ██   ██      ███ ███  ██    ██    ██   ██      ██████  ██         ██    ██ ██      ██ ██ ███████ ███████ ██   ██ ███████
        
        */


        if(CONFIG.SYMBIOTE.ENABLE_ASK_OPTIMIZERS && !SYMBIOTE_META.PROGRESS_CHECKER.ALREADY_ASK_OPTIMIZERS){

            LOG('Ask optimizers if we should start the \x1b[32;1m<SKIP_VALIDATOR>\x1b[36;1m procedure','I')

            // -1. Let's ask OPTIMIZERS if we should start SKIP procedure
            // We do it via messaging among nodes & validators. So send the OPTIMIZER_QUERY_MESSAGE

            /*
    
                Payload is object with the following structure

                +++++++++++++++++++++++++
                + Example: AwakeMessage +
                +++++++++++++++++++++++++

                {
            
                    T:"AWAKE",

                    V:CONFIG.SYMBIOTE.PUB, //AwakeMessage issuer(validator who want to activate his thread again)
                   
                    P:aggregatedPub, //Approver's aggregated BLS pubkey

                    S:aggregatedSignatures,

                    H:myMetadataHash,

                    A:[] //AFK validators who hadn't vote. Need to agregate it to the ROOT_VALIDATORS_KEYS

                }


            */

            let optimizersPromises = []

            for(let optimizerData of CONFIG.SYMBIOTE.NODES_OPTIMIZERS){
    
                optimizersPromises.push(
                    
                    fetch(optimizerData.url+'/vmessage',{
                    
                        method: 'POST',
                    
                        body: JSON.stringify({
    
                            T:"OPTIMIZER_QUERY",
                        
                            B:SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT
    
                        })
                
                    }).then(r=>r.json()).then(resp=>
    
                        VERIFY(resp.p,resp.s,optimizerData.pub).then(_=>resp.p) //verify signature from OPTIMIZER and return his solution if signa is OK
    
                    ).catch(e=>'YES')
                
                )
    
            }
    
            let shouldGiveOneMoreChance = await Promise.all(optimizersPromises.splice(0)).then(arr=>arr.includes('NO'))
    
            //If some optimizer send us promise that "Everything is ok,soon you'll get your proofs or block"
            if(shouldGiveOneMoreChance){

                //But this works only one time,so next iteration you'll start SKIP_PROCEDURE if there will be no progress yet
                SYMBIOTE_META.PROGRESS_CHECKER.ALREADY_ASK_OPTIMIZERS=true

                LOG(`Ok. We'll initiate \x1b[32;1m<SKIP_VALIDATOR>\x1b[36;1m next time`,'I')

                return

            }

        }




        /*
        
        
            ███████ ████████  █████  ██████  ████████     ███████ ██   ██ ██ ██████      ██████  ██████   ██████   ██████ ███████ ██████  ██    ██ ██████  ███████ 
            ██         ██    ██   ██ ██   ██    ██        ██      ██  ██  ██ ██   ██     ██   ██ ██   ██ ██    ██ ██      ██      ██   ██ ██    ██ ██   ██ ██      
            ███████    ██    ███████ ██████     ██        ███████ █████   ██ ██████      ██████  ██████  ██    ██ ██      █████   ██   ██ ██    ██ ██████  █████   
                 ██    ██    ██   ██ ██   ██    ██             ██ ██  ██  ██ ██          ██      ██   ██ ██    ██ ██      ██      ██   ██ ██    ██ ██   ██ ██      
            ███████    ██    ██   ██ ██   ██    ██        ███████ ██   ██ ██ ██          ██      ██   ██  ██████   ██████ ███████ ██████   ██████  ██   ██ ███████ 
                                                                                                                                                                                                                                                                                             
        
        */


            console.log('Checker is ',SYMBIOTE_META.PROGRESS_CHECKER)


        let promises = []

        //0. Initially,try to get pubkey => node_ip binding 
        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.forEach(
    
            pubKey => {

                promises.push(GET_STUFF(pubKey).then(
        
                    url => ({pubKey,pureUrl:url.payload.url})
                    
                ))


                //Also, prepare structure for commitments
                // Insofar as we do hashing over commitments, all validators need to have the same structure
                SYMBIOTE_META.PROGRESS_CHECKER.COMMITMENTS[pubKey]={}

            }

        )

        
        let validatorsUrls = await Promise.all(promises.splice(0)).then(array=>array.filter(Boolean)),

            prevValidatorWeChecked = SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.VALIDATOR,

            validatorsPool = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS,

            //take the next validator in a row. If it's end of validators pool - start from the first validator in array
            currentValidatorToCheck = validatorsPool[validatorsPool.indexOf(prevValidatorWeChecked)+1] || validatorsPool[0],
    
            //We receive {INDEX,HASH,ACTIVE} - it's data from previously checked blocks on this validators' track. We're going to verify next block(INDEX+1)
            currentSessionMetadata = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[currentValidatorToCheck],
    
            blockToSkip = currentValidatorToCheck+":"+(currentSessionMetadata.INDEX+1)



        console.log('Checker is ',SYMBIOTE_META.PROGRESS_CHECKER)

        //Check if this thread (validator) is not in our zone of responsibility in cluster
        if(!(CONFIG.SYMBIOTE.RESPONSIBILITY_ZONES.SHARE_COMMITMENTS.ALL || CONFIG.SYMBIOTE.RESPONSIBILITY_ZONES.SHARE_COMMITMENTS[currentValidatorToCheck])) return


            /*
            
            Going to build our commitment

            Commitment is an object with the following structure 
    
                {
                    V:<Validator who sent this message to you>,
                    P:<Hash of VERIFICATION_THREAD a.k.a. progress point>,
                    B:<BlockID - block which we are going to skip>,

                    ++++++++++++ The following structure might be different for APPROVE and SKIP commitments ++++++++++++

                    ?M:<BlockHash:validatorSignature> - if block exists and we're going to vote to APPROVE - then also send hash with signature(created by block creator) to make sure there is no forks
                    
                        If you're going to skip - then you don't have "M" property in commitment

                    S:<Signature of commitment e.g. SIG(P+B+M)>
                }

            */


        let myCommitmentToSkipOrApprove = {
                
            V:CONFIG.SYMBIOTE.PUB,
            P:SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT,
            B:blockToSkip,
            S:''
       
        }


        //Check if we already have block. This way we check our ability to generate proof for fork with this block

        let blockHashAndSignaByValidator = await SYMBIOTE_META.BLOCKS.get(blockToSkip).then(
            
            block => Block.genHash(block.c,block.e,block.v,block.i,block.p)+':'+block.sig
            
        ).catch(_=>false)


        if(blockHashAndSignaByValidator) {

            myCommitmentToSkipOrApprove.M=blockHashAndSignaByValidator // if we have block - then vote to stop <SKIP_VALIDATOR> procedure and to approve the block

        } else {

            //If we still haven't any proof - then freeze the ability to generate proofs for block to avoid situation when our node generate both proofs - to "skip" and to "accept"

            SYMBIOTE_META.PROGRESS_CHECKER.BLOCK_TO_SKIP=blockToSkip

        }


        myCommitmentToSkipOrApprove.S = await SIG(SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT+":"+blockToSkip+":"+(myCommitmentToSkipOrApprove.M || ""))

        myCommitmentToSkipOrApprove = JSON.stringify(myCommitmentToSkipOrApprove)

        //! Finally, check if PROGRESS_POINT still equal to hash of VALIDATORS_METADATA
        if(SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT!==BLAKE3(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA))) return


        // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        // + Go through the validators and share our commitment about skip|approve the block(and validators thread in general) +
        // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


        //Validator handler is {pubKey,pureUrl}
        for(let validatorHandler of validatorsUrls){
 
            //If we already have commitment(for example, from previous node launch) then no sense to get it again
            if(SYMBIOTE_META.PROGRESS_CHECKER.COMMITMENTS[validatorHandler.pubKey]) continue

            //Share our commitment and receive the answers

            fetch(validatorHandler.pureUrl+`/commitments`,
            
                {
                    method:'POST',

                    body:myCommitmentToSkipOrApprove
                }

            ).then(r=>r.json()).then(
        
                async counterCommitment => {

                    //If everything is OK and validator was stopped on the same point - in this case we receive the same <CommitmentToSkip> object from validator

                    /*
                    
                       Commitment is an object with the following structure 
    
                            {
                                V:<Validator who sent this message to you>,
                                P:<Hash of VERIFICATION_THREAD a.k.a. progress point>,
                                B:<BlockID - block which we are going to skip>,

                            ++++++++++++ The following structure might be different for APPROVE and SKIP commitments ++++++++++++

                                ?M:<BlockHash:validatorSignature> - if block exists and we're going to vote to APPROVE - then also send hash with signature(created by block creator) to make sure there is no forks
                    
                                If you're going to skip - then you don't have "M" property in commitment

                                S:<Signature of commitment e.g. SIG(P+B+M)>
                            }

                    */

                    if(!SYMBIOTE_META.PROGRESS_CHECKER.COMMITMENTS[validatorHandler.pubKey] && await VERIFY(SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT+":"+blockToSkip+":"+(counterCommitment.M || ""),counterCommitment.S,validatorHandler.pubKey)){
                        
                        //If this fork already exist - then add points,otherwise - add the first point
                            

                        //SKIP is the special pre-set fork means that validator has no version of block with <blockID>, so generated commitment to skip

                        let fork = counterCommitment.M ? counterCommitment.M.split(":") : "SKIP",

                            blockCreator = blockToSkip.split(":")[0]

                        /*
                            
                            We need to verify the signature by blockCreator of blockHash to make sure that voter do not try to trick us
                                                            
                            In this case counterCommitment.M looks like ===> BlockHash:validatorSignature

                            So:

                                fork[0] - block hash
                                fork[1] - signature which proofs that blockcreator has signed it
        
                        */


                        //So, if signature failed - then we don't accept commitment from this validator - some error occured or it tries to trick us
                        if(fork!=='SKIP' && !await VERIFY(fork[0],fork[0],blockCreator)) return
                        
                        //If everything is OK - we can store this commitment locally
                        SYMBIOTE_META.PROGRESS_CHECKER.COMMITMENTS[validatorHandler.pubKey]=counterCommitment

                        SYMBIOTE_META.PROGRESS_CHECKER.TOTAL_COMMITMENTS++

                        if(SYMBIOTE_META.PROGRESS_CHECKER.POINTS_PER_FORK[fork]){

                            SYMBIOTE_META.PROGRESS_CHECKER.POINTS_PER_FORK[fork]++

                        }
                        else SYMBIOTE_META.PROGRESS_CHECKER.POINTS_PER_FORK[fork]=1
                        
                        
                    }

                }
        
            ).catch(e=>{})

        }


        START_TO_COUNT_COMMITMENTS()


    }else{

        let progress=BLAKE3(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA))

        LOG(`VERIFICATION_THREAD works fine! (\x1b[31;1m${SYMBIOTE_META.PROGRESS_CHECKER.PROGRESS_POINT} \x1b[36;1m=>\x1b[31;1m ${progress}\x1b[32;1m)`,'S')


        //Update the progress metadata
        SYMBIOTE_META.PROGRESS_CHECKER={

            PROGRESS_POINT:progress,
            
            BLOCK_TO_SKIP:'',
            
            COMMITMENTS:{},
            
            POINTS_PER_FORK:{},

            TOTAL_COMMITMENTS:0,

            ADVERSARIES:{},

            SKIP_PROOFS:{},
   
            ALREADY_ASK_OPTIMIZERS:false

        }

    }

},




START_VERIFICATION_THREAD=async()=>{


    //This option will stop workflow of verification for each symbiote
    if(!SYSTEM_SIGNAL_ACCEPTED){


        THREADS_STILL_WORKS.VERIFICATION=true


        let prevValidatorWeChecked = SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.VALIDATOR,

            validatorsPool=SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS,

            //take the next validator in a row. If it's end of validators pool - start from the first validator in array
            currentValidatorToCheck = validatorsPool[validatorsPool.indexOf(prevValidatorWeChecked)+1] || validatorsPool[0],

            //We receive {INDEX,HASH,ACTIVE} - it's data from previously checked blocks on this validators' track. We're going to verify next block(INDEX+1)
            currentSessionMetadata = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[currentValidatorToCheck],

            blockID =  currentValidatorToCheck+":"+(currentSessionMetadata.INDEX+1),

            //take the next validator in a row. If it's end of validators pool - start from the first validator
            nextValidatorToCheck=validatorsPool[validatorsPool.indexOf(currentValidatorToCheck)+1] || validatorsPool[0],

            nextBlock//to verify block as fast as possible




        //If current validator was marked as "offline" or AFK - skip his blocks till his activity signals
        if(!currentSessionMetadata.ACTIVE){

            /*
                    
                Here we do everything to skip this block and move to the next validator's block
                        
                If 2/3+1 validators have voted to "skip" block - we take the "NEXT+1" block and continue work in verification thread
                    
                Here we just need to change finalized pointer to imitate that "skipped" block was successfully checked and next validator's block should be verified(in the next iteration)

            */

                
            SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.VALIDATOR=currentValidatorToCheck

            SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.INDEX=currentSessionMetadata.INDEX+1
                                    
            SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.HASH='Sleep,the brother of Death @ Homer'


        }else {

            //Try to get block
            let block=await GET_BLOCK(currentValidatorToCheck,currentSessionMetadata.INDEX+1),

                blockHash = block && Block.genHash(block.c,block.e,block.v,block.i,block.p),

                validatorsSolution = await CHECK_BFT_PROOFS_FOR_BLOCK(blockID,blockHash)
        


            if(validatorsSolution.shouldSkip){

                /*
                        
                    Here we do everything to skip this block and move to the next validator's block
                            
                    If 2/3+1 validators have voted to "skip" block - we take the "NEXT+1" block and continue work in verification thread
                        
                    Here we just need to change finalized pointer to imitate that "skipped" block was successfully checked and next validator's block should be verified(in the next iteration)
    
                */

                currentSessionMetadata.ACTIVE=false
    
                SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.VALIDATOR=currentValidatorToCheck

                SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.INDEX=currentSessionMetadata.INDEX+1
                                        
                SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.HASH='Sleep,the brother of Death @ Homer'

                LOG(`Going to skip \x1b[31;1m${currentValidatorToCheck}:${currentSessionMetadata.INDEX+1}`,'S')

    
            }else{
                
                let pointerThatVerificationWasSuccessful = currentSessionMetadata.INDEX+1 //if the id will be increased - then the block was verified and we can move on 

                if(block && validatorsSolution.bftProofsIsOk){

                    await verifyBlock(block)
            
                    //Signal that verification was successful
                    if(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[currentValidatorToCheck].INDEX===pointerThatVerificationWasSuccessful){
                
                        nextBlock=await GET_BLOCK(nextValidatorToCheck,SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[nextValidatorToCheck].INDEX+1)
                
                    }
                    //If verification failed - delete block. It will force to find another(valid) block from network
                    else SYMBIOTE_META.BLOCKS.del(currentValidatorToCheck+':'+(currentSessionMetadata.INDEX+1)).catch(e=>{})
                
                }
                
            }

        }



        if(CONFIG.SYMBIOTE.STOP_VERIFY) return//step over initiation of another timeout and this way-stop the Verification thread


        //If next block is available-instantly start perform.Otherwise-wait few seconds and repeat request
        setTimeout(START_VERIFICATION_THREAD,(nextBlock||!currentSessionMetadata.ACTIVE)?0:CONFIG.SYMBIOTE.VERIFICATION_THREAD_POLLING_INTERVAL)

        //Probably no sense to stop polling via .clearTimeout()
        //UPD:Do it to provide dynamic functionality for start/stop Verification Thread
        
        THREADS_STILL_WORKS.VERIFICATION=false

    
    }else{

        LOG(`Polling for \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[36;1m was stopped`,'I',CONFIG.SYMBIOTE.SYMBIOTE_ID)

        SIG_PROCESS.VERIFY=true

    }

},




MAKE_SNAPSHOT=async()=>{

    let {SNAPSHOT,STATE,VERIFICATION_THREAD,METADATA}=SYMBIOTE_META,//get appropriate dbs & descriptors of symbiote


        //Get current height canary
        canary=await METADATA.get('CANARY').catch(e=>{
            
            LOG(`Can't load canary for snapshot of \x1b[36;1m${SYMBIOTE_ALIAS()}\n${e}`,'W')

            return false
        
        })



    
    //Delete old canary and VT.Now we can't use snapshot till the next canary will be added(in the end of snapshot creating)
    await SNAPSHOT.METADATA.del('CANARY').then(()=>SNAPSHOT.METADATA.del('VT')).catch(e=>{

        LOG(`Can't delete canary or VT from snapshot on \x1b[36;1m${SYMBIOTE_ALIAS()}\n\x1b[31;1m${e}`,'F')

        process.emit('SIGINT',137)

    })




    //_____________________________________________________Now we can make snapshot_____________________________________________________

    LOG(`Start making snapshot for ${SYMBIOTE_ALIAS()}`,'I')

    
    //Init in-memory caches
    let records={}


    //Check if we should do full or partial snapshot.See https://github.com/KLYN74R/CIIPs
    if(CONFIG.SYMBIOTE.SNAPSHOTS.ALL){
        
        await new Promise(
        
            resolve => STATE.createReadStream()
            
                            .on('data',data=>records[data.key]=data.value)//add state of each account to snapshot dbs
            
                            .on('close',resolve)
            
        ).catch(e=>{
    
                LOG(`Snapshot creation failed on state copying stage for ${SYMBIOTE_ALIAS()}\n${e}`,'W')
                
                process.emit('SIGINT',130)
    
            })

    }else{

        //Read only part of state to make snapshot for backups
        //Set your own policy of backups with your other nodes,infrastructure etc.
        let choosen=JSON.parse(process.env.SNAPSHOTS_PATH+`/separation/${CONFIG.SYMBIOTE.SYMBIOTE_ID}.json`),
        
            getPromises=[]


        choosen.forEach(
            
            recordId => getPromises.push(STATE.get(recordId).then(acc=>records[recordId]=acc))
            
        )


        await Promise.all(getPromises.splice(0)).catch( e => {
    
            LOG(`Snapshot creation failed on getting choosen records for ${SYMBIOTE_ALIAS()}\n${e}`,'W')
            
            process.emit('SIGINT',130)

        })
        

    }
    

    let write=[]

    Object.keys(records).forEach(id=>write.push(SNAPSHOT.STATE.put(id,records[id])))




    //After that-put another updated canary,to tell the core that this snapshot is valid and state inside is OK
    await Promise.all(write.splice(0))
    
                    .then(_=>SNAPSHOT.METADATA.put('CANARY',canary))//put canary to snapshot
                    
                    .then(()=>SNAPSHOT.METADATA.put('VT',VERIFICATION_THREAD))//...and VERIFICATION_THREAD(to get info about collapsed height,hash etc.)
                    
                    .catch(e => {

                        LOG(`Snapshot creation failed for ${SYMBIOTE_ALIAS()}\n${e}`,'W')
        
                        process.emit('SIGINT',130)

                    })

    LOG(`Snapshot was successfully created for \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m on height \x1b[36;1m${VERIFICATION_THREAD.FINALIZED_POINTER.HASH} ### ${VERIFICATION_THREAD.FINALIZED_POINTER.INDEX}`,'S')




},




verifyBlock=async block=>{


    let blockHash=Block.genHash(block.c,block.e,block.v,block.i,block.p),


    overviewOk=
    
        block.e?.length<=CONFIG.SYMBIOTE.MANIFEST.EVENTS_LIMIT_PER_BLOCK
        &&
        block.v?.length<=CONFIG.SYMBIOTE.MANIFEST.VALIDATORS_STUFF_LIMIT_PER_BLOCK
        &&
        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[block.c].HASH === block.p//it should be a chain
        &&
        await VERIFY(blockHash,block.sig,block.c)


    if(block.i === CONFIG.SYMBIOTE.CHECKPOINT.HEIGHT && blockHash !== CONFIG.SYMBIOTE.CHECKPOINT.HEIGHT){

        LOG(`Checkpoint verification failed. Delete the CHAINDATA/BLOCKS,CHAINDATA/METADATA,CHAINDATA/STATE and SNAPSHOTS. Resync node with the right blockchain or load the true snapshot`,'F')

        LOG('Going to stop...','W')

        process.emit('SIGINT')

    }


    if(overviewOk){


        //To calculate fees and split between validators.Currently - general fees sum is 0. It will be increased each performed transaction
        let rewardBox={fees:0}


        //_________________________________________GET ACCOUNTS FROM STORAGE____________________________________________
        

        let sendersAccounts=[]
        
        //Go through each event,get accounts of initiators from state by creating promise and push to array for faster resolve
        block.e.forEach(event=>sendersAccounts.push(GET_ACCOUNT_ON_SYMBIOTE(event.c)))
        
        //Push accounts of validators
        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.forEach(pubKey=>sendersAccounts.push(GET_ACCOUNT_ON_SYMBIOTE(pubKey)))

        //Now cache has all accounts and ready for the next cycles
        await Promise.all(sendersAccounts.splice(0))


        //______________________________________CALCULATE TOTAL FEES AND AMOUNTS________________________________________


        block.e.forEach(event=>{

            //O(1),coz it's set
            if(!SYMBIOTE_META.BLACKLIST.has(event.c)){

                
                let acc=GET_ACCOUNT_ON_SYMBIOTE(event.c),
                    
                    spend=SYMBIOTE_META.SPENDERS[event.t]?.(event) || CONFIG.SYMBIOTE.MANIFEST.DEFAULT_PAYMENT_IF_WRONG_TYPE



                        
                //If no such address-it's a signal that transaction can't be accepted
                if(!acc) return;
             
                (event.n<=acc.ACCOUNT.N||acc.NS.has(event.n)) ? acc.ND.add(event.n) : acc.NS.add(event.n);
    
                if((acc.OUT-=spend)<0 || !SYMBIOTE_META.SPENDERS[event.t]) SYMBIOTE_META.BLACKLIST.add(event.c)

            }

        })


        //___________________________________________START TO PERFORM EVENTS____________________________________________

        
        let eventsPromises=[]


        block.e.forEach(event=>
                
            //If verifier to such event exsist-then verify it!
            SYMBIOTE_META.VERIFIERS[event.t]
            &&
            eventsPromises.push(SYMBIOTE_META.VERIFIERS[event.t](event,rewardBox))

        )
        
        await Promise.all(eventsPromises.splice(0))

        LOG(`Blacklist size(\u001b[38;5;177m${block.c+":"+block.i}\x1b[32;1m ### \u001b[38;5;177m${blockHash}\u001b[38;5;3m) ———> \x1b[36;1m${SYMBIOTE_META.BLACKLIST.size}`,'W')


        //____________________________________________PERFORM SYNC OPERATIONS___________________________________________

        // Some events must be synchronized

        //_______________________________________PERFORM VALIDATORS_STUFF OPERATIONS____________________________________

        // We need it for consensus too, so do it in a separate structure

        let validatorsStuffOperations = []


        for(let operation of block.v){

            validatorsStuffOperations.push(MESSAGE_VERIFIERS[operation.T]?.(operation,true).catch(e=>''))

        }


        await Promise.all(validatorsStuffOperations.splice(0))


        //__________________________________________SHARE FEES AMONG VALIDATORS_________________________________________
        

        let shareFeesPromises=[], 

            payToValidator = rewardBox.fees * CONFIG.SYMBIOTE.MANIFEST.VALIDATOR_REWARD_PERCENTAGE, //the biggest part is usually delegated to creator of block
        
            payToSingleNonCreatorValidator = Math.floor((rewardBox.fees - payToValidator)/(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length-1))//and share the rest among other validators




        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.forEach(validatorPubKey=>

            shareFeesPromises.push(

                GET_ACCOUNT_ON_SYMBIOTE(validatorPubKey).then(accountRef=>accountRef.ACCOUNT.B+=payToSingleNonCreatorValidator)

            )
            
        )
     
        await Promise.all(shareFeesPromises.splice(0))


        //Probably you would like to store only state or you just run another node via cloud module and want to store some range of blocks remotely
        if(CONFIG.SYMBIOTE.STORE_BLOCKS){
            
            //No matter if we already have this block-resave it

            SYMBIOTE_META.BLOCKS.put(block.c+":"+block.i,block).catch(e=>LOG(`Failed to store block ${block.i} on ${SYMBIOTE_ALIAS()}\nError:${e}`,'W'))

        }else{

            //...but if we shouldn't store and have it locally(received probably by range loading)-then delete
            SYMBIOTE_META.BLOCKS.del(block.c+":"+block.i).catch(
                
                e => LOG(`Failed to delete block ${block.i} on ${SYMBIOTE_ALIAS()}\nError:${e}`,'W')
                
            )

        }


        //________________________________________________COMMIT STATE__________________________________________________    

        SYMBIOTE_META.VERIFICATION_THREAD.DATA={}//prepare empty staging data


        let promises=[],snapshot={ACCOUNTS:{},EVENTS:{}}
        


        
        //Commit state
        //Use caching(such primitive for the first time)
        if(SYMBIOTE_META.ACCOUNTS.size>=CONFIG.SYMBIOTE.BLOCK_TO_BLOCK_CACHE_SIZE){

            SYMBIOTE_META.ACCOUNTS.forEach((acc,addr)=>{

                promises.push(SYMBIOTE_META.STATE.put(addr,acc.ACCOUNT))

                snapshot.ACCOUNTS[addr]=acc.ACCOUNT

            })
            
            SYMBIOTE_META.ACCOUNTS.clear()//flush cache.NOTE-some kind of advanced upgrade soon
        
        }else{
            
            SYMBIOTE_META.ACCOUNTS.forEach((acc,addr)=>{

                promises.push(SYMBIOTE_META.STATE.put(addr,acc.ACCOUNT))
            
                snapshot.ACCOUNTS[addr]=acc.ACCOUNT



                //Update urgent balance for the next blocks
                acc.OUT=acc.ACCOUNT.B

                //Clear sets of nonces(NOTE: Optional chaining here because some accounts are newly created)
                acc.NS?.clear()
                acc.ND?.clear()

            })
        
        }


        
        //Create for each type of events which occured changes
        SYMBIOTE_META.EVENTS_STATE.forEach(
            
            (eventChanges,eventId)=>{

                //Add to snapshot for durability
                snapshot.EVENTS[eventId]=eventChanges

                //...and definitely to state
                promises.push(SYMBIOTE_META.STATE.put(eventId,eventChanges))

            }
        
        )



        //Change finalization pointer
        SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.VALIDATOR=block.c

        SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.INDEX=block.i
                
        SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.HASH=blockHash

        
        //Change metadata
        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[block.c].INDEX=block.i

        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[block.c].HASH=blockHash



        SYMBIOTE_META.VERIFICATION_THREAD.DATA=snapshot

        SYMBIOTE_META.VERIFICATION_THREAD.CHECKSUM=BLAKE3(
            
            JSON.stringify(snapshot)
            +
            JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER)
            +
            JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS)
            +
            JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA)
        
        )

        //Finally - decrease the counter to snapshot
        
        SYMBIOTE_META.VERIFICATION_THREAD.SNAPSHOT_COUNTER--

        let snapCounter=SYMBIOTE_META.VERIFICATION_THREAD.SNAPSHOT_COUNTER




        //Make commit to staging area
        await SYMBIOTE_META.METADATA.put('VT',SYMBIOTE_META.VERIFICATION_THREAD)



        
        SYMBIOTE_META.EVENTS_STATE.clear()

        //Also just clear and add some advanced logic later-it will be crucial important upgrade for process of phantom blocks
        SYMBIOTE_META.BLACKLIST.clear()
        


        //____________________________________NOW WE CAN SAFELY WRITE STATE OF ACCOUNTS_________________________________
        

        await Promise.all(promises.splice(0)).then(()=>
            
            SYMBIOTE_META.METADATA.put('CANARY',SYMBIOTE_META.VERIFICATION_THREAD.CHECKSUM)//canary is the signal that current height is verified and you can continue from this point

        ).catch(e=>{
            
            LOG(`Problem when write to state or canary on \x1b[36;1m${SYMBIOTE_ALIAS()}\n${e}`,'F')
            
            process.emit('SIGINT',108)
        
        })


        //__________________________________________CREATE SNAPSHOT IF YOU NEED_________________________________________


        block.i!==0//no sense to snaphost if no blocks yet
        &&
        CONFIG.SYMBIOTE.SNAPSHOTS.ENABLE//probably you don't won't to make snapshot on this machine
        &&
        snapCounter===0//if it's time to make snapshot(e.g. next 200th block generated)
        &&
        await MAKE_SNAPSHOT()


        //____________________________________________FINALLY-CHECK WORKFLOW____________________________________________

        //Here we check if has proofs for this block in any hostchain for this symbiote.So here we check workflow

        let workflow=CONFIG.SYMBIOTE.WORKFLOW_CHECK.HOSTCHAINS
        
        Object.keys(workflow).forEach(ticker=>

            workflow[ticker].STORE
            &&
            SYMBIOTE_META.HOSTCHAINS_DATA.get(block.i+ticker).then(async proof=>{

                let response = await HOSTCHAINS.get(ticker).checkTx(proof.HOSTCHAIN_HASH,block.i,proof.KLYNTAR_HASH,symbiote).catch(e=>-1)
                    
                if(proof.KLYNTAR_HASH===blockHash && response!=-1 && response){

                    LOG(`Proof for block \x1b[36;1m${block.i}\x1b[32;1m on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m verified and stored`,'S')

                }else{

                    LOG(`Can't write proof for block \x1b[36;1m${block.i}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W')

                    //...send report

                }
                
            }).catch(e=>{})
            
        )

    }

}