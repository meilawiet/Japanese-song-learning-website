$ErrorActionPreference = 'Stop'
$desktop = Join-Path $PSScriptRoot '..\desktop'
Add-Type -AssemblyName System.Drawing
$original = [System.Drawing.Image]::FromFile((Join-Path $desktop 'icon-source.png'))
$bitmap = New-Object System.Drawing.Bitmap 256,256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($original, 0, 0, 256, 256)
  $bitmap.Save((Join-Path $desktop 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose(); $original.Dispose() }
$png = [IO.File]::ReadAllBytes((Join-Path $desktop 'icon.png'))
$stream = [IO.File]::Create((Join-Path $desktop 'icon.ico'))
$writer = New-Object IO.BinaryWriter $stream
try {
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
  $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
  $writer.Write([uint16]1); $writer.Write([uint16]32)
  $writer.Write([uint32]$png.Length); $writer.Write([uint32]22); $writer.Write($png)
} finally { $writer.Dispose() }
