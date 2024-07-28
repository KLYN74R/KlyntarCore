export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='constructor') return 10000

}




export let CONTRACT = {


    addContract:async(originShard,tx,rewardsAndSuccessfulTxsCollector,atomicBatch)=>{

        // Add contract whitelisted to using in account and storage abstractions

    },

    removeContract:async(originShard,tx,rewardsAndSuccessfulTxsCollector,atomicBatch)=>{

        // Remove contract that used in account and storage abstractions

    },

    chargePaymentForStorageUsedByContract:async(originShard,tx,rewardsAndSuccessfulTxsCollector,atomicBatch)=>{

        // Method to charge some assets as a rent for storage used by contract. Once charge - update the .storageAbstractionLastPayment field to current value of epoch

    },

}