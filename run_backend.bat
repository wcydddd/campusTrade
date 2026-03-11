@echo off
cd /d "%~dp0"

:: 如果 venv 不存在就自动创建
if not exist "venv\Scripts\activate.bat" (
  echo Creating virtual environment...
  python -m venv venv
  if errorlevel 1 (
    echo Failed to create venv. Make sure Python is installed and in PATH.
    pause
    exit /b 1
  )
  echo Virtual environment created.
  echo.
)

:: 激活虚拟环境
call venv\Scripts\activate.bat

:: 安装依赖
echo Installing dependencies...
pip install -r requirements.txt -q
if errorlevel 1 (
  echo Failed to install dependencies. Check Python and pip.
  pause
  exit /b 1
)

:: 启动后端
echo.
echo Starting backend at http://127.0.0.1:8000
echo API docs: http://127.0.0.1:8000/docs
echo.
cd backend
python main.py
pause
