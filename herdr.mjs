import net from 'node:net';
import {homedir} from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);

export function agentControls(pane, ansi) {
  if (!['codex', 'claude'].includes(pane.agent)) return null;
  const lines = ansi.split(/\r?\n/);
  const plain = line => line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  if (pane.agent === 'claude') {
    const text = lines.map(plain);
    const prompt = text.findLastIndex(line => line.trimStart().startsWith('❯'));
    const divider = text.findIndex((line, i) => i > prompt && /^\s*─{3,}/u.test(line));
    const footer = divider >= 0 ? text.slice(divider + 1).join('\n') : '';
    const model = footer.match(/\[([^\]\n]+)\]\s*🧠\s*(low|medium|high|xhigh|max)\b/u);
    const mode = footer.match(/\b(auto|plan|accept edits|bypass permissions) mode\b/i)?.[1];
    const empty = prompt >= 0 && divider > prompt && ![text[prompt].trimStart().slice(1), ...text.slice(prompt + 1, divider)].join('').trim();
    return { model: model?.[1] || null, reasoning: model?.[2] || null, mode: mode ? mode[0].toUpperCase() + mode.slice(1) : null, canOpen: empty && ['idle','done'].includes(pane.agent_status), shortcuts: { model: 'model', reasoning: 'effort', mode: 'cycle-mode' } };
  }
  const footer = plain(lines.at(-1) || '');
  const model = footer.match(/\b((?:gpt|o\d)[\w.-]+)\s+(none|minimal|low|medium|high|xhigh|max|ultra)\b/);
  const prompt = lines.findLastIndex(line => plain(line).trimStart().startsWith('›'));
  let empty = prompt >= 0 && prompt < lines.length - 1;
  // Only accept blank or dim placeholder text. Never erase or append a shortcut to a desktop draft.
  for (let i = prompt; empty && i < lines.length - 1; i++) {
    const line = i === prompt ? lines[i].slice(lines[i].indexOf('›') + 1) : lines[i];
    let dim = false, offset = 0;
    for (const match of line.matchAll(/\x1b\[([0-9;]*)m/g)) {
      if (line.slice(offset, match.index).trim() && !dim) empty = false;
      const codes = match[1].split(';').map(Number);
      for (let j = 0; j < codes.length; j++) {
        if ([38,48,58].includes(codes[j])) { j += codes[j+1] === 2 ? 4 : 2; continue; }
        if (codes[j] === 0 || codes[j] === 22) dim = false;
        if (codes[j] === 2) dim = true;
      }
      offset = match.index + match[0].length;
    }
    if (line.slice(offset).trim() && !dim) empty = false;
  }
  return { model: model?.[1] || pane.tokens?.quota_model || null, reasoning: model?.[2] || null, mode: /\bplan mode\b/i.test(footer) ? 'Plan' : null, canOpen: empty && ['idle','done'].includes(pane.agent_status), shortcuts: { model: 'model', reasoning: 'model', mode: 'plan' } };
}

export async function herdrBinary() {
  const installed=process.env.LOCALAPPDATA&&join(process.env.LOCALAPPDATA,'Programs','Herdr','bin','herdr.exe');
  if(process.env.HERDR_MOBILE_BIN) return process.env.HERDR_MOBILE_BIN;
  for(const path of [installed, join(homedir(),'.local','bin','herdr'), '/opt/homebrew/bin/herdr', '/usr/local/bin/herdr']) if(path&&await access(path).then(()=>true,()=>false)) return path;
  return 'herdr';
}
export async function discover(session = 'default') {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(session)) throw new Error('Invalid Herdr session name');
  const binary = await herdrBinary();
  const { stdout } = await exec(binary, ['--session', session, 'status', '--json'], {
    windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024,
  });
  const { server } = JSON.parse(stdout);
  if (!server?.running || !server.socket) throw new Error('The selected Herdr session is not running');
  const endpoint = process.platform === 'win32' && !server.socket.startsWith('\\\\.\\pipe\\')
    ? '\\\\.\\pipe\\' + server.socket : server.socket;
  return { endpoint, session, version: server.version, protocol: server.protocol };
}

// One request per connection. Input is never retried: a lost reply may follow a successful write.
export function rpc(endpoint, method, params = {}, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const socket = net.createConnection(endpoint);
    let buffer = '', settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve(value);
    };
    socket.setEncoding('utf8');
    socket.setTimeout(timeout, () => finish(new Error('Herdr reply timed out; input was not retried')));
    socket.on('error', error => finish(error));
    socket.on('close', () => finish(new Error('Herdr closed before replying; input was not retried')));
    socket.on('connect', () => socket.write(JSON.stringify({ id, method, params }) + '\n'));
    socket.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 2 * 1024 * 1024) return finish(new Error('Herdr reply is too large'));
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      try {
        const reply = JSON.parse(buffer.slice(0, end));
        if (reply.id !== id) throw new Error('Herdr reply identity mismatch');
        if (reply.error) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
        if (!reply.result) throw new Error('Herdr reply has no result');
        finish(null, reply.result);
      } catch (error) { finish(error); }
    });
  });
}
