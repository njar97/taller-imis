@echo off
REM Wrapper para poder doble-clickear desde el explorador de Windows.
REM Llama a start-claude.ps1 con ExecutionPolicy Bypass (solo este proceso).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-claude.ps1"
if errorlevel 1 pause
