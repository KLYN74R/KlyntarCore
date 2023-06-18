
<div align="center">

<img src="./images/CorePreview.png" height="600px">

#

</div>

## 📖 Content

- [Intro](#intro)
- [WhoAmI](#who_am_i)
- [How to build](#build)
- [Running AntiVenom(testnet)](#testnet)
- [Running kNULL](#kNULL)
- [Summary](#summary)
- [Advice](#advice)
- [Docs](#docs)

<br/><br/>

<div name="intro"></div>

## ⚡ <b>Intro</b> 
<br/>

<div align="center">

# <b>KLYNTAR</b> - symbiotic blockchain platform which takes the best from other projects, add new cool features and breaks into the industry

</div>

Working on KLYNTAR, we've been trying to make a project so powerful to wonder you as in your 8 y.o. when you've got to know Santa doesn't exsist 🎅. This project isn't another shitcoin, 10<sup>th</sup> generation of memecoins, scam NFT project or so on. We want to resurrect the time of useful projects by creating cool stuff for our industry like <b>Unobtanium</b>, <b>KLYNTAR Services</b>, <b>Hivemind</b>, <b>SpookyAction</b>, <b>symbiotes</b> and much more! Symbiosis with other projects(chains) will give you ability to use the best and so loved functions from other cryptos. The sense is to join as new blockchains as old ones in one super organizm and make a revolution in cryptoindustry! Common resources, different consensuses, BTC miners, ETH token hodlers, Solana validators, maximum security based on security of whole the crypto industry - everything on KLYNTAR :)

<br/>
<div align="center">

# We're geeks. We love crypto

</div>

<br/>

## This project can involve literally everyone:

- Developers will find here abilites to create decentralized services on any language they want and using latest & most reliable technologies like powerful set of crypto algorithms(Cryptoland), tons of offchain work, cross & multichain interactions, and so on. Our strong community will devolope plugins to customize your infrastructure and improve workflows, create best practises, will work on our Cryptoland, improve security of runners & containers by adding cybersec stuff and so on! 
- Enterprise players will have an ability to build & control clusters of nodes,runners and run symbiotes
- Resources owners can use probably the most advanced staking system using <b>Unobtanium</b> - a KLYNTAR unified resource which includes your mined Bitcoin blocks, combination of tokens on Avalanche, validators place on Polkadot and so on!
- Everyone who has server & laptop & any other machine will make our empire more powerful. The installation processes are minified to several commands in pre-build Docker images, so we also save your health & nervous system & time
- It you are miner, journalist, sportsmen, crypto-geek - welcome to KLYNTAR where everything you own can be useful
- ...and...read our other docs 😀

<br/><br/>

<div name="who_am_i"></div>

## 🎭 <b>WhoAmI</b>

<br/>

The <a href="https://github.com/KlyntarTeam"><b>@KlyntarTeam</b></a> consists of primarly young players. We love our industry and last years have been working on KLYNTAR & other projects which will become the part of KLY ecosystem in future:

<br/>

- <b>Vlad Chernenko(CTO,CEO,Co-Founder)</b>  
  
  It's me) .../add more info soon/ 
    
- <b>Ivan Ushkov(CFO,COO,Co-Founder)</b>
  
  Ivan is .../add more info soon/  

- <b>KLY Community</b> 
  
  Join our community and let's make the future brighter


<br/><br/>

<div name="build"></div>

## 🏗️ <b>How to build</b>

<br/>

<p>
As you've seen, KLYNTAR is in symbiotic relationship with other blockchains. By running different nodes of other projects, working with tools required by them, the most auful & irritating problem was problem with initial setup - misconfigs, old docs, semver mistakes, nightly versions and so on. That's why, we've prepared docker images to allow you to be sure that you'll have 100% succesful setup. Recommended to be used to run KLY nodes & clusters, Apollo and so on.It's for better experience not to force you to waste time for finding misconfigs, dependencies problems and so on. Build & run quickly and let's start 🚀

<br/>

### <b>NOTE</b>
We assume that you have Docker on the board. You can install Docker for Linux & Windows & Mac <a href="https://docs.docker.com/engine/install/">here</a>

```shell

johndoe@klyntar:~$ docker -v
Docker version 20.10.14, build a224086

```

<br/><br/>

### <b>Download the image</b>

We present you our first image <a href="https://hub.docker.com/repository/docker/klyntar/all_in_one" target="_blank" rel="noopener">klyntar/all_in_one</a>.

<br/><br/>
<img src="http://dockeri.co/image/klyntar/all_in_one">
<br/><br/>

This is universal image with preinstalled Node.js, Go , Python and some tools like <code>pnpm</code> , <code>node-gyp</code>, <code>git</code> and so on. This is the base layer for all our Dockerfiles(at least for core and Apollo). The aproximate compressed size is 606M. Also, in our repository <a href="https://github.com/KLYN74R/KlyntarBaseImage" target="_blank" rel="noopener">KlyntarBaseImages</a> you can find the sources of all base-layer Dockerfiles, so you can clone and build it yourself or find the bash build script and so through the process to install requirements to your host machine. But anyway,we recomend you to use containers.


<img src="https://user-images.githubusercontent.com/53381472/174490998-2041af0d-6cd5-4873-ad64-fa810cda02df.jpg"/>

```shell

docker pull klyntar/all_in_one@sha256:dff001a9cd3da6328c504b52ed8a5748c47d23219feae220930dac1c1981cfe7

```

<br/><br/>

### <b>Run container</b>

<p>We recomend you to expose several ports for container</p>

Honestly,you can choose other ports,but use these ones as a good manner

- <b>7331</b> - mainnet/kNULL default port for initial symbiote kNULL <b> Easter egg:It's reversed 1337 :) </b> 
  
- <b>9691</b> - default Apollo UI server port <b>Easter egg:it's reversed 1969-the Apollo-11 mission and the first moon landing</b>
  
- <b>11111</b> - local testnet(AntiVenom)

<br/><br/>

> <b>⚠ ATTENTION:</b>  
>   
> This setup is the most default & simple way. If you need,you can manually run container with more advanced steps e.g. by using volumes,set user and so on

<br/><br/>


```shell
docker run -dtp 7331:7331 -p 9691:9691 -p 11111:11111 --name klyntar0 klyntar/all_in_one@sha256:dff001a9cd3da6328c504b52ed8a5748c47d23219feae220930dac1c1981cfe7
```

<br/><br/>

### <b>Final</b>

Go into container to root dir

```shell
docker exec -ti klyntar0 bash

# Inside container

cd ~

```

Clone KlyntarCore repository
```shell

git clone https://github.com/KLYN74R/KlyntarCore.git

cd KlyntarCore

```

Finally,run the only one command
```shell

pnpm run build

```

<div align="center">

  ## <b>Now take a rest and see the building process. It may take some minutes,but you're free from self-install tons of libs,dependencies and walking among dirs</b>

  <img src="https://i.pinimg.com/originals/d0/63/09/d063096ba4e07795c1bdf98572cb79a8.gif" style="height:200px;width:auto;">

<br/>

</div>

> <b>⚠ ATTENTION:</b>  
> 
> As we said before,this setup is the most default way for quick start. In a nutshell, KLYNTAR go through the dirs and runs Typescript compiler, set access rights(700 by default for root user) for build scripts, build addons via Go compiler and run <code>npm link</code> to make possible to run <code>klyntar</code> as binary from <code>PATH</code> (by creating symlink to Node.js dir)

<br/><br/>

<div align="center">

### The signs that build was succesful are messages to console like this
<br/>

  <img src="https://user-images.githubusercontent.com/53381472/174610940-55ed92b8-bba3-4057-921e-2f1809c332d4.jpg">

<br/>

### ...and after building Go addons
<br/>

  <img src="https://user-images.githubusercontent.com/53381472/174610936-3df6ea44-25fc-441d-8cc3-0f3dd414edf5.jpg">

<br/>

</div>

<!-- ### <b>...One more thing</b>

Insofar as KLYNTAR has many chains ( known as <b>symbiotes</b>) which symbiotically linked with the <b>hostchains</b> (Bitcoin,Ethereum,Avalanche,Solana,Dogecoin,XRP and other chains), we need <b>connectors</b> to allow symbiotes to interact with hostchains(e.g. reading contract state, getting blocks, write to hostchains and so on)

<br/><br/>

- ### <b>kNULL</b>
  Our initial symbiote runned by KlyntarTeam will use <a href="https://github.com/KLYN74R/KlyntarCore/tree/main/KLY_Hostchains/connectors/dev0"> <b>dev0</b> </a> pack with connectors. The initial set of hostchains will become public soon.

- ### <b>AntiVenom</b>
  The alias for testnet by default configuration(<a href="https://github.com/KLYN74R/KlyntarCore/blob/main/ANTIVENOM/CONFIGS/symbiotes.json"><b></a>ANTIVENOM/CONFIGS/symbiotes.json</b>) have disabled connection with the hostchains(or their testnets) but anyway, as far you can enable it, you should have installed dependecies for packs with connectors

```js

//Somewhere inside symbiotes.json

"STOP_HOSTCHAIN":true


```

<br/>

Finally, go to dev0 directory and install node modules

```shell

# In KlyntarCore directory

cd KLY_Hostchains/connectors/dev0

pnpm install

```
<br/><br/>

<div align="center">

# 🚀Success,now your KLYNTAR is ready to start 🚀

</div>




<br/><br/>

<div name="testnet"></div>

## ☄️ <b>Running AntiVenom(testnet)</b>

<br/>

We assume that before to start some symbiote, you want to run at least local testnet to check how it works,to get used to the interface and so on. For this, you can instantly run AntiVenom locally. The testnet directory is <b>KlyntarCore/ANTIVENOM</b> and has the following structure:


```
KlyntarCore
│     
│   
└───ANTIVENOM (default testnet directory if you don't override it via env variable)
│   │   
│   │   
│   └───CHAINDATA(will be created after the daemon run in testnet mode)
│   │    │
│   │    │───CANDIDATES
│   │    │───CONTROLLER_BLOCKS
│   │    │───HOSTCHAINS_DATA
│   │    │───INSTANT_BLOCKS
│   │    │───METADATA
│   │    └───STATE
│   │        
│   └───CONFIGS
│   │    │
│   │    │───network.json
│   │    │───node.json
│   │    │───services.json
│   │    └───symbiotes.json
│   │
│   └───GENESIS
│   

```

### <b>Recomendation</b>

To run any symbiote you need two directories - <b>CONFIGS</b> and <b>GENESIS</b>. You can find them on our site or on sites/resources of someone who runs other symbiotes.Let's create a separate directory for our local testnet AntiVenom with the default values.

```shell

# In ~/KlyntarCore

mkdir -p ANTIVENOM_0

cd ANTIVENOM

cp -r CONFIGS GENESIS ../ANTIVENOM_0

```
Now, you can set some environment variables to set the path for this directory and other values. Find out more on our resources, but now we need only env for path


```shell

export SYMBIOTE_DIR=~/KlyntarCore/ANTIVENOM_0

```

Now set mode

```shell

export KLY_MODE=test

```
Finally run

```shell

klyntar

```

<div align="center">

## You should see the following


<img src="https://user-images.githubusercontent.com/53381472/174685058-ae9d42e3-c37c-483b-b462-2ec45230fca9.jpg"/>

</div>

<br/>

Since you are using default configuration, there is default keypair, workflow and so on. To continue decrypt your private key with the password <code>qwerty</code>

### <b>Tip</b>

Now you have locally runned symbiote AntiVenom. Your node is a single one and works as <b>Controller</b> for <b>dev_controller</b> workflow. Soon we'll show who to make your network more advanced by adding <b>InstantGenerators</b>, changing workflows, make your network semi-public, join your symbiote to external AntiVenom testnets, make your AntiVenom network in TOR network(via hidden services) and other cool features!

<br/>

<div align="center">

## KLYNTAR - your provider to new generation of crypto projects

</div>


### <b>Advice</b>

Find out more about advanced options,configs,flags and so on our resources

<br/><br/>

<div name="kNULL"></div>

## 🧬 <b>Running kNULL</b>

The installation process for symbiotes are the same as for testnet, but you should firstly modify configs and generate keypair. Then, open another terminal and create a separate dir

```shell

mkdir ~/KlyntarCore/kNULL

```

Then, discover manifest for your symbiote(in this case kNULL) and paste to <code>symbiotes.json</code>. Load manifest <a href="https://github.com/KLYN74R/SymbiotesManifests/kNULL.json">here</a>.
Also,load GENESIS <a href="https://klyntar.org/manifests/kNULL.json">here</a>.


```shell

export SYMBIOTE_DIR=~/KlyntarCore/kNULL

```

Now run

```shell

klyntar

```

<br/><br/>

<div align="center">

# 🔥Cool,now you are the part of KLYNTAR🔥
## The part of family

### The part of hivemind

</div>

<br/><br/>

<div name="summary"></div>

## ⚙️ <b>Summary</b>
<br/>
<p>

KLYNTAR can do literally everything. Described here is less than 0.001% of potential. Soon you'll get to know about another features like:

- Interactions with the hostchains, services, mutualism
- How to make your AntiVenom more advanced by making it semi-public, by adding tons of plugins and so on
- How to use Cryptoland with cool crypto features like VRF, multi & threshold & linkable ring signatures, post quantum cryptography and so on
- How to run clusters
- How to create workflows and this way-change the consensus
- How to take part in social consensus & voting
- How to use Unobtanium - your united resources from other blockchains e.g. bitcoin mined blocks, frozen stakes on Polygon, miner on Helium and so on



<br/><br/> -->


<div align="center">

# <b>It's just beginning</b>

</div>



<br/><br/>

<div name="advice"></div>

## 🤓 <b>Advice</b>
<br/>
<p>
Follow us to get the news & updates ASAP. Discuss, share ideas, advices, help newbies to make our community more powerful.We're happy to involve new members to KLY community 😊
</p>

<br/>

<a href="https://www.reddit.com/r/KLYN74R/">  
  <img src="https://img.shields.io/badge/Reddit-FF4500?style=for-the-badge&logo=reddit&logoColor=white"/>
</a>
<a href="https://twitter.com/KLYN74R">
  <img src="https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white"/>
</a>
<a href="https://klyntar.medium.com/">
  <img src="https://img.shields.io/badge/Medium-12100E?style=for-the-badge&logo=medium&logoColor=white"/>
</a>
<a href="https://www.tiktok.com/@klyn74r">
  <img src="https://img.shields.io/badge/TikTok-000000?style=for-the-badge&logo=tiktok&logoColor=white"/>
</a>

<br/>

<a href="https://www.instagram.com/klyn74r/">
  <img src="https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white"/>
</a>
  <a href="https://www.pinterest.com/klyn74r">
  <img src="https://img.shields.io/badge/Pinterest-%23E60023.svg?&style=for-the-badge&logo=Pinterest&logoColor=white"/>
</a>
  <a href="https://dev.to/klyntar">
  <img src="https://img.shields.io/badge/dev.to-0A0A0A?style=for-the-badge&logo=devdotto&logoColor=white"/>
</a>
<a href="https://github.com/KLYN74R">
  <img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white"/>
</a>

<br/>

<a href="https://t.me/KLYN74R">
  <img src="https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white"/>
</a>
<a href="https://discord.gg/f7e7fCp97r">
  <img src="https://img.shields.io/badge/Discord-7289DA?style=for-the-badge&logo=discord&logoColor=white"/>
</a>
<a href="http://klyntar66kjwhyirucco6sjgyp2f7lfznelzgpjcp6oha2olzb4rlead.onion">
  <img src="https://img.shields.io/badge/Tor%20site-330F63?style=for-the-badge&logoColor=white"/>
</a>
<a href="https://www.youtube.com/channel/UC3TiyK40an6rQlf3BarMDoQ">
  <img src="https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white"/>
</a>

<br/>

<a href="https://www.facebook.com/KLYN74R/">
  <img src="https://img.shields.io/badge/Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white"/>
</a>
<a href="https://gitlab.com/KLYNTAR">
  <img src="https://img.shields.io/badge/GitLab-330F63?style=for-the-badge&logo=gitlab&logoColor=white"/>
</a>
<a href="https://klyn74r.tumblr.com/">
  <img src="https://img.shields.io/badge/Tumblr-%2336465D.svg?&style=for-the-badge&logo=Tumblr&logoColor=white"/>
</a>
<a href="">
  <img src="https://img.shields.io/badge/Stack_Overflow-FE7A16?style=for-the-badge&logo=stack-overflow&logoColor=white"/>
</a>

<br/><br/>


<div name="docs"></div>

## 📚<b>Docs</b>

Read the docs here to find out more. For example, how to use plugins, prepare & change configs, run on a host machine, how to start a KLY Service and so on!

<br/>

<a href="https://mastering.klyntar.org">🇬🇧 <img src="https://img.shields.io/badge/Gitbook-000000?style=for-the-badge&logo=gitbook&logoColor=white"></a><br/>
<a href="https://ru.mastering.klyntar.org">🇷🇺 <img src="https://img.shields.io/badge/Gitbook-000000?style=for-the-badge&logo=gitbook&logoColor=white"></a>