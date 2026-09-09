import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {opencodeHistory} from './opencode-history.mjs';

test('OpenCode history is ordered, session-scoped, text-only and read-only',async()=>{
 const root=await mkdtemp(join(tmpdir(),'opencode-history-')),path=join(root,'history.db');
 try {
  const db=new DatabaseSync(path);
  db.exec('CREATE TABLE message(id TEXT,session_id TEXT,time_created INTEGER,data TEXT); CREATE TABLE part(id TEXT,message_id TEXT,session_id TEXT,time_created INTEGER,data TEXT)');
  for(const [id,session,time,role,text,type,extra] of [
   ['b','ses_test',2,'assistant','Complete answer','text',{}],
   ['a','ses_test',1,'user','Earlier question','text',{}],
   ['c','ses_other',0,'user','Other session','text',{}],
   ['d','ses_test',3,'assistant','Private reasoning','reasoning',{}],
   ['e','ses_test',4,'user','Internal context','text',{synthetic:true}],
  ]) {
   db.prepare('INSERT INTO message VALUES(?,?,?,?)').run(id,session,time,JSON.stringify({role}));
   db.prepare('INSERT INTO part VALUES(?,?,?,?,?)').run(id,id,session,time,JSON.stringify({type,text,...extra}));
  }
  const pane={agent:'opencode',agent_session:{kind:'id',value:'ses_test'}};
  assert.equal(opencodeHistory(pane,1000,path).text,'❯ Earlier question\n\n● Complete answer');
  assert.equal(opencodeHistory(pane,1,path).truncated,true);
  assert.equal(opencodeHistory(pane,1,path).text,'● Complete answer');
  assert.equal(opencodeHistory({...pane,agent_session:{kind:'id',value:'ses_missing'}},100,path),null);
  assert.equal(opencodeHistory({...pane,agent_session:{kind:'id',value:"ses_' OR 1=1"}},100,path),null);
  assert.equal(db.prepare('SELECT count(*) n FROM message').get().n,5);
  db.close();
 }finally{await rm(root,{recursive:true,force:true});}
});
