# Market submission for @vfvrpq/dsh-file-explorer, run by a one-shot scheduled
# task shortly after the repository turns 24 hours old (the catalog's hard gate).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File dev\market-submit.ps1
#   ... -Retries 1 -DelaySeconds 5      # quick manual check
#
# ASCII only on purpose: Windows PowerShell 5.1 reads a BOM-less UTF-8 .ps1 as
# ANSI, and the Chinese description lives in dev\market-entry.json instead.
# The skill script is idempotent: it exits 0 when the PR already exists, when the
# entry is already listed, or on --dry-run, so re-running is safe.

param(
    [int]$Retries = 5,
    [int]$DelaySeconds = 90
)

$ErrorActionPreference = "Continue"
$skill = Join-Path $env:USERPROFILE ".agents\skills\dsh-plugin-publish-market\scripts\submit-market-pr.mjs"
$entryPath = Join-Path $PSScriptRoot "market-entry.json"
$log = Join-Path $PSScriptRoot "market-submit.log"
$entry = Get-Content -LiteralPath $entryPath -Raw -Encoding UTF8 | ConvertFrom-Json

$arguments = @(
    $skill,
    "--repo", [string]$entry.repo,
    "--category", [string]$entry.category,
    "--en", [string]$entry.en,
    "--zh", [string]$entry.zh,
    "--note", [string]$entry.note
)

"=== $(Get-Date -Format o) market submit start (retries=$Retries) ===" | Add-Content -LiteralPath $log -Encoding UTF8

for ($attempt = 1; $attempt -le $Retries; $attempt++) {
    # Native stderr must not become a terminating error under a Stop preference.
    $output = (& node @arguments 2>&1 | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
    $code = $LASTEXITCODE
    "--- attempt $attempt exit=$code ---" | Add-Content -LiteralPath $log -Encoding UTF8
    $output | Add-Content -LiteralPath $log -Encoding UTF8
    if ($code -eq 0) {
        $pr = [regex]::Match($output, "https://github\.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/\d+")
        if ($pr.Success) { "PR: $($pr.Value)" | Add-Content -LiteralPath $log -Encoding UTF8 }
        "=== done: submitted or already present ===" | Add-Content -LiteralPath $log -Encoding UTF8
        exit 0
    }
    if ($attempt -lt $Retries) { Start-Sleep -Seconds $DelaySeconds }
}

"=== failed after $Retries attempts ===" | Add-Content -LiteralPath $log -Encoding UTF8
exit 1
