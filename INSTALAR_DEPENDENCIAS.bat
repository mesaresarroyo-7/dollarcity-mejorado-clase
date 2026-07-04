@echo off
title Instalar dependencias DollarCity
echo ==========================================
echo  Instalando dependencias del BACKEND
echo ==========================================
cd /d "%~dp0backend"
call npm install
if errorlevel 1 (
  echo.
  echo ERROR instalando backend.
  pause
  exit /b 1
)

echo.
echo ==========================================
echo  Instalando dependencias del FRONTEND
echo ==========================================
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 (
  echo.
  echo ERROR instalando frontend.
  pause
  exit /b 1
)

echo.
echo Listo. Ahora ejecuta INICIAR_BACKEND.bat y INICIAR_FRONTEND.bat
pause
