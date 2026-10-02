param(
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot

# All new tools, Python environments and download/build caches stay in this project.
$toolsDir = Join-Path $projectRoot '.tools'
$setupCache = Join-Path $projectRoot '.setup-cache'
$npmCache = Join-Path $projectRoot '.npm-cache'
$pipCache = Join-Path $projectRoot '.pip-cache'
$uvCache = Join-Path $projectRoot '.uv-cache'
$venvPython = Join-Path $projectRoot 'server\.venv\Scripts\python.exe'
$nodeVersion = '24.21.0'
$uvVersion = '0.12.20'

foreach ($dir in @($toolsDir, $setupCache, $npmCache, $pipCache, $uvCache, (Join-Path $setupCache 'tmp'))) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
$env:TEMP = Join-Path $setupCache 'tmp'
$env:TMP = $env:TEMP
$env:PIP_CACHE_DIR = $pipCache
$env:UV_CACHE_DIR = $uvCache
$env:UV_STATE_DIR = Join-Path $toolsDir 'uv-state'
$env:UV_TOOL_DIR = Join-Path $toolsDir 'uv-tools'
$env:UV_TOOL_BIN_DIR = Join-Path $toolsDir 'uv-tool-bin'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $toolsDir 'python'
$env:UV_PYTHON_BIN_DIR = Join-Path $toolsDir 'python-bin'

function Invoke-Step([string]$label, [scriptblock]$action) {
  Write-Host "[UTA] $label"
  & $action
  if ($LASTEXITCODE -ne 0) { throw "$label failed (exit code $LASTEXITCODE)." }
}

function Get-PlatformName {
  $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  if ($arch -eq 'X64') { return 'x64' }
  if ($arch -eq 'Arm64') { return 'arm64' }
  throw "Unsupported Windows architecture: $arch. Use x64 or ARM64 Windows."
}

function Get-VerifiedDownload([string]$url, [string]$hashUrl, [string]$fileName, [string]$target) {
  $cachePrefix = [IO.Path]::GetFullPath($setupCache).TrimEnd('\') + '\'
  if (-not [IO.Path]::GetFullPath($target).StartsWith($cachePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to write a download outside the project setup cache.'
  }
  $hashText = (Invoke-WebRequest -Uri $hashUrl -UseBasicParsing).Content
  $matchingLine = @($hashText -split "`n" | Where-Object { $_ -match [regex]::Escape($fileName) }) | Select-Object -First 1
  if (-not $matchingLine -and $hashUrl.EndsWith('.sha256')) { $matchingLine = ($hashText -split "`n" | Select-Object -First 1) }
  $checksumMatch = [regex]::Match([string]$matchingLine, '[a-fA-F0-9]{64}')
  if (-not $checksumMatch.Success) {
    throw "Could not find a SHA-256 checksum for $fileName at $hashUrl."
  }
  $expected = $checksumMatch.Value.ToLowerInvariant()
  if (Test-Path -LiteralPath $target) {
    $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) {
      Write-Host "[UTA] Re-downloading incomplete or invalid cache file: $fileName"
      Remove-Item -LiteralPath $target -Force
    }
  }
  if (-not (Test-Path -LiteralPath $target)) {
    Write-Host "[UTA] Downloading $fileName from the publisher..."
    Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing
  }
  $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "Checksum mismatch for $fileName. Remove the damaged copy at $target and retry."
  }
}

function Test-Node([string]$nodeExe, [string]$npmCmd) {
  if (-not (Test-Path -LiteralPath $nodeExe) -or -not (Test-Path -LiteralPath $npmCmd)) { return $false }
  try {
    $versionText = (& $nodeExe --version 2>$null | Select-Object -First 1)
    if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '^v(\d+)\.(\d+)\.') { return $false }
    $major = [int]$Matches[1]; $minor = [int]$Matches[2]
    return (($major -eq 20 -and $minor -ge 19) -or ($major -eq 22 -and $minor -ge 12) -or ($major -ge 24 -and $major % 2 -eq 0))
  } catch { return $false }
}

function Find-Python {
  $candidate = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($candidate) {
    foreach ($version in @('3.13', '3.12', '3.11', '3.10')) {
      try {
        & $candidate.Source "-$version" -c 'import sys; print(sys.executable)' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { return @{ File = $candidate.Source; Prefix = @("-$version") } }
      } catch { }
    }
  }
  $candidate = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($candidate) {
    try {
      & $candidate.Source -c 'import sys; exit(0 if sys.version_info[:2] in [(3, 10), (3, 11), (3, 12), (3, 13)] else 1)' 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) {
        return @{ File = $candidate.Source; Prefix = @() }
      }
    } catch { }
  }
  return $null
}

