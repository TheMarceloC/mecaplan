@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
 ) else (
  echo Instala Node.js 24 o superior y vuelve a abrir este archivo.
  pause
  exit /b 1
 )
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 (
 echo MecaPlan requiere Node.js 24 o superior.
 pause
 exit /b 1
)
set "MECAPLAN_PNPM=pnpm"
where pnpm >nul 2>nul
if errorlevel 1 (
 if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" (
  set "MECAPLAN_PNPM=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
 ) else (
  echo Instala pnpm con: npm install --global pnpm@11.25.0
  pause
  exit /b 1
 )
)
if not exist node_modules (
 call "%MECAPLAN_PNPM%" install --frozen-lockfile
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
echo Abre http://127.0.0.1:3000 al iniciar el servidor.
echo Deten con Ctrl+C. Los datos existentes se conservan.
call "%MECAPLAN_PNPM%" run dev
pause

