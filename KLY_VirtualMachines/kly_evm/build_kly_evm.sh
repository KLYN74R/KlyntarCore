###################################################
#        Change files to activate extra logic     #
###################################################


echo "Changing files (EVM => KLY-EVM)" ...


cp ./to_change/runTx.js node_modules/@ethereumjs/vm/dist/runTx.js

cp ./to_change/vmState.js node_modules/@ethereumjs/vm/dist/eei/vmState.js

cp ./to_change/hooking/functions.js node_modules/@ethereumjs/evm/dist/opcodes/functions.js

cp ./to_change/hooking/util.js node_modules/@ethereumjs/evm/dist/opcodes/util.js

echo "KLY-EVM is ready !!!"