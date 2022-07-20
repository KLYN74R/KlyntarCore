//Just import all needed modules with routes

['test.js'].forEach(
    
    mod => import(`./routes/${mod}`)
    
)
