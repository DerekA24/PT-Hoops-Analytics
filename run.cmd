@echo off
setlocal

set "SITE_DIR=%~dp0PT_Hub_Complete_Handoff_2026-11-04\01_STUDENTS\frontend"
if not exist "%SITE_DIR%\index.html" (
    echo Website files were not found at "%SITE_DIR%".
    exit /b 1
)

echo Serving the website at http://127.0.0.1:8000/
echo Press Ctrl+C to stop the server.
python -m http.server 8000 --bind 127.0.0.1 --directory "%SITE_DIR%"
