import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,readFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
let packaged=process.env.SHEP_SMOKE_BINARY;
if(process.argv.includes('--packaged')){
  const candidates=process.platform==='win32'?['dist/win-unpacked/Shep.exe']:process.platform==='darwin'?['dist/mac-arm64/Shep.app/Contents/MacOS/Shep','dist/mac/Shep.app/Contents/MacOS/Shep']:['dist/linux-unpacked/shep'];
  for(const candidate of candidates)if(await access(candidate).then(()=>true,()=>false)){packaged=resolve(candidate);break;}
  assert.ok(packaged,'Packaged executable is missing');
}
const binary=packaged||createRequire(import.meta.url)('electron');
const home=resolve('.local','smoke-'+Date.now());await mkdir(home,{recursive:true});
const args=packaged?['--smoke-test']:['.','--smoke-test'];
const child=spawn(binary,args,{env:{...process.env,SHEP_TEST_HOME:home},stdio:'inherit'});
await new Promise((done,fail)=>{
  const timer=setTimeout(()=>{child.kill();fail(Error('Setup window smoke test timed out'));},60000);
  child.once('error',e=>{clearTimeout(timer);fail(e);});
  child.once('exit',code=>{clearTimeout(timer);code===0?done():fail(Error('Setup window failed: '+code));});
});
const result=JSON.parse(await readFile(resolve(home,'smoke.json'),'utf8'));
assert.equal(result.loaded,true);assert.match(result.title,/Shep/);assert.ok(Number(result.node.split('.')[0])>=24);
console.log('Setup window opened:',JSON.stringify(result));
