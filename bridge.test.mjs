import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridge } from './server.mjs';
import { rpc, agentControls } from './herdr.mjs';
import { validateLaunch } from './launch.mjs';
import { transcriptText } from './claude-history.mjs';

test('Claude history restores full text only from the selected session, excluding internal blocks',()=>{
  const row=(type,content,extra={})=>JSON.stringify({sessionId:'selected',type,message:{content},...extra});
  const raw=[row('user','Question'),row('assistant',[{type:'thinking',thinking:'private'},{type:'text',text:'Complete answer\nLast line'}]),row('assistant','Other session',{sessionId:'other'}),row('user','metadata',{isMeta:true}),'partial{'].join('\n');
  assert.equal(transcriptText(raw,'selected'),'❯ Question\n\n● Complete answer\nLast line');
});

const fixture = () => ({
  version: 'test', protocol: 20, focused_pane_id: 'w1:p1',
  workspaces: [{ workspace_id: 'w1', label: 'Test' }],
  panes: [{ pane_id: 'w1:p1', terminal_id: 'term1', workspace_id: 'w1', tab_id: 'w1:t1', scroll: { viewport_rows: 23 } }],
  layouts: [{ workspace_id: 'w1', tab_id: 'w1:t1', panes: [{ pane_id: 'w1:p1', rect: { width: 82, height: 25 } }] }],
});

async function setup(t, handler, wallpaper, access, choices, uploadDir, push, mouse, followSession=false) {
  const state = fixture(), calls = [];
  const call = async (_endpoint, method, params) => {
    calls.push({ method, params });
    if (handler) {
      const value = await handler(method, params, state);
      if (value !== undefined) return value;
    }
    if (method === 'session.snapshot') return { snapshot: structuredClone(state) };
    if (method === 'pane.read') return { read: { text: '\x1b[31mhello 🧠\x1b[0m', revision: 1, pane_id: params.pane_id, truncated: false } };
    assert.ok(['pane.send_text', 'pane.send_keys'].includes(method), `Unexpected mutation: ${method}`);
    return { type: 'ok' };
  };
  const server = createBridge({ endpoint: 'test-only', workspaceId: 'w1', session: 'test', access, uploadDir, followSession }, call, wallpaper, async()=>({providers:[]}),choices,push,mouse);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base);
  const cookie = page.headers.get('set-cookie').split(';')[0]; await page.text();
  const request = (path, options = {}) => fetch(base + path, { ...options, headers: { Cookie: cookie, ...options.headers } });
  const { bridgeId } = await (await request('/api/state')).json();
  const action = (overrides = {}) => ({ id: randomUUID(), bridgeId, paneId: 'w1:p1', terminalId: 'term1', kind: 'text', text: 'hello', ...overrides });
  const post = (body, headers = {}, path = '/api/input') => request(path, { method: 'POST', headers: { Origin: base, 'X-Herdr-Bridge': bridgeId, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const writes = () => calls.filter(c => c.method.startsWith('pane.send_'));
  return { server, base, request, action, post, calls, writes, state };
}

test('session following discovers replacement PC workspaces while explicit scope stays restricted',async t=>{
  for(const follow of [false,true]){
    const h=await setup(t,undefined,undefined,undefined,undefined,undefined,undefined,undefined,follow);
    h.state.workspaces=[{workspace_id:'w2'}];h.state.focused_workspace_id='w2';
    h.state.panes=[{...h.state.panes[0],pane_id:'w2:p1',workspace_id:'w2'}];h.state.layouts=[];
    const data=await(await h.request('/api/state')).json();
    assert.equal(data.panes.length,follow?1:0);
    if(follow){assert.equal(data.workspaceId,'w2');assert.equal((await h.post(h.action({paneId:'w2:p1'}))).status,200);}
  }
});

test('diagnostics require authentication and never send input',async t=>{
  const h=await setup(t);
  assert.equal((await fetch(h.base+'/api/health')).status,401);
  const data=await(await h.request('/api/health')).json();
  assert.equal(data.bridge,true);assert.equal(data.herdr,true);assert.equal(data.privateRoute,false);
  assert.equal(h.writes().length,0);
  assert.deepEqual(Object.keys(data).sort(),['bridge','herdr','privateRoute','uptime']);
});

test('mouse clicks validate geometry and identity and are never duplicated',async t=>{
  const clicks=[];
  const h=await setup(t,method=>method==='pane.process_info'?{process_info:{pane_id:'w1:p1',shell_pid:123}}:undefined,undefined,undefined,undefined,undefined,undefined,async(...args)=>clicks.push(args));
  const body=h.action({kind:'mouse',column:3,row:2,cols:80,rows:23});
  assert.equal((await h.post(body)).status,200);
  assert.equal((await h.post(body)).status,200);
  assert.deepEqual(clicks,[[123,3,2]]);
  for(const change of [{column:0},{row:24},{column:1.5},{cols:79},{terminalId:'stale'}]) {
    assert.ok([400,409].includes((await h.post(h.action({...body,id:randomUUID(),...change}))).status));
  }
  h.state.panes[0].agent='codex';
  assert.equal((await h.post(h.action({...body,id:randomUUID()}))).status,409);
  assert.equal(clicks.length,1);
});

test('direct typing sends literal keys once and rejects control-sequence injection',async t=>{
  const h=await setup(t),body=h.action({kind:'type',text:'iHi there'});
  assert.equal((await h.post(body)).status,200);assert.equal((await h.post(body)).status,200);
  assert.equal(h.writes().length,1);assert.deepEqual(h.writes()[0].params.keys,['i','H','i','space','t','h','e','r','e']);
  assert.equal((await h.post(h.action({kind:'type',text:'\x1b[2J'}))).status,400);
  assert.equal((await h.post(h.action({kind:'mouse',column:1,row:1}))).status,400);
  assert.equal(h.writes().length,1);
});

test('team setup requires authentication, origin and current bridge identity before any launch',async t=>{
  const h=await setup(t);
  assert.equal((await fetch(h.base+'/api/teams')).status,401);
  assert.deepEqual((await(await h.request('/api/teams')).json()).teams,[]);
  assert.equal((await h.post({}, {Origin:'https://wrong.invalid'},'/api/teams')).status,403);
  assert.equal((await h.post({bridgeId:'old'}, {},'/api/teams')).status,409);
  assert.equal(h.writes().length,0);
});

test('notification subscriptions require the same authenticated origin and bridge identity as input',async t=>{
  const calls=[];const push={publicKey:'public-only',subscribe:async s=>calls.push(s),unsubscribe:async e=>calls.push(e)};
  const h=await setup(t,undefined,undefined,undefined,undefined,undefined,push);
  assert.equal((await fetch(h.base+'/api/push/key')).status,401);
  assert.deepEqual(await(await h.request('/api/push/key')).json(),{publicKey:'public-only'});
  assert.equal((await h.post({endpoint:'test'},{Origin:'https://wrong.test'},'/api/push/subscribe')).status,403);
  assert.equal(calls.length,0);
  assert.equal((await h.post({endpoint:'test'},{},'/api/push/subscribe')).status,200);
  assert.equal((await h.post({endpoint:'test'},{},'/api/push/unsubscribe')).status,200);
  assert.deepEqual(calls,[{endpoint:'test'},'test']);assert.equal(h.writes().length,0);
});

test('HTTP boundary rejects foreign origins, missing cookies and forged hosts', async t => {
  const h = await setup(t);
  assert.equal((await fetch(h.base + '/api/state')).status, 401);
  assert.equal((await h.post(h.action(), { Origin: 'https://example.invalid' })).status, 403);
  assert.equal((await h.post(h.action(), { 'X-Herdr-Bridge': 'wrong' })).status, 403);
  const forgedHostStatus = await new Promise((resolve, reject) => {
    httpRequest(h.base + '/api/state', { headers: { Host: 'attacker.invalid' } }, response => {
      response.resume(); resolve(response.statusCode);
    }).on('error', reject).end();
  });
  assert.equal(forgedHostStatus, 403);
  assert.equal((await h.request('/', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await h.request('/herdr.mjs')).status, 404);
  assert.equal(h.writes().length, 0);
});

test('QuotaDeck is available without a terminal pane and uses the existing private session boundary', async t=>{
  const h=await setup(t);
  h.state.panes=[];
  assert.equal((await fetch(h.base+'/api/quota')).status,401);
  assert.deepEqual(await (await h.request('/api/quota')).json(),{providers:[]});
  assert.equal((await h.request('/api/quota',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  for(const name of ['claude.svg','codex.svg','grok.svg','hermes.png','openrouter.svg','opencode.svg']){
    assert.equal((await h.request('/brands/'+name)).status,200);
  }
  assert.equal((await h.request('/brands/unknown.svg')).status,404);
  assert.equal(h.writes().length,0);
});

test('concurrent duplicate Unicode input is forwarded once, unchanged', async t => {
  const h = await setup(t);
  const body = h.action({ text: 'héllo 🧠 東京\n$(this is literal text)' });
  const replies = await Promise.all([h.post(body), h.post(body), h.post(body)]);
  assert.ok(replies.every(r => r.status === 200));
  assert.deepEqual(h.writes(), [{ method: 'pane.send_text', params: { pane_id: 'w1:p1', text: body.text } }]);
  assert.equal((await h.post({ ...body, text: 'different' })).status, 409);
});

test('new-session receipts create each real resource once and preserve partial or uncertain launches', async t=>{
  let index=1, failStart=false, startupMenu=false;
  const waiting=new Set();
  const choices=async()=>[{id:'codex',name:'Codex',icon:'/brands/codex.svg',modes:['default','plan'],efforts:['high']}];
  const h=await setup(t,async(method,params,state)=>{
    if(['pane.split','tab.create','workspace.create'].includes(method)) {
      const workspace_id=method==='workspace.create'?'created-workspace':'w1';
      if(method==='workspace.create')state.workspaces.push({workspace_id,label:'Created'});
      const pane={pane_id:workspace_id+':p'+(++index),terminal_id:'new-term'+index,workspace_id,tab_id:workspace_id+':t'+index,cwd:params.cwd,agent_status:'unknown'};
      state.panes.push(pane);
      return method==='pane.split'?{pane}:{root_pane:pane};
    }
    if(method==='pane.wait_for_output')return {matched:true};
    if(method==='pane.swap')return {swapped:true};
    if(method==='pane.read')return {read:{text:startupMenu?'Update Codex? Press Enter to update.':'› \x1b[2mAsk anything\x1b[0m\ngpt-test high D:\\'}};
    if(method==='agent.wait') {
      if(!waiting.has(params.target)){waiting.add(params.target);throw Object.assign(new Error('Starting'),{code:'agent_not_found'});}
      return {agent:state.panes.find(p=>p.pane_id===params.target)};
    }
    if(method==='agent.start'||(method==='pane.send_text'&&params.text.startsWith("& 'codex' "))) {
      const pane=state.panes.find(p=>p.pane_id===params.pane_id);pane.agent='codex';pane.agent_status='idle';
      if(failStart)throw new Error('Lost startup acknowledgement');
      return {agent:pane};
    }
  },undefined,undefined,choices);
  const make=overrides=>({...h.action(),agent:'codex',destination:'tab',workspaceId:'w1',cwd:process.cwd(),model:'gpt-test',effort:'high',mode:'default',message:'',...overrides});
  const post=body=>h.post(body,{},'/api/launch');
  const finished=async body=>{
    for(let attempt=0;attempt<300;attempt++) {
      const value=await(await h.request('/api/launch?id='+body.id)).json();
      if(value.status!=='opening')return value;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.fail('Launch did not finish');
  };
  assert.equal((await fetch(h.base+'/api/launch-options')).status,401);
  assert.equal((await h.post(make(),{Origin:'https://foreign.invalid'},'/api/launch')).status,403);
  for(const bad of [{cwd:'relative'},{agent:'powershell'},{model:'$(launch something)'},{effort:'impossible'},{message:'\x1b[H'},{workspaceId:'unrelated'},{destination:'pane',direction:'right',terminalId:'replaced'}])assert.ok((await post(make(bad))).status>=400);
  assert.equal(h.calls.filter(c=>['pane.split','tab.create','workspace.create','agent.start'].includes(c.method)).length,0);
  for(const destination of ['pane','tab','workspace']) {
    const body=make({destination,direction:'down',message:destination==='tab'?'Hello 🧠\nThis is literal $(text).':''});
    const replies=await Promise.all([post(body),post(body),post(body)]);
    assert.ok(replies.every(reply=>reply.status===202));
    const result=await finished(body);assert.equal(result.status,'ready');
    const created=h.calls.filter(c=>c.method==={pane:'pane.split',tab:'tab.create',workspace:'workspace.create'}[destination]);
    assert.equal(created.length,1);assert.equal(created[0].params.focus,false);
    if(destination==='pane')assert.equal(created[0].params.target_pane_id,'w1:p1');
    const start=h.calls.filter(c=>(c.method==='agent.start'||(c.method==='pane.send_text'&&c.params.text.startsWith("& 'codex' ")))&&c.params.pane_id===result.paneId);
    assert.equal(start.length,1);
    if(process.platform==='win32')assert.equal(start[0].params.text,"& 'codex' '-c' 'check_for_update_on_startup=false' '--model' 'gpt-test' '-c' 'model_reasoning_effort=high' '-c' 'plan_mode_reasoning_effort=high'");
    else {assert.match(start[0].params.name,/^[a-z][a-z0-9_-]{0,31}$/);assert.deepEqual(start[0].params.args,['-c','check_for_update_on_startup=false','--model','gpt-test','-c','model_reasoning_effort=high','-c','plan_mode_reasoning_effort=high']);}
    assert.equal((await post({...body,model:'different'})).status,409);
    assert.ok((await(await h.request('/api/state')).json()).panes.some(p=>p.pane_id===result.paneId));
  }
  assert.equal(h.writes().filter(c=>c.params.text==='Hello 🧠\nThis is literal $(text).').length,1);
  const left=make({destination:'pane',direction:'left'});
  await post(left);const leftResult=await finished(left);assert.equal(leftResult.status,'ready');
  assert.equal(h.calls.filter(c=>c.method==='pane.split').at(-1).params.direction,'right');
  assert.deepEqual(h.calls.find(c=>c.method==='pane.swap').params,{source_pane_id:leftResult.paneId,target_pane_id:'w1:p1'});
  await post(left);assert.equal(h.calls.filter(c=>c.method==='pane.swap').length,1);
  const previousWrites=h.writes().length;
  failStart=true;
  const uncertain=make(), reply=await post(uncertain);assert.equal(reply.status,202);
  const result=await finished(uncertain);assert.equal(result.status,'error');assert.ok(result.paneId);assert.equal(result.notRetried,true);
  await post(uncertain);assert.equal((await finished(uncertain)).paneId,result.paneId);
  assert.equal(h.calls.filter(c=>(c.method==='agent.start'||c.method==='pane.send_text')&&c.params.pane_id===result.paneId).length,1);
  assert.equal(h.writes().length,previousWrites+(process.platform==='win32'?1:0));
  failStart=false;startupMenu=true;
  const blocked=make({mode:'plan',message:'Do not send into a startup menu'});
  await post(blocked);const blockedResult=await finished(blocked);
  assert.equal(blockedResult.status,'error');assert.match(blockedResult.error,/startup menu/);
  assert.ok(!h.writes().some(c=>['/plan','Do not send into a startup menu'].includes(c.params.text)));
  startupMenu=false;h.state.panes=[];h.state.workspaces=[];
  assert.equal((await post(make())).status,404);
  assert.equal((await post(make({destination:'workspace',workspaceId:'unrelated'}))).status,404);
  const reopen=make({destination:'workspace'});
  assert.equal((await post(reopen)).status,202);
  assert.equal((await finished(reopen)).status,'ready');
});

test('empty terminal creates a native pane once without launching or sending anything',async t=>{
 const h=await setup(t,async(method,params,state)=>{
  if(method==='tab.create'){const pane={pane_id:'w1:empty',terminal_id:'empty-term',workspace_id:'w1',tab_id:'w1:empty-tab'};state.panes.push(pane);return {root_pane:pane};}
 },undefined,undefined,async()=>[{id:'empty',name:'Empty terminal',modes:['default']}]);
 const body={...h.action(),agent:'empty',workspaceId:'w1',destination:'tab',cwd:process.cwd(),message:''};
 assert.equal((await h.post({...body,message:'run this'}, {},'/api/launch')).status,400);
 assert.equal((await h.post(body,{},'/api/launch')).status,202);
 await h.post(body,{},'/api/launch');
 const result=await(await h.request('/api/launch?id='+body.id)).json();assert.equal(result.status,'ready');
 assert.equal(h.calls.filter(c=>c.method==='tab.create').length,1);assert.equal(h.writes().length,0);assert.ok(!h.calls.some(c=>c.method.startsWith('agent.')));
});

test('Grok launch uses its native model and permission-mode flags',async()=>{
  const choices=[{id:'grok',name:'Grok',modes:['default','plan','auto','acceptEdits']}];
  const action=await validateLaunch({id:randomUUID(),bridgeId:'test',workspaceId:'w1',agent:'grok',destination:'tab',cwd:process.cwd(),model:'grok-4.6',mode:'plan'},choices);
  assert.deepEqual(action.args,['--model','grok-4.6','--permission-mode','plan']);
});

test('close targets one verified terminal, rejects stale or foreign targets, and never repeats after a lost reply', async t=>{
  let loseReply=false;
  const h=await setup(t,(method,params,state)=>{
    if(method!=='pane.close')return;
    state.panes=state.panes.filter(p=>p.pane_id!==params.pane_id);
    if(loseReply)throw new Error('Close reply lost');
    return {type:'ok'};
  });
  h.state.panes.push({pane_id:'w1:p2',terminal_id:'term2',workspace_id:'w1',agent_status:'working'});
  h.state.panes.push({pane_id:'w2:p1',terminal_id:'foreign',workspace_id:'w2'});
  const action=h.action({kind:'close'});
  assert.equal((await h.post(action,{Origin:'https://foreign.invalid'})).status,403);
  assert.equal((await h.post({...action,bridgeId:randomUUID()})).status,409);
  assert.equal((await h.post(h.action({kind:'close',terminalId:'replaced'}))).status,409);
  assert.equal((await h.post(h.action({kind:'close',paneId:'w2:p1',terminalId:'foreign'}))).status,404);
  assert.equal(h.calls.filter(c=>c.method==='pane.close').length,0);
  assert.ok((await Promise.all([h.post(action),h.post(action),h.post(action)])).every(r=>r.status===200));
  assert.deepEqual(h.calls.filter(c=>c.method==='pane.close').map(c=>c.params),[{pane_id:'w1:p1'}]);
  assert.ok(h.state.panes.some(p=>p.pane_id==='w1:p2'));
  assert.equal((await h.post({...action,paneId:'w1:p2',terminalId:'term2'})).status,409);
  loseReply=true;
  const uncertain=h.action({kind:'close',paneId:'w1:p2',terminalId:'term2'});
  assert.equal((await h.post(uncertain)).status,502);
  assert.equal((await h.post(uncertain)).status,502);
  assert.equal(h.calls.filter(c=>c.method==='pane.close').length,2);
  assert.equal(h.writes().length,0);
  assert.deepEqual(h.state.panes.map(p=>p.pane_id),['w2:p1']);
});

test('private HTTPS accepts only the configured Tailscale user and matching origin', async t => {
  const access={origin:'https://pc.example.ts.net:8447',userLogin:'owner@example.test'};
  const h=await setup(t,undefined,undefined,access);
  const proxyHeaders={Host:'pc.example.ts.net:8447','X-Forwarded-For':'100.64.0.2','Tailscale-User-Login':access.userLogin};
  const raw=(path,headers={},body)=>new Promise((resolve,reject)=>{
    const request=httpRequest(h.base+path,{method:body?'POST':'GET',headers},response=>{
      let text='';response.setEncoding('utf8');response.on('data',part=>text+=part);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,text}));
    }).on('error',reject);request.end(body?JSON.stringify(body):undefined);
  });
  for(const headers of [
    {Host:proxyHeaders.Host},
    {...proxyHeaders,'Tailscale-User-Login':'someone-else@example.test'},
    {...proxyHeaders,'Tailscale-User-Login':''},
    {...proxyHeaders,Host:new URL(h.base).host},
    {...proxyHeaders,Host:'unrecognized.example.test'},
  ])assert.equal((await raw('/',headers)).status,403);
  const page=await raw('/',proxyHeaders);assert.equal(page.status,200);
  const navigationHeaders={...proxyHeaders,'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
  assert.equal((await raw('/',navigationHeaders)).status,200);
  assert.equal((await raw('/api/state',navigationHeaders)).status,403);
  assert.equal((await raw('/',{...navigationHeaders,'Sec-Fetch-Dest':'iframe'})).status,403);
  const cookie=page.headers['set-cookie'][0];assert.match(cookie,/; Secure/);
  assert.equal((await raw('/api/state',proxyHeaders)).status,401);
  const sessionHeaders={...proxyHeaders,Cookie:cookie.split(';')[0]};
  const state=await raw('/api/state',sessionHeaders);assert.equal(state.status,200);
  const {bridgeId}=JSON.parse(state.text);
  const body=h.action({bridgeId});
  const inputHeaders={...sessionHeaders,Origin:access.origin,'X-Herdr-Bridge':bridgeId,'Content-Type':'application/json'};
  assert.equal((await raw('/api/input',{...inputHeaders,Origin:h.base},body)).status,403);
  assert.equal((await raw('/api/input',inputHeaders,body)).status,200);
  assert.equal((await raw('/api/input',inputHeaders,body)).status,200);
  assert.equal(h.writes().length,1);
});

test('wrong process identity and out-of-workspace targets receive no input', async t => {
  const h = await setup(t);
  assert.equal((await h.post(h.action({ terminalId: 'replaced-process' }))).status, 409);
  h.state.panes.push({ pane_id: 'w2:p2', terminal_id: 'term2', workspace_id: 'w2' });
  assert.equal((await h.post(h.action({ paneId: 'w2:p2', terminalId: 'term2' }))).status, 404);
  assert.equal(h.writes().length, 0);
});

test('repeated frame/reconnect reads retain source ANSI, geometry and perform no mutations', async t => {
  const h = await setup(t);
  for (let n = 0; n < 3; n++) {
    const frame = await (await h.request('/api/frame?pane=w1%3Ap1')).json();
    assert.equal(frame.cols, 80); assert.equal(frame.rows, 23);
    assert.equal(frame.read.text, '\x1b[31mhello 🧠\x1b[0m');
    assert.equal(frame.pane.terminal_id, 'term1');
    await h.request('/api/state');
  }
  assert.equal(h.writes().length, 0);
  assert.ok(h.calls.every(c => ['session.snapshot', 'pane.read'].includes(c.method)));
});

test('focused history includes earlier answers while controls and overview use the visible screen', async t=>{
  const history=Array.from({length:1200},(_,i)=>'Line '+i).join('\n')+'\nThe complete final answer';
  const h=await setup(t,(method,params)=>method==='pane.read'?{read:{text:params.source==='recent'?history:'Current screen',truncated:false}}:undefined);
  const normal=await(await h.request('/api/frame?pane=w1%3Ap1')).json();
  assert.equal(normal.history,undefined);
  const frame=await(await h.request('/api/frame?pane=w1%3Ap1&history=2000')).json();
  assert.equal(frame.read.text,'Current screen');assert.equal(frame.history.text,history);
  assert.ok(h.calls.some(c=>c.method==='pane.read'&&c.params.source==='recent'&&c.params.lines===2000));
  for(const suffix of ['-1','1.5','10001','NaN'])assert.equal((await h.request('/api/frame?pane=w1%3Ap1&history='+suffix)).status,400);
  assert.equal((await h.request('/api/frame?pane=foreign&history=1000')).status,404);
  assert.equal(h.writes().length,0);
});

test('attachments preserve file bytes and only a matching terminal can send the issued file reference', async t=>{
  const directory=await mkdtemp(join(tmpdir(),'herdr-attachment-test-'));
  t.after(async()=>{for(const name of await readdir(directory))await unlink(join(directory,name));await rmdir(directory);});
  const h=await setup(t,undefined,undefined,undefined,undefined,directory);
  const upload=(name,body,headers={})=>h.request('/api/attachments',{method:'POST',headers:{Origin:h.base,'Content-Type':'application/octet-stream','X-Herdr-Bridge':h.action().bridgeId,'X-Herdr-Pane':'w1:p1','X-Herdr-Terminal':'term1','X-File-Name':encodeURIComponent(name),...headers},body});
  assert.equal((await upload('../escape.txt','no')).status,400);
  assert.equal((await upload('bad\nname.txt','no')).status,400);
  assert.equal((await upload('file.txt','no',{Origin:'https://foreign.invalid'})).status,403);
  assert.equal((await upload('file.txt','no',{'X-Herdr-Terminal':'replaced'})).status,409);
  assert.equal((await upload('large.bin',Buffer.alloc(20*1024*1024+1))).status,413);
  assert.equal((await readdir(directory)).length,0);
  const bytes=Buffer.from([0,255,1,10,128,240]), response=await upload('phone photo.png',bytes);
  assert.equal(response.status,201);const file=await response.json();
  const stored=join(directory,file.id+'.png');assert.deepEqual(await readFile(stored),bytes);
  assert.equal((await h.request('/.local/uploads/'+file.id+'.png')).status,404);
  const send=h.action({kind:'send',text:'',attachments:[file.id]});
  const replies=await Promise.all([h.post(send),h.post(send)]);assert.ok(replies.every(r=>r.status===200));
  assert.equal(h.writes().filter(c=>c.method==='pane.send_text').length,1);
  assert.ok(h.writes()[0].params.text.includes(stored));assert.ok(h.writes()[0].params.text.includes('phone photo.png'));
  assert.deepEqual(h.writes()[1].params.keys,['enter']);
  h.state.panes.push({pane_id:'w1:p2',workspace_id:'w1',terminal_id:'term2'});
  assert.equal((await h.post(h.action({paneId:'w1:p2',terminalId:'term2',attachments:[file.id]}))).status,409);
  assert.equal((await h.post(h.action({attachments:['unknown-upload']}))).status,410);
  for(const attachments of [false,{},[file.id,file.id],Array(5).fill('123456789')])assert.equal((await h.post(h.action({attachments}))).status,400);
  assert.equal(h.writes().length,2);
});

test('lost acknowledgement is retained and never automatically resubmitted', async t => {
  let delivered = 0;
  const h = await setup(t, method => {
    if (method === 'pane.send_text') { delivered++; throw new Error('Reply lost after delivery'); }
  });
  const body = h.action();
  assert.equal((await h.post(body)).status, 502);
  assert.equal((await h.post(body)).status, 502);
  assert.equal(delivered, 1);
  assert.equal((await h.post(h.action({ kind: 'key', key: 'esc' }))).status, 200);
});

test('invalid control bytes, arbitrary keys, oversized drafts and old bridge epochs are rejected', async t => {
  const h = await setup(t);
  for (const extra of [{ text: '\x1b]52;clipboard' }, { text: 'x'.repeat(8193) }, { kind: 'key', key: 'shell-command' }, { kind: 'key', key: 'end' }, { kind: 'key', key: 'home' }, { kind: 'shortcut', shortcut: 'shell' }, { kind: 'run' }]) {
    assert.equal((await h.post(h.action(extra))).status, 400);
  }
  assert.equal((await h.post(h.action({ bridgeId: randomUUID() }))).status, 409);
  assert.equal(h.writes().length, 0);
});

test('wallpaper requires the local session and exposes only the configured image', async t => {
  const bytes = Buffer.from([255,216,255,217]); let reads = 0;
  const h = await setup(t, undefined, async (...args) => {
    reads++; assert.deepEqual(args, []);
    return { bytes, type: 'image/jpeg', modifiedAt: '2026-09-04T00:00:00Z' };
  });
  assert.equal((await fetch(h.base + '/api/wallpaper')).status, 401);
  assert.equal(reads, 0);
  const response = await h.request('/api/wallpaper?path=C:/not-the-wallpaper');
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(reads, 1);
  assert.equal(h.writes().length, 0);
});

test('native Codex controls distinguish dim placeholders from colored desktop drafts', () => {
  const pane = { agent: 'codex', agent_status: 'idle' };
  const footer = '\n  gpt-5.6-sol xhigh · D:\\';
  assert.equal(agentControls(pane, '› \x1b[2mImplement {feature}\x1b[0m' + footer).canOpen, true);
  assert.equal(agentControls(pane, '› \x1b[48;2;41;41;41mMy existing draft\x1b[0m' + footer).canOpen, false);
  assert.equal(agentControls(pane, '› \x1b[38;2;20;40;60mColored draft\x1b[0m' + footer).canOpen, false);
  assert.equal(agentControls({...pane,agent_status:'working'},'› '+footer).canOpen, false);
  assert.equal(agentControls({agent:'opencode'},'› '+footer), null);
  assert.equal(agentControls(pane, 'Earlier conversation about plan mode\n› '+footer).mode, null);
});

test('Claude controls read native values, protect drafts and limit shortcuts to that agent', async t => {
  const pane = { agent: 'claude', agent_status: 'idle' };
  let text = '❯ \n─────────\n  [Opus 5] 🧠 medium [──────────] 0.0%\n  ⏵⏵ auto mode on (shift+tab to cycle)';
  const meta = agentControls(pane, text);
  assert.deepEqual([meta.model,meta.reasoning,meta.mode,meta.canOpen], ['Opus 5','medium','Auto',true]);
  assert.equal(agentControls(pane,text.replace('❯ ','❯ Keep my draft')).canOpen,false);
  assert.equal(agentControls({...pane,agent_status:'working'},text).canOpen,false);
  assert.equal(agentControls(pane,'A menu without a composer').canOpen,false);
  const h = await setup(t, method => method === 'pane.read' ? {read:{text}} : undefined);
  Object.assign(h.state.panes[0],pane);
  assert.equal((await h.post(h.action({kind:'shortcut',shortcut:'plan'}))).status,400);
  assert.equal(h.writes().length,0);
  const action = h.action({kind:'shortcut',shortcut:'cycle-mode'});
  assert.equal((await h.post(action)).status,200);
  assert.equal((await h.post(action)).status,200);
  assert.deepEqual(h.writes().map(c=>c.params.keys),[['shift+tab']]);
  text=text.replace('❯ ','❯ existing draft');
  assert.equal((await h.post(h.action({kind:'shortcut',shortcut:'effort'}))).status,409);
  assert.equal(h.writes().length,1);
  assert.equal((await h.post(h.action({kind:'text',text:'literal',shortcut:'cycle-mode'}))).status,200);
  assert.equal(h.writes().at(-1).params.text,'literal');
});

test('native model shortcut protects a draft, then opens the real menu once when empty', async t => {
  let composer = '› Keep this desktop draft';
  const h = await setup(t, method => method === 'pane.read' ? { read: { text: composer + '\n  gpt-5.6-sol xhigh · D:\\' } } : undefined);
  Object.assign(h.state.panes[0], { agent:'codex', agent_status:'idle' });
  assert.equal((await h.post(h.action({kind:'shortcut',shortcut:'model'}))).status,409);
  assert.equal(h.writes().length,0);
  composer = '› \x1b[2mImplement {feature}\x1b[0m';
  const action = h.action({kind:'shortcut',shortcut:'model'});
  assert.equal((await h.post(action)).status,200);
  assert.equal((await h.post(action)).status,200);
  assert.deepEqual(h.writes().map(c=>c.params.text ?? c.params.keys),['/model',['enter']]);
});

test('send separates text and Enter, serializes following keys and never changes layout', async t => {
  const h = await setup(t);
  const send = h.post(h.action({ kind: 'send', text: 'test prompt' }));
  // The HTTP request order is pinned before enqueueing a second browser action.
  for (let n = 0; n < 200 && !h.writes().length; n++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(h.writes().length, 1);
  const key = h.post(h.action({ kind: 'key', key: 'left' }));
  assert.equal((await send).status, 200); assert.equal((await key).status, 200);
  assert.deepEqual(h.writes().map(c => [c.method, c.params.text ?? c.params.keys]), [
    ['pane.send_text', 'test prompt'], ['pane.send_keys', ['enter']], ['pane.send_keys', ['left']],
  ]);
});

test('a process replacement between paste and Enter blocks the Enter', async t => {
  const h = await setup(t, (method, _params, state) => {
    if (method === 'pane.send_text') state.panes[0].terminal_id = 'new-process';
  });
  assert.equal((await h.post(h.action({ kind: 'send' }))).status, 409);
  assert.deepEqual(h.writes().map(c => c.method), ['pane.send_text']);
});

test('named-pipe RPC preserves split Unicode and times out without retrying', async t => {
  const endpoint = process.platform === 'win32' ? '\\\\.\\pipe\\herdr-mobile-test-' + randomUUID() : '/tmp/herdr-mobile-' + randomUUID() + '.sock';
  let count = 0;
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
    let line = ''; socket.on('data', chunk => {
      line += chunk;
      if (!line.includes('\n')) return;
      const request = JSON.parse(line); count++;
      if (request.method === 'silent') return;
      const reply = Buffer.from(JSON.stringify({ id: request.id, result: { text: '🧠 héllo' } }) + '\n');
      const split = reply.indexOf(Buffer.from('🧠')) + 2;
      socket.write(reply.subarray(0, split)); socket.end(reply.subarray(split));
    });
  });
  server.listen(endpoint); await once(server, 'listening');
  t.after(() => { for (const socket of sockets) socket.destroy(); server.close(); });
  assert.deepEqual(await rpc(endpoint, 'ping'), { text: '🧠 héllo' });
  await assert.rejects(rpc(endpoint, 'silent', {}, 80), /timed out/);
  assert.equal(count, 2);
});
