import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
export async function terminalMouse(pid, column, row) {
  if (process.platform !== 'win32') throw new Error('Touch input requires the Windows bridge');
  if (!Number.isSafeInteger(pid) || pid <= 0 || ![column,row].every(n=>Number.isInteger(n)&&n>=1&&n<=1000)) throw new Error('Invalid terminal mouse target');
  let python = process.env.HERDR_MOBILE_PYTHON;
  if (!python) {
    const root = join(process.env.LOCALAPPDATA || '', 'Programs', 'Python');
    const folders = (await readdir(root)).filter(name=>/^Python\d+$/.test(name)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
    for (const name of folders) {
      const candidate=join(root,name,'python.exe');
      try { await access(candidate); python=candidate; break; } catch {}
    }
  }
  if (!python) throw new Error('Python was not found for terminal touch input');
  await exec(python,[fileURLToPath(new URL('./terminal-mouse.py',import.meta.url)),String(pid),String(column),String(row)],{windowsHide:true,timeout:3000});
}
