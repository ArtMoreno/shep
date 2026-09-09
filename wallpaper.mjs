import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';

const exec = promisify(execFile);

// The browser can read only the wallpaper selected by Windows, never an arbitrary local path.
export async function pcWallpaper() {
  if (process.platform !== 'win32') throw new Error('PC wallpaper is unavailable on this host');
  const { stdout } = await exec('reg.exe', ['query', 'HKCU\\Control Panel\\Desktop', '/v', 'WallPaper'], { windowsHide: true, timeout: 5000 });
  const path = stdout.match(/WallPaper\s+REG_SZ\s+([^\r\n]+)/i)?.[1].trim();
  if (!path) throw new Error('Windows has no image wallpaper selected');
  const info = await stat(path);
  if (!info.isFile() || info.size > 32 * 1024 * 1024) throw new Error('PC wallpaper image is unavailable');
  const bytes = await readFile(path);
  const type = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
    : bytes.subarray(1, 4).toString() === 'PNG' ? 'image/png'
    : bytes.subarray(0, 2).toString() === 'BM' ? 'image/bmp'
    : bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
  if (!type) throw new Error('The PC wallpaper format is not supported');
  return { bytes, type, modifiedAt: info.mtime.toISOString() };
}
