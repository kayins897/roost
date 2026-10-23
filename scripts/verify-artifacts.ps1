# Compare release files without extracting the ZIP or starting the application.
# Example: powershell -NoProfile -File scripts/verify-artifacts.ps1 release/0.4.4
[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [string]$ReleaseDirectory,
    [string]$Version,
    [switch]$PortableOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $Version) {
    $Version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
}
if ($Version -notmatch '^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$') { throw 'Invalid version.' }
$release = if ([System.IO.Path]::IsPathRooted($ReleaseDirectory)) {
    [System.IO.Path]::GetFullPath($ReleaseDirectory)
} else { [System.IO.Path]::GetFullPath((Join-Path $projectRoot $ReleaseDirectory)) }
$releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'release'))
if (-not ($release + '\').StartsWith($releaseRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The release directory must be inside this project release directory.'
}
$source = Join-Path $release 'win-unpacked'
$zipPath = Join-Path $release "Qiyu-NoInstall-$Version-x64.zip"
$installerPath = Join-Path $release "Qiyu-Setup-$Version-x64.exe"
$executablePath = Join-Path $source '栖域.exe'
$asarPath = Join-Path $source 'resources/app.asar'
$distPath = Join-Path $projectRoot 'dist'
$requiredInputs = @($source, $zipPath, $executablePath, $asarPath, $distPath)
if (-not $PortableOnly) { $requiredInputs += $installerPath }
foreach ($required in $requiredInputs) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing required release input: $required" }
}

