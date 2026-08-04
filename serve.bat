@echo off
REM Serve the invoice app over http so the PWA can be installed and cached offline.
REM (Opening index.html directly with file:// works too, but "Install app" needs http/https.)
cd /d "%~dp0"
echo.
echo   SK POLYMERS invoice  ->  http://localhost:8080/
echo   Open that address on this PC, or use http://YOUR-PC-IP:8080/ on your phone
echo   (same Wi-Fi). Press Ctrl+C to stop.
echo.
start "" http://localhost:8080/
python -m http.server 8080
