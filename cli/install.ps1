# CONSILIUM installer for Windows. No Node.js needed.
#   irm __SITE__/install.ps1 | iex
$ErrorActionPreference = "Stop"
$site = if ($env:CONSIL_SITE) { $env:CONSIL_SITE } else { "__SITE__" }
$dir = Join-Path $env:LOCALAPPDATA "Consilium"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Write-Host "downloading consil.exe ..."
Invoke-WebRequest -UseBasicParsing "$site/dl/consil-win-x64.exe" -OutFile (Join-Path $dir "consil.exe")
$path = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not ($path -split ";" | Where-Object { $_ -eq $dir })) {
  [Environment]::SetEnvironmentVariable("Path", ($path.TrimEnd(";") + ";" + $dir), "User")
  Write-Host "added $dir to your PATH (open a new terminal)"
}
Write-Host "installed: $dir\consil.exe"
Write-Host "try: consil council NVDA"
