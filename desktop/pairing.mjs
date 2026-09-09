import {randomBytes, createHash} from 'node:crypto';
import {readFile, writeFile, rename} from 'node:fs/promises';
const hash = value => createHash('sha256').update(value).digest('hex');
export async function pairing(file, now = Date.now) {
  let devices = [];
  try { devices = JSON.parse(await readFile(file, 'utf8')); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  let invitation;
  let queue = Promise.resolve();
  const save = () => { const data = JSON.stringify(devices); queue = queue.then(async () => { await writeFile(file+'.tmp', data, {mode:0o600}); await rename(file+'.tmp', file); }); return queue; };
  return {
    invite() { const code = randomBytes(24).toString('hex'); invitation = {hash:hash(code), expires:now()+300000}; return code; },
    list() { return devices.map(({id, created}) => ({id, created})); },
    async revoke(id) { devices = devices.filter(d => d.id !== id); await save(); },
    async authorize(req, res, url) {
      if(url.pathname === '/pair' && req.method === 'GET') {
        const code = url.searchParams.get('code') || '';
        if(!invitation || invitation.expires <= now() || hash(code) !== invitation.hash) { res.writeHead(403); res.end('Pairing expired or already used. Create a new QR code in Shep on your computer.'); return false; }
        invitation = undefined;
        const token = randomBytes(32).toString('hex');
        devices.push({id:randomBytes(8).toString('hex'), hash:hash(token), created:new Date(now()).toISOString()});
        await save();
        res.writeHead(303, {Location:'/', 'Set-Cookie':`shep_device=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000`}); res.end(); return false;
      }
      const token = (req.headers.cookie || '').split(/;\s*/).find(c=>c.startsWith('shep_device='))?.slice(12);
      const device=token && devices.find(d=>d.hash===hash(token));
      if(device){req.shepDeviceId=device.id;return true;}
      res.writeHead(403, {'Content-Type':'text/plain; charset=utf-8'}); res.end('This device is not paired. Scan a new QR code from Shep on your computer.'); return false;
    }
  };
}
