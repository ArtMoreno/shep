import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
const root='.local/site-dist';
const expected=['.nojekyll','index.html','style.css','notices.txt','assets/shep-logo.png','assets/chat.png','assets/sessions.png','assets/controls.png','assets/attention.png','assets/video-poster.jpg','assets/shep-demo.mp4','assets/demo.vtt'].sort();
async function files(folder,prefix=''){const result=[];for(const entry of await readdir(folder,{withFileTypes:true})){const name=prefix+entry.name;result.push(...(entry.isDirectory()?await files(join(folder,entry.name),name+'/'):[name]));}return result;}
assert.deepEqual((await files(root)).sort(),expected,'Website output contains unexpected files');
const html=await readFile(join(root,'index.html'),'utf8');
assert.ok(!/<script\b|<iframe\b|<form\b/i.test(html),'Static page should not include scripts, embeds, or forms');
for(const [,url] of html.matchAll(/(?:src|poster|href)="([^"]+)"/g)){
  if(url.startsWith('#')){if(url.length>1)assert.ok(html.includes(`id="${url.slice(1)}"`),`Missing anchor: ${url}`);}
  else if(!url.startsWith('https://'))assert.ok(expected.includes(url),`Unlisted local asset: ${url}`);
}
console.log('Website allowlist, static-content policy, and asset links passed.');
