import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const binary=process.env.SHEP_SMOKE_BINARY||createRequire(import.meta.url)('electron');
const home=resolve('.local','smoke-'+Date.now());await mkdir(home,{recursive:true});
const args=process.env.SHEP_SMOKE_BINARY?['--smoke-test']:['.','--smoke-test'];
const child=spawn(binary,args,{env:{...process.env,SHEP_TEST_HOME:home},stdio:'inherit'});
await new Promise((done,fail)=>{
  const timer=setTimeout(()=>{child.kill();fail(Error('Setup window smoke test timed out'));},60000);
  child.once('error',e=>{clearTimeout(timer);fail(e);});
  child.once('exit',code=>{clearTimeout(timer);code===0?done():fail(Error('Setup window failed: '+code));});
});
const result=JSON.parse(await readFile(resolve(home,'smoke.json'),'utf8'));
assert.equal(result.loaded,true);assert.match(result.title,/Shep/);assert.ok(Number(result.node.split('.')[0])>=24);
console.log('Setup window opened:',JSON.stringify(result));
