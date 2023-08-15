//Just import all needed modules with routes

['api.js','main.js','kly_evm_json_rpc.js'].forEach(
    
    mod => import(`./routes/${mod}`)
    
)