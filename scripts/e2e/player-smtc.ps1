param([ValidateSet('play','pause','list','absent','media-toggle')][string]$Action = 'list')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function AwaitResult($Operation, $ResultType) {
  $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  if (!$task.Wait(10000)) { throw 'SMTC operation timed out' }
  $task.Result
}
$manager = AwaitResult ($managerType::RequestAsync()) $managerType
$sessions = @($manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'iluha|e2e' })
if ($Action -eq 'absent') { if ($sessions.Count -ne 0) { throw 'Stale player SMTC session after close' }; exit 0 }
if ($sessions.Count -ne 1) { throw "Expected one isolated iluhaAnime SMTC session, found $($sessions.Count)" }
$session = $sessions[0]
if ($Action -eq 'media-toggle') {
  $current = $manager.GetCurrentSession()
  if (!$current -or $current.SourceAppUserModelId -ne $session.SourceAppUserModelId) { throw 'Isolated player is not the current Windows media session' }
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PlayerMediaKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  public static void Toggle() {
    keybd_event(0xB3, 0, 0, UIntPtr.Zero);
    keybd_event(0xB3, 0, 2, UIntPtr.Zero);
  }
}
'@
  [PlayerMediaKey]::Toggle()
}
if ($Action -eq 'pause') { $ok = AwaitResult ($session.TryPauseAsync()) ([bool]); if (!$ok) { throw 'SMTC pause rejected' } }
if ($Action -eq 'play') { $ok = AwaitResult ($session.TryPlayAsync()) ([bool]); if (!$ok) { throw 'SMTC play rejected' } }
Write-Output $session.SourceAppUserModelId
