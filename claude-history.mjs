import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';

const cached=new Map();
export function transcriptText(raw,sessionId) {
  const messages=new Map();
  for(const line of raw.split('\n')) {
    let row;try{row=JSON.parse(line);}catch{continue;}
    if(row.sessionId!==sessionId||!['user','assistant'].includes(row.type)||row.isMeta)continue;
    const content=row.message?.content;
    const text=typeof content==='string'?content:Array.isArray(content)?content.filter(b=>b.type==='text').map(b=>b.text).join('\n'):'';
    if(text.trim())messages.set(row.uuid||messages.size,(row.type==='user'?'❯ ':'● ')+text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,''));
  }
  return [...messages.values()].join('\n\n');
}

// Only the session ID reported by the verified live pane can select a transcript.
export async function claudeHistory(pane,lines,root=join(homedir(),'.claude','projects')) {
  const id=pane.agent_session?.value;
  if(pane.agent!=='claude'||pane.agent_session?.kind!=='id'||!/^[-a-f0-9]{36}$/i.test(id||''))return null;
  const key=join(root,id);let entry=cached.get(key);
  if(!entry) {
    let dirs;try{dirs=await readdir(root,{withFileTypes:true});}catch{return null;}
    for(const dir of dirs.filter(d=>d.isDirectory())) {
      const path=join(root,dir.name,id+'.jsonl');
      try{await stat(path);entry={path};break;}catch{}
    }
    if(!entry)return null;
  }
  try {
    const info=await stat(entry.path);
    if(entry.mtime!==info.mtimeMs||entry.size!==info.size) {
      entry.text=transcriptText(await readFile(entry.path,'utf8'),id);
      entry.mtime=info.mtimeMs;entry.size=info.size;cached.set(key,entry);
    }
    if(!entry.text)return null;
    const rows=entry.text.split('\n');
    return {text:rows.slice(-lines).join('\n'),truncated:rows.length>lines,source:'session-transcript'};
  }catch{return null;}
}
