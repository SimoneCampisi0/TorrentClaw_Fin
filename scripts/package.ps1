param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $repositoryRoot "src\Jellyfin.Plugin.TorrentClaw\Jellyfin.Plugin.TorrentClaw.csproj"
$manifest = Join-Path $repositoryRoot "build.yaml"

# The project file is the single source of the version; build.yaml must agree with it.
[xml]$projectXml = Get-Content -LiteralPath $project -Raw
$version = @($projectXml.Project.PropertyGroup | ForEach-Object { $_.Version } | Where-Object { $_ }) | Select-Object -First 1
if (-not $version) {
    throw "Version not found in $project."
}

$manifestText = Get-Content -LiteralPath $manifest -Raw
if ($manifestText -notmatch ('(?m)^version:\s*"' + [regex]::Escape($version) + '"')) {
    throw "build.yaml version does not match project version $version."
}

$buildOutput = Join-Path $repositoryRoot "src\Jellyfin.Plugin.TorrentClaw\bin\$Configuration\net10.0"
$artifacts = Join-Path $repositoryRoot "artifacts"
$stage = Join-Path $artifacts "TorrentClaw_Fin_$version"
$archive = Join-Path $artifacts "TorrentClaw_Fin_$version.zip"
$resolvedRepositoryRoot = [System.IO.Path]::GetFullPath($repositoryRoot).TrimEnd('\') + '\'
$resolvedStage = [System.IO.Path]::GetFullPath($stage).TrimEnd('\') + '\'

if (-not $resolvedStage.StartsWith($resolvedRepositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean a staging directory outside the repository."
}

dotnet build $project -c $Configuration --no-restore
if ($LASTEXITCODE -ne 0) {
    throw "Plugin build failed."
}

if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
}

New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $buildOutput "Jellyfin.Plugin.TorrentClaw.dll") -Destination $stage
Copy-Item -LiteralPath (Join-Path $buildOutput "Jellyfin.Plugin.TorrentClaw.pdb") -Destination $stage

if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force
}

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $archive -CompressionLevel Optimal

$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$archive.sha256" -Value "$hash  $(Split-Path -Leaf $archive)" -Encoding ascii
Write-Output $archive
Write-Output "SHA-256: $hash"
