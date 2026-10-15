param(
  [Parameter(Mandatory=$true)][string]$Archive,
  [Parameter(Mandatory=$true)][string]$Destination,
  [Parameter(Mandatory=$true)][string]$Version
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($Archive)
$root = [System.IO.Path]::GetFullPath($Destination)
$prefix = "UTA-Windows-x64/versions/$Version/"
$total = [long]0
$count = 0
try {
  foreach ($entry in $zip.Entries) {
    $name = $entry.FullName
    if (-not $name.StartsWith($prefix, [System.StringComparison]::Ordinal)) { continue }
    $relative = $name.Substring($prefix.Length)
    if (-not $relative -or $relative.EndsWith('/')) { continue }
    if ($relative.Length -gt 512 -or $relative.Contains('\') -or $relative.Contains(':') -or $relative.Contains([char]0)) { throw 'Unsafe archive path' }
    $parts = $relative.Split('/')
    if ($parts | Where-Object { -not $_ -or $_ -eq '.' -or $_ -eq '..' }) { throw 'Unsafe archive path' }
    $target = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)))
    if (-not $target.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escapes staging folder' }
    $total += [long]$entry.Length
    $count++
    if ($total -gt 4GB -or $count -gt 20000) { throw 'Archive exceeds update limits' }
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
    $inputStream = $entry.Open()
    try {
      $outputStream = [System.IO.File]::Create($target)
      try { $inputStream.CopyTo($outputStream) }
      finally { $outputStream.Dispose() }
    } finally { $inputStream.Dispose() }
  }
} finally { $zip.Dispose() }
if (-not [System.IO.File]::Exists([System.IO.Path]::Combine($root, 'manifest.json'))) { throw 'Version manifest missing' }
