<div align="center">

# 😈 Place for your adapters 😇

</div>

## Basic information

<u>We'll add instructions soon</u>

There are also some examples.</br>
You can use adapters as middleware between source and <b>KLYNTAR</b> node to perform some custom logic and modify data to appropriate formats for connectors.</br>
To prevent misunderstandings create directory for your another adapter with the same name as connector</br>

For example, if you have your own versions of connectors for Solana,XRP and RSK in directory <b>KLY_Hostchains/connectors/custom_MY_OWN_CONS</b>,then you</br>
should create directory <b>KLY_Hostchains/adapters/custom_MY_OWN_CONS</b> and put inside subdirs Solana,XRP and RSK.</br>


#### Visualisation


```
KLY_Hostchains
│     
│   
└───adapters
│   │   
│   │   README.md
│   │   
│   └───custom_MY_OWN_CONS(kind of root directory for such pack)
│   │    │   
│   │    │───Solana(all files together)
│   │    │   └───configs.json
│   │    │   └───server.js
│   │    │   └───routes.js
│   │    │   └───...
│   │    │
│   │    │───XRP   
│   │    │   └───listener.rs(use different languages)
│   │    │   └───bot.js
│   │    │   └───Configs.toml
│   │    │   └───...
│   │    │ 
│   │    │───RSK
│   │         └───...
│   │
│   └───dev0(developers examples of adapters)
│        └───...
│
└───connectors
    └───...

```