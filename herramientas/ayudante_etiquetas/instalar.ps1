# Instala el ayudante de etiquetas en ESTA computadora (la que tiene la Brother):
# lo copia a Documentos\etiquetas_brother, lo deja arrancando solo al iniciar
# sesión (tarea de Windows «Ayudante de etiquetas IMIS», sin ventana) y lo enciende.
# Para quitarlo:  Unregister-ScheduledTask -TaskName 'Ayudante de etiquetas IMIS' -Confirm:$false
param([string]$Impresora = 'Brother TD-4210D', [int]$Puerto = 17651)
$ErrorActionPreference = 'Stop'
$destino = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'etiquetas_brother'
New-Item -ItemType Directory -Force $destino | Out-Null
$script = Join-Path $destino 'ayudante_etiquetas.ps1'
Copy-Item (Join-Path $PSScriptRoot 'ayudante_etiquetas.ps1') $script -Force

$tarea = 'Ayudante de etiquetas IMIS'
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ("-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"{0}`" -Impresora `"{1}`" -Puerto {2}" -f $script, $Impresora, $Puerto)
$inicio = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $tarea -Action $accion -Trigger $inicio -Settings $ajustes -Description 'Le dice a la app de uniformes si la impresora de etiquetas está lista (solo lectura, solo esta computadora).' -Force | Out-Null
Stop-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName $tarea
Start-Sleep -Seconds 3
try {
  $r = Invoke-RestMethod "http://127.0.0.1:$Puerto/estado" -TimeoutSec 5
  "Instalado. Estado ahora: $($r.estado) - $($r.mensaje)"
  $r | ConvertTo-Json -Depth 4
} catch { "Instalado, pero no contestó todavía: $($_.Exception.Message)" }
