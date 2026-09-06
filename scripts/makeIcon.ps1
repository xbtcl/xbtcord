# Builds Xbtcord's icons from assets/xbtcord.png.
#
# The source mark is white on transparency, which reads beautifully on Discord's dark UI
# and disappears completely on a light Windows taskbar. So two things come out of here:
#
#   assets/xbtcord.ico      the app icon - the mark on a dark rounded plate, at every size
#                           Windows asks for, so it is legible wherever it lands
#   src/utils/xbtcordLogo.ts  both marks as data URIs, so nothing in the client has to
#                           find a file on disk or make a network request to draw itself
#
# Run with: pnpm makeIcon

#Requires -Version 5.1
[CmdletBinding()]
param(
    [string] $Source = (Join-Path (Split-Path -Parent $PSScriptRoot) "assets\xbtcord.png"),
    # The plate the mark sits on. Near-black rather than pure, so it reads as a shape
    # against a black taskbar instead of dissolving into it.
    [string] $Plate = "#1A1A1E"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $PSScriptRoot
$IcoOut = Join-Path $Root "assets\xbtcord.ico"
$TsOut = Join-Path $Root "src\utils\xbtcordLogo.ts"

if (-not (Test-Path $Source)) { throw "No source mark at $Source" }

$plateColor = [System.Drawing.ColorTranslator]::FromHtml($Plate)
$src = [System.Drawing.Image]::FromFile($Source)

function New-RoundedPath([int] $size, [single] $radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

# Draws the mark at `size`, optionally on a rounded plate. Aspect ratio is preserved and
# the mark is inset, because an icon that runs to the very edge looks wrong next to the
# system's own icons.
function New-Icon([int] $size, [bool] $withPlate) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"
    $g.InterpolationMode = "HighQualityBicubic"
    $g.PixelOffsetMode = "HighQuality"
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($withPlate) {
        $radius = [single]([math]::Max(2, $size * 0.22))
        $path = New-RoundedPath $size $radius
        $brush = New-Object System.Drawing.SolidBrush $plateColor
        $g.FillPath($brush, $path)
        $brush.Dispose(); $path.Dispose()
    }

    # 6% inset on a plate, none without - the transparent mark is used inline where the
    # surrounding layout already provides the breathing room.
    $inset = if ($withPlate) { [int]($size * 0.06) } else { 0 }
    $box = $size - ($inset * 2)
    $scale = [math]::Min($box / $src.Width, $box / $src.Height)
    $w = [int]($src.Width * $scale)
    $h = [int]($src.Height * $scale)
    $g.DrawImage($src, [int](($size - $w) / 2), [int](($size - $h) / 2), $w, $h)

    $g.Dispose()
    return $bmp
}

function Get-PngBytes($bmp) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $ms.Dispose()
    # The leading comma stops PowerShell unrolling the array into one byte per pipeline
    # item, which would leave the caller holding an Object[] that BinaryWriter cannot take.
    return , $bytes
}

# Classic uncompressed frame: a BITMAPINFOHEADER whose height counts twice (colour rows
# then the AND mask), followed by bottom-up BGRA rows. The mask is left zeroed because
# 32-bit frames carry their own alpha, which is what every renderer since XP actually uses.
function Get-DibBytes($bmp) {
    $w = $bmp.Width
    $h = $bmp.Height

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter $ms

    $bw.Write([uint32] 40)          # biSize
    $bw.Write([int32] $w)           # biWidth
    $bw.Write([int32] ($h * 2))     # biHeight, colour rows + mask rows
    $bw.Write([uint16] 1)           # biPlanes
    $bw.Write([uint16] 32)          # biBitCount
    $bw.Write([uint32] 0)           # biCompression, BI_RGB
    $bw.Write([uint32] ($w * $h * 4))
    $bw.Write([int32] 0); $bw.Write([int32] 0)
    $bw.Write([uint32] 0); $bw.Write([uint32] 0)

    for ($y = $h - 1; $y -ge 0; $y--) {
        for ($x = 0; $x -lt $w; $x++) {
            $c = $bmp.GetPixel($x, $y)
            $bw.Write([byte] $c.B); $bw.Write([byte] $c.G)
            $bw.Write([byte] $c.R); $bw.Write([byte] $c.A)
        }
    }

    # AND mask: 1bpp, each row padded out to a 4-byte boundary.
    $maskRow = [int][math]::Ceiling($w / 32.0) * 4
    $blank = New-Object byte[] ($maskRow * $h)
    $bw.Write($blank)

    $bw.Flush()
    $bytes = $ms.ToArray()
    $bw.Dispose(); $ms.Dispose()
    return , $bytes
}

# --- the .ico -------------------------------------------------------------------------
#
# Small frames go in uncompressed, large ones PNG-compressed. Vista and later read PNG at
# any size, but plenty of older shell paths only look for it at 256, and an uncompressed
# 256 frame would add 256KB on its own. This split is what icon editors emit.

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()
foreach ($size in $sizes) {
    $bmp = New-Icon $size $true
    $images += , $(if ($size -ge 64) { Get-PngBytes $bmp } else { Get-DibBytes $bmp })
    $bmp.Dispose()
}

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms

$bw.Write([uint16] 0)                 # reserved
$bw.Write([uint16] 1)                 # type: icon
$bw.Write([uint16] $sizes.Count)

# Directory entries come first, so every image offset has to account for the whole table.
$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $size = $sizes[$i]
    # 0 means 256 in this field; anything larger has no encoding.
    $dim = if ($size -ge 256) { 0 } else { $size }
    $bw.Write([byte] $dim)            # width
    $bw.Write([byte] $dim)            # height
    $bw.Write([byte] 0)               # palette size
    $bw.Write([byte] 0)               # reserved
    $bw.Write([uint16] 1)             # colour planes
    $bw.Write([uint16] 32)            # bits per pixel
    $bw.Write([uint32] $images[$i].Length)
    $bw.Write([uint32] $offset)
    $offset += $images[$i].Length
}
foreach ($img in $images) { $bw.Write([byte[]] $img) }

$bw.Flush()
[System.IO.File]::WriteAllBytes($IcoOut, $ms.ToArray())
$bw.Dispose(); $ms.Dispose()
Write-Host "wrote $IcoOut ($((Get-Item $IcoOut).Length) bytes, $($sizes.Count) sizes)"

# --- the data URIs --------------------------------------------------------------------

$plated = New-Icon 256 $true
$plain = New-Icon 256 $false
$platedB64 = [Convert]::ToBase64String((Get-PngBytes $plated))
$plainB64 = [Convert]::ToBase64String((Get-PngBytes $plain))
$plated.Dispose(); $plain.Dispose()
$src.Dispose()

$header = @'
/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Generated by scripts/makeIcon.ps1 from assets/xbtcord.png - do not edit by hand.
 *
 * Inlined as data URIs rather than files so that drawing the client's own logo never
 * costs a network request or a lookup on disk, and so it works identically in the
 * desktop client and the browser build.
 */

/** The mark on a dark rounded plate. For the window and taskbar icon. */
export const XBTCORD_ICON = "data:image/png;base64,{0}";

/** White on transparency. For use inside Discord's own dark UI. */
export const XBTCORD_MARK = "data:image/png;base64,{1}";
'@

$ts = $header.Replace("{0}", $platedB64).Replace("{1}", $plainB64)
Set-Content -Path $TsOut -Value $ts -Encoding utf8 -NoNewline
Add-Content -Path $TsOut -Value "" -Encoding utf8
Write-Host "wrote $TsOut ($([math]::Round((Get-Item $TsOut).Length / 1KB)) KB)"
