param([ValidateSet('vlc','mpc','iluha')][string]$Player='iluha',[int]$Runs=1,[int]$AppPid=0,[string]$Signal='',[string]$ControlClip='',[int]$TimeoutMs=15000,[string]$Executable='',[string]$OutputRoot='',[long]$WindowHandle=0,[switch]$IncludeExisting)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FrameWindow {
 public delegate bool Callback(IntPtr hwnd,IntPtr data);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback,IntPtr data);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int cx,int cy,uint flags);
 public static IntPtr[] Windows(int pid) { var result=new System.Collections.Generic.List<IntPtr>(); EnumWindows((h,d)=>{uint p;GetWindowThreadProcessId(h,out p);if(p==pid&&IsWindowVisible(h))result.Add(h);return true;},IntPtr.Zero);return result.ToArray(); }
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
}
'@
[FrameWindow]::SetProcessDPIAware() | Out-Null
$clip=$ControlClip
if($ControlClip){$clip=(Resolve-Path -LiteralPath $ControlClip).Path}
if($Player -ne 'iluha' -and (-not $Executable -or -not $clip -or -not $OutputRoot)){throw 'Reference runs require Executable, ControlClip and OutputRoot'}
if($Player -eq 'iluha' -and ($AppPid -le 0 -or -not $Signal)){throw 'App runs require AppPid and Signal'}
$exe=$Executable
$arguments=if($Player -eq 'vlc'){@('--ignore-config','--no-one-instance','--no-media-library','--no-qt-privacy-ask','--no-qt-updates-notif','--volume=0',('"'+$clip+'"'))}else{@(('"'+$clip+'"'),'/new','/play')}
$samples=@()
for($run=1;$run -le $Runs;$run++) {
 $bitmap=New-Object System.Drawing.Bitmap 1,1
 $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
 $process=New-Object System.Diagnostics.Process
 $excluded=@()
 if($Player -eq 'iluha') {
  $process=[System.Diagnostics.Process]::GetProcessById($AppPid)
  $excluded=@([FrameWindow]::Windows($AppPid))
  if($IncludeExisting){$excluded=@()}
  Set-Content "$Signal.armed" 'ready'
  $deadline=[DateTime]::UtcNow.AddSeconds(30)
  while(-not (Test-Path -LiteralPath $Signal)) {if([DateTime]::UtcNow -gt $deadline){throw 'signal timeout'};Start-Sleep -Milliseconds 1}
 }
 $process.StartInfo.FileName=$exe
 $process.StartInfo.Arguments=$arguments -join ' '
 $clock=[System.Diagnostics.Stopwatch]::StartNew()
 try {
  if($Player -ne 'iluha' -and -not $process.Start()){throw 'Player failed to start'}
  $seen=$false
  while($clock.ElapsedMilliseconds -lt $TimeoutMs) {
   $process.Refresh()
   foreach($handle in [FrameWindow]::Windows($process.Id)) {
   if($WindowHandle -ne 0) {if($handle.ToInt64() -ne $WindowHandle){continue}} elseif($excluded -contains $handle){continue}
   $rect=New-Object FrameWindow+Rect
   if($handle -ne [IntPtr]::Zero -and [FrameWindow]::IsWindowVisible($handle) -and [FrameWindow]::GetWindowRect($handle,[ref]$rect)) {
    if(($rect.Right-$rect.Left) -lt 300 -or ($rect.Bottom-$rect.Top) -lt 200){continue}
    [FrameWindow]::SetWindowPos($handle,[IntPtr](-1),100,100,900,600,0x0010) | Out-Null
    [FrameWindow]::GetWindowRect($handle,[ref]$rect) | Out-Null
    $x=[int](($rect.Left+$rect.Right)/2);$y=[int](($rect.Top+$rect.Bottom)/2)
    $graphics.CopyFromScreen($x,$y,0,0,$bitmap.Size)
    $color=$bitmap.GetPixel(0,0)
    if($color.R -gt 200 -and $color.B -gt 200 -and $color.G -lt 60){$seen=$true;break}
   }
   }
   if($seen){break}
   Start-Sleep -Milliseconds 10
  }
  $samples+=@{run=$run;screenMagentaSeen=$seen;observedMs=$clock.Elapsed.TotalMilliseconds}
 }finally{
  if($Player -ne 'iluha' -and -not $process.HasExited){$process.Kill();$process.WaitForExit()}
  $process.Dispose();$graphics.Dispose();$bitmap.Dispose()
 }
}
$resultFile=if($Signal){"$Signal.result.json"}else{Join-Path $OutputRoot "$Player-screen-probe-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff')).json"}
@{player=$Player;samples=$samples;limitations='Screen pixel upper bound; fixed 900x600 topmost owned window; 10 ms polling plus GDI/resize overhead; synthetic clip only; iluha clock starts on signal receipt'} | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 $resultFile
$samples | ConvertTo-Json
if(@($samples | Where-Object {-not $_.screenMagentaSeen}).Count -gt 0){exit 1}
