# Custom workflow template


Hello everyone! This this the "HelloWorld" workflow example. Follow changes here to understand how to write custom workflows and use them for KLYNTAR symbiotes


## Requirements

Although you're free in your ideas & inventions you should follow some rules, use global variables and so on

Here is the list

<ul>

<li>File <code>configsTemplate.json</code></li>

Give the template of configuration for your workflow to allow other to customize and use own values

<li>Create file <code>routes.js</code> to define routes for node server</li>

Definitely your node should interact with other nodes / offchain services and so on. Also, you need to propose API, control routes and so on. In this file you tell the core how to load modules with your defined API. This file is on the top level of workflow directory hierarchy. Like this

```shell

KLY_Workflow
│     
│   
└───dev_controller
│   │   
│   └───routes
│   │    │   
│   │    │───main.js
│   │    │   │  
│   │    │   configs.json
│   │    │   └───server.js


```

This file has the following structure

```js

//Just import all needed modules with routes

['api.js','control.js','main.js','services.js'].forEach(
    
    mod => import(`./routes/${mod}`)
    
)


```


</ul>