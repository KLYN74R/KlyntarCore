# <b>KLYNTAR Virtual Machines Collection</b>

### <b>Coming soon</b>
<b>
    <i>
        <u>We'll publish more detailed instructions soon</u>    
    </i>
</b>

<br/>
<p>
This is the location for KLYNTAR virtual machines. They might be various - KLYNTAR VM, EVM, Cosmos VM and so on. Symbiotes use VMs to perform onchain smart-contracts. Each VM should be configurable and present API functionality to allow workflow creators to inject usage of them to code.
</p>

<br/>

<p>Here you can notice the <code>default</code> KLYNTAR VM implementation. It has several templates for configs and cost table to allow workflows creators to use KLYNTAR VM as they want</p>

<br/>

## <b>How to create custom VM</b>

Create subdirectory in <code>KLY_VMs</code> for your implementation.

```shell

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
    └─── configs.json

```

Such structure will help you to easily has access to VM implementation from each KLYNTAR daemon running for some symbiote. Subdirectory might be repository(to track changes).