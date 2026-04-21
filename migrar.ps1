# ====================================================================
# Taller IMIS - Migrar
# Corre migraciones SQL pendientes contra Supabase
# ====================================================================
# Uso:
#   .\migrar.ps1                  <- corre las migraciones pendientes
#   .\migrar.ps1 -DryRun          <- muestra que se haria sin ejecutar
#   .\migrar.ps1 -Forzar NOMBRE   <- re-corre una migracion ya aplicada
#
# Requiere: variable de entorno SUPABASE_SERVICE_KEY con la service_role key
#
# Setup primera vez:
#   [System.Environment]::SetEnvironmentVariable("SUPABASE_SERVICE_KEY", "eyJhbG...", "User")
#   (cerrar y reabrir PowerShell)
# ====================================================================

param(
    [switch]$DryRun,
    [string]$Forzar = ""
)

$ErrorActionPreference = 'Stop'

# --- Config ---
$SUPABASE_URL = "https://kszdievqesveluzcnzsh.supabase.co"
$MIGRATIONS_DIR = Join-Path $PSScriptRoot "migrations"

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Taller IMIS - Migrar Supabase" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# --- 1. Validaciones ---
$serviceKey = $env:SUPABASE_SERVICE_KEY
if ([string]::IsNullOrWhiteSpace($serviceKey)) {
    Write-Host ""
    Write-Host "ERROR: Falta la variable de entorno SUPABASE_SERVICE_KEY" -ForegroundColor Red
    Write-Host ""
    Write-Host "Para configurarla (una sola vez):" -ForegroundColor Yellow
    Write-Host "  1. Abri Supabase > Settings > API" -ForegroundColor DarkGray
    Write-Host "  2. Copia el valor de 'service_role' (secret)" -ForegroundColor DarkGray
    Write-Host "  3. Correr en PowerShell:" -ForegroundColor DarkGray
    Write-Host '     [System.Environment]::SetEnvironmentVariable("SUPABASE_SERVICE_KEY", "PEGAR_AQUI", "User")' -ForegroundColor White
    Write-Host "  4. CERRAR y reabrir PowerShell" -ForegroundColor DarkGray
    Write-Host "  5. Verificar con: " -NoNewline -ForegroundColor DarkGray
    Write-Host '$env:SUPABASE_SERVICE_KEY' -ForegroundColor White
    Write-Host ""
    exit 1
}

if (-not (Test-Path $MIGRATIONS_DIR)) {
    Write-Host ""
    Write-Host "ERROR: No existe la carpeta migrations/ en $PSScriptRoot" -ForegroundColor Red
    exit 1
}

# --- 2. Listar migraciones disponibles ---
Write-Host ""
Write-Host "[1/4] Buscando migraciones..." -ForegroundColor Yellow
$migraciones = Get-ChildItem -Path $MIGRATIONS_DIR -Filter "*.sql" | Sort-Object Name
if ($migraciones.Count -eq 0) {
    Write-Host "  No hay archivos .sql en migrations/" -ForegroundColor DarkGray
    exit 0
}
Write-Host "  Encontradas:" -ForegroundColor DarkGray
foreach ($m in $migraciones) {
    Write-Host "    - $($m.Name)" -ForegroundColor DarkGray
}

# --- 3. Crear tabla de control si no existe ---
# Esta tabla lleva registro de las migraciones aplicadas
Write-Host ""
Write-Host "[2/4] Verificando tabla de control..." -ForegroundColor Yellow

$headers = @{
    "apikey" = $serviceKey
    "Authorization" = "Bearer $serviceKey"
    "Content-Type" = "application/json"
}

# Usamos la Supabase Management API para ejecutar SQL
# Endpoint: POST /rest/v1/rpc/<funcion>
# Pero lo mas simple es crear un proxy RPC que ejecute SQL.
# Alternativa: usar el endpoint POST /pg-meta (no publico) o usar la Query API
# 
# Opcion mas simple: usar pg-direct via REST
# Pero no existe un endpoint estandar.
# Entonces creamos la tabla _migraciones via ejecutor SQL usando fetch directo.

# En realidad Supabase ofrece un endpoint:
# https://{ref}.supabase.co/rest/v1/rpc/{funcion}
# Pero para correr SQL arbitrario necesitamos un RPC preexistente.

# SOLUCION: usar la PostgREST API para crear una funcion RPC que ejecute SQL
# La primera vez hay que crearla a mano en Supabase SQL Editor.

# Verificamos si la funcion existe intentando llamarla:
$testUrl = "$SUPABASE_URL/rest/v1/rpc/exec_sql"
$testBody = @{ sql = "SELECT 1" } | ConvertTo-Json

try {
    $null = Invoke-RestMethod -Uri $testUrl -Method Post -Headers $headers -Body $testBody -ErrorAction Stop
    Write-Host "  [OK] Funcion exec_sql disponible" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "ERROR: Falta la funcion exec_sql en Supabase." -ForegroundColor Red
    Write-Host ""
    Write-Host "Esto se configura UNA SOLA VEZ. Pasos:" -ForegroundColor Yellow
    Write-Host "  1. Abri Supabase > SQL Editor" -ForegroundColor DarkGray
    Write-Host "  2. Copia y pega este SQL:" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "CREATE OR REPLACE FUNCTION exec_sql(sql text)" -ForegroundColor White
    Write-Host "RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS" -ForegroundColor White
    Write-Host "`$`$ BEGIN EXECUTE sql; RETURN json_build_object('ok', true); END; `$`$;" -ForegroundColor White
    Write-Host ""
    Write-Host "  3. Clic en RUN" -ForegroundColor DarkGray
    Write-Host "  4. Volve a correr .\migrar.ps1" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}

