#!/usr/bin/env pwsh
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

& node "$PSScriptRoot\blade.js" @args
