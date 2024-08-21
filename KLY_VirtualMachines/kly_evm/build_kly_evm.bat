@echo off

:https:\\misc.flogisoft.com\bash\tip_colors_and_formatting


:::::::::::::::::::::::::::::::::::::::::::::::::::
:        Change files to activate extra logic     :
:::::::::::::::::::::::::::::::::::::::::::::::::::


echo "Changing files (EVM => KLY-EVM)" ...


copy .\to_change\runTx.js node_modules\@ethereumjs\vm\dist\runTx.js

copy .\to_change\vmState.js node_modules\@ethereumjs\vm\dist\eei\vmState.js

copy .\to_change\evm.js node_modules\@ethereumjs\evm\dist\evm.js

copy .\to_change\hooking\functions.js node_modules\@ethereumjs\evm\dist\opcodes\functions.js

copy .\to_change\hooking\util.js node_modules\@ethereumjs\evm\dist\opcodes\util.js

echo "KLY-EVM is ready !!!"