# Crear tabla de control _migraciones
$sqlControl = @"
CREATE TABLE IF NOT EXISTS _migraciones (
    nombre TEXT PRIMARY KEY,
    aplicada_en TIMESTAMPTZ DEFAULT NOW(),
    hash_archivo TEXT
);
"@

$body = @{ sql = $sqlControl } | ConvertTo-Json
try {
    $null = Invoke-RestMethod -Uri $testUrl -Method Post -Headers $headers -Body $body -ErrorAction Stop
    Write-Host "  [OK] Tabla _migraciones lista" -ForegroundColor Green
} catch {
    Write-Host "  ERROR creando tabla de control: $_" -ForegroundColor Red
    exit 1
}

# --- 4. Determinar cuales faltan ---
Write-Host ""
Write-Host "[3/4] Verificando cuales migraciones estan pendientes..." -ForegroundColor Yellow

$consultaUrl = "$SUPABASE_URL/rest/v1/_migraciones?select=nombre"
try {
    $aplicadas = Invoke-RestMethod -Uri $consultaUrl -Method Get -Headers $headers -ErrorAction Stop
    $aplicadasSet = @{}
    foreach ($a in $aplicadas) { $aplicadasSet[$a.nombre] = $true }
} catch {
    Write-Host "  WARN: no se pudo leer _migraciones: $_" -ForegroundColor Yellow
    $aplicadasSet = @{}
}

$pendientes = @()
foreach ($m in $migraciones) {
    if ($Forzar -eq $m.Name) {
        Write-Host "    * $($m.Name) (forzado)" -ForegroundColor Magenta
        $pendientes += $m
    } elseif ($aplicadasSet.ContainsKey($m.Name)) {
        Write-Host "    - $($m.Name) ya aplicada" -ForegroundColor DarkGray
    } else {
        Write-Host "    + $($m.Name) pendiente" -ForegroundColor Yellow
        $pendientes += $m
    }
}

if ($pendientes.Count -eq 0) {
    Write-Host ""
    Write-Host "No hay migraciones pendientes. Todo al dia." -ForegroundColor Green
    Write-Host ""
    exit 0
}

# --- 5. Ejecutar ---
Write-Host ""
if ($DryRun) {
    Write-Host "[4/4] DRY RUN - Se ejecutarian $($pendientes.Count) migracion(es):" -ForegroundColor Yellow
    foreach ($m in $pendientes) {
        Write-Host "    $($m.Name) ($([math]::Round($m.Length / 1024, 1)) KB)" -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-Host "Para ejecutar de verdad, corre: .\migrar.ps1" -ForegroundColor Cyan
    Write-Host ""
    exit 0
}

Write-Host "[4/4] Ejecutando $($pendientes.Count) migracion(es)..." -ForegroundColor Yellow
$ok = 0
$errores = 0

foreach ($m in $pendientes) {
    Write-Host ""
    Write-Host "  Ejecutando: $($m.Name)" -ForegroundColor Cyan
    $sql = Get-Content $m.FullName -Raw -Encoding UTF8
    $body = @{ sql = $sql } | ConvertTo-Json -Depth 10 -Compress
    
    try {
        $null = Invoke-RestMethod -Uri $testUrl -Method Post -Headers $headers -Body $body -ErrorAction Stop
        
        # Registrar como aplicada
        $hash = (Get-FileHash -Path $m.FullName -Algorithm SHA256).Hash
        $registroBody = @{
            nombre = $m.Name
            hash_archivo = $hash
        } | ConvertTo-Json
        
        $registroUrl = "$SUPABASE_URL/rest/v1/_migraciones"
        $regHeaders = $headers.Clone()
        $regHeaders["Prefer"] = "resolution=merge-duplicates"
        
        try {
            Invoke-RestMethod -Uri $registroUrl -Method Post -Headers $regHeaders -Body $registroBody -ErrorAction Stop | Out-Null
        } catch {
            # Si falla el registro no es critico, la migracion ya corrio
            Write-Host "    (WARN: no se pudo registrar en _migraciones)" -ForegroundColor Yellow
        }
        
        Write-Host "    [OK]" -ForegroundColor Green
        $ok++
    } catch {
        Write-Host "    ERROR: $_" -ForegroundColor Red
        $errores++
        # Si falla una, detenemos para no dejar la BD en estado mixto
        break
    }
}

# --- Resumen ---
Write-Host ""
Write-Host "====================================================" -ForegroundColor $(if($errores -eq 0){"Green"}else{"Red"})
Write-Host " Resumen" -ForegroundColor $(if($errores -eq 0){"Green"}else{"Red"})
Write-Host "====================================================" -ForegroundColor $(if($errores -eq 0){"Green"}else{"Red"})
Write-Host "  Exitosas: $ok"
Write-Host "  Con error: $errores"
if ($errores -gt 0) {
    Write-Host ""
    Write-Host "Una migracion fallo. Revisa el mensaje de error arriba." -ForegroundColor Red
    Write-Host "Podes ver el estado en Supabase > Table Editor > _migraciones" -ForegroundColor DarkGray
    exit 1
}
Write-Host ""
exit 0
