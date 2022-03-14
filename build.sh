#https://misc.flogisoft.com/bash/tip_colors_and_formatting

#!/bin/bash

echo -e "\e[42mBuilding addons process started\e[49m"


###################################################
#      Build dll/so for PQC signature schemes     #
###################################################


#Build dll/so for BLISS PQC signature scheme
go build -buildmode=c-shared -o KLY_Addons/bliss/bliss.so KLY_Addons/bliss/bliss.go

echo -e "\e[42mBLISS build successfully\e[49m"




go build -buildmode=c-shared -o KLY_Addons/crystal/crystal.so KLY_Addons/crystal/crystal.go

echo -e "\e[42mCRYSTAL build successfully\e[49m"


#################################
#   Build addons via node-gyp   #
#################################

cd KLY_Addons/bliss

node-gyp configure build

echo -e "\e[42mBLISS addon created\e[49m"



cd ../crystal

node-gyp configure build

echo -e "\e[42mCRYSTAL addon created\e[49m"