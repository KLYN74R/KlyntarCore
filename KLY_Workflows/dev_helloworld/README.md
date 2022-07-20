# Custom workflow template


Hello everyone! This this the "HelloWorld" workflow example. Follow changes here to understand how to write custom workflows and use them for KLYNTAR symbiotes

<br/>

## Requirements

Although you're free in your ideas & inventions you should follow some rules, use global variables and so on

<br/>

Here is the list

<ul>

<li>File <code>configsTemplate.json</code></li>

Give the template of configuration for your workflow to allow other to customize and use own values

<li>Create file <code>routes.js</code> to define routes for node server</li>

Definitely your node should interact with other nodes / offchain services and so on. Also, you need to propose API, control routes and so on. In this file you tell the core how to load modules with your defined API. This file is on the top level of workflow directory hierarchy. Like this

```shell

KLY_Workflow
│     
└───dev_controller
    └───routes   
│       └───main.js
│       └───configs.json
│       └───server.js
│           
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

<li>Create file <code>life.js</code>and export functions <code>RENAISSANCE</code> and <code>PREPARE_SYMBIOTE</code></li>

<br/>

File <code>dev_helloworld/life.js</code>

```js

export let PREPARE_SYMBIOTE = symbioteID => {

    console.log('************ IMITATION OF PREPARATIONS************')
    console.log('You can skip if you don`t need')
    console.log('************ IMITATION OF RENAISSANCE************')

}



export let RENAISSANCE = symbioteID => {

    console.log('************ IMITATION OF RENAISSANCE************')
    console.log('You can skip if you don`t need')
    console.log('************ IMITATION OF RENAISSANCE************')

}

```

These funciton used on the top level of core in <code>klyn74r.js</code>


<li>Define special varibles to correctly process system signals <code>SIGTERM</code>,<code>SIGINT</code> and <code>SIGHUP</code></li>

</ul>