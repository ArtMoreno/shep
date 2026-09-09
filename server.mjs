import http from 'node:http';
import {homedir} from 'node:os';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, extname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { discover, rpc, agentControls } from './herdr.mjs';
import { pcWallpaper } from './wallpaper.mjs';
import { quotaSnapshot } from './quota.mjs';
import { launchOptions, validateLaunch, agents } from './launch.mjs';
import { claudeHistory } from './claude-history.mjs';
import { opencodeHistory } from './opencode-history.mjs';
import { createPushService } from './push.mjs';
import { createTeams } from './teams.mjs';
import { terminalMouse } from './terminal-mouse.mjs';
import {sizeNeovim} from './neovim-size.mjs';
import {savedMachines,remoteTransport} from './machines.mjs';
import {macWelcomeCommand} from './mac-welcome.mjs';

const statePath = name => join(process.env.SHEP_STATE_DIR || fileURLToPath(new URL('.local/', import.meta.url)), name);

export const keys = new Set(['enter', 'esc', 'tab', 'backspace', 'pageup', 'pagedown', 'left', 'right', 'up', 'down', 'ctrl+c']);
const files = new Map([
  ['/drawer.js', ['public/drawer.js', 'text/javascript; charset=utf-8']],
  ['/teams.js', ['public/teams.js', 'text/javascript; charset=utf-8']],
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/extras.js', ['public/extras.js', 'text/javascript; charset=utf-8']],
  ['/voice.js', ['public/voice.js', 'text/javascript; charset=utf-8']],
  ['/offline.html', ['public/offline.html', 'text/html; charset=utf-8']],
  ['/qol.js', ['public/qol.js', 'text/javascript; charset=utf-8']],
  ['/sw.js', ['public/sw.js', 'text/javascript; charset=utf-8']],
  ['/launch.js', ['public/launch.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
  ['/manifest.webmanifest', ['public/manifest.webmanifest', 'application/manifest+json; charset=utf-8']],
  ['/apple-touch-icon.png', ['public/apple-touch-icon.png', 'image/png']],
  ['/assets/herdr-icon.svg', ['public/assets/herdr-icon.svg', 'image/svg+xml']],
  ['/assets/rainbow-apple.svg', ['public/assets/rainbow-apple.svg', 'image/svg+xml']],
  ['/xterm.js', ['node_modules/@xterm/xterm/lib/xterm.js', 'text/javascript; charset=utf-8']],
  ['/xterm.css', ['node_modules/@xterm/xterm/css/xterm.css', 'text/css; charset=utf-8']],
  ['/assets/CascadiaMono.ttf', ['public/assets/CascadiaMono.ttf', 'font/ttf']],
]);
for (const size of [32,192,512]) files.set(`/assets/herdr-icon-${size}.png`, [`public/assets/herdr-icon-${size}.png`, 'image/png']);
for (const icon of ['arrow-up', 'arrow-left', 'chevron-down', 'chevron-right', 'adjustments-horizontal', 'x', 'plus', 'keyboard', 'layout-grid']) files.set(`/assets/${icon}.svg`, [`public/assets/${icon}.svg`, 'image/svg+xml']);
for (const brand of ['claude','codex','grok','agy','openrouter','opencode','omp']) files.set(`/brands/${brand}.svg`, [`references/provider-svg/${brand}.svg`, 'image/svg+xml']);
files.set('/brands/hermes.png', ['references/hermes-user.png', 'image/png']);
const fail = (status, message) => Object.assign(new Error(message), { status });

export function validateAction(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'Expected an input action');
  for (const field of ['id', 'bridgeId', 'paneId', 'terminalId']) {
    if (typeof body[field] !== 'string' || !body[field] || body[field].length > 160) throw fail(400, `Invalid ${field}`);
  }
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(body.id)) throw fail(400, 'Invalid input receipt ID');
  const attachments=body.attachments??[];
  if(!Array.isArray(attachments)||attachments.length>4||attachments.some(id=>typeof id!=='string'||!/^[-a-zA-Z0-9]{8,80}$/.test(id))||new Set(attachments).size!==attachments.length)throw fail(400,'Invalid attachments');
  if(attachments.length&&!['send','text'].includes(body.kind))throw fail(400,'Attachments need a message');
  if (body.kind === 'key') {
    if (!keys.has(body.key)) throw fail(400, 'Unsupported terminal key');
  } else if(body.kind==='editor-size'){
    if(![body.cols,body.rows].every(n=>Number.isInteger(n)&&n>=12&&n<=240))throw fail(400,'Invalid editor dimensions');
  } else if (body.kind === 'mouse') {
    if (![body.column,body.row,body.cols,body.rows].every(n=>Number.isInteger(n)&&n>=1&&n<=1000) || body.column>body.cols || body.row>body.rows) throw fail(400,'Invalid terminal coordinates');
  } else if (body.kind === 'shortcut') {
    if (!['model', 'plan', 'effort', 'cycle-mode'].includes(body.shortcut)) throw fail(400, 'Unsupported agent shortcut');
  } else if (body.kind === 'text' || body.kind === 'send' || body.kind==='type') {
    if (typeof body.text !== 'string' || (!body.text&&!attachments.length) || body.text.length > 8192) throw fail(400, 'Add a message or attachment (8192 characters maximum)');
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body.text)) throw fail(400, 'Use the terminal key buttons for control characters');
  } else if (body.kind !== 'close') throw fail(400, 'Unsupported input action');
  return { paneId: body.paneId, terminalId: body.terminalId, kind: body.kind, text: body.text, key: body.key, shortcut: body.shortcut, attachments, ...(['mouse','editor-size'].includes(body.kind)?{column:body.column,row:body.row,cols:body.cols,rows:body.rows}:{}) };
}

