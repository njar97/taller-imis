# ====================================================================
# Instala los git hooks del repo (los que están en hooks/).
# Uso (una sola vez por clon del repo):
#     .\hooks\install.ps1
# ====================================================================

$ErrorActionPreference = 'Stop'

# Apuntar git al directorio hooks/ del repo (relativo al root).
git config core.hooksPath hooks

# Verificación
$current = git config --get core.hooksPath
if ($current -ne 'hooks') {
    Write-Error "core.hooksPath quedó como '$current', esperaba 'hooks'."
    exit 1
}

Write-Host "[install] git config core.hooksPath = hooks" -ForegroundColor Green
Write-Host "[install] Listo. Cada commit que toque src/ va a regenerar produccion.html automáticamente." -ForegroundColor Green
