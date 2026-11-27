# Ayudante de etiquetas (Taller IMIS) · versión 4
# Corre en la computadora que tiene la Brother TD-4210D por USB. La app de
# uniformes le habla SOLO desde esta misma computadora (127.0.0.1):
#   GET  /estado    ->  { estado: lista | desconectada | error | no_instalada, ... }
#   POST /imprimir  ->  manda etiquetas DIRECTO a la Brother (sin cuadro de imprimir)
# Además (v4) toma de la base los pedidos mandados desde el celular
# (cola etiqueta_trabajo) y los imprime, solo si la impresora está lista.
#        cuerpo JSON: { "nombre": "texto del trabajo", "png": ["<base64>", ...] }
#        cada imagen tiene que medir 382 x 156 puntos (la etiqueta de 51 x 26 mm).
# Solo acepta pedidos de la app (origen permitido) y solo imprime si Windows
# dice que la impresora está lista. Nadie de afuera de esta computadora lo ve.
param(
  [string]$Impresora = 'Brother TD-4210D',
  [int]$Puerto = 17651,
  [string]$Papel = 'RD 51mm x 26mm',
  [string]$ArchivoPrueba = '',     # solo para pruebas: imprime a un archivo en vez de a la impresora
  [switch]$SinReporte               # solo para pruebas: no reporta el estado a la app
)
$ErrorActionPreference = 'Stop'
$Version = 4
$OrigenesPermitidos = @('https://uniformes.imeltex.com.sv', 'https://njar97.github.io')
$AnchoPx = 382; $AltoPx = 156; $MaxEtiquetas = 150; $MaxCuerpo = 3MB
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions

function Get-EstadoImpresora {
  $p = Get-CimInstance Win32_Printer -Filter ("Name = '{0}'" -f $Impresora.Replace("'", "''")) -ErrorAction SilentlyContinue
  if (-not $p) {
    return @{ version = $Version; imprime = $true; impresora = $Impresora; estado = 'no_instalada'; lista = $false; mensaje = 'No se encontró la impresora en esta computadora' }
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
    version = $Version; imprime = $true
    impresora = $Impresora; estado = $estado; lista = ($estado -eq 'lista'); mensaje = $mensaje
    trabajos_en_cola = $trabajos.Count; trabajos_con_error = $conError.Count
    detalle = @{ WorkOffline = [bool]$p.WorkOffline; PrinterState = [int]$p.PrinterState; PrinterStatus = [int]$p.PrinterStatus; DetectedErrorState = $err; ExtendedPrinterStatus = [int]$p.ExtendedPrinterStatus }
    cuando = (Get-Date).ToString('s')
  }
}

# Manda las imágenes a la Brother: una etiqueta por página, a todo el área
# imprimible del papel de 51 x 26 mm (igual que imprimir_etiquetas.ps1).
function Send-Etiquetas([string[]]$Png, [string]$Nombre) {
  $imagenes = New-Object System.Collections.Generic.List[System.Drawing.Image]
  try {
    foreach ($b64 in $Png) {
      $ms = New-Object IO.MemoryStream(, [Convert]::FromBase64String($b64))
      $img = [System.Drawing.Image]::FromStream($ms)
      if ($img.Width -ne $AnchoPx -or $img.Height -ne $AltoPx) { throw "Una imagen no mide ${AnchoPx} x ${AltoPx}, no es una etiqueta" }
      $imagenes.Add($img)
    }
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrinterSettings.PrinterName = $Impresora
    if (-not $doc.PrinterSettings.IsValid) { throw "No se encontró la impresora $Impresora" }
    $tam = $doc.PrinterSettings.PaperSizes | Where-Object { $_.PaperName -eq $Papel } | Select-Object -First 1
    if (-not $tam) { throw "La impresora no tiene el papel «$Papel»" }
    $doc.DefaultPageSettings.PaperSize = $tam
    $doc.DefaultPageSettings.Landscape = $false
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    $doc.OriginAtMargins = $false
    $doc.DocumentName = $Nombre
    $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
    if ($ArchivoPrueba) { $doc.PrinterSettings.PrintToFile = $true; $doc.PrinterSettings.PrintFileName = $ArchivoPrueba }
    $script:pagina = 0
    $script:lote = $imagenes
    $doc.add_PrintPage({
      param($s, $e)
      $a = $e.PageSettings.PrintableArea          # centésimas de pulgada
      $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $e.Graphics.DrawImage($script:lote[$script:pagina], 0, 0, $a.Width, $a.Height)
      $script:pagina++
      $e.HasMorePages = ($script:pagina -lt $script:lote.Count)
    })
    $doc.Print()
    $doc.Dispose()
    return $imagenes.Count
  } finally { foreach ($i in $imagenes) { $i.Dispose() } }
}

