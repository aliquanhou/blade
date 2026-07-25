@echo off
REM ⚔️ Blade — Windows 启动脚本
REM 用法: scripts\start.cmd [prod|dev]

setlocal enabledelayedexpansion

if "%1"=="" set "MODE=prod"
if not "%1"=="" set "MODE=%1"

echo ⚔️ Blade Server — %MODE% mode
echo ──────────────────────────────

if /i "%MODE%"=="prod" (
    REM 确保前端已构建
    if not exist "web\frontend\dist" (
        echo Building frontend...
        cd web\frontend
        call npm run build
        cd ..\..
    )

    REM 使用 PM2 启动
    echo Starting with PM2...
    call pm2 start ecosystem.config.js --env production
    call pm2 save
    echo.
    echo   PM2 status: pm2 status
    echo   Logs:       pm2 logs blade
    echo   Stop:       pm2 stop blade
) else if /i "%MODE%"=="dev" (
    echo Starting dev server on :3001...
    echo Frontend proxy: /api -^> localhost:3001
    echo.
    start "Blade Server" bun run web\server\src\index.ts
    timeout /t 2 /nobreak >nul
    cd web\frontend
    start "Blade Frontend" cmd /c "bun run dev"
    cd ..\..
    echo.
    echo Servers started in separate windows.
    echo Close windows to stop.
) else (
    echo Usage: %0 [prod^|dev]
    exit /b 1
)

endlocal
