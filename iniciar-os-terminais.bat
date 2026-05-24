@echo off

echo Iniciando React Native...
start cmd /k "cd /d cfaocian && npx expo start -c"

echo Iniciando Backend Node...
start cmd /k "cd /d backend-node && npx tsx src/server.ts"

echo Iniciando Backend ML...
start cmd /k "cd /d backend-ml && uvicorn main:app --reload"

echo Tudo iniciado!