function Send-Respuesta($stream, [int]$codigo, [string]$cuerpo, [string]$origen) {
  $razon = @{ 200 = 'OK'; 204 = 'No Content'; 400 = 'Bad Request'; 403 = 'Forbidden'; 404 = 'Not Found'; 409 = 'Conflict'; 413 = 'Payload Too Large'; 500 = 'Internal Server Error' }[$codigo]
  $bytes = [Text.Encoding]::UTF8.GetBytes($cuerpo)
  $cab = "HTTP/1.1 $codigo $razon`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n"
  if ($origen -and ($OrigenesPermitidos -contains $origen)) {
    $cab += "Access-Control-Allow-Origin: $origen`r`nVary: Origin`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Private-Network: true`r`nAccess-Control-Max-Age: 600`r`n"
  }
  $cabBytes = [Text.Encoding]::ASCII.GetBytes($cab + "`r`n")
  $stream.Write($cabBytes, 0, $cabBytes.Length)
  if ($bytes.Length) { $stream.Write($bytes, 0, $bytes.Length) }
  $stream.Flush()
}
function ConvertTo-Texto($obj) { return ($obj | ConvertTo-Json -Depth 4 -Compress) }

# Lee el pedido completo: cabeceras hasta la línea en blanco y luego el cuerpo.
function Read-Pedido($stream) {
  $buf = New-Object byte[] 65536
  $datos = New-Object IO.MemoryStream
  $finCab = -1
  while ($finCab -lt 0) {
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { throw 'pedido cortado' }
    $datos.Write($buf, 0, $n)
    if ($datos.Length -gt 32768 -and $finCab -lt 0) {
      $txt = [Text.Encoding]::ASCII.GetString($datos.GetBuffer(), 0, [Math]::Min($datos.Length, 32768))
      if ($txt.IndexOf("`r`n`r`n") -lt 0) { throw 'cabeceras demasiado largas' }
    }
    $txt = [Text.Encoding]::ASCII.GetString($datos.GetBuffer(), 0, [int]$datos.Length)
    $finCab = $txt.IndexOf("`r`n`r`n")
  }
  $lineas = $txt.Substring(0, $finCab) -split "`r`n"
  $cab = @{}
  foreach ($l in $lineas[1..($lineas.Count - 1)]) { if ($l -match '^([^:]+):\s*(.*)$') { $cab[$Matches[1].Trim().ToLower()] = $Matches[2].Trim() } }
  $largo = 0; if ($cab['content-length']) { $largo = [int]$cab['content-length'] }
  if ($largo -gt $MaxCuerpo) { return @{ primera = $lineas[0]; cab = $cab; grande = $true; cuerpo = '' } }
  $inicio = $finCab + 4
  while (($datos.Length - $inicio) -lt $largo) {
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { throw 'cuerpo cortado' }
    $datos.Write($buf, 0, $n)
  }
  $cuerpo = ''
  if ($largo -gt 0) { $cuerpo = [Text.Encoding]::UTF8.GetString($datos.GetBuffer(), $inicio, $largo) }
  return @{ primera = $lineas[0]; cab = $cab; grande = $false; cuerpo = $cuerpo }
}

$escucha = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Puerto)
try { $escucha.Start() } catch { Write-Output "El puerto $Puerto ya está en uso: el ayudante ya está corriendo."; exit 0 }
Write-Output "Ayudante de etiquetas v$Version escuchando en http://127.0.0.1:$Puerto (impresora: $Impresora)"
$cache = $null; $cacheHora = [datetime]::MinValue