async function readBody(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw fail(415, 'Expected application/json');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 40 * 1024) throw fail(413, 'Input is too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail(400, 'Invalid JSON'); }
}

export function createBridge(connection, call = rpc, wallpaper = pcWallpaper, quotas = quotaSnapshot, choices = launchOptions, push, mouse = terminalMouse) {
  const access = connection.access;
  let privateHost;
  if (access) {
    const url = new URL(access.origin);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.ts.net') || url.origin !== access.origin || typeof access.userLogin !== 'string' || !access.userLogin.trim()) throw new Error('Invalid private Tailscale access configuration');
    privateHost = url.host;
  }
  const bridgeId = randomUUID();
  const cookie = connection.cookie || `herdr_mobile=${randomBytes(32).toString('hex')}`;
  const receipts = new Map();
  const attachments = new Map();
  const workspaces = new Set([connection.workspaceId,...(connection.workspaceIds||[])]);
  const openingPanes = new Set();
  let inputQueue = Promise.resolve();
  const requestHerdr = (method, params, timeout) => call(connection.endpoint, method, params, timeout);
  const snapshot = async () => {
    const state=(await requestHerdr('session.snapshot', {})).snapshot;
    if(connection.followSession){
      workspaces.clear();for(const w of state.workspaces)workspaces.add(w.workspace_id);
      if(!workspaces.has(connection.workspaceId))connection.workspaceId=state.focused_workspace_id||state.workspaces[0]?.workspace_id;
    }
    return state;
  };
  const selectPane = (state, paneId, terminalId) => {
    const pane = state.panes.find(p => p.pane_id === paneId && workspaces.has(p.workspace_id));
    if (!pane) throw fail(404, 'Pane is no longer in this workspace');
    if (terminalId && pane.terminal_id !== terminalId) throw fail(409, 'The terminal process changed. Reconnect before sending input.');
    return pane;
  };
  const publicState = state => ({
    hostPlatform:state.host_platform||process.platform,
    machine:connection.machine||{id:'local',label:'This PC'},
    bridgeId, session: connection.session, protocol: state.protocol, version: state.version,
    workspaceId: connection.workspaceId,
    workspaces: state.workspaces.filter(w => workspaces.has(w.workspace_id)),
    panes: state.panes.filter(p => workspaces.has(p.workspace_id)),
    layouts: state.layouts.filter(l => workspaces.has(l.workspace_id)),
    focusedPaneId: state.focused_pane_id,
  });
  const sendText = async (pane,text,expectedAgent) => {
    const check=async()=>{
      const current=selectPane(await snapshot(),pane.pane_id,pane.terminal_id);
      if(expectedAgent&&current.agent!==expectedAgent)throw fail(409,'The agent changed. Inspect the pane before sending more input.');
    };
    await check();
    await requestHerdr('pane.send_text',{pane_id:pane.pane_id,text});
    await delay(1000);
    await check();
    await requestHerdr('pane.send_keys',{pane_id:pane.pane_id,keys:['enter']});
  };

  async function runLaunch(action,launch,id) {
              launch.stage='Creating pane…';
              const params={cwd:action.cwd,focus:false};
              let created;
              if(action.destination==='workspace')created=await requestHerdr('workspace.create',params);
              else if(action.destination==='tab')created=await requestHerdr('tab.create',{...params,workspace_id:action.workspaceId});
              else created=await requestHerdr('pane.split',{...params,workspace_id:action.workspaceId,target_pane_id:action.paneId,direction:action.direction==='left'?'right':action.direction});
              const pane=created.root_pane||created.pane;
              if(!pane?.pane_id||!pane.terminal_id)throw new Error('Herdr did not confirm the new pane. Check Sessions before trying again.');
              if(action.destination!=='workspace'&&pane.workspace_id!==action.workspaceId)throw new Error('Herdr returned an unexpected workspace');
              workspaces.add(pane.workspace_id);openingPanes.add(pane.pane_id);
              Object.assign(launch,{paneId:pane.pane_id,terminalId:pane.terminal_id,workspaceId:pane.workspace_id});
              if(action.destination==='pane'&&action.direction==='left') {
                selectPane(await snapshot(),action.paneId,action.terminalId);
                await requestHerdr('pane.swap',{source_pane_id:pane.pane_id,target_pane_id:action.paneId});
              }
              if(action.destination==='workspace')await connection.persistWorkspaces?.([...workspaces]);
              selectPane(await snapshot(),pane.pane_id,pane.terminal_id);
              if(action.agent==='empty'){
                if(connection.machine&&(await snapshot()).host_platform==='darwin'){
                  await delay(700);await sendText(pane,macWelcomeCommand);
                }
                launch.stage='Ready';launch.status='ready';return;
              }
              launch.stage='Starting '+action.name+'…';
              if(process.platform==='win32'&&!connection.machine) {
                // Herdr 0.8.2 Start-Process cannot run npm's .ps1 launcher. Invoke it in its existing PowerShell instead.
                await requestHerdr('pane.wait_for_output',{pane_id:pane.pane_id,source:'visible',lines:2000,match:{type:'regex',value:'(?m)^PS [^\\r\\n]*>\\s*$'},timeout_ms:15000},16000);
                const command='& '+[action.agent,...action.args].map(value=>"'"+value.replaceAll("'","''")+"'").join(' ');
                await sendText(pane,command);
              } else await requestHerdr('agent.start',{name:'mobile-'+action.agent+'-'+id.slice(0,8),kind:action.agent,pane_id:pane.pane_id,args:action.args,timeout_ms:60000},65000);
              const deadline=Date.now()+60000;
              launch.stage='Waiting for '+action.name+' to be ready…';
              while(Date.now()<deadline) {
                try {await requestHerdr('agent.wait',{target:pane.pane_id,until:['idle','done','blocked'],timeout_ms:Math.max(1,deadline-Date.now())},65000);break;}
                catch(error) {if(error.code!=='agent_not_found')throw error;await delay(500);}
              }
              const active=selectPane(await snapshot(),pane.pane_id,pane.terminal_id);
              if(active.agent!==action.agent||!['idle','done','blocked'].includes(active.agent_status))throw new Error('Agent startup was not confirmed. Open the created pane to inspect it.');
              if((action.message||(action.agent==='codex'&&action.mode==='plan'))&&['codex','claude'].includes(action.agent)) {
                const {read}=await requestHerdr('pane.read',{pane_id:pane.pane_id,source:'visible',format:'ansi',strip_ansi:false,lines:2000});
                if(!agentControls(active,read.text)?.canOpen)throw new Error('Finish the startup menu in the created pane. Your first message has not been sent.');
              }
              if(action.agent==='codex'&&action.mode==='plan') {
                if(!['idle','done'].includes(active.agent_status))throw new Error('Finish agent startup in the created pane before switching to Plan mode.');
                await sendText(pane,'/plan',action.agent);
                await requestHerdr('pane.wait_for_output',{pane_id:pane.pane_id,source:'visible',lines:2000,match:{type:'regex',value:'(?i)plan mode'},timeout_ms:7000},8000);
                const {read}=await requestHerdr('pane.read',{pane_id:pane.pane_id,source:'visible',format:'ansi',strip_ansi:false,lines:2000});
                if(agentControls(active,read.text)?.mode!=='Plan')throw new Error('Confirm Plan mode in the created pane. Your first message has not been sent.');
              }
              if(action.message) {
                const ready=selectPane(await snapshot(),pane.pane_id,pane.terminal_id);
                if(ready.agent!==action.agent||!['idle','done'].includes(ready.agent_status))throw new Error('The agent is not ready for the first message. It is still saved in the form.');
                await sendText(pane,action.message,action.agent);
              }
              launch.stage=active.agent_status==='blocked'?'Needs your startup approval':'Ready';launch.status='ready';
  }

  const teams=createTeams({choices,launch:async(action,result,id)=>{try{await runLaunch(action,result,id);}finally{openingPanes.delete(result.paneId);}},snapshot,send:sendText,session:connection.session,file:connection.teamFile,allowed:workspaces});
  const server = http.createServer(async (request, response) => {
    const json = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(data));
    };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const port = connection.publicPort || server.address()?.port;
      const forwarded = ['x-forwarded-for','x-forwarded-proto','tailscale-user-login'].some(name => request.headers[name] !== undefined);
      const privateRequest = forwarded || request.headers.host === privateHost;
      if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) throw fail(403, 'Use the private Tailscale address');
      if (privateRequest) {
        if (!access || request.headers.host !== privateHost || request.headers['tailscale-user-login'] !== access.userLogin) throw fail(403, 'Connect with your own Tailscale account to open Herdr');
      } else if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) throw fail(403, 'Unrecognized local host');
      const origin = privateRequest ? access.origin : `http://${request.headers.host}`;
      const url = new URL(request.url, origin);
      if(privateRequest && connection.authorize && !await connection.authorize(request,response,url)) return;
      const openPage = request.method === 'GET' && url.pathname === '/' && request.headers['sec-fetch-mode'] === 'navigate' && request.headers['sec-fetch-dest'] === 'document';
      if (request.headers['sec-fetch-site'] === 'cross-site' && !openPage) throw fail(403, 'Cross-site requests are not allowed');
      if (request.method === 'GET' && files.has(url.pathname)) {
        if (url.pathname === '/') response.setHeader('Set-Cookie', cookie + '; HttpOnly; SameSite=Strict; Path=/' + (privateRequest ? '; Secure' : ''));
        const [path, type] = files.get(url.pathname);
        response.writeHead(200, { 'Content-Type': type });
        response.end(await readFile(new URL(path, import.meta.url)));
        return;
      }
      if (!(request.headers.cookie || '').split(/;\s*/).includes(cookie)) throw fail(401, 'Open this bridge page again to reconnect');
      if(connection.machineRouter&&await connection.machineRouter(request,response,url))return;
      if(connection.machine&&['/api/teams','/api/attachments'].includes(url.pathname))throw fail(409,'Create agents and manage files on this machine in Herdr. Existing remote panes support reading and keyboard input here.');
      if(request.method==='GET'&&url.pathname==='/api/health') {
        let herdr=false;try{await snapshot();herdr=true;}catch{}
        return json(200,{bridge:true,herdr,privateRoute:privateRequest,uptime:Math.floor(process.uptime())});
      }
      if (request.method === 'GET' && url.pathname === '/api/wallpaper') {
        try {
          const picture = await wallpaper();
          response.writeHead(200, { 'Content-Type': picture.type, 'Last-Modified': new Date(picture.modifiedAt).toUTCString() });
          response.end(picture.bytes);
        } catch { json(503, { error: 'PC wallpaper is unavailable. Choose an image wallpaper in Windows, then refresh.' }); }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/quota') return json(200, await quotas());
      if (request.method === 'GET' && url.pathname === '/api/push/key') {
        if(!push)throw fail(503,'Notifications are unavailable on this bridge');
        return json(200,{publicKey:push.publicKey});
      }
      if (request.method === 'GET' && url.pathname === '/api/teams') return json(200,{bridgeId,teams:await teams.list()});
      if (request.method === 'GET' && url.pathname === '/api/launch-options') return json(200,{agents:await choices(),home:await connection.launchHome?.()});
      if (request.method === 'GET' && url.pathname === '/api/launch') {
        const receipt=receipts.get(url.searchParams.get('id'));
        if(!receipt?.launch)throw fail(404,'Launch receipt unavailable. Check Sessions before opening another session.');
        return json(200,{bridgeId,...receipt.launch});
      }
      if (request.method === 'GET' && url.pathname === '/api/state') return json(200, publicState(await snapshot()));
      if (request.method === 'GET' && url.pathname === '/api/frame') {
        const state = await snapshot();
        const pane = selectPane(state, url.searchParams.get('pane'));
        const layout = state.layouts.find(l => l.tab_id === pane.tab_id);
        const rect = layout?.panes.find(p => p.pane_id === pane.pane_id)?.rect;
        if (!rect) throw fail(503, 'Herdr has not supplied this pane layout');
        const historyLines=Number(url.searchParams.get('history')||0);
        if(!Number.isInteger(historyLines)||historyLines<0||historyLines>10000)throw fail(400,'Invalid history length');
        const { read } = await requestHerdr('pane.read', { pane_id: pane.pane_id, source: 'visible', format: 'ansi', strip_ansi: false, lines: 2000 });
        // The overview remains a native screen; only the opened terminal requests scrollback.
        let history=historyLines?(await requestHerdr('pane.read',{pane_id:pane.pane_id,source:'recent',format:'ansi',strip_ansi:false,lines:historyLines},8000)).read:undefined;
        if(!connection.machine&&historyLines&&pane.agent==='claude') {
          const saved=await claudeHistory(pane,historyLines);
          if(saved)history=pane.agent_status==='working'?{...saved,text:saved.text+'\n\n'+read.text}:saved;
        }
        if(!connection.machine&&historyLines&&pane.agent==='opencode') {
          const saved=opencodeHistory(pane,historyLines);
          // Keep the live TUI (including model/approval menus) below earlier messages.
          if(saved)history={...saved,text:saved.text+'\n\n'+read.text};
        }
        selectPane(await snapshot(),pane.pane_id,pane.terminal_id);
        return json(200, {
          ...publicState(state), pane, read, history,
          agentControls: agentControls(pane, read.text),
          cols: Math.max(2, rect.width - 2), rows: Math.max(1, pane.scroll?.viewport_rows ?? rect.height - 2),
        });
      }
      if (request.method !== 'POST' || !['/api/input','/api/launch','/api/teams','/api/attachments','/api/push/subscribe','/api/push/unsubscribe'].includes(url.pathname)) throw fail(404, 'Not found');
      if (request.headers.origin !== origin || request.headers['x-herdr-bridge'] !== bridgeId) throw fail(403, 'Input must come from this bridge page');
      if(url.pathname==='/api/attachments') {
        if(request.headers['content-type']!=='application/octet-stream')throw fail(415,'Expected file bytes');
        let name;try{name=decodeURIComponent(request.headers['x-file-name']||'');}catch{throw fail(400,'Invalid filename');}
        if(!name||name.length>240||/[\x00-\x1f\x7f/\\]/.test(name))throw fail(400,'Choose a file with a valid filename');
        const paneId=request.headers['x-herdr-pane'], terminalId=request.headers['x-herdr-terminal'];
        if(typeof paneId!=='string'||typeof terminalId!=='string'||!terminalId)throw fail(400,'Choose a terminal first');
        selectPane(await snapshot(),paneId,terminalId);
        const limit=20*1024*1024;
        if(Number(request.headers['content-length'])>limit)throw fail(413,'Files must be 20 MB or smaller');
        const chunks=[];let size=0;
        for await(const chunk of request){size+=chunk.length;if(size>limit)throw fail(413,'Files must be 20 MB or smaller');chunks.push(chunk);}
        selectPane(await snapshot(),paneId,terminalId);
        const id=randomUUID(), extension=extname(name);
        const directory=connection.uploadDir||statePath('uploads');
        await mkdir(directory,{recursive:true});
        const path=join(directory,id+(/^\.[a-zA-Z0-9]{1,12}$/.test(extension)?extension:'.bin'));
        await writeFile(path,Buffer.concat(chunks),{flag:'wx'});
        attachments.set(id,{id,name,path,size,paneId,terminalId});
        return json(201,{id,name,size,bridgeId});
      }
      const body = await readBody(request);
      if(url.pathname==='/api/teams')return json(202,{bridgeId,team:await teams.start(body,bridgeId)});
      if(url.pathname.startsWith('/api/push/')) {
        if(!push)throw fail(503,'Notifications are unavailable on this bridge');
        if(url.pathname.endsWith('/subscribe'))await push.subscribe(body);else await push.unsubscribe(body?.endpoint);
        return json(200,{ok:true});
      }
      if(url.pathname==='/api/launch') {
        if(body?.bridgeId!==bridgeId)throw fail(409,'The bridge restarted. Check Sessions before opening another session.');
        const action=await validateLaunch(body,await choices(),connection.directoryCheck);
        const fingerprint=createHash('sha256').update(JSON.stringify({launch:action})).digest('hex');
        let receipt=receipts.get(body.id);
        if(receipt&&receipt.fingerprint!==fingerprint)throw fail(409,'This launch ID already belongs to a different action');
        if(!receipt) {
          if(receipts.size>=4096)throw fail(429,'Receipt limit reached. Restart only the bridge.');
          const before=await snapshot();
          if(!(connection.machine&&action.destination==='workspace')&&(!workspaces.has(action.workspaceId)||(action.destination!=='workspace'&&!before.workspaces.some(w=>w.workspace_id===action.workspaceId))))throw fail(404,'The selected workspace is unavailable');
          if(action.destination==='pane') {
            const target=selectPane(before,action.paneId,action.terminalId);
            if(target.workspace_id!==action.workspaceId)throw fail(409,'The selected pane changed workspaces');
          }
          // Recheck after asynchronous validation so simultaneous taps share one operation.
          receipt=receipts.get(body.id);
          if(receipt&&receipt.fingerprint!==fingerprint)throw fail(409,'This launch ID already belongs to a different action');
          if(!receipt) {
            receipt={fingerprint,launch:{id:body.id,status:'opening'}};
            receipts.set(body.id,receipt);
            const launch=receipt.launch;
            receipt.operation=(async()=>{
              await runLaunch(action,launch,body.id);
            })().catch(error=>{launch.status='error';launch.error=error.message;launch.notRetried=true;}).finally(()=>{openingPanes.delete(launch.paneId);});
          }
        }
        return json(202,{bridgeId,...receipt.launch});
      }
      const action = validateAction(body);
      if (body.bridgeId !== bridgeId) throw fail(409, 'The bridge restarted. Reload; previous input will not be replayed.');
      const fingerprint = createHash('sha256').update(JSON.stringify(action)).digest('hex');
      let receipt = receipts.get(body.id);
      if (receipt && receipt.fingerprint !== fingerprint) throw fail(409, 'This input ID already belongs to a different action');
      if (!receipt) {
        // ponytail: keep 4096 receipts per run instead of a database. Restart only the bridge at the ceiling.
        if (receipts.size >= 4096) throw fail(429, 'Receipt limit reached. Restart the bridge; Herdr sessions keep running.');
        const operation = inputQueue.then(async () => {
          const live = await snapshot();
          const selected = selectPane(live, action.paneId, action.terminalId);
          if(openingPanes.has(action.paneId))throw fail(409,'This session is still opening. Wait for startup to finish.');
          const attached=action.attachments.map(id=>{
            const file=attachments.get(id);
            if(!file)throw fail(410,'Attachment expired after reconnect. Remove it and attach it again.');
            if(file.paneId!==action.paneId||file.terminalId!==action.terminalId)throw fail(409,'This attachment belongs to another terminal');
            return file;
          });
          if (action.kind === 'shortcut') {
            const { read } = await requestHerdr('pane.read', { pane_id: action.paneId, source: 'visible', format: 'ansi', strip_ansi: false, lines: 2000 });
            const meta = agentControls(selected, read.text);
            if (!meta || !Object.values(meta.shortcuts).includes(action.shortcut)) throw fail(400, 'This agent does not support that shortcut.');
            if (!meta.canOpen) throw fail(409, 'Finish the existing terminal draft or menu before opening this control.');
          }
          if(action.kind==='editor-size'){
            if(connection.machine||selected.agent)throw fail(409,'Phone editor sizing currently supports local Windows Neovim panes.');
            const {process_info}=await requestHerdr('pane.process_info',{pane_id:action.paneId});
            selectPane(await snapshot(),action.paneId,action.terminalId);
            await sizeNeovim(process_info.shell_pid,action.cols,action.rows);
          } else if(action.kind==='mouse') {
            if(connection.machine)throw fail(409,'Use keyboard controls for this SSH terminal. Remote mouse input is not available.');
            const rect=live.layouts.find(l=>l.tab_id===selected.tab_id)?.panes.find(p=>p.pane_id===selected.pane_id)?.rect;
            if(selected.agent || !rect || action.cols!==Math.max(2,rect.width-2) || action.rows!==Math.max(1,selected.scroll?.viewport_rows??rect.height-2)) throw fail(409,'Terminal changed size or mode. Refresh before tapping.');
            const {process_info}=await requestHerdr('pane.process_info',{pane_id:action.paneId});
            if(process_info?.pane_id!==action.paneId)throw fail(409,'Terminal identity changed');
            selectPane(await snapshot(),action.paneId,action.terminalId);
            await mouse(process_info.shell_pid,action.column,action.row);
          } else if(action.kind==='type') {
            await requestHerdr('pane.send_keys',{pane_id:action.paneId,keys:Array.from(action.text,char=>({' ':'space','\n':'enter','\r':'enter','\t':'tab'}[char]||char))});
          } else if (action.kind === 'close') {
            await requestHerdr('pane.close', { pane_id: action.paneId });
          } else if (action.kind === 'key' || (action.kind === 'shortcut' && action.shortcut === 'cycle-mode')) {
            await requestHerdr('pane.send_keys', { pane_id: action.paneId, keys: [action.kind === 'key' ? action.key : 'shift+tab'] });
          } else {
            const references=attached.length?'\n\nAttached files on this PC (read these files):\n'+attached.map(file=>'- '+file.name+': '+file.path).join('\n'):'';
            const text=action.kind==='shortcut'?'/'+action.shortcut:action.text+references;
            if (action.kind === 'send' || action.kind === 'shortcut') {
              // Agent TUIs may treat an immediate Enter as part of a paste. Keep the operations separate.
              await sendText(selected,text,selected.agent);
            } else await requestHerdr('pane.send_text',{pane_id:action.paneId,text});
          }
          return { status: 200, data: { ok: true, id: body.id } };
        }).catch(error => ({ status: error.status || 502, data: { error: error.message, id: body.id, notRetried: true } }));
        inputQueue = operation;
        receipt = { fingerprint, operation };
        receipts.set(body.id, receipt);
      }
      const result = await receipt.operation;
      json(result.status, result.data);
    } catch (error) {
      if (!response.headersSent) json(error.status || 502, { error: error.status ? error.message : 'Herdr connection unavailable. Input was not retried.' });
      else response.end();
    }
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 10_000;
  return server;
}

