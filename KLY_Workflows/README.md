<div align="center">

# <b>Collection of workflows</b>

</div>

## What is workflow?

Workflow - is the main part of each symbiote on KLYNTAR. It's a set of files which describes the logic of separate chain. It contains appropriate routes for network communications, workflow-specific crypto primitives, files with functionality and so on. Here you describe how your symbiote(which will use appropriate workflow) interact with hostchains, other symbiotes, use API of VMs and so on. A good idea is to think about symbiotes & workflows like about crypto-projects and consensus mechanisms.

For example, pairs of crypto-projects and consensus mechanisms:

<ul>

<li><code>Bitcoin - PoW</code></li>
<li><code>Ethereum - PoS</code></li>
<li><code>Tron - DPoS</code></li>
<li>...</li>

</ul>

And pairs of symbiotes and workflows:

<ul>

<li><code>kNULL - dev_tachyon</code></li>
<li><code>Venom - dev_another</code></li>
<li><code>Carnage - some_another_X</code></li>
<li>...</li>

</ul>

<div align="center">

```

The only difference is that workflow has more global meaning than consensus, because contains consensus and other stuff(networking,cryptography and so on)

```

</div>

## How to write custom workflow

See <a href="https://github.com/KlyntarNetwork/KlyntarCore/tree/main/KLY_Workflows/dev_helloworld">here</a>