# Reporte a la app (para ver el estado desde el celular): solo si existe el
# archivo ayudante_token.txt junto a este script. Manda el estado cada 30 s
# y enseguida cuando cambia.
$SupaUrl = 'https://kszdievqesveluzcnzsh.supabase.co/rest/v1/rpc/etiqueta_impresora_reportar'
$SupaKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzemRpZXZxZXN2ZWx1emNuenNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTgwMTgsImV4cCI6MjA5MDM5NDAxOH0.r28goEyUxZeKK9j0efu1BXC8ssU9lYxRK7dp3BGix1M'   # llave PÚBLICA de la app (la misma que trae la página)
$tokenArchivo = Join-Path $PSScriptRoot 'ayudante_token.txt'
$token = ''; if (Test-Path $tokenArchivo) { $token = (Get-Content $tokenArchivo -Raw).Trim() }
$repHora = [datetime]::MinValue; $repRevisado = [datetime]::MinValue; $repUltimo = ''
function Send-Reporte {
  if (-not $token -or $SinReporte) { return }
  if (((Get-Date) - $script:repRevisado).TotalSeconds -lt 5) { return }
  $script:repRevisado = Get-Date
  try {
    $e = Get-EstadoImpresora
    $firma = "$($e.estado)|$($e.trabajos_en_cola)"
    if ($firma -eq $script:repUltimo -and ((Get-Date) - $script:repHora).TotalSeconds -lt 30) { return }
    $cuerpo = @{ p_token = $token; p_estado = $e.estado; p_mensaje = $e.mensaje; p_cola = [int]$e.trabajos_en_cola; p_equipo = $env:COMPUTERNAME; p_version = $Version } | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri $SupaUrl -Method Post -TimeoutSec 6 -ContentType 'application/json; charset=utf-8' `
      -Headers @{ apikey = $SupaKey; Authorization = "Bearer $SupaKey" } -Body ([Text.Encoding]::UTF8.GetBytes($cuerpo)) | Out-Null
    $script:repUltimo = $firma; $script:repHora = Get-Date
  } catch { $script:repHora = (Get-Date).AddSeconds(-20) }   # falló (sin internet): reintenta en unos segundos
}

# Cola del celular: cada 4 s, si la impresora está lista, toma un envío,
# lo imprime y avisa cómo le fue (si falla, la base corrige sola la cuenta).
$SupaRpc = 'https://kszdievqesveluzcnzsh.supabase.co/rest/v1/rpc/'
$colaRevisado = [datetime]::MinValue
function Invoke-Rpc([string]$Funcion, $Cuerpo) {
  $json = $Cuerpo | ConvertTo-Json -Compress
  return Invoke-RestMethod -Uri ($SupaRpc + $Funcion) -Method Post -TimeoutSec 15 -ContentType 'application/json; charset=utf-8' `
    -Headers @{ apikey = $SupaKey; Authorization = "Bearer $SupaKey" } -Body ([Text.Encoding]::UTF8.GetBytes($json))
}
function Receive-Cola {
  if (-not $token) { return }
  if (((Get-Date) - $script:colaRevisado).TotalSeconds -lt 4) { return }
  $script:colaRevisado = Get-Date
  try {
    $e = Get-EstadoImpresora
    if (-not $ArchivoPrueba -and -not $e.lista) { return }
    $t = Invoke-Rpc 'etiqueta_trabajo_tomar' @{ p_token = $token }
    if (-not $t -or -not $t.id) { return }
  } catch { return }   # sin internet: se intenta en la próxima vuelta
  $ok = $true; $msg = $null
  try { $n = Send-Etiquetas ([string[]]@($t.png)) ("$($t.nombre)"); $msg = "Impresas $n" }
  catch { $ok = $false; $msg = $_.Exception.Message }
  for ($i = 0; $i -lt 3; $i++) {
    try { Invoke-Rpc 'etiqueta_trabajo_terminar' @{ p_token = $token; p_id = "$($t.id)"; p_ok = $ok; p_mensaje = $msg } | Out-Null; break }
    catch { Start-Sleep -Seconds 2 }
  }
  $script:cacheHora = [datetime]::MinValue; $script:repUltimo = ''
}

while ($true) {
  if (-not $escucha.Pending()) { Send-Reporte; Receive-Cola; Start-Sleep -Milliseconds 150; continue }
  $cliente = $escucha.AcceptTcpClient()
  try {
    $cliente.ReceiveTimeout = 5000; $cliente.SendTimeout = 5000
    $stream = $cliente.GetStream()
    $ped = Read-Pedido $stream
    $origen = "$($ped.cab['origin'])"
    if ($ped.primera -match '^OPTIONS ') { Send-Respuesta $stream 204 '' $origen }
    elseif ($ped.primera -match '^GET /estado') {
      if (((Get-Date) - $cacheHora).TotalSeconds -gt 2) {
        try { $cache = Get-EstadoImpresora } catch { $cache = @{ version = $Version; impresora = $Impresora; estado = 'error'; lista = $false; mensaje = "No se pudo leer el estado: $($_.Exception.Message)" } }
        $cacheHora = Get-Date
      }
      Send-Respuesta $stream 200 (ConvertTo-Texto $cache) $origen
    }
    elseif ($ped.primera -match '^POST /imprimir') {
      if (-not ($OrigenesPermitidos -contains $origen)) { Send-Respuesta $stream 403 '{"ok":false,"mensaje":"Solo la app de uniformes puede mandar a imprimir"}' $origen }
      elseif ($ped.grande) { Send-Respuesta $stream 413 '{"ok":false,"mensaje":"Son demasiadas etiquetas de una vez"}' $origen }
      else {
        try {
          $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
          $ser.MaxJsonLength = [int]$MaxCuerpo * 2
          $j = $ser.DeserializeObject($ped.cuerpo)
          $png = @($j['png'])
          if ($png.Count -lt 1 -or $png.Count -gt $MaxEtiquetas) { throw "Tienen que ser de 1 a $MaxEtiquetas etiquetas por envío" }
          $nombre = "$($j['nombre'])"; if (-not $nombre) { $nombre = 'Etiquetas de bolsa' }
          if ($nombre.Length -gt 80) { $nombre = $nombre.Substring(0, 80) }
          $est = Get-EstadoImpresora; $cacheHora = [datetime]::MinValue
          if (-not $ArchivoPrueba -and -not $est.lista) { Send-Respuesta $stream 409 (ConvertTo-Texto @{ ok = $false; estado = $est.estado; mensaje = $est.mensaje }) $origen }
          else {
            $n = Send-Etiquetas ([string[]]$png) $nombre
            Send-Respuesta $stream 200 (ConvertTo-Texto @{ ok = $true; enviadas = $n }) $origen
          }
        } catch { Send-Respuesta $stream 500 (ConvertTo-Texto @{ ok = $false; mensaje = "No se pudo imprimir: $($_.Exception.Message)" }) $origen }
      }
    }
    else { Send-Respuesta $stream 404 '{"error":"no existe"}' $origen }
  } catch { } finally { $cliente.Close() }
}
