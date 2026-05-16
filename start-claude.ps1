# ====================================================================
# start-claude.ps1
# Launcher para sesiones de Claude Code sobre este repo.
# Uso: doble-click start-claude.cmd (o desde PowerShell: .\start-claude.ps1)
#
# Hace:
#   1. cd al directorio del script (sin importar desde donde se lance)
#   2. git fetch + prune
#   3. detecta el branch claude/* mas reciente en origin
#   4. checkout + pull
#   5. lanza `claude`
# ====================================================================

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host " Taller IMIS - Launcher de Claude Code" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] git fetch origin..." -ForegroundColor Yellow
git fetch origin --prune

# Aviso si hay cambios sin commitear (no aborto, solo confirmo)
$dirty = git status --porcelain
if ($dirty) {
    Write-Host ""
    Write-Host "AVISO: tenes cambios sin commitear:" -ForegroundColor Yellow
    Write-Host $dirty
    $resp = Read-Host "Continuar de todas formas? (s/N)"
    if ($resp -ne 's' -and $resp -ne 'S') {
        Write-Host "Abortado." -ForegroundColor Red
        Read-Host "Enter para cerrar"
        exit 1
    }
}

# Branch claude/* mas reciente en remote (ordenado por fecha del ultimo commit)
Write-Host "[2/4] buscando branch claude/* mas reciente en origin..." -ForegroundColor Yellow
$branch = git for-each-ref --sort=-committerdate `
    --format='%(refname:lstrip=3)' `
    refs/remotes/origin/claude/ 2>$null |
    Where-Object { $_ -and $_.Trim() -ne '' } |
    Select-Object -First 1

if (-not $branch) {
    Write-Host "  no hay branch claude/* en origin -> uso main" -ForegroundColor Gray
    $branch = 'main'
} else {
    Write-Host "  -> $branch" -ForegroundColor Green
}

Write-Host "[3/4] checkout $branch + pull..." -ForegroundColor Yellow
git checkout $branch
git pull origin $branch

Write-Host "[4/4] lanzando claude..." -ForegroundColor Yellow
Write-Host ""
claude
