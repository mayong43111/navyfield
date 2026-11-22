@echo off
setlocal
set "PORTABLE_NODE=C:\Users\mayon\.copilot\session-state\89c0ec0b-79f3-4cf5-9e0c-91f3fa766baa\files\tooling\node-v22.23.5-win-x64"
if not exist "%PORTABLE_NODE%\node.exe" (
  echo Portable Node.js is unavailable. Install Node.js 22.18+ and run npm run dev.
  exit /b 1
)
set "PATH=%PORTABLE_NODE%;%PATH%"
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Run npm install with Node.js first.
  exit /b 1
)
call "%PORTABLE_NODE%\npm.cmd" run dev
