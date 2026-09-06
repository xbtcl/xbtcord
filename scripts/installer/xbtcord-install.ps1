# Xbtcord installer.
#
# Discord loads whatever `resources/app.asar` resolves to. This moves the real `app.asar`
# aside to `_app.asar` and puts a small folder in its place whose index.js requires
# Xbtcord's patcher; the patcher then loads the original from `_app.asar`. Same shape
# Vencord and BetterDiscord use, which is why uninstalling is just a rename back.
#
# No administrator rights needed: Discord installs into the user's own LocalAppData.
#
#   -Dev        point Discord at this repo's dist/ instead of copying a snapshot, so
#               `pnpm build` takes effect on the next Discord restart
#   -Uninstall  put Discord back exactly as it was

#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch] $Uninstall,
    [switch] $Dev,
    [switch] $NoPause
)

$ErrorActionPreference = "Stop"

$Branches = @("Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment")
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$InstallDir = Join-Path $env:LOCALAPPDATA "Xbtcord\dist"
$PayloadDir = Join-Path $PSScriptRoot "xbtcord"

function Write-Step($m) { Write-Host "  $m" -ForegroundColor Gray }
function Write-Good($m) { Write-Host "  $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "  $m" -ForegroundColor Yellow }
function Write-Bad($m)  { Write-Host "  $m" -ForegroundColor Red }

# The newest app-<version> folder is the one Discord actually runs.
function Get-DiscordInstalls {
    $found = @()

    foreach ($branch in $Branches) {
        $root = Join-Path $env:LOCALAPPDATA $branch
        if (-not (Test-Path $root)) { continue }

        $apps = Get-ChildItem $root -Filter "app-*" -Directory -ErrorAction SilentlyContinue
        if (-not $apps) { continue }

        $newest = $apps | Sort-Object {
            $raw = $_.Name -replace '^app-', ''
            try { [version] $raw } catch { [version] "0.0.0" }
        }, Name | Select-Object -Last 1

        $resources = Join-Path $newest.FullName "resources"
        if (-not (Test-Path $resources)) { continue }

        $found += [pscustomobject] @{
            Branch    = $branch
            Root      = $root
            Version   = $newest.Name -replace '^app-', ''
            Resources = $resources
        }
    }

    return $found
}

function Stop-Discord($installs) {
    $stopped = @()
    foreach ($install in $installs) {
        $procs = Get-Process -Name $install.Branch -ErrorAction SilentlyContinue
        if (-not $procs) { continue }
        Write-Step "Closing $($install.Branch)..."
        $procs | Stop-Process -Force -ErrorAction SilentlyContinue
        $stopped += $install
    }
    # Discord's files stay locked for a moment after the processes go.
    if ($stopped.Count -gt 0) { Start-Sleep -Seconds 3 }
    return $stopped
}

function Start-Discord($installs) {
    foreach ($install in $installs) {
        # Update.exe picks whichever version is current, which survives Discord updating
        # itself between now and the next launch.
        $updater = Join-Path $install.Root "Update.exe"
        try {
            if (Test-Path $updater) {
                Start-Process $updater -ArgumentList "--processStart", "$($install.Branch).exe"
            } else {
                Start-Process (Join-Path $install.Resources "..\$($install.Branch).exe")
            }
            Write-Step "Restarted $($install.Branch)"
        } catch {
            Write-Warn "Couldn't restart $($install.Branch) - start it yourself"
        }
    }
}

function Set-Patch($resources, $patcher) {
    $asar = Join-Path $resources "app.asar"
    $original = Join-Path $resources "_app.asar"

    # A folder here is a previous injection - ours or another mod's.
    if (Test-Path $asar -PathType Container) { Remove-Item $asar -Recurse -Force }

    # A real app.asar next to an existing _app.asar means Discord replaced the file after
    # a previous install. The file is the newer Discord, so it wins.
    if (Test-Path $asar -PathType Leaf) {
        if (Test-Path $original) { Remove-Item $original -Force }
        Move-Item $asar $original
    }

    if (-not (Test-Path $original)) {
        throw "No app.asar or _app.asar in $resources - this doesn't look like a Discord install"
    }

    New-Item -ItemType Directory -Path $asar -Force | Out-Null
    $escaped = $patcher.Replace('\', '\\')
    Set-Content -Path (Join-Path $asar "index.js") -Value ('require("' + $escaped + '");') -Encoding utf8
    Set-Content -Path (Join-Path $asar "package.json") -Value '{"name":"discord","main":"index.js"}' -Encoding utf8
}

function Remove-Patch($resources) {
    $asar = Join-Path $resources "app.asar"
    $original = Join-Path $resources "_app.asar"

    if (Test-Path $asar -PathType Container) { Remove-Item $asar -Recurse -Force }
    if ((Test-Path $original) -and -not (Test-Path $asar)) {
        Move-Item $original $asar
        return $true
    }
    return (Test-Path $asar -PathType Leaf)
}

# --- main ------------------------------------------------------------------------------

Write-Host ""
Write-Host "  Xbtcord" -ForegroundColor Magenta
Write-Host "  $(if ($Uninstall) { 'Uninstaller' } elseif ($Dev) { 'Installer (dev - links to this repo)' } else { 'Installer' })" -ForegroundColor DarkGray
Write-Host ""

try {
    $installs = Get-DiscordInstalls
    if ($installs.Count -eq 0) {
        throw "No Discord installation found in $env:LOCALAPPDATA. Install Discord, run it once, then try again."
    }
    foreach ($install in $installs) { Write-Step "Found $($install.Branch) $($install.Version)" }

    $running = Stop-Discord $installs

    if ($Uninstall) {
        foreach ($install in $installs) {
            if (Remove-Patch $install.Resources) { Write-Good "Removed from $($install.Branch)" }
            else { Write-Warn "$($install.Branch) was not patched" }
        }
        if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force; Write-Step "Deleted $InstallDir" }
        Write-Host ""
        Write-Good "Xbtcord removed. Settings kept at $env:APPDATA\Xbtcord."
    } else {
        if ($Dev) {
            # Point straight at the repo so a rebuild lands without reinstalling.
            $patcher = Join-Path $RepoRoot "dist\patcher.js"
            if (-not (Test-Path $patcher)) { throw "No build at $patcher - run `pnpm build` first." }
            Write-Step "Linking to $patcher"
        } else {
            if (-not (Test-Path (Join-Path $PayloadDir "patcher.js"))) {
                throw "No payload at $PayloadDir. Use -Dev to link this repo, or package a build first."
            }
            if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
            Copy-Item (Join-Path $PayloadDir "*") $InstallDir -Recurse -Force
            $patcher = Join-Path $InstallDir "patcher.js"
            Write-Step "Installed Xbtcord to $InstallDir"
        }

        foreach ($install in $installs) {
            Set-Patch $install.Resources $patcher
            Write-Good "Patched $($install.Branch) $($install.Version)"
        }

        Write-Host ""
        Write-Good "Done. Discord will start with Xbtcord from now on."
    }

    Start-Discord $running
} catch {
    Write-Host ""
    Write-Bad "Failed: $($_.Exception.Message)"
    Write-Step "If Discord was open, close it completely (check the system tray) and try again."
    if (-not $NoPause) { Read-Host "Press Enter to close" | Out-Null }
    exit 1
}

Write-Host ""
if (-not $NoPause) { Read-Host "Press Enter to close" | Out-Null }
