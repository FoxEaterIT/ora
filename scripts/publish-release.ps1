[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('patch', 'minor', 'major')]
    [string]$Bump,

    [Parameter(Mandatory = $true, Position = 1)]
    [ValidateNotNullOrEmpty()]
    [string]$Message
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Invoke-Gh {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    & gh @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "gh $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

$repoRoot = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
    throw 'Run this script from inside the Ora Git repository.'
}
Set-Location $repoRoot

$scriptRelativePath = [System.IO.Path]::GetRelativePath($repoRoot, $PSCommandPath).Replace('\\', '/')
$packagePath = Join-Path $repoRoot 'package.json'
$packageText = Get-Content -LiteralPath $packagePath -Raw
$package = $packageText | ConvertFrom-Json
if ($package.version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
    throw "package.json version '$($package.version)' is not a plain stable semver version (x.y.z)."
}

$desktopConfigPath = Join-Path $repoRoot 'src-tauri/tauri.conf.json'
$desktopConfigText = Get-Content -LiteralPath $desktopConfigPath -Raw
$desktopConfig = $desktopConfigText | ConvertFrom-Json
$cargoTomlPath = Join-Path $repoRoot 'src-tauri/Cargo.toml'
$cargoTomlText = Get-Content -LiteralPath $cargoTomlPath -Raw
$cargoLockPath = Join-Path $repoRoot 'src-tauri/Cargo.lock'
$cargoLockText = Get-Content -LiteralPath $cargoLockPath -Raw
$cargoPackageVersionMatch = [regex]::Match($cargoTomlText, '(?ms)^\[package\]\s*.*?^version\s*=\s*"([^"]+)"')
$cargoLockVersionMatch = [regex]::Match($cargoLockText, '(?ms)^name\s*=\s*"ora-desktop"\s*\r?\nversion\s*=\s*"([^"]+)"')
if (-not $cargoPackageVersionMatch.Success -or -not $cargoLockVersionMatch.Success) {
    throw 'Could not locate the ora-desktop package versions in Cargo.toml and Cargo.lock.'
}
foreach ($source in @(@{ Name = 'Tauri config'; Version = [string]$desktopConfig.version }, @{ Name = 'Cargo.toml'; Version = [string]$cargoPackageVersionMatch.Groups[1].Value }, @{ Name = 'Cargo.lock'; Version = [string]$cargoLockVersionMatch.Groups[1].Value })) {
    if ($source.Version -cne [string]$package.version) {
        throw "$($source.Name) version '$($source.Version)' must match package.json version '$($package.version)' before a unified release."
    }
}

$parts = @([int]$package.version.Split('.')[0], [int]$package.version.Split('.')[1], [int]$package.version.Split('.')[2])
switch ($Bump) {
    'patch' { $parts[2]++ }
    'minor' { $parts[1]++; $parts[2] = 0 }
    'major' { $parts[0]++; $parts[1] = 0; $parts[2] = 0 }
}
$newVersion = '{0}.{1}.{2}' -f $parts[0], $parts[1], $parts[2]
$tag = "v$newVersion"

