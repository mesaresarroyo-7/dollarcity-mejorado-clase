@echo off
title Frontend DollarCity
cd /d "%~dp0frontend"
echo Iniciando frontend en http://localhost:5173
echo Para cerrar, presiona Ctrl+C o cierra esta ventana.
echo.
call npm run dev
pause
