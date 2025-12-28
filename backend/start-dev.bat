@echo off

REM Check if .env exists
if not exist .env (
    echo ⚠️  .env file not found!
    echo 📝 Creating .env from template...
    copy env.template .env
    echo ✅ .env file created. Please edit it with your Firebase credentials.
    echo.
    echo To get your Firebase credentials:
    echo 1. Go to Firebase Console
    echo 2. Project Settings ^> Service Accounts
    echo 3. Generate New Private Key
    echo 4. Copy the JSON content to .env
    echo.
    pause
    exit /b 1
)

REM Start the server
echo 🚀 Starting FloodWatch Backend API...
npm run dev

