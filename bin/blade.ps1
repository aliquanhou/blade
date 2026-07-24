#!/usr/bin/env pwsh
# Blade launcher with ASCII art logo

Write-Host ""
Write-Host "   ____  _       _     _        "
Write-Host "  | __ )| | __ _| |__ | | ___   "
Write-Host "  |  _ \| |/ _' | '_ \| |/ _ \  "
Write-Host "  | |_) | | (_| | |_) | |  __/  "
Write-Host "  |____/|_|\__,_|_.__/|_|\___|  "
Write-Host ""
Write-Host "      Blade v1.0.0"
Write-Host "  Model handles intelligence, shell handles delivery"
Write-Host ""

# P0 defaults
$env:CLAUDE_CODE_DISABLE_UPDATES = "1"

& node "$PSScriptRoot\blade.js" @args
