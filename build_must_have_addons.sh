#https://misc.flogisoft.com/bash/tip_colors_and_formatting

#!/bin/bash


###################################################
#           Install all dependencies              #
###################################################

cd KLY_Addons/must_have_signatures

echo -e "\e[43mFetching dependencies ...\e[49m"

go get ./...

echo -e "\e[42mBuilding addons process started\e[49m"


###################################################################################
#         Build .wasm bundle for PQC signature schemes  Dilithium & Bliss         #
###################################################################################

GOARCH=wasm GOOS=js go build -o main.wasm

if [ $? -eq 0 ]; then
     cat ../success.txt
else
     cat ../fail.txt
fi

cd ../../