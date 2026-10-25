@echo off
setlocal
set ELECTRON_RUN_AS_NODE=1
set ELECTRON_ENABLE_LOGGING=
"%~dp0PageWeave.exe" "%~dp0resources\app.asar\dist-electron\cli.cjs" %*
exit /b %errorlevel%
