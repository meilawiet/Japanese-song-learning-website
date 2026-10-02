# Windows setup smoke test. Import only the two detection functions; do not run
# the installer itself or download anything.
$ErrorActionPreference = 'Stop'
$setupScript = Join-Path $PSScriptRoot '..\scripts\setup.ps1'
$tokens = $null
$parseErrors = $null
$syntax = [System.Management.Automation.Language.Parser]::ParseFile($setupScript, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "setup.ps1 has syntax errors: $($parseErrors[0].Message)" }

foreach ($name in @('Test-Node', 'Find-Python', 'Get-VerifiedDownload')) {
  $functionAst = $syntax.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
  if (-not $functionAst) { throw "Missing setup function: $name" }
  . ([scriptblock]::Create($functionAst.Extent.Text))
}

$node = Get-Command node.exe -ErrorAction Stop
$npm = Get-Command npm.cmd -ErrorAction Stop
Remove-Variable LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue
if (-not (Test-Node $node.Source $npm.Source)) { throw 'A valid installed Node.js was rejected in a fresh PowerShell session.' }
if (Test-Node $node.Source (Join-Path $PSScriptRoot 'missing-npm.cmd')) { throw 'Missing npm.cmd was incorrectly accepted.' }

$python = Find-Python
if ($python) {
  Remove-Variable LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue
  $python = Find-Python
  if (-not $python) { throw 'Installed Python was rejected in a fresh PowerShell session.' }
}

# PowerShell 5.1 may return a .sha256 response as byte[], not text.
$setupCache = Join-Path $PSScriptRoot '..\.setup-cache'
New-Item -ItemType Directory -Path $setupCache -Force | Out-Null
$fixtureName = "setup-checksum-$([guid]::NewGuid().ToString('N')).bin"
$fixture = Join-Path $setupCache $fixtureName
try {
  [IO.File]::WriteAllBytes($fixture, [byte[]](1, 2, 3, 4))
  $script:fixtureHash = (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLowerInvariant()
  $script:fixtureName = $fixtureName
  function Invoke-WebRequest {
    param([string]$Uri, [switch]$UseBasicParsing)
    if ($Uri -ne 'test://checksum.sha256') { throw "Unexpected request: $Uri" }
    return [pscustomobject]@{ Content = [Text.Encoding]::UTF8.GetBytes("$script:fixtureHash  $script:fixtureName") }
  }
  Get-VerifiedDownload 'test://archive' 'test://checksum.sha256' $fixtureName $fixture
} finally {
  if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Force }
}

Write-Host 'Setup environment detection and checksum checks passed.'
