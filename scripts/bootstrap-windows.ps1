<#
.SYNOPSIS
    DevBench Windows Developer Workstation Bootstrap & Health Check Script
.DESCRIPTION
    Checks Windows 10/11 build environment settings (Winget, LongPaths, Developer Mode,
    Node.js LTS, Git, and optional desktop SDKs). Runs in -DryRun mode by default so
    zero system changes occur without explicit `-Apply` consent.
#>
param(
    [switch]$Apply = $false,
    [ValidateSet('Core', 'DotNet', 'CppNative', 'RustTauri', 'PythonGui')]
    [string]$StackProfile = 'Core'
)

$ErrorActionPreference = 'Stop'
Write-Host "=== DevBench Windows Workstation Setup Check ===" -ForegroundColor Cyan
Write-Host ("Mode: " + ($(if ($Apply) { "APPLY (User Approved)" } else { "DRY-RUN (Read-Only Check — pass -Apply to install)" })))

function Test-CommandExists([string]$cmd) {
    return $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

# 1. Registry Developer Checks (Read-Only)
$longPathVal = (Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'LongPathsEnabled' -ErrorAction SilentlyContinue).LongPathsEnabled
Write-Host ("[Check] Win32 LongPathsEnabled: " + ($(if ($longPathVal -eq 1) { "ENABLED" } else { "DISABLED (Recommended: 1)" })))

$devUnlock = (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name 'AllowDevelopmentWithoutDevLicense' -ErrorAction SilentlyContinue).AllowDevelopmentWithoutDevLicense
Write-Host ("[Check] Windows Developer Sideloading: " + ($(if ($devUnlock -eq 1) { "ENABLED" } else { "DISABLED" })))

# 2. Core CLI Checks
$packages = @(
    @{ Cmd = 'git'; WingetId = 'Git.Git'; Name = 'Git for Windows' },
    @{ Cmd = 'node'; WingetId = 'OpenJS.NodeJS.LTS'; Name = 'Node.js LTS' }
)

switch ($StackProfile) {
    'DotNet'    { $packages += @{ Cmd = 'dotnet'; WingetId = 'Microsoft.DotNet.SDK.8'; Name = '.NET 8 SDK' } }
    'CppNative' { $packages += @{ Cmd = 'cmake'; WingetId = 'Kitware.CMake'; Name = 'CMake' }; $packages += @{ Cmd = 'ninja'; WingetId = 'Ninja-build.Ninja'; Name = 'Ninja' } }
    'RustTauri' { $packages += @{ Cmd = 'rustup'; WingetId = 'Rustlang.Rustup'; Name = 'Rustup Toolchain' } }
    'PythonGui' { $packages += @{ Cmd = 'uv'; WingetId = 'astral-sh.uv'; Name = 'uv Python Manager' } }
}

foreach ($pkg in $packages) {
    if (Test-CommandExists $pkg.Cmd) {
        Write-Host "[OK] $($pkg.Name) ($($pkg.Cmd)) detected." -ForegroundColor Green
    } else {
        Write-Host "[Missing] $($pkg.Name) -> winget install $($pkg.WingetId) --exact" -ForegroundColor Yellow
        if ($Apply -and (Test-CommandExists 'winget')) {
            winget install $pkg.WingetId --exact --accept-package-agreements --accept-source-agreements
        }
    }
}
