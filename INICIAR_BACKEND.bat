@echo off
title Backend DollarCity
cd /d "%~dp0backend"
echo Iniciando backend en http://localhost:4000
echo Para cerrar, presiona Ctrl+C o cierra esta ventana.
echo.
call npm start
pause
