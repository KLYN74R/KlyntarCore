@echo off

:https://misc.flogisoft.com/bash/tip_colors_and_formatting


:::::::::::::::::::::::::::::::::::::::::::::::::::
:           Install all dependencies              :
:::::::::::::::::::::::::::::::::::::::::::::::::::

cd KLY_Addons/must_have


echo Fetching dependencies ...


go get ./...

:::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
:         Build .wasm bundle for PQC signature schemes  Dilithium & Bliss         :
:::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

echo Building addons process started

SET GOARCH=wasm
SET GOOS=js

go build -o main_x.wasm

echo Finished

cd ../../