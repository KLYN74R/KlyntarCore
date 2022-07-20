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


<b>Required configs options</b>

<ul>

<li><code>STOP_WORK</code></li>

true/false - if you want to stop your symbiote

<li><code>VERSION</code></li>

Workflow version

<li><code>INFO</code></li>

Miscellaneous data like email, Telegram, site of symbiote. It might be controlled by DAO,some organization and so on. Might be empty({}). Has no format requirements - use everything you want

</ul>

<li><code>MANIFEST.WORKFLOW</code> and <code>MANIFEST.WORKFLOW_HASH</code></li>

These options are inside <code>MANIFEST</code> object used to load appropriate workflow and start the instance

</ul>

<br/>

<b>Required configs options as a single list</b>

```json

{
    "STOP_WORK":false,
    "VERSION":"13.3.7",
    "MANIFEST":{
        "WORKFLOW":"<YOUR_WORKFLOW>",
        "WORFLOW_HASH":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",//BLAKE3 hash
        ... //other options
    },
    "INFO":{
        "EMAIL":"example@example.com",
        ...
    }
}

```

<br/>

<li>Create file <code>routes.js</code> to define routes for node server</li>

Definitely your node should interact with other nodes / offchain services and so on. Also, you need to propose API, control routes and so on. In this file you tell the core how to load modules with your defined API. This file is on the top level of workflow directory hierarchy. Like this

```shell

KLY_Workflow
│
└───...(other workflows)
│     
└───dev_controller
│   └───routes   
│   │    └───main.js
│   │    └───server.js
│   │    └─... 
│   │
│   │───life.js
│   │───routes.js
│   └───verification.js
│
│
└───dev_controller
│   └───routes   
│   │    └───main.js
│   │    └───server.js
│   │    └─... 
│   │
│   │───life.js
│   │───routes.js
│   └───verification.js
│
...

```

This file has the following structure

```js

//Just import all needed modules with routes

['api.js','control.js','main.js','services.js'].forEach(
    
    mod => import(`./routes/${mod}`)
    
)


```

<li>Create file <code>life.js</code> and export functions <code>RENAISSANCE</code> and <code>PREPARE_SYMBIOTE</code></li>

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


</ul>