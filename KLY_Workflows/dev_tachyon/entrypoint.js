// 7 main threads - main core logic

import { BUILD_TEMPORARY_SEQUENCE_OF_VERIFICATION_THREAD } from './life/temp_vt_sequence_builder.js'

import { SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS } from './life/share_block_and_grab_proofs.js'

import { FIND_AGGREGATED_EPOCH_FINALIZATION_PROOFS } from './life/find_new_epoch.js'

import { CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH } from './life/new_epoch_proposer.js'

import { START_VERIFICATION_THREAD } from './verification_process/verification.js'

import { SHARDS_LEADERS_MONITORING } from './life/shards_leaders_monitoring.js'

import { BLOCKCHAIN_GENESIS, CONFIGURATION } from '../../klyn74r.js'

import { PREPARE_BLOCKCHAIN } from './blockchain_preparation.js'

import { BLOCKS_GENERATION } from './life/block_generation.js'

import { COLORS, LOG } from '../../KLY_Utils/utils.js'

export let RUN_BLOCKCHAIN = async () => {
    await PREPARE_BLOCKCHAIN()

    //_________________________ RUN SEVERAL ASYNC THREADS _________________________

    //✅0.Start verification process - process blocks and find new epoch step-by-step
    START_VERIFICATION_THREAD()

    //✅1.Thread to find AEFPs and change the epoch for QT
    FIND_AGGREGATED_EPOCH_FINALIZATION_PROOFS()

    //✅2.Share our blocks within quorum members and get the finalization proofs
    SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS()

    //✅3.Thread to propose AEFPs to move to next epoch
    CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH()

    //✅4.Thread to track changes of leaders on shards
    SHARDS_LEADERS_MONITORING()

    //✅5.Function to build the temporary sequence of blocks to verify them
    BUILD_TEMPORARY_SEQUENCE_OF_VERIFICATION_THREAD()

    //✅6.Start to generate blocks
    BLOCKS_GENERATION()

    //Check if bootstrap nodes is alive
    CONFIGURATION.NODE_LEVEL.BOOTSTRAP_NODES.forEach(endpoint =>
        fetch(endpoint + '/addpeer', {
            method: 'POST',

            body: JSON.stringify([
                BLOCKCHAIN_GENESIS.SYMBIOTE_ID,
                CONFIGURATION.NODE_LEVEL.MY_HOSTNAME
            ]),

            headers: { contentType: 'application/json' }
        })
            .then(res => res.text())

            .then(val =>
                LOG(
                    val === 'OK'
                        ? `Received pingback from \x1b[32;1m${endpoint}\x1b[36;1m. Node is \x1b[32;1malive`
                        : `\x1b[36;1mAnswer from bootstrap \x1b[32;1m${endpoint}\x1b[36;1m => \x1b[34;1m${val}`,
                    COLORS.CYAN
                )
            )

            .catch(error =>
                LOG(
                    `Bootstrap node \x1b[32;1m${endpoint}\x1b[31;1m send no response or some error occured \n${error}`,
                    COLORS.RED
                )
            )
    )
}