try {
  $arch = Get-PlatformName
  $localNodeDir = Join-Path $toolsDir "node-v$nodeVersion-win-$arch"
  $localNode = Join-Path $localNodeDir 'node.exe'
  $localNpm = Join-Path $localNodeDir 'npm.cmd'
  $nodeDir = $null
  if (Test-Node $localNode $localNpm) {
    $nodeDir = $localNodeDir
    Write-Host '[UTA] Using project-local Node.js.'
  } else {
    $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
    $systemNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($systemNode -and $systemNpm -and (Test-Node $systemNode.Source $systemNpm.Source)) {
      $nodeDir = Split-Path $systemNode.Source -Parent
      Write-Host '[UTA] Using existing Node.js.'
    }
  }
  if (-not $nodeDir) {
    if ($CheckOnly) { throw 'Node.js is missing or unsupported.' }
    $fileName = "node-v$nodeVersion-win-$arch.zip"
    $baseUrl = "https://nodejs.org/dist/v$nodeVersion"
    $archive = Join-Path $setupCache $fileName
    Get-VerifiedDownload "$baseUrl/$fileName" "$baseUrl/SHASUMS256.txt" $fileName $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $toolsDir -Force
    if (-not (Test-Node $localNode $localNpm)) { throw 'Downloaded Node.js is not usable.' }
    $nodeDir = $localNodeDir
    Write-Host '[UTA] Node.js installed inside .tools.'
  }
  $env:PATH = "$nodeDir;$env:PATH"
  $selectedNpm = Join-Path $nodeDir 'npm.cmd'
  $npm = if (Test-Path -LiteralPath $selectedNpm) { $selectedNpm } else { (Get-Command npm.cmd).Source }

  if (Test-Path -LiteralPath $venvPython) {
    & $venvPython --version 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The existing server/.venv is damaged. Back it up and remove that folder, then retry setup.' }
    Write-Host '[UTA] Using existing project Python environment.'
  } else {
    if ($CheckOnly) { throw 'The project Python environment server/.venv is missing.' }
    if (Test-Path -LiteralPath (Join-Path $projectRoot 'server\.venv')) {
      throw 'server/.venv exists but has no Python executable. Back it up and remove that folder, then retry setup.'
    }
    $systemPython = Find-Python
    if ($systemPython) {
      Write-Host '[UTA] Creating a project virtual environment with existing Python.'
      & $systemPython.File @($systemPython.Prefix) -m venv (Join-Path $projectRoot 'server\.venv')
      if ($LASTEXITCODE -ne 0) { throw 'Python could not create server/.venv.' }
    } else {
      $uvArch = if ($arch -eq 'x64') { 'x86_64' } else { 'aarch64' }
      $uvFile = "uv-$uvArch-pc-windows-msvc.zip"
      $uvUrl = "https://github.com/astral-sh/uv/releases/download/$uvVersion/$uvFile"
      $uvArchive = Join-Path $setupCache "$uvVersion-$uvFile"
      Get-VerifiedDownload $uvUrl "$uvUrl.sha256" $uvFile $uvArchive
      $uvDir = Join-Path $toolsDir "uv-$uvVersion-$arch"
      New-Item -ItemType Directory -Path $uvDir -Force | Out-Null
      Expand-Archive -LiteralPath $uvArchive -DestinationPath $uvDir -Force
      $uv = Join-Path $uvDir 'uv.exe'
      if (-not (Test-Path -LiteralPath $uv)) { throw "uv.exe was not found in $uvDir." }
      Invoke-Step 'Installing Python 3.12 inside .tools' { & $uv python install 3.12 --install-dir $env:UV_PYTHON_INSTALL_DIR }
      Invoke-Step 'Creating server/.venv' { & $uv venv --managed-python --python 3.12 --seed (Join-Path $projectRoot 'server\.venv') }
      Write-Host '[UTA] Python installed inside .tools; environment created in server/.venv.'
    }
  }

  if ($CheckOnly) {
    Write-Host '[UTA] Node.js and Python are available. No dependencies were installed.'
    exit 0
  }

  # npm and pip are explicitly given project-local caches, even when the
  # interpreter/runtime itself was already present elsewhere on the machine.
  Invoke-Step 'Installing JavaScript dependencies into node_modules' {
    & $npm ci --cache $npmCache --no-audit --no-fund
  }
  Invoke-Step 'Installing Python dependencies into server/.venv' {
    & $venvPython -m pip install --cache-dir $pipCache -r (Join-Path $projectRoot 'server\requirements.txt')
  }
  Invoke-Step 'Checking the Python annotation service' {
    & $venvPython -c 'import fastapi, uvicorn, sudachipy, sudachidict_core; print(1)'
  }
  Write-Host ''
  Write-Host '[UTA] Setup complete. Double-click the UTA start launcher in the project folder.'
  Write-Host '[UTA] The optional large Chinese dictionary is installed separately; see README.md.'
} catch {
  Write-Host ''
  Write-Host "[UTA] Setup stopped: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host '[UTA] Check network/proxy access to nodejs.org, github.com and the package registries, then run setup again.'
  exit 1
}
