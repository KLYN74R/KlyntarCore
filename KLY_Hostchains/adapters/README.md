<div align="center">

# π Place for your adapters π

</div>

## Basic information

<span style="color:#28E9C3">

<u>We'll add instructions soon</u>

</span>

There are also some examples.</br>
You can use adapters as middleware between the source and <b>KLYNTAR</b> infrastructure(node,cluster,conveyor,etc.) to perform some custom logic and modify data to appropriate formats for connectors.</br>
To prevent misunderstandings create directory for your another adapter with the same name as connector</br>

For example, if you have your own versions of connectors for Solana,XRP and RSK in directory <b>KLY_Hostchains/connectors/custom_MY_OWN_COLLECTION</b>,then you</br>
should create directory <b>KLY_Hostchains/adapters/custom_MY_OWN_CONS</b> and put inside subdirs Solana,XRP and RSK.</br></br></br>



### Visualisation</br>


```
KLY_Hostchains
β     
β   
ββββadapters
β   β   
β   β   README.md
β   β   
β   ββββcustom_MY_OWN_COLLECTION(kind of root directory for this pack)
β   β    β   
β   β    ββββSolana(all files together)
β   β    β   ββββconfigs.json
β   β    β   ββββserver.js
β   β    β   ββββroutes.js
β   β    β   ββββ...
β   β    β
β   β    ββββXRP   
β   β    β   ββββlistener.rs(use different languages)
β   β    β   ββββbot.js
β   β    β   ββββCargo.toml
β   β    β   ββββ...
β   β    β 
β   β    ββββRSK
β   β         ββββ...
β   β
β   ββββdev0(developers' examples of adapters)
β        ββββ...
β
ββββconnectors
    ββββ...

```