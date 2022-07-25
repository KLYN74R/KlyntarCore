//Just import all needed modules with routes
// We have only dev_helloworld/routes/test.js routes set, so only one file here. You can add more if you need

['test.js'].forEach(
    
    mod => import(`./routes/${mod}`)
    
)
