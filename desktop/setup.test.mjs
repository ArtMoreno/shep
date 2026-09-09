import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pairing} from './pairing.mjs';
import {identity, checkRoute, connectPhone} from './setup.mjs';
import {createBridge} from '../server.mjs';
import {request} from 'node:http';

const status={BackendState:'Running',Self:{DNSName:'demo.example.ts.net.',UserID:1},User:{1:{LoginName:'owner@example.test'}}};
test('Tailscale identity and route checks reject offline, tagged, public and occupied routes',()=>{
  assert.deepEqual(identity(status),{origin:'https://demo.example.ts.net:8443',userLogin:'owner@example.test'});
  assert.throws(()=>identity({...status,BackendState:'NeedsLogin'}));
  assert.throws(()=>identity({...status,User:{}}));
  const host='demo.example.ts.net:8443',origin='https://'+host;
  assert.equal(checkRoute({},origin,4317),'http://127.0.0.1:4317');
  assert.throws(()=>checkRoute({AllowFunnel:{[host]:true}},origin,4317));
  assert.throws(()=>checkRoute({TCP:{8443:{TCPForward:'somewhere'}}},origin,4317));
  assert.throws(()=>checkRoute({Web:{[host]:{Handlers:{'/':{Proxy:'http://127.0.0.1:9999'}}}}},origin,4317));
});
test('phone setup verifies its private route and does not overwrite another application',async()=>{
  const calls=[];let configured=false;
  const command=async(bin,args)=>{calls.push(args);if(args[0]==='status')return JSON.stringify(status);if(args[1]==='status')return JSON.stringify(configured?{Web:{'demo.example.ts.net:8443':{Handlers:{'/':{Proxy:'http://127.0.0.1:4317'}}}}}:{});configured=true;return '';};
  assert.equal((await connectPhone(4317,command,'tailscale')).userLogin,'owner@example.test');
  assert.deepEqual(calls[2],['serve','--bg','--https=8443','http://127.0.0.1:4317']);
  let mutations=0;
  await assert.rejects(connectPhone(4317,async(_,args)=>{if(args[0]==='status')return JSON.stringify(status);if(args[1]==='status')return JSON.stringify({TCP:{8443:{TCPForward:'other'}}});mutations++;return '';},'tailscale'));
  assert.equal(mutations,0);
});
test('one-time pairing persists hashed devices, expires, and revokes immediately at HTTP boundary',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'shep-pair-'));
  let clock=1000;const file=join(dir,'devices.json');const pairs=await pairing(file,()=>clock);
  const server=createBridge({endpoint:'fake',workspaceId:'w1',session:'demo',access:{origin:'https://demo.example.ts.net:8443',userLogin:'owner@example.test'},authorize:pairs.authorize},async()=>({snapshot:{workspaces:[],panes:[],layouts:[]}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={host:'demo.example.ts.net:8443','tailscale-user-login':'owner@example.test'};
  const get=(path,cookie)=>new Promise((resolve,reject)=>{const req=request(base+path,{headers:{...headers,...(cookie?{cookie}:{})}},res=>{res.resume();resolve({status:res.statusCode,headers:{get:name=>[res.headers[name]].flat().join(';')}});});req.on('error',reject);req.end();});
  try{
    assert.equal((await get('/')).status,403);
    assert.equal((await get('/api/state')).status,403);
    const expired=pairs.invite();clock+=300001;
    assert.equal((await get('/pair?code='+expired)).status,403);
    const code=pairs.invite();const response=await get('/pair?code='+code);
    assert.equal(response.status,303);
    const cookie=response.headers.get('set-cookie').split(';')[0];
    assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
    assert.equal((await get('/pair?code='+code)).status,403);
    assert.equal((await get('/',cookie)).status,200);
    assert.ok(!(await readFile(file,'utf8')).includes(cookie.split('=')[1]));
    const restored=await pairing(file);assert.equal(restored.list().length,1);
    await pairs.revoke(pairs.list()[0].id);
    assert.equal((await get('/',cookie)).status,403);
    assert.equal((await get('/api/state',cookie)).status,403);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
