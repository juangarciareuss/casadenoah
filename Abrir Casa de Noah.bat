@echo off
rem Abre Casa de Noah. Deja abierta la ventana que aparece (puedes minimizarla).
cd /d "%~dp0"
start "Casa de Noah" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
