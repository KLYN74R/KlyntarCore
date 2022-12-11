//Just import all needed modules with routes

['api.js','main.js','services.js'].forEach(
    
    mod => import(`./routes/${mod}`)
    
)