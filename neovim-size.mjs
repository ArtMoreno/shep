import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function sizeNeovim(shellPid,cols,rows){
  if(process.platform!=='win32'||!Number.isSafeInteger(shellPid)||shellPid<1||![cols,rows].every(n=>Number.isInteger(n)&&n>=12&&n<=240))throw Error('Invalid Neovim dimensions or process');
  const script=`$all=Get-CimInstance Win32_Process; $matches=@($all | Where-Object Name -eq 'nvim.exe' | Where-Object { $p=$_; $seen=@{}; while($p -and !$seen.ContainsKey([int]$p.ProcessId)){ $seen[[int]$p.ProcessId]=$true; if($p.ParentProcessId -eq ${shellPid}){return $true}; $parent=$p.ParentProcessId; $p=$all | Where-Object ProcessId -eq $parent }; return $false }); $matches=@($matches | Where-Object { $candidate=$_.ProcessId; !($all | Where-Object { $_.Name -eq 'nvim.exe' -and $_.ParentProcessId -eq $candidate }) }); if($matches.Count -ne 1){throw 'Select a pane with exactly one running Neovim editor'}; $matches | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress`;
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:8000});
  const p=JSON.parse(stdout);if(!Number.isSafeInteger(p.ProcessId)||!p.ExecutablePath)throw Error('Neovim process unavailable');
  await exec(p.ExecutablePath,['--headless','--server',`\\\\.\\pipe\\nvim.${p.ProcessId}.0`,'--remote-expr',`execute('set columns=${cols} lines=${rows}')`],{windowsHide:true,timeout:3000});
}
