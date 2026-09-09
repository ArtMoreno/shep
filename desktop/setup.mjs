import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access} from 'node:fs/promises';
import {join} from 'node:path';
const exec = promisify(execFile);
export const run = async (bin,args) => (await exec(bin,args,{windowsHide:true,timeout:20000,maxBuffer:1024*1024})).stdout;
export async function tailscaleBinary(platform=process.platform) {
  const paths=platform==='win32'?[join(process.env.ProgramFiles||'C:\\Program Files','Tailscale','tailscale.exe')]:platform==='darwin'?['/Applications/Tailscale.app/Contents/MacOS/Tailscale','/opt/homebrew/bin/tailscale','/usr/local/bin/tailscale']:['/usr/bin/tailscale','/usr/local/bin/tailscale'];
  for(const path of paths) if(await access(path).then(()=>true,()=>false)) return path;
  return 'tailscale';
}
export function identity(status) {
  const name=status.Self?.DNSName?.replace(/\.$/,'');
  const userLogin=status.User?.[status.Self?.UserID]?.LoginName;
  if(status.BackendState!=='Running'||!name?.endsWith('.ts.net')||!userLogin) throw Error('Sign in to Tailscale on this computer first. Tagged nodes are not supported by this personal setup.');
  return {origin:`https://${name}:8443`,userLogin};
}
export function checkRoute(config, origin, port) {
  const host=new URL(origin).host;
  const target=`http://127.0.0.1:${port}`;
  const route=config.Web?.[host];
  if(config.AllowFunnel?.[host]) throw Error('Port 8443 is publicly exposed by another configuration. Disable that route before using Shep.');
  if(route && (Object.keys(route.Handlers||{}).length!==1 || route.Handlers?.['/']?.Proxy!==target)) throw Error('Tailscale port 8443 already serves another app. Shep left it unchanged.');
  if(config.TCP?.['8443']&&!route) throw Error('Tailscale port 8443 is already in use. Shep left it unchanged.');
  return target;
}
export async function connectPhone(port, command=run, binary) {
  binary ||= await tailscaleBinary();
  const access=identity(JSON.parse(await command(binary,['status','--json'])));
  const before=JSON.parse(await command(binary,['serve','status','--json']));
  const target=checkRoute(before,access.origin,port);
  await command(binary,['serve','--bg','--https=8443',target]);
  const after=JSON.parse(await command(binary,['serve','status','--json']));
  checkRoute(after,access.origin,port);
  if(after.Web?.[new URL(access.origin).host]?.Handlers?.['/']?.Proxy!==target) throw Error('The private HTTPS route is not ready. Enable HTTPS in your Tailscale admin console and try again.');
  return access;
}
