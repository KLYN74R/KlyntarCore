# <b>KLYNTAR Virtual Machines Collection</b>

### <b>Coming soon</b>
<b>
    <i>
        <u>We'll publish more detailed instructions soon</u>    
    </i>
</b>

<br/>
<p>
This is the location for KLYNTAR virtual machines. They might be various - KLYNTAR VM(KLYVM), EVM, Cosmos VM and so on. Symbiotes use VMs to perform onchain smart-contracts. Each VM should be configurable and present API functionality to allow workflow creators to inject usage of them to code.
</p>

<br/>

<p>Here you can notice the <code>default</code> KLYNTAR VM implementation. It has several templates for configs and cost table to allow workflows creators to use KLYNTAR VM as they want</p>

<br/>

## <b>How to create custom VM</b>

Create subdirectory in <code>KLY_VMs</code> for your implementation.

```bash

KLY_VMs
│     
│   
└───default
│   │   
│   │  //...(default implementation of KLYNTAR VM)
│   ...
│
└───custom_VM
    │  
    └─── main.js
    │
    └─── configsTemplate.json

```
Such structure will help you to easily has access to VM implementation from each KLYNTAR daemon running for some symbiote. Subdirectory might be repository(to track changes).

Each new VM must have <code>configsTemplate.json</code> file where your provide the required options for your VM implementation. Developers and node operators will use it to set appropriate options required by symbiote manifest & genesis. By default, you should put file <code>vm.json</code> based on <code>configsTemplate.json</code> to symbiote directory

<br/>

## <b>Example</b>

```bash

export SYMBIOTE_DIR=/some/path/to/symbiote/dir

# Imagine you want to use some VM CUSTOM_VM
# You are in core root directory

cp KLY_VMs/CUSTOM_VM/configsTemplate.json "$SYMBIOTE_DIR/CONFIGS/vm.json"

```

Then, you can modify configs and run symbiote