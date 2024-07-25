export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='constructor') return 0.1

}




export let CONTRACT = {


    addContract:async(transaction,originShard,atomicBatch)=>{

        // Add contract whitelisted to using in account and storage abstractions

    },

    removeContract:async(transaction,originShard,atomicBatch)=>{

        // Remove contract that used in account and storage abstractions

    },

    chargePaymentForStorageUsedByContract:async(transaction,originShard,atomicBatch)=>{

        // Method to charge some assets as a rent for storage used by contract. Once charge - update the .storageAbstractionLastPayment field to current value of epoch

    },

}