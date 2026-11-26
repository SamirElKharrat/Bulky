# Genera las imágenes del instalador de Windows (NSIS y MSI) con el logo de Bulky.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\installer-images.ps1
# Parte de src-tauri\icons\icon.png (el que crea "npx tauri icon public/bulky.svg").
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "src-tauri\installer"
New-Item -ItemType Directory -Force $out | Out-Null
$logo = [System.Drawing.Image]::FromFile((Join-Path $root "src-tauri\icons\icon.png"))

$dark = [System.Drawing.Color]::FromArgb(23, 24, 28)
$light = [System.Drawing.Color]::FromArgb(255, 255, 255)
$muted = [System.Drawing.Color]::FromArgb(154, 158, 167)
$domains = @("#D93636", "#E8761C", "#C99A00", "#1E9A5A", "#2C72D6", "#8445D6") | ForEach-Object { [System.Drawing.ColorTranslator]::FromHtml($_) }

function New-Canvas([int]$w, [int]$h, $bg) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "AntiAlias"; $g.InterpolationMode = "HighQualityBicubic"; $g.TextRenderingHint = "AntiAliasGridFit"
  $g.Clear($bg)
  return @($bmp, $g)
}
# Franja con los seis colores de dominio
function Draw-Stripe($g, [int]$x, [int]$y, [int]$w, [int]$h) {
  $seg = $w / 6
  for ($i = 0; $i -lt 6; $i++) {
    $b = New-Object System.Drawing.SolidBrush $domains[$i]
    $g.FillRectangle($b, [single]($x + $i * $seg), [single]$y, [single]([math]::Ceiling($seg)), [single]$h)
    $b.Dispose()
  }
}
function Draw-Text($g, [string]$text, [single]$size, $color, [single]$x, [single]$y, [string]$style = "Bold", [string]$align = "Near", [single]$w = 0) {
  $font = New-Object System.Drawing.Font("Segoe UI", $size, [System.Drawing.FontStyle]::$style, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush $color
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = $align
  if ($w -gt 0) { $g.DrawString($text, $font, $brush, (New-Object System.Drawing.RectangleF($x, $y, $w, 200)), $fmt) } else { $g.DrawString($text, $font, $brush, $x, $y) }
  $font.Dispose(); $brush.Dispose()
}
function Save-Bmp($bmp, $g, [string]$name) {
  $g.Dispose(); $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Bmp); $bmp.Dispose()
}

# NSIS · lateral de bienvenida y final (164 x 314)
$c = New-Canvas 164 314 $dark; $bmp = $c[0]; $g = $c[1]
$g.DrawImage($logo, 22, 60, 120, 120)
Draw-Text $g "Bulky" 30 $light 0 192 "Bold" "Center" 164
Draw-Text $g "Tu bulk de Riftbound," 12 $muted 0 234 "Regular" "Center" 164
Draw-Text $g "ordenado" 12 $muted 0 250 "Regular" "Center" 164
Draw-Stripe $g 0 308 164 6
Save-Bmp $bmp $g "nsis-sidebar.bmp"

# NSIS · cabecera de cada paso (150 x 57); NSIS la pone a la derecha sobre fondo blanco
$c = New-Canvas 150 57 $light; $bmp = $c[0]; $g = $c[1]
$g.DrawImage($logo, 98, 6, 44, 44)
Draw-Text $g "Bulky" 20 $dark 22 13 "Bold"
Save-Bmp $bmp $g "nsis-header.bmp"

# MSI · banner superior (493 x 58)
$c = New-Canvas 493 58 $light; $bmp = $c[0]; $g = $c[1]
$g.DrawImage($logo, 437, 6, 46, 46)
Draw-Stripe $g 0 55 493 3
Save-Bmp $bmp $g "msi-banner.bmp"

# MSI · fondo de bienvenida y final (493 x 312); el texto del instalador va en la parte blanca de la derecha
$c = New-Canvas 493 312 $light; $bmp = $c[0]; $g = $c[1]
$b = New-Object System.Drawing.SolidBrush $dark; $g.FillRectangle($b, 0, 0, 164, 312); $b.Dispose()
$g.DrawImage($logo, 22, 60, 120, 120)
Draw-Text $g "Bulky" 30 $light 0 192 "Bold" "Center" 164
Draw-Text $g "Tu bulk de Riftbound," 12 $muted 0 234 "Regular" "Center" 164
Draw-Text $g "ordenado" 12 $muted 0 250 "Regular" "Center" 164
Draw-Stripe $g 0 306 164 6
Save-Bmp $bmp $g "msi-dialog.bmp"

$logo.Dispose()
Get-ChildItem $out | Select-Object Name, Length
