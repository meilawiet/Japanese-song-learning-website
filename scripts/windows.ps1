param([ValidateSet('setup','build','start','test')][string]$Task = 'build')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
$temporary = Join-Path $projectRoot 'work\tmp'
New-Item -ItemType Directory -Path $temporary -Force | Out-Null
$env:TEMP = $temporary
$env:TMP = $temporary
$env:npm_config_cache = Join-Path $projectRoot '.npm-cache'
$env:npm_config_devdir = Join-Path $projectRoot '.cache\node-gyp'
$env:ELECTRON_CACHE = Join-Path $projectRoot '.cache\electron'
$env:electron_config_cache = $env:ELECTRON_CACHE
$env:PIP_CACHE_DIR = Join-Path $projectRoot '.pip-cache'
$env:PYTHONUTF8 = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'
function Invoke-Checked([scriptblock]$Action) { & $Action; if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE)." } }
$portableNode = Join-Path $projectRoot '.tools\node-v24.21.0-win-x64'
if (Test-Path -LiteralPath (Join-Path $portableNode 'node.exe')) { $env:PATH = $portableNode + ';' + $env:PATH }
switch ($Task) {
  'setup' {
    # Existing project-local bootstrap downloads verified Node/Python when needed.
    Invoke-Checked { & (Join-Path $projectRoot 'scripts\setup.ps1') }
    Invoke-Checked { & 'server\.venv\Scripts\python.exe' -m pip install -r server\requirements-desktop.txt }
    Invoke-Checked { & 'server\.venv\Scripts\python.exe' -B scripts\download-tomoshi.py }
  }
  'build' { Invoke-Checked { npm.cmd run windows:package } }
  'test' {
    Invoke-Checked { npm.cmd test }
    Invoke-Checked { & 'server\.venv\Scripts\python.exe' -m unittest discover -s server\tests }
    Invoke-Checked { npm.cmd run test:desktop }
  }
  'start' {
    $executable = Join-Path $projectRoot 'release\UTA-Windows-x64\UTA.exe'
    if (!(Test-Path -LiteralPath $executable)) { throw 'Build the Windows application first.' }
    Start-Process -FilePath $executable -WorkingDirectory (Split-Path -Parent $executable)
  }
}
