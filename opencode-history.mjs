import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {homedir} from 'node:os';

// Select only the verified pane's session; never guess by folder or recency.
export function opencodeHistory(pane,lines,path=join(process.env.XDG_DATA_HOME||join(homedir(),'.local','share'),'opencode','opencode.db')) {
  const id=pane.agent_session?.value;
  if(pane.agent!=='opencode'||pane.agent_session?.kind!=='id'||!/^ses_[a-zA-Z0-9]+$/.test(id||''))return null;
  let db;
  try {
    db=new DatabaseSync(path,{readOnly:true});
    const rows=db.prepare(`SELECT m.id, json_extract(m.data,'$.role') role,
      json_extract(p.data,'$.text') text FROM message m JOIN part p
      ON p.message_id=m.id AND p.session_id=m.session_id
      WHERE m.session_id=? AND json_extract(m.data,'$.role') IN ('user','assistant')
      AND json_extract(p.data,'$.type')='text'
      AND COALESCE(json_extract(p.data,'$.synthetic'),0)=0
      AND COALESCE(json_extract(p.data,'$.ignored'),0)=0
      ORDER BY m.time_created,m.id,p.time_created,p.id`).all(id);
    const messages=new Map();
    for(const row of rows) {
      if(typeof row.text!=='string'||!row.text.trim())continue;
      const text=row.text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'');
      messages.set(row.id,messages.has(row.id)?messages.get(row.id)+'\n'+text:(row.role==='user'?'❯ ':'● ')+text);
    }
    if(!messages.size)return null;
    const text=[...messages.values()].join('\n\n').split('\n');
    return {text:text.slice(-lines).join('\n'),truncated:text.length>lines,source:'session-transcript'};
  }catch{return null;}finally{db?.close();}
}
