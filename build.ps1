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
    'data_cache.js',
    'dashboard.js',
    'corte.js',
    'hojas_corte.js',
    'estadistica.js',
    'estadistica_tallas.js',
    'est_escuela.js',
    'pronostico.js',
    'busqueda_global.js',
    'nav_badges.js',
    'atajos_teclado.js',
    'costos.js',
    'trazo.js',
    'tendido.js',
    'bulto.js',
    'historial.js',
    'corte_ficha.js',
    'editor_trazo.js',
    'produccion.js',
    'plan_produccion.js',
    'operarias.js',
    'asignaciones.js',
    'registro.js',
    'registro_cantidad.js',
    'tallaje.js',
    'importacion.js',
    'bodega.js',
    'materiales.js',
    'empaque.js',
    'reportes.js',
    'alumnos_global.js',
    'grilla_padron.js',
    'historico.js',
    'exportar.js',
    'grupos.js',
    'auditoria.js',
    'config.js',
    'escanear_qr.js',
    'etiquetas_bolsa.js',
    'atras.js'
)

$viewsOrder = @(
    'inicio.html',
    'corte.html',
    'trazo.html',
    'tendido.html',
    'bulto.html',
    'historial.html',
    'produccion.html',
    'estadistica.html',
    'registro.html',
    'bodega.html',
    'empaque.html',
    'etiquetas.html',
    'auditoria.html',
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

# --- Version a la vista (Inicio) y sello que la app compara con el sw.js ---
$ahora = Get-Date
$nuevaVer = 'v' + $ahora.ToString('yyyyMMdd-HHmmss')
$meses = 'ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'
$h12 = $ahora.Hour % 12; if ($h12 -eq 0) { $h12 = 12 }
$ampm = if ($ahora.Hour -lt 12) { 'a. m.' } else { 'p. m.' }
$versionTxt = '{0}-{1} {2} {3}:{4:00} {5}' -f $ahora.Day, $meses[$ahora.Month - 1], [char]0xB7, $h12, $ahora.Minute, $ampm
$html = $html.Replace('@@VERSION@@', $versionTxt).Replace('@@BUILD@@', $nuevaVer)

# --- Escribir ---
[System.IO.File]::WriteAllText($outFile, $html, [System.Text.UTF8Encoding]::new($false))

# --- sw.js: mismo sello, para que los telefonos noten la version nueva ---
$swFile = Join-Path (Split-Path $outFile) 'sw.js'
if (Test-Path $swFile) {
    $sw = [System.IO.File]::ReadAllText($swFile)
    $sw2 = [regex]::Replace($sw, "(?m)^const CACHE_VERSION = '[^']*';", "const CACHE_VERSION = '$nuevaVer';")
    if ($sw2 -ne $sw) {
        [System.IO.File]::WriteAllText($swFile, $sw2, [System.Text.UTF8Encoding]::new($false))
        Write-Host "  + sw.js  CACHE_VERSION=$nuevaVer"
    }
}

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