$branch = (& git branch --show-current)
if ($LASTEXITCODE -ne 0 -or -not $branch) {
    throw 'A named branch must be checked out; detached HEAD is not supported.'
}
$dirty = @(& git status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Git working-tree status.' }
$dirty = @($dirty | Where-Object {
    $entry = $_.Substring(3).Trim('"') -replace '\\', '/'
    $entry -ne $scriptRelativePath
})
if ($dirty.Count -gt 0) {
    throw "Working tree is not clean. Commit or stash changes before publishing:`n$($dirty -join "`n")"
}

$upstream = (& git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $upstream -or -not $upstream.StartsWith('origin/')) {
    throw "Branch '$branch' must have an upstream on origin before publishing."
}
Invoke-Git -Arguments @('fetch', '--tags', 'origin')
$counts = (& git rev-list --left-right --count "$upstream...HEAD") -split '\s+'
if ($LASTEXITCODE -ne 0 -or $counts.Count -lt 2 -or $counts[0] -ne '0') {
    throw "Local branch must not be behind its upstream '$upstream'; synchronize it before publishing."
}
if ((& git tag --list $tag)) {
    throw "Tag '$tag' already exists. Choose another bump or resolve the existing release first."
}
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI authentication is required. Run gh auth login, then retry.'
}
& gh workflow list --all *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI cannot access repository workflows; verify repository permissions and gh authentication.'
}

$desktopMarker = 'Ora-Desktop-Release: true'
$releaseMessage = "$Message`n`n$desktopMarker`n"
Write-Host "Preparing unified Ora and Ora Desktop release $tag ($Bump)"
Write-Host "Release notes: $Message"
Write-Host "Desktop release marker: $desktopMarker"
$confirmation = (Read-Host "Publish $tag to GitHub (commit, push, create a public release, and dispatch desktop installer build)? [Y/N]").Trim()
if ($confirmation -notmatch '^(?i:y|yes)$') {
    throw 'Release cancelled; no files were changed.'
}

$escapedVersion = [regex]::Escape([string]$package.version)
$desktopConfigPattern = '("version"\s*:\s*")' + [regex]::Escape([string]$desktopConfig.version) + '(")'
$updatedDesktopConfig = [regex]::Replace($desktopConfigText, $desktopConfigPattern, {
    param($match)
    $match.Groups[1].Value + $newVersion + $match.Groups[2].Value
}, 1)
if ($updatedDesktopConfig -ceq $desktopConfigText -or ([string]($updatedDesktopConfig | ConvertFrom-Json).version -cne $newVersion)) {
    throw 'Could not update the Tauri config version safely.'
}
$cargoPackagePattern = '(?ms)(^\[package\]\s*.*?^version\s*=\s*")' + [regex]::Escape([string]$package.version) + '(")'
$updatedCargoToml = [regex]::Replace($cargoTomlText, $cargoPackagePattern, {
    param($match)
    $match.Groups[1].Value + $newVersion + $match.Groups[2].Value
}, 1)
if ($updatedCargoToml -ceq $cargoTomlText -or ([regex]::Match($updatedCargoToml, '(?ms)^\[package\]\s*.*?^version\s*=\s*"([^"]+)"').Groups[1].Value -cne $newVersion)) {
    throw 'Could not update the Cargo.toml package version safely.'
}
$cargoLockPackagePattern = '(?ms)(^name\s*=\s*"ora-desktop"\s*\r?\nversion\s*=\s*")' + [regex]::Escape([string]$package.version) + '(")'
$updatedCargoLock = [regex]::Replace($cargoLockText, $cargoLockPackagePattern, {
    param($match)
    $match.Groups[1].Value + $newVersion + $match.Groups[2].Value
}, 1)
if ($updatedCargoLock -ceq $cargoLockText -or ([regex]::Match($updatedCargoLock, '(?ms)^name\s*=\s*"ora-desktop"\s*\r?\nversion\s*=\s*"([^"]+)"').Groups[1].Value -cne $newVersion)) {
    throw 'Could not update the ora-desktop Cargo.lock package version safely.'
}
# Use a MatchEvaluator. A replacement string such as '$1' + $newVersion is expanded
# by the regex engine and, in PowerShell, '$1' can also be consumed as a variable.
# That previously wrote `$10.2.1"` instead of `"version": "0.2.1"`.
$versionPattern = '("version"\s*:\s*")' + $escapedVersion + '(")'
$replacementCount = 0
$updatedText = [regex]::Replace($packageText, $versionPattern, {
    param($match)
    $script:replacementCount++
    $match.Groups[1].Value + $newVersion + $match.Groups[2].Value
}, 1)
if ($replacementCount -ne 1 -or $updatedText -ceq $packageText) {
    throw 'Could not update the package.json version field safely.'
}
try {
    $parsed = $updatedText | ConvertFrom-Json
} catch {
    throw "Refusing to write package.json because the version bump produced invalid JSON: $($_.Exception.Message)"
}
if ([string]$parsed.version -cne $newVersion) {
    throw "Refusing to write package.json because the version field is '$($parsed.version)', not '$newVersion'."
}
Set-Content -LiteralPath $packagePath -Value $updatedText -NoNewline
Set-Content -LiteralPath $desktopConfigPath -Value $updatedDesktopConfig -NoNewline
Set-Content -LiteralPath $cargoTomlPath -Value $updatedCargoToml -NoNewline
Set-Content -LiteralPath $cargoLockPath -Value $updatedCargoLock -NoNewline

try {
    Invoke-Git -Arguments @('add', '--', 'package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', $scriptRelativePath)
    Invoke-Git -Arguments @('commit', '-m', "chore: release $tag")
    Invoke-Git -Arguments @('tag', '-a', $tag, '-m', $Message)
    Invoke-Git -Arguments @('push', 'origin', $branch)
    Invoke-Git -Arguments @('push', 'origin', $tag)
    Invoke-Gh -Arguments @('release', 'create', $tag, '--title', $tag, '--notes', $releaseMessage, '--verify-tag')
    Write-Host "Published https://github.com/FoxEaterIT/ora/releases/tag/$tag"
    Write-Host 'The release-archive workflow will attach the updater ZIP after the release is published.'
    try {
        Invoke-Gh -Arguments @('workflow', 'run', 'desktop-release.yml', '--ref', $branch, '-f', "tag=$tag")
        Write-Host "Dispatched desktop installer workflow for $tag. Follow its progress in GitHub Actions."
    }
    catch {
        Write-Warning "The release $tag was published, but the desktop workflow dispatch failed. Start 'Build Ora Desktop installers' manually in GitHub Actions with tag $tag."
        throw
    }
}
catch {
    Write-Error "Release publishing stopped: $_"
    Write-Warning "Check git status, local/remote tag '$tag', and GitHub Releases before retrying. The version bump or commit may already have been created/pushed."
    throw
}
