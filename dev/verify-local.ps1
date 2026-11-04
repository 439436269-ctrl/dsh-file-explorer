# Scratch-profile verification for dsh-file-explorer.
#
# Creates (or reuses) a throwaway profile from the shipped `web` template, copies
# this package into it, boots a headless web server, runs the Playwright checks,
# then tears the profile down. The desktop profile is never touched.
#
#   pwsh -File dev\verify-local.ps1
#   pwsh -File dev\verify-local.ps1 -KeepProfile   # keep the profile for poking
#
param(
    [string]$Profile = "fe-verify",
    [string]$PackageDir = "",
    [switch]$KeepProfile
)

$ErrorActionPreference = "Stop"
$packageRoot = Split-Path -Parent $PSScriptRoot
$source = if ($PackageDir -ne "") { $PackageDir } else { $packageRoot }
$manifest = Get-Content (Join-Path $source "package.json") -Raw | ConvertFrom-Json
$packageName = $manifest.name
$packageVersion = $manifest.version
$profileDir = Join-Path (Join-Path $env:USERPROFILE ".dsh\profiles") $Profile
$python = if ($env:PYTHON) { $env:PYTHON } else { "python" }

if (-not (Test-Path $profileDir)) {
    Write-Host "creating profile $Profile from the web template"
    dsh --profile $Profile --from-default-profile web --dump-config *> $null
}

$nodeModules = Join-Path $profileDir "node_modules"
New-Item -ItemType Directory -Path $nodeModules -Force | Out-Null
$installed = Join-Path $nodeModules $packageName
New-Item -ItemType Directory -Path (Split-Path $installed -Parent) -Force | Out-Null
if (Test-Path $installed) { Remove-Item $installed -Recurse -Force }
New-Item -ItemType Directory -Path $installed | Out-Null
Copy-Item (Join-Path $source "lib") -Destination (Join-Path $installed "lib") -Recurse
Copy-Item (Join-Path $source "package.json"), (Join-Path $source "cordis.patch.yml") -Destination $installed

# The profile must list the package so the client-bundle scan sees `dsh.client`,
# and as a bundle so its own cordis.patch.yml supplies the insert row 鈥?exactly
# what `dsh plugin --profile <p> add <pkg>` does. Written without a BOM: the
# loader parses this file as JSON.
$manifestPath = Join-Path $profileDir "package.json"
$profileManifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$profileManifest.dependencies | Add-Member -NotePropertyName $packageName -NotePropertyValue $packageVersion -Force
$bundles = @($profileManifest.dsh.profile.bundles)
if ($bundles -notcontains $packageName) {
    $profileManifest.dsh.profile.bundles = @($bundles + $packageName)
}
[IO.File]::WriteAllText($manifestPath, ($profileManifest | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))

$outLog = Join-Path $PSScriptRoot "server.log"
$errLog = Join-Path $PSScriptRoot "server.err.log"
Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue

$serverCommand = "dsh --profile $Profile --no-open --port 0"
$server = Start-Process -FilePath "powershell" -ArgumentList @("-NoProfile", "-Command", $serverCommand) `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -WindowStyle Hidden

$url = $null
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    Start-Sleep -Milliseconds 1000
    if (Test-Path $outLog) {
        $match = Select-String -Path $outLog -Pattern "http://127\.0\.0\.1:\d+/\?token=" | Select-Object -First 1
        if ($match) { $url = [regex]::Match($match.Line, "http://\S+").Value; break }
    }
    if ($server.HasExited) { break }
}
if (-not $url) {
    Write-Host "server did not report a URL; stderr:"
    if (Test-Path $errLog) { Get-Content $errLog -Tail 40 }
    if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    exit 1
}
Write-Host "server: $url"

& $python (Join-Path $PSScriptRoot "verify_ui.py") $url $PSScriptRoot
$code = $LASTEXITCODE

if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500
if (-not $KeepProfile) { Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host "verification exit code: $code"
exit $code
