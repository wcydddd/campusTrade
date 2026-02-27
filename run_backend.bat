@echo off
cd /d "%~dp0backend"
echo Installing dependencies (using same Python that will run the server)...
python -m pip install -r requirements.txt -q
if errorlevel 1 (
  echo Failed to install dependencies. Check Python and pip.
  pause
  exit /b 1
)
echo.
echo Starting backend at http://127.0.0.1:8000
echo API docs: http://127.0.0.1:8000/docs
echo.
python main.py
pause
