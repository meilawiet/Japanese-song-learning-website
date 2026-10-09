#requires -Version 7.0
param([string]$Source)

# 旧写法：参数默认值里直接使用 $PSScriptRoot；Windows PowerShell 5 运行时可能为空。
# [string]$Source = (Join-Path $PSScriptRoot '..\android\icon-source.png')
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Source) { $Source = Join-Path $scriptDirectory '..\android\icon-source.png' }

Add-Type -AssemblyName System.Drawing

# 图标源图已在背景添加「うた」；这里仅等比例生成 Android 各密度图标。
# 旧路径：$androidRes = Join-Path $PSScriptRoot '..\android\app\src\main\res'
$androidRes = Join-Path $scriptDirectory '..\android\app\src\main\res'
$sourceImage = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source).Path)
$background = [System.Drawing.ColorTranslator]::FromHtml('#20272F')

function New-IconBitmap([int]$size, [double]$scale, [bool]$withBackground, [bool]$round) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.Clear([System.Drawing.Color]::Transparent)
        if ($round) {
            # 旧版圆形图标使用同一底色与图案，并裁掉圆外部分。
            $circle = [System.Drawing.Drawing2D.GraphicsPath]::new()
            $circle.AddEllipse(0, 0, $size, $size)
            $graphics.SetClip($circle)
            $circle.Dispose()
        }
        if ($withBackground) {
            $brush = [System.Drawing.SolidBrush]::new($background)
            $graphics.FillRectangle($brush, 0, 0, $size, $size)
            $brush.Dispose()
        }
        $edge = [int][Math]::Round($size * $scale)
        $offset = [int][Math]::Floor(($size - $edge) / 2)
        $graphics.DrawImage($sourceImage, [System.Drawing.Rectangle]::new($offset, $offset, $edge, $edge))
    } finally { $graphics.Dispose() }
    return $bitmap
}

try {
    $densitySizes = [ordered]@{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }
    foreach ($entry in $densitySizes.GetEnumerator()) {
        $folder = Join-Path $androidRes "mipmap-$($entry.Key)"
        $legacy = New-IconBitmap $entry.Value 0.96 $true $false
        $legacy.Save((Join-Path $folder 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $legacy.Dispose()
        $round = New-IconBitmap $entry.Value 0.96 $true $true
        $round.Save((Join-Path $folder 'ic_launcher_round.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $round.Dispose()
        $adaptive = New-IconBitmap ($entry.Value * 108 / 48) 0.85 $false $false
        $adaptive.Save((Join-Path $folder 'ic_launcher_foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $adaptive.Dispose()
    }
} finally { $sourceImage.Dispose() }

# 自适应图标透明区域使用与传统图标一致的深色底。
$backgroundXml = Join-Path $androidRes 'values\ic_launcher_background.xml'
@'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#20272F</color>
</resources>
'@ | Set-Content -LiteralPath $backgroundXml -Encoding utf8