function Get-StreamSha256([System.IO.Stream]$Stream) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($algorithm.ComputeHash($Stream)).Replace('-', '') }
    finally { $algorithm.Dispose() }
}
function Get-FileSha256([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try { return Get-StreamSha256 $stream } finally { $stream.Dispose() }
}
function Get-BinaryEvidence([string]$Path, [string]$RelativePath) {
    $file = Get-Item -LiteralPath $Path
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    return [ordered]@{
        path = $RelativePath
        bytes = $file.Length
        sha256 = Get-FileSha256 $Path
        productVersion = $file.VersionInfo.ProductVersion
        fileVersion = $file.VersionInfo.FileVersion
        signatureStatus = [string]$signature.Status
        signerSubject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
    }
}

$issues = [System.Collections.Generic.List[string]]::new()
$sourceFiles = [System.Collections.Generic.Dictionary[string,object]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse) {
    $relative = $file.FullName.Substring($source.Length + 1).Replace('\', '/')
    $sourceFiles.Add($relative, $file)
}
$zipFiles = [System.Collections.Generic.Dictionary[string,object]]::new([StringComparer]::OrdinalIgnoreCase)
$documents = [System.Collections.Generic.List[object]]::new()
$programFiles = [System.Collections.Generic.List[object]]::new()
$expectedDocuments = @('先读我-免安装版.txt', '更新说明.md')
$prefix = "QIYU-$Version/"
$zipEntryCount = 0
$zipFileCount = 0
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $zipEntryCount = $archive.Entries.Count
    foreach ($entry in $archive.Entries) {
        $name = $entry.FullName.Replace('\', '/')
        if ($name.EndsWith('/')) { continue }
        $zipFileCount++
        if (-not $name.StartsWith($prefix, [StringComparison]::Ordinal)) {
            $issues.Add("Unexpected ZIP root: $name"); continue
        }
        $relative = $name.Substring($prefix.Length)
        if (-not $relative -or $relative -match '(^|/)\.\.?(/|$)|^/|:') {
            $issues.Add("Invalid ZIP path: $name"); continue
        }
        if ($zipFiles.ContainsKey($relative)) { $issues.Add("Duplicate ZIP path: $relative"); continue }
        $stream = $entry.Open()
        try { $entryHash = Get-StreamSha256 $stream } finally { $stream.Dispose() }
        $record = [ordered]@{ path = $relative; bytes = $entry.Length; sha256 = $entryHash }
        $zipFiles.Add($relative, $record)
        if ($expectedDocuments -contains $relative) { $documents.Add($record); continue }
        if (-not $sourceFiles.ContainsKey($relative)) { $issues.Add("Unexpected ZIP program file: $relative"); continue }
        $file = $sourceFiles[$relative]
        $sourceHash = Get-FileSha256 $file.FullName
        $matched = $file.Length -eq $entry.Length -and $sourceHash -eq $entryHash
        $programFiles.Add([ordered]@{
            path = $relative; bytes = $file.Length; sha256 = $sourceHash
            zipBytes = $entry.Length; zipSha256 = $entryHash; matched = $matched
        })
        if (-not $matched) { $issues.Add("ZIP program content mismatch: $relative") }
    }
} finally { $archive.Dispose() }
foreach ($relative in $sourceFiles.Keys) {
    if (-not $zipFiles.ContainsKey($relative)) { $issues.Add("Missing ZIP program file: $relative") }
    if ($expectedDocuments -contains $relative) { $issues.Add("Document collides with a program file: $relative") }
}
foreach ($relative in $expectedDocuments) {
    if (-not $zipFiles.ContainsKey($relative)) { $issues.Add("Missing ZIP document: $relative") }
}

$installer = if (-not $PortableOnly) { Get-BinaryEvidence $installerPath ([System.IO.Path]::GetFileName($installerPath)) } else { $null }
$application = Get-BinaryEvidence $executablePath 'win-unpacked/栖域.exe'
foreach ($binary in @($installer, $application) | Where-Object { $null -ne $_ }) {
    if ($binary.productVersion -notin @($Version, "$Version.0")) { $issues.Add("Product version mismatch: $($binary.path)") }
    if ($binary.fileVersion -notin @($Version, "$Version.0")) { $issues.Add("File version mismatch: $($binary.path)") }
    if ($binary.signatureStatus -notin @('Valid', 'NotSigned')) { $issues.Add("Unexpected Authenticode status for $($binary.path): $($binary.signatureStatus)") }
}
$zipArtifact = [ordered]@{
    path = [System.IO.Path]::GetFileName($zipPath)
    bytes = (Get-Item -LiteralPath $zipPath).Length
    sha256 = Get-FileSha256 $zipPath
}
$artifacts = @(@($installer, $zipArtifact) | Where-Object { $null -ne $_ })
$distFiles = @(foreach ($file in Get-ChildItem -LiteralPath $distPath -File -Recurse | Sort-Object FullName) {
    [ordered]@{ path = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/'); bytes = $file.Length; sha256 = Get-FileSha256 $file.FullName }
})
if (-not ($distFiles | Where-Object { $_.path -eq 'dist/index.html' })) { $issues.Add('Missing dist/index.html') }
$matchedFiles = @($programFiles | Where-Object { $_.matched })
# Check the packaged app against this exact front-end and desktop build as well.
$bundleCheck = @'
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const [root, archive] = process.argv.slice(1);
const asar = require(require.resolve('@electron/asar', { paths: [root] }));
const digest = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const files = [];
function walk(file) {
  if (fs.statSync(file).isDirectory()) for (const name of fs.readdirSync(file)) walk(path.join(file, name));
  else files.push(file);
}
for (const entry of ['dist', 'desktop-build', 'build/icon.png']) walk(path.join(root, entry));
const issues = [];
const records = files.map(file => {
  const archivePath = path.relative(root, file);
  const name = archivePath.split(path.sep).join('/');
  const source = fs.readFileSync(file);
  try {
    // @electron/asar resolves nested archive paths using the host path separator.
    const packed = asar.extractFile(archive, archivePath);
    const matched = source.equals(packed);
    if (!matched) issues.push(`Packaged build content mismatch: ${name}`);
    return { path: name, bytes: source.length, sha256: digest(source), packedSha256: digest(packed), matched };
  } catch (error) {
    issues.push(`Missing or unreadable packaged build file: ${name}`);
    return { path: name, bytes: source.length, sha256: digest(source), matched: false, error: error.message };
  }
});
const expected = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packed = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
for (const key of ['name', 'version', 'main']) if (expected[key] !== packed[key]) issues.push(`Packaged package.json mismatch: ${key}`);
process.stdout.write(JSON.stringify({ passed: !issues.length, packageVersion: packed.version, checkedFiles: records.length, files: records, issues }));
'@
$bundleCheckRaw = & node -e $bundleCheck $projectRoot $asarPath
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify packaged app.asar build contents.' }
$bundleEvidence = $bundleCheckRaw | ConvertFrom-Json
foreach ($issue in $bundleEvidence.issues) { $issues.Add([string]$issue) }
$programBytes = [long]0
foreach ($record in $programFiles) { $programBytes += [long]$record['bytes'] }
$report = [ordered]@{
    passed = $issues.Count -eq 0
    version = $Version
    timestamp = [DateTime]::UtcNow.ToString('o')
    method = 'Read-only ZIP streaming SHA256 comparison; no extraction or application launch.'
    source = $source
    expectedProgramFiles = $sourceFiles.Count
    verifiedProgramFiles = $matchedFiles.Count
    programBytes = $programBytes
    allProgramFilesMatch = $matchedFiles.Count -eq $sourceFiles.Count -and $issues.Count -eq 0
    zipEntries = $zipEntryCount
    zipFiles = $zipFileCount
    additionalDocumentCount = $documents.Count
    documents = @($documents | Sort-Object { $_.path })
    artifacts = $artifacts
    application = $application
    appAsar = [ordered]@{ exists = $true; bytes = (Get-Item -LiteralPath $asarPath).Length; sha256 = Get-FileSha256 $asarPath }
    packagedBuild = $bundleEvidence
    distFiles = $distFiles
    programFiles = @($programFiles | Sort-Object { $_.path })
    issues = @($issues.ToArray())
    notes = @('Authenticode status is observed directly; an unsigned release is recorded as NotSigned.', 'No user data directories or running application processes are accessed. Only this report and SHA256SUMS.txt are written.')
}
$evidenceDirectory = Join-Path $projectRoot 'evidence'
[System.IO.Directory]::CreateDirectory($evidenceDirectory) | Out-Null
$reportPath = Join-Path $evidenceDirectory ("v$($Version.Replace('.', ''))-artifacts-validation.json")
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 8) + "`n", $utf8)
$manifest = ($artifacts | ForEach-Object { "$($_.sha256)  $($_.path)" }) -join "`n"
[System.IO.File]::WriteAllText((Join-Path $release 'SHA256SUMS.txt'), $manifest + "`n", $utf8)
[ordered]@{ passed = $report.passed; verifiedProgramFiles = $report.verifiedProgramFiles; additionalDocumentCount = $documents.Count; issues = $report.issues; report = $reportPath } | ConvertTo-Json -Depth 3
if (-not $report.passed) { exit 1 }
