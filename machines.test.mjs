import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {validMachine,remoteTransport} from './machines.mjs';
import {validateLaunch,agents} from './launch.mjs';
test('remote creation validates folders on the remote host and only offers its installed agents',async()=>{
 const body={id:'remote-test-123',bridgeId:'bridge',workspaceId:'new',agent:'codex',destination:'workspace',cwd:'/Users/test/project',mode:'default'};
 let checked;const action=await validateLaunch(body,agents.filter(a=>a.id==='codex'),async path=>{checked=path;return true;});
 assert.equal(checked,body.cwd);assert.equal(action.agent,'codex');
 await assert.rejects(validateLaunch(body,agents,async()=>false),/selected computer/);
 await assert.rejects(validateLaunch({...body,cwd:'D:\\project'},agents,async()=>true),/absolute/);
 await assert.rejects(validateLaunch({...body,agent:'hermes'},agents.filter(a=>a.id==='codex'),async()=>true),/installed/);
});
test('saved SSH transport validates targets, verifies host keys and never replays lost input',async()=>{
 const machine={id:'a'.repeat(32),target:'test@mac',session:'default',enabled:true};
 for(const change of [{target:'-oProxyCommand=bad'},{target:'mac;bad'},{session:'x;bad'},{enabled:false}])assert.equal(validMachine({...machine,...change}),false);
 let child,starts=0;const writes=[];
 const transport=remoteTransport(machine,(_bin,args)=>{starts++;assert.ok(args.includes('BatchMode=yes'));assert.ok(args.includes('StrictHostKeyChecking=yes'));child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.on('data',data=>writes.push(JSON.parse(data)));child.kill=()=>{};return child;});
 const first=transport.call('', 'session.snapshot');child.stdout.write(JSON.stringify({id:writes[0].id,result:{snapshot:{panes:[]}}})+'\n');assert.deepEqual(await first,{snapshot:{panes:[]}});
 const input=transport.call('','pane.send_keys',{pane_id:'w1:p1',keys:['enter']});child.emit('exit');await assert.rejects(input,/not retried/);assert.equal(writes.length,2);assert.equal(starts,1);
 const next=transport.call('','session.snapshot');assert.equal(starts,2);assert.equal(writes[2].method,'session.snapshot');child.stdout.write(JSON.stringify({id:writes[2].id,result:{}})+'\n');await next;transport.close();
});
