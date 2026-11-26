@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 請先安裝 Node.js：https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo 第一次啟動，正在安裝套件...
  call npm install
)
npm run dev
