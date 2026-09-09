import {access,readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const candidates=process.platform==='win32'?['dist/win-unpacked/resources/app']:process.platform==='darwin'?['dist/mac-arm64/Shep.app/Contents/Resources/app','dist/mac/Shep.app/Contents/Resources/app']:['dist/linux-unpacked/resources/app'];
let root;for(const path of candidates)if(await access(path).then(()=>true,()=>false)){root=resolve(path);break;}
assert.ok(root,'Packaged application missing');
for(const name of ['claude.svg','codex.svg','grok.svg','agy.svg','openrouter.svg','opencode.svg','omp.svg','hermes.png'])assert.ok((await readFile(join(root,'public/brands',name))).length>100,name);
for(const name of await readdir(root))assert.ok(!['.local','.git','references','evidence','dist'].includes(name)&&!name.startsWith('.env')&&!/\.(pem|key|log)$/.test(name),'Private build input: '+name);
assert.match(await readFile(join(root,'LICENSE'),'utf8'),/Copyright \(c\) 2026 ArtMoreno/);
console.log('Packaged provider icons present; local/private build folders excluded.');
