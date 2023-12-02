//Just import all needed modules with routes

[
    
    'api/block_data.js',
    'api/state_data.js',
    'api/misc.js',
    
    'main/epoch_changing.js',
    'main/epoch_edge_operations.js',
    'main/reassignment_procedure.js',
    'main/websocket.js',
    
    'kly_evm_json_rpc.js'

].forEach(
    
    mod => import(`./routes/${mod}`)
    
)