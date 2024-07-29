export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='constructor') return 10000

}




export let CONTRACT = {


    addContract:async(originShard,tx,atomicBatch)=>{

        /*

            Add contract whitelisted to using in account and storage abstractions

            tx.payload.params[0] format is:

            {
                contractID:<WASM or EVM contract to call>,
                
                majorityProofs:{

                    quorumMember1: SIG(originShard+contractID+epochIndex),
                    ...

                }
                
            }

            If majority voted to add contract for AA 2.0 - verify signatures and it will be available to be used from the next epoch(not instantly because of async core work manner)
        
        */

    },

    removeContract:async(originShard,tx,atomicBatch)=>{

        // Remove contract that used in account and storage abstractions

    },

    chargePaymentForStorageUsedByContract:async(originShard,tx,atomicBatch)=>{

        // Method to charge some assets as a rent for storage used by contract. Once charge - update the .storageAbstractionLastPayment field to current value of epoch

    },

}