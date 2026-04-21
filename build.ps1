# ====================================================================
# Taller IMIS - Build Script
# Toma los archivos separados de src/ y genera produccion.html
# ====================================================================
# Uso: .\build.ps1
# ====================================================================

$ErrorActionPreference = 'Stop'

$srcDir = Join-Path $PSScriptRoot 'src'
$outFile = Join-Path $PSScriptRoot 'produccion.html'

if (-not (Test-Path $srcDir)) {
    Write-Error "No se encontro la carpeta src/ en $PSScriptRoot"
    exit 1
}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Taller IMIS - Build" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$jsOrder = @(
    'core.js',
    'trazo.js',
    'tendido.js',
    'bulto.js',
    'historial.js',
    'produccion.js',
    'asignaciones.js',
    'config.js'
)

$viewsOrder = @(
    'nuevo.html',
    'trazo.html',
    'tendido.html',
    'bulto.html',
    'historial.html',
    'produccion.html',
    'config.html'
)

function Read-Text($path) {
    if (-not (Test-Path $path)) {
        Write-Error "Falta archivo: $path"
        exit 1
    }
    Get-Content $path -Raw -Encoding UTF8
}

# --- Leer fuentes ---
Write-Host ""
Write-Host "Leyendo fuentes..." -ForegroundColor Yellow

$css = Read-Text (Join-Path $srcDir 'css\styles.css')
$headTpl = Read-Text (Join-Path $srcDir 'head.html')
$nav = Read-Text (Join-Path $srcDir 'nav.html')
$modals = Read-Text (Join-Path $srcDir 'modals.html')
$footerTpl = Read-Text (Join-Path $srcDir 'footer.html')

$viewsContent = @()
foreach ($v in $viewsOrder) {
    $path = Join-Path $srcDir "views\$v"
    $viewsContent += Read-Text $path
    Write-Host "  + views/$v" -ForegroundColor DarkGray
}
$views = $viewsContent -join "`r`n"

$jsContent = @()
foreach ($jf in $jsOrder) {
    $path = Join-Path $srcDir "js\$jf"
    $content = Read-Text $path
    $jsContent += "// +++++++++++++++++++ $jf +++++++++++++++++++`r`n$content"
    Write-Host "  + js/$jf" -ForegroundColor DarkGray
}
$jsCombined = $jsContent -join "`r`n`r`n"

# --- Sustituir templates ---
Write-Host ""
Write-Host "Combinando..." -ForegroundColor Yellow

$headFilled = $headTpl.Replace('@@CSS_INLINE@@', $css)
$footerFilled = $footerTpl.Replace('@@MODALS@@', $modals).Replace('@@JS_INLINE@@', $jsCombined)

$buildDate = Get-Date -Format "yyyy-MM-dd HH:mm"

$html = @"
<!-- Generado: $buildDate | Build: src/ -> produccion.html -->
$headFilled
$nav
$views
$footerFilled
"@

$html = $html -replace '(\r?\n){3,}', "`r`n`r`n"

# --- Escribir ---
[System.IO.File]::WriteAllText($outFile, $html, [System.Text.UTF8Encoding]::new($false))

$size = (Get-Item $outFile).Length
$lines = ($html -split "`n").Count

Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host " [OK] Build OK" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
$sizeKB = [math]::Round($size / 1024, 1)
Write-Host "  Archivo:  $outFile"
Write-Host "  Tamano:   $sizeKB KB ($size bytes)"
Write-Host "  Lineas:   $lines"
Write-Host "  Fecha:    $buildDate"
Write-Host ""

exit 0