export async function startBridge({authorize} = {}) {
    await mkdir(statePath(''), {recursive:true});
    const connection = await discover(process.env.HERDR_MOBILE_SESSION || 'default');
    connection.launchHome=async()=>homedir();
    connection.teamFile=statePath('teams.json');
    const state = (await rpc(connection.endpoint, 'session.snapshot')).snapshot;
    connection.workspaceId = process.env.HERDR_MOBILE_WORKSPACE || state.focused_workspace_id;
    connection.followSession = !process.env.HERDR_MOBILE_WORKSPACE;
    if (!connection.workspaceId) throw new Error('Open a Herdr workspace before starting the bridge');
    try { connection.access = JSON.parse(await readFile(statePath('access.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const workspaceFile=statePath('mobile-workspaces.json');
    try { connection.workspaceIds=JSON.parse(await readFile(workspaceFile,'utf8')).filter(id=>typeof id==='string'); }
    catch(error) { if(error.code!=='ENOENT')throw error; }
    if (!state.workspaces.some(w => w.workspace_id === connection.workspaceId) && !connection.workspaceIds?.includes(connection.workspaceId)) throw new Error('The selected Herdr workspace is unavailable');
    connection.persistWorkspaces=ids=>{connection.workspaceIds=ids;return writeFile(workspaceFile,JSON.stringify(ids));};
    const port = Number(process.env.HERDR_MOBILE_PORT || 4317);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid bridge port');
    const watchers=new Map();
    const push=await createPushService({file:statePath('push.json'),origin:connection.access?.origin||'https://herdr.dev',snapshot:async()=>{
      const allowed=new Set([connection.workspaceId,...(connection.workspaceIds||[])]);
      const saved=await savedMachines();
      for(const [id,w] of watchers)if(!saved.some(m=>m.id===id&&JSON.stringify(m)===w.identity)){w.transport.close();watchers.delete(id);}
      const reads=[rpc(connection.endpoint,'session.snapshot').then(r=>r.snapshot.panes.filter(p=>connection.followSession||allowed.has(p.workspace_id)).map(p=>({...p,machineId:'local',machineLabel:'Windows'})))];
      for(const machine of saved){
        if(!watchers.has(machine.id))watchers.set(machine.id,{identity:JSON.stringify(machine),transport:remoteTransport(machine)});
        reads.push(watchers.get(machine.id).transport.call('','session.snapshot').then(r=>r.snapshot.panes.map(p=>({...p,machineId:machine.id,machineLabel:machine.label}))));
      }
      return (await Promise.allSettled(reads)).flatMap(r=>r.status==='fulfilled'?r.value:[]);
    }});
    connection.authorize=authorize;
    connection.cookie=`herdr_mobile=${randomBytes(32).toString('hex')}`;
    const remoteBridges=new Map();let machines=[],machinesAt=0;
    connection.machineRouter=async(request,response,url)=>{
      if(url.pathname!=='/api/machines'&&!url.searchParams.has('machine'))return false;
      if(Date.now()-machinesAt>5000){machines=await savedMachines();machinesAt=Date.now();}
      if(url.pathname==='/api/machines'){response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({machines:[{id:'local',label:'This PC'},...machines.map(m=>({id:m.id,label:m.label}))]}));return true;}
      const machine=machines.find(m=>m.id===url.searchParams.get('machine'));if(!machine)throw fail(404,'Saved machine unavailable. Enable it in Herdr on your PC.');
      let remote=remoteBridges.get(machine.id);
      if(remote&&remote.identity!==JSON.stringify(machine)){remote.transport.close();remoteBridges.delete(machine.id);remote=undefined;}
      if(!remote){const transport=remoteTransport(machine);const child=createBridge({endpoint:'ssh',launchHome:async()=>(await transport.call('','shep.launch-info')).home,session:machine.session,followSession:true,machine:{id:machine.id,label:machine.label},access:connection.access,cookie:connection.cookie,publicPort:port,authorize,directoryCheck:async cwd=>(await transport.call('','shep.launch-info',{cwd})).directory},transport.call,undefined,async()=>({providers:[]}),async()=>{const info=await transport.call('','shep.launch-info');return [...agents.filter(a=>info.agents.includes(a.id)),{id:'empty',name:'Empty terminal · no agent',modes:['default']}];},push);remote={child,transport,identity:JSON.stringify(machine)};remoteBridges.set(machine.id,remote);}
      url.searchParams.delete('machine');request.url=url.pathname+url.search;
      remote.child.emit('request',request,response);return true;
    };
    const server = createBridge(connection,undefined,undefined,undefined,undefined,push);
    server.on('close',()=>{push.stop();for(const w of watchers.values())w.transport.close();for(const remote of remoteBridges.values())remote.transport.close();});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);}).catch(error=>{push.stop();throw error;});
    return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startBridge().then(server=>console.log(`Shep: http://127.0.0.1:${server.address().port}`)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
