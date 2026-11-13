@echo off
chcp 65001 >nul
title Blocky Strike
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Falta instalar Node.js. Se abrira la pagina de descarga.
  echo Instala la version LTS, y luego vuelve a dar doble clic en JUGAR.bat
  start "" https://nodejs.org
  pause
  exit /b
)
rem Cierra cualquier Blocky Strike viejo que siga abierto (ocupa el puerto 3000 y muestra la version vieja)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>nul
echo Iniciando Blocky Strike... NO cierres esta ventana mientras juegas.
start "" cmd /c "timeout /t 5 >nul & start http://localhost:3000"
node server.js
pause
