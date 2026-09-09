import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createTeams} from './teams.mjs';
test('one to four independent panes need no Git repo, worktrees, task or orchestrator prompt',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'herdr-independent-'));
 for(const count of [1,2,3,4]){
  const launched=[];let sends=0;
  const api=createTeams({allowed:new Set(['w1']),choices:async()=>[{id:'codex',modes:['default']},{id:'empty',modes:['default']}],snapshot:async()=>({panes:[]}),send:async()=>sends++,launch:async(action,result)=>{launched.push(action);Object.assign(result,{paneId:'pane-'+launched.length,status:'ready'});}});
  const team=await api.start({id:'independent-'+count,bridgeId:'bridge',workspaceId:'w1',cwd,orchestrated:false,members:Array.from({length:count},(_,i)=>({agent:i%2?'codex':'empty'}))},'bridge');
  for(let i=0;i<100&&team.status==='opening';i++)await delay(10);
  assert.equal(team.status,'ready',team.error);assert.equal(launched.length,count);assert.equal(sends,0);assert.equal(team.brief,undefined);
  assert.ok(launched.every(a=>a.cwd===cwd&&a.message===''));assert.ok(team.members.every(m=>m.role.startsWith('Pane ')&&!m.branch));
 }
});
test('teams isolate workers, send one supervisory brief, preserve receipts and never replay interrupted setup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'herdr-team-')),cwd=join(root,'repo');
 const git=(...args)=>execFileSync('git',args,{cwd:root,windowsHide:true,stdio:'pipe'});
 git('init',cwd);git('-C',cwd,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','--allow-empty','-m','Test');
 const panes=[],sent=[],file=join(root,'teams.json');let launches=0;
 const options={file,session:'qa',allowed:new Set(['w1']),choices:async()=>[{id:'codex',name:'Codex',modes:['default'],efforts:[]}],snapshot:async()=>({panes}),send:async(p,text)=>sent.push(text),launch:async(action,result)=>{launches++;Object.assign(result,{paneId:'p'+launches,terminalId:'t'+launches,status:'ready'});panes.push({pane_id:result.paneId,terminal_id:result.terminalId,workspace_id:'w1',agent_status:'idle'});}};
 const api=createTeams(options),body={id:'team-test-123',bridgeId:'bridge',workspaceId:'w1',cwd,branch:'test-team',checkout:'worktree',task:'Review only',members:[{agent:'codex'},{agent:'codex'}]};
 const team=await api.start(body,'bridge');assert.equal(await api.start(body,'bridge'),team);
 for(let i=0;i<100&&['opening','sending'].includes(team.status);i++)await delay(30);
 assert.equal(team.status,'ready',team.error);assert.equal(launches,2);assert.equal(sent.length,1);assert.notEqual(team.members[0].cwd,team.members[1].cwd);
 assert.match(sent[0],/ASK before integrating/);assert.match(sent[0],/Never answer an approval/);assert.match(sent[0],/You do not implement code/);
 await assert.rejects(api.start({...body,task:'changed'},'bridge'),/conflicts/);
 await assert.rejects(api.start({...body,id:'second-team',members:[...body.members,...body.members,{agent:'codex'}]},'bridge'),/three workers/);
 await delay(50);await writeFile(file,JSON.stringify([{...team,status:'sending'}]));const restored=createTeams(options);assert.equal((await restored.list())[0].status,'interrupted');assert.equal(launches,2);
});
