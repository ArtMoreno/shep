import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { quotaSnapshot } from './quota.mjs';
import { createBridge } from './server.mjs';

test('packaged QuotaDeck serves every provider icon from bundled public assets', async t=>{
  const server=createBridge({endpoint:'unused',workspaceId:'demo'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  for(const name of ['claude.svg','codex.svg','grok.svg','agy.svg','openrouter.svg','opencode.svg','omp.svg','hermes.png']){
    const response=await fetch(`http://127.0.0.1:${server.address().port}/brands/${name}`);
    assert.equal(response.status,200,name);
    assert.match(response.headers.get('content-type'),/^image\//,name);
    assert.ok((await response.arrayBuffer()).byteLength>100,name);
  }
});

test('QuotaDeck preserves display choices, zero versus unavailable, stale data and private-field boundaries', async t=>{
  const root=await mkdtemp(join(tmpdir(),'herdr-mobile-quota-'));
  t.after(async()=>{for(const file of await readdir(root))await unlink(join(root,file));await rmdir(root);});
  const files={
    'dashboard-providers.json':{version:2,providers:[
      {provider:'grok',show:true}, {provider:'claude',show:false},
      {provider:'hermes',show:true,fields:['top-up-amount']},
      {provider:'opencode-go',show:true}, {provider:'../../secret',show:true}, {provider:'grok',show:true}
    ]},
    'grok-cli-billing.json':{provider:'grok',fetched_at_unix:100,account_id:'SECRET',session_models:{SECRET:'private'},windows:[{kind:'weekly',remaining_percent:0,resets_at:1200}]},
    'hermes-portal.json':{provider:'hermes',fetched_at_unix:995,windows:[{kind:'weekly',source_label:'top-up $2.12',remaining_percent:100,resets_at:null}]},
  };
  for(const [name,value]of Object.entries(files))await writeFile(join(root,name),JSON.stringify(value));
  const result=await quotaSnapshot(root,1000);
  assert.deepEqual(result.providers.map(p=>p.id),['grok','hermes','opencode-go']);
  assert.equal(result.providers[0].windows[0].remaining,0);
  assert.equal(result.providers[0].stale,true);
  assert.equal(result.providers[1].windows[0].amount,'$2.12');
  assert.equal(result.providers[1].windows[0].remaining,null);
  assert.equal(result.providers[1].icon,'/brands/hermes.png');
  assert.equal(result.providers[2].icon,'/brands/opencode.svg');
  assert.deepEqual(result.providers[2].windows,[]);
  assert.equal(result.providers[2].fetchedAt,null);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
  for(const [name,value]of Object.entries(files))assert.deepEqual(JSON.parse(await readFile(join(root,name),'utf8')),value);
  await writeFile(join(root,'opencode-go.opencode-store.json'),JSON.stringify({provider:'opencodego',fetched_at_unix:999,windows:[{kind:'five_hour',used_percent:8,resets_at:null}]}));
  assert.equal((await quotaSnapshot(root,1000)).providers[2].windows[0].remaining,92);
});
