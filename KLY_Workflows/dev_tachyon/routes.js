// Just import all needed modules with routes

let modules = [
    'api/block_data.js',
    'api/state_data.js',
    'api/misc.js',

    'main/epoch_changing.js',
    'main/epoch_edge_operations.js',
    'main/leaders_rotation.js',
    'main/websocket.js',

    'kly_evm_json_rpc.js'
]

for (let modPath of modules) await import(`./routes/${modPath}`)
