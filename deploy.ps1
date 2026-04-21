# ====================================================================
# Taller IMIS - Deploy Script
# Hace build + git add + commit + push en un solo comando
# ====================================================================
# Uso:
#   .\deploy.ps1                              <- pide mensaje
#   .\deploy.ps1 "descripcion del cambio"     <- usa el mensaje dado
# ====================================================================

param(
    [string]$Message = ""
)

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Taller IMIS - Deploy" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# --- 0. Verificar que estamos en el repo correcto ---
if (-not (Test-Path ".git")) {
    Write-Host ""
    Write-Host "ERROR: No estas en un repositorio git." -ForegroundColor Red
    Write-Host "  Abri PowerShell en C:\Users\confe\Documents\taller-imis" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path "build.ps1")) {
    Write-Host ""
    Write-Host "ERROR: No se encontro build.ps1" -ForegroundColor Red
    Write-Host "  Asegurate de haber descomprimido el ZIP en esta carpeta" -ForegroundColor Yellow
    exit 1
}

# --- 1. Ver estado actual ---
Write-Host ""
Write-Host "[1/5] Estado actual del repo..." -ForegroundColor Yellow
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "  (sin cambios pendientes)" -ForegroundColor DarkGray
} else {
    Write-Host "  Archivos con cambios:" -ForegroundColor DarkGray
    $status -split "`n" | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
}

# --- 2. Correr el build ---
Write-Host ""
Write-Host "[2/5] Ejecutando build..." -ForegroundColor Yellow
try {
    & .\build.ps1
    if ($LASTEXITCODE -ne 0) {
        throw "El build fallo con codigo $LASTEXITCODE"
    }
} catch {
    Write-Host ""
    Write-Host "ERROR en el build: $_" -ForegroundColor Red
    exit 1
}

# --- 3. Ver cambios despues del build ---
Write-Host ""
Write-Host "[3/5] Verificando cambios para subir..." -ForegroundColor Yellow
$changes = git status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
    Write-Host ""
    Write-Host "  No hay cambios para subir." -ForegroundColor Cyan
    Write-Host "  El build regenero produccion.html igual al anterior." -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}
Write-Host "  Cambios detectados:" -ForegroundColor DarkGray
$changes -split "`n" | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }

# --- 4. Pedir mensaje si no vino como argumento ---
if ([string]::IsNullOrWhiteSpace($Message)) {
    Write-Host ""
    Write-Host "[4/5] Que mensaje de commit?" -ForegroundColor Yellow
    Write-Host "  (Enter para usar 'actualizacion'):" -ForegroundColor DarkGray
    $Message = Read-Host "  >"
    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = "actualizacion"
    }
} else {
    Write-Host ""
    Write-Host "[4/5] Mensaje de commit: $Message" -ForegroundColor Yellow
}

# --- 5. Git add + commit + push ---
Write-Host ""
Write-Host "[5/5] Subiendo a GitHub..." -ForegroundColor Yellow

git add -A
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: git add fallo" -ForegroundColor Red; exit 1 }

git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: git commit fallo" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Enviando a origin/main..." -ForegroundColor DarkGray
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR en git push." -ForegroundColor Red
    Write-Host "  Posibles causas:" -ForegroundColor Yellow
    Write-Host "    - Token de GitHub expirado o mal configurado" -ForegroundColor DarkGray
    Write-Host "    - Sin internet" -ForegroundColor DarkGray
    Write-Host "    - Conflicto con cambios remotos (proba: git pull --rebase)" -ForegroundColor DarkGray
    exit 1
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host " [OK] Deploy completo" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Los cambios estaran live en 1-2 minutos:" -ForegroundColor Cyan
Write-Host "  https://njar97.github.io/taller-imis/produccion.html" -ForegroundColor White
Write-Host ""
Write-Host "  Ctrl+F5 en el navegador para ver los cambios." -ForegroundColor DarkGray
Write-Host ""
