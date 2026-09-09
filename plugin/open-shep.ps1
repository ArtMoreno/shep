param([switch]$Download,[switch]$Check)
$ErrorActionPreference='Stop'
$release='https://github.com/ArtMoreno/shep/releases/tag/v0.2.0-preview'
$candidates=@((Join-Path $env:LOCALAPPDATA 'Programs/Shep/Shep.exe'),(Join-Path $env:ProgramFiles 'Shep/Shep.exe'))
$installed=$candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if($Check){ if($Download -or !$installed){'downloads'}else{'installed'};exit 0 }
if(!$Download -and $installed){Start-Process -FilePath $installed -WindowStyle Hidden}else{Start-Process $release}
