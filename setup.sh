#!/bin/bash

#Traditionally
apt update && apt upgrade

#Load all tools we need for further builds
apt install nano sudo git curl wget build-essential libreadline-dev libncursesw5-dev libssl-dev libsqlite3-dev tk-dev libgdbm-dev libc6-dev libbz2-dev libffi-dev zlib1g-dev -y


#██████╗ ██╗   ██╗████████╗██╗  ██╗ ██████╗ ███╗   ██╗
#██╔══██╗╚██╗ ██╔╝╚══██╔══╝██║  ██║██╔═══██╗████╗  ██║
#██████╔╝ ╚████╔╝    ██║   ███████║██║   ██║██╔██╗ ██║
#██╔═══╝   ╚██╔╝     ██║   ██╔══██║██║   ██║██║╚██╗██║
#██║        ██║      ██║   ██║  ██║╚██████╔╝██║ ╚████║
#╚═╝        ╚═╝      ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
                                                     

if ! python --version | grep -q 'Python 3.10\|Python 3.9\|Python 3.8'
then
    wget -c https://www.python.org/ftp/python/3.10.0/Python-3.10.0.tar.xz

    tar -Jxvf Python-3.10.0.tar.xz

    cd Python-3.10.0

    ./configure --enable-optimizations


    make altinstall

    update-alternatives --install /usr/bin/python python /usr/local/bin/python3.10 1
    update-alternatives --install /usr/bin/pip pip /usr/local/bin/pip3.10 1

    #Finally-delete useless
    cd ..
    rm -r Python-3.10.0  Python-3.10.0.tar.xz

fi



#███╗   ██╗ ██████╗ ██████╗ ███████╗     ██╗███████╗
#████╗  ██║██╔═══██╗██╔══██╗██╔════╝     ██║██╔════╝
#██╔██╗ ██║██║   ██║██║  ██║█████╗       ██║███████╗
#██║╚██╗██║██║   ██║██║  ██║██╔══╝  ██   ██║╚════██║
#██║ ╚████║╚██████╔╝██████╔╝███████╗╚█████╔╝███████║
#╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝ ╚════╝ ╚══════╝

if ! node -v | grep -q "v17."
then

    #Add public recursive DNS
    echo "nameserver 8.8.8.8" >> /etc/resolv.conf
    echo "nameserver 8.8.4.4" >> /etc/resolv.conf



    apt install software-properties-common -y

    curl -sL https://deb.nodesource.com/setup_17.x | bash - 

    apt update

    # #Install npm and node
    apt install -y nodejs

fi



#But we'll use advanced npm - pnpm
npm install pnpm -g

#And node-gyp to build Golang addons(Go => C => .node addons)
npm install node-gyp -g


# ██████╗  ██████╗ 
#██╔════╝ ██╔═══██╗
#██║  ███╗██║   ██║
#██║   ██║██║   ██║
#╚██████╔╝╚██████╔╝
# ╚═════╝  ╚═════╝ 
# https://go.dev/doc/install

KLY_GO_VERSION=`go version`

if ! $KLY_GO_VERSION | grep 'go1.1' -q
then

    #Fetch archive
    wget https://go.dev/dl/go1.18.linux-amd64.tar.gz

    #Unpack
    rm -rf /usr/local/go && tar -C /usr/local -xzf go1.18.linux-amd64.tar.gz


    #Add vars to PATH
    echo 'export GO111MODULE="auto"' >> ~/.bashrc
    echo "export PATH=$PATH:/usr/local/go/bin" >> ~/.bashrc

    source ~/.bashrc


    #Don't need archive anymore
    rm go1.18.linux-amd64.tar.gz

fi





# █████╗ ██████╗  ██████╗ ██╗     ██╗      ██████╗ 
#██╔══██╗██╔══██╗██╔═══██╗██║     ██║     ██╔═══██╗
#███████║██████╔╝██║   ██║██║     ██║     ██║   ██║
#██╔══██║██╔═══╝ ██║   ██║██║     ██║     ██║   ██║
#██║  ██║██║     ╚██████╔╝███████╗███████╗╚██████╔╝
#╚═╝  ╚═╝╚═╝      ╚═════╝ ╚══════╝╚══════╝ ╚═════╝ 

#Install Apollo to the project directory
git clone https://github.com/KLYN74R/Apollo.git APOLLO

cd APOLLO

pnpm install

npm link

cd ..



#Run building addons script
./build.sh