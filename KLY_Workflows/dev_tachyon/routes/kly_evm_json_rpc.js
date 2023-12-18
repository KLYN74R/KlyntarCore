import {EVM_ROUTE_HANDLER} from '@klyntar/klyntarevmjsonrpc'

import {FASTIFY_SERVER} from '../../../klyn74r.js'

import {LOG} from '../../../KLY_Utils/utils.js'




LOG(`\u001b[38;5;93mKLY-EVM JSON-RPC is available via \u001b[38;5;113mPOST /kly_evm_rpc/:SHARD`,'S')

// Bind to enable KLY-EVM JSON-RPC communication. This gives us ability to interact with KLYNTAR ecosystem via well-known instruments, wallets, SDKs, libs and common interfaces for EVM compatible chains

FASTIFY_SERVER

.post('/kly_evm_rpc/:SHARD',EVM_ROUTE_HANDLER)