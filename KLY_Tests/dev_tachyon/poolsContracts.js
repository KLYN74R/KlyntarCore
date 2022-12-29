/*

                                                    This is the set of tests related to the interactions with the pools' contracts.

                                                                                We need to test:


![*] ------------------------------------------------------- Pool deployment. See dev_tachyon/specContracts/stakingPool.js --------------------------------------------------------


    0) Create new pool(subchain) via TX_TYPE=CONTRACT_DEPLOY with the following payload

    {
        {
            bytecode:'',(empty)
            lang:'spec/stakingPool'
            constructorParams:[BLSPoolRootKey,Percentage,OverStake,WhiteList]
        }
    }

*    [*] BLSPoolRootKey - BLS pubkey for validator. The same as PoolID. It should be your pubkey or aggregated pubkey controlled by some group

    We'll create the pool for our KLY_TESTNET_V1 with the following creds

    {
        privateKey: '8cd685bd53078dd908dc49c40eb38c46305eba1473348b0a573f3598a5c2e32f',
        pubKey: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u'
    }


*    [*] Percentage - % of fees that will be earned by BLS pubkey related to PoolID. The rest(100%-Percentage) will be shared among stakers. The value is in range 0-1

    Our stake will be 70%(so the 30% will be shared among the rest validators). For this, set the value to 0.7
    
    

*    [*] OverStake - number of power(in UNO) allowed to overfill the minimum stake. You need this to prevent deletion from validators pool if your stake are lower than minimum
    
    Hence the minimal required stake is 55000, we stake the KLY(not UNO) and we are a single validator in a pool - we can set the overstake to 0 because we can trust ourself that there will be no surprises with unstake
    


*    [*] WhiteList - array of addresses who can invest in this pool. Thanks to this, you can set own logic to distribute fees,make changes and so on by adding only one address - ID of smart contract

    To prevent contract call by the someone else, set the whitelist to ['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u']





*    So, the payload for constructor for system contract will be like this:

    ['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',0.7,0,['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u']]


+++++++++++++++++++++++++++++++++++++++++++++++++ RESULT +++++++++++++++++++++++++++++++++++++++++++++++++

After pool's contract deployment we should have the following in state


        0) Pool metadata should be present

        {
            key: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)',
            value: {
                type: 'contract',
                lang: 'spec/stakingPool',
                balance: 0,
                uno: 0,
                storages: [ 'POOL' ],
                bytecode: ''
            }
        }

        1) Pool single storage 'POOL' should be present

        {

            key: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)_STORAGE_POOL',
            value: {
                percentage: 0.7,
                overStake: 0,
                whiteList: ['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u'],
                totalPower: 0,
                STAKERS: {},
                WAITING_ROOM: {}
            }
        }


On this step, we've created everything for pool. But it's still not active because we haven't staked on this. We'll stake during the next test below



![*] -------------------------------------------------------- Staking to existing pool --------------------------------------------------------


0) Insofar as for our pool we'll be a single staker, we should have at least 55000 KLY(due to WORKFLOW_OPTIONS on QUORUM_THREAD). We should call the <stake> method and send a 55 000 to contract

TX_TYPE=CONTRACT_CALL, required payload is

    {

        contractID:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)',
        method:'stake',
        energyLimit:0,
        params:[A] params to pass to function. A is alias - see below
        imports:[] imports which should be included to contract instance to call. Example ['default.CROSS-CONTRACT','storage.GET_FROM_ARWEAVE']. As you understand, it's form like <MODULE_NAME>.<METHOD_TO_IMPORT>
        
    }

    This is the single parameter
    
    A={
        pool:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u'
        amount:55000
        units:'KLY'
    }

+++++++++++++++++++++++++++++++++++++++++++++++++ RESULT +++++++++++++++++++++++++++++++++++++++++++++++++

If stake was successfull, your balance will be reduced and your stake will be placed to WAITING_ROOM of contract. We'll speak about it during the next tests

The state will look like this

    {

        key: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)_STORAGE_POOL',
        value: {
            percentage: 0.7,
            overStake: 0,
            whiteList: ['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u'],
            totalPower: 0,
            STAKERS: {},
            WAITING_ROOM: {

                BLAKE3(event.sig):{

                    checkpointID:SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.HEADER.ID,

                    staker:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',

                    amount:55000,

                    units:'KLY',

                    type:'+' //means "STAKE"

                }

            }
        }
    }



![*] -------------------------------------------------------- Move stake from WAITING_ROOM to pool --------------------------------------------------------

We need to add your stake to WAITING_ROOM and only after that - accept the stake to pool due to some sync stuff. QUORUM_THREAD and VERIFICATION_THREAD are async and works independently, however,
if you keep node synced - QT will be equal to VT.

So, once you notice that tx was successfully finalized and your stake is in WAITING_ROOM - you can create special operation to become the staker. It's the last step.
The only thing that you should take from the previous step - hash of event signature BLAKE3(event.sig) - because it's id of our staking transaction



0) Create the STAKING_CONTRACT_CALL special operation. Here's the structure

    {
        type:'STAKING_CONTRACT_CALL',
        
        payload:{

            {
                txid:BLAKE3(event.sig),
                pool:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',
                type:'+'
                amount:55000
    
            }

        }
    
    }


1) Send this special operation to ALL the members of current quorum. They'll make an overview(verification) and add to SPECIAL_OPERATIONS_MEMPOOL and as result - to the SPEICAL_OPERATIONS array in checkpoint

2) Nice - just wait till the next checkpoint and join to the rest of pools and work on your own subchain

3) After next checkpoint, the state will looks like this


    Pool metadata:

    {
        key: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)',
        value: {
            type: 'contract',
            lang: 'spec/stakingPool',
            balance: 0,
            uno: 0,
            storages: [ 'POOL' ],
            bytecode: ''
        }
    }



    {

        key: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)_STORAGE_POOL',
        value: {
            percentage: 0.7,
            overStake: 0,
            whiteList: ['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u'],
            totalPower: 55000,
            STAKERS: {

                '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u':{
                    
                    KLY:55000,
                    UNO:0,
                    REWARD:0
                }                

            },
            WAITING_ROOM: {}
        }
    }

As you see - you're now in STAKERS section. From this moment - all the rewards of this pool will be automatically distributed among all stakers in order to size of their stake
The object {KLY,UNO,REWARD} used for contract logic. We need KLY,UNO to know how many you can unstake and to allow unobtanium minters to change the value of your unobtanium.
REWARD shows how much you earned since the last <getReward> call.




![*] -------------------------------------------------------- How to unstake --------------------------------------------------------


Coming soon(today,but later)


![*] ------------------------------------------------------ How to get rewards --------------------------------------------------------


Coming soon(today,but later)


*/