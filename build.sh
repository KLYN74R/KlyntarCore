#https://misc.flogisoft.com/bash/tip_colors_and_formatting

#!/bin/bash


###################################################
#           Install all dependencies              #
###################################################

cd BUNDLE

echo -e "\e[43mFetching dependencies ...\e[49m"

go get ./...

echo -e "\e[42mBuilding addons process started\e[49m"


###################################################
#          Build dll/so for PQC schemes           #
###################################################


go build -buildmode=c-shared -o csidh.so csidh.go

go build -buildmode=c-shared -o kyber.so kyber.go

go build -buildmode=c-shared -o dilithium.so dilithium.go

go build -buildmode=c-shared -o bliss.so bliss.go



#################################
#   Build addons via node-gyp   #
#################################

node-gyp configure build

if [ $? -eq 0 ]; then
     cat success.txt
else
     cat fail.txt
fi

cd ..