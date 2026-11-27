# Ayudante de etiquetas (Taller IMIS)
# Corre en la computadora que tiene la Brother TD-4210D por USB. La app de
# uniformes le pregunta «¿la impresora está lista?» antes de imprimir:
#   GET http://127.0.0.1:17651/estado  ->  { estado: lista | desconectada | error | no_instalada, ... }
# Solo escucha en esta misma computadora (127.0.0.1): nadie de afuera lo ve.
# No imprime ni cambia nada: solo lee el estado que da Windows.
param(
  [string]$Impresora = 'Brother TD-4210D',
  [int]$Puerto = 17651
)
$ErrorActionPreference = 'Stop'
$OrigenesPermitidos = @('https://uniformes.imeltex.com.sv', 'https://njar97.github.io')

function Get-EstadoImpresora {
  $p = Get-CimInstance Win32_Printer -Filter ("Name = '{0}'" -f $Impresora.Replace("'", "''")) -ErrorAction SilentlyContinue
  if (-not $p) {
    return @{ impresora = $Impresora; estado = 'no_instalada'; lista = $false; mensaje = 'No se encontró la impresora en esta computadora' }
  }
  $trabajos = @(Get-PrintJob -PrinterName $Impresora -ErrorAction SilentlyContinue)
  $conError = @($trabajos | Where-Object { "$($_.JobStatus)" -match 'Error|Offline|PaperOut|Blocked|UserIntervention' })
  # DetectedErrorState: 0 desconocido, 1 otro, 2 sin error, 3 poco papel, 4 SIN papel, 5 poco tóner,
  # 6 sin tóner, 7 tapa abierta, 8 atasco, 9 fuera de línea, 10 pide servicio, 11 bandeja llena
  $err = [int]$p.DetectedErrorState
  $estado = 'lista'; $mensaje = 'Impresora lista'
  if ($p.WorkOffline -or $err -eq 9) { $estado = 'desconectada'; $mensaje = 'La impresora está apagada o desconectada' }
  elseif ($err -eq 4) { $estado = 'error'; $mensaje = 'La impresora no tiene etiquetas (se acabó el rollo)' }
  elseif ($err -eq 7) { $estado = 'error'; $mensaje = 'La impresora tiene la tapa abierta' }
  elseif ($err -eq 8) { $estado = 'error'; $mensaje = 'La impresora tiene un atasco' }
  elseif ($conError.Count -gt 0 -or ([int]$p.PrinterState -band 2) -ne 0) { $estado = 'error'; $mensaje = 'La impresora tiene un error: revise el rollo y la cola de impresión' }
  return @{
    impresora = $Impresora; estado = $estado; lista = ($estado -eq 'lista'); mensaje = $mensaje
    trabajos_en_cola = $trabajos.Count; trabajos_con_error = $conError.Count
    detalle = @{ WorkOffline = [bool]$p.WorkOffline; PrinterState = [int]$p.PrinterState; PrinterStatus = [int]$p.PrinterStatus; DetectedErrorState = $err; ExtendedPrinterStatus = [int]$p.ExtendedPrinterStatus }
    cuando = (Get-Date).ToString('s')
  }
}

function Send-Respuesta($stream, [int]$codigo, [string]$cuerpo, [string]$origen) {
  $razon = @{ 200 = 'OK'; 204 = 'No Content'; 404 = 'Not Found' }[$codigo]
  $bytes = [Text.Encoding]::UTF8.GetBytes($cuerpo)
  $cab = "HTTP/1.1 $codigo $razon`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n"
  if ($origen -and ($OrigenesPermitidos -contains $origen)) {
    $cab += "Access-Control-Allow-Origin: $origen`r`nVary: Origin`r`nAccess-Control-Allow-Methods: GET, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Private-Network: true`r`nAccess-Control-Max-Age: 600`r`n"
  }
  $cabBytes = [Text.Encoding]::ASCII.GetBytes($cab + "`r`n")
  $stream.Write($cabBytes, 0, $cabBytes.Length)
  if ($bytes.Length) { $stream.Write($bytes, 0, $bytes.Length) }
  $stream.Flush()
}

$escucha = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Puerto)
try { $escucha.Start() } catch { Write-Output "El puerto $Puerto ya está en uso: el ayudante ya está corriendo."; exit 0 }
Write-Output "Ayudante de etiquetas escuchando en http://127.0.0.1:$Puerto/estado (impresora: $Impresora)"
$cache = $null; $cacheHora = [datetime]::MinValue
while ($true) {
  $cliente = $escucha.AcceptTcpClient()
  try {
    $cliente.ReceiveTimeout = 2000; $cliente.SendTimeout = 2000
    $stream = $cliente.GetStream()
    $lector = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
    $primera = $lector.ReadLine()
    $origen = ''
    while ($true) {
      $linea = $lector.ReadLine()
      if ([string]::IsNullOrEmpty($linea)) { break }
      if ($linea -match '^Origin:\s*(.+)$') { $origen = $Matches[1].Trim() }
    }
    if ($primera -match '^OPTIONS ') { Send-Respuesta $stream 204 '' $origen }
    elseif ($primera -match '^GET /estado') {
      if (((Get-Date) - $cacheHora).TotalSeconds -gt 2) {
        try { $cache = Get-EstadoImpresora } catch { $cache = @{ impresora = $Impresora; estado = 'error'; lista = $false; mensaje = "No se pudo leer el estado: $($_.Exception.Message)" } }
        $cacheHora = Get-Date
      }
      Send-Respuesta $stream 200 ($cache | ConvertTo-Json -Depth 4 -Compress) $origen
    }
    else { Send-Respuesta $stream 404 '{"error":"no existe"}' $origen }
  } catch { } finally { $cliente.Close() }
}
