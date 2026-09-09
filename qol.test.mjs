import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {validSubscription,completion,createPushService} from './push.mjs';

test('reading positions, unread status changes, swipe switching and text settings stay isolated',async()=>{
  const source=await readFile(new URL('public/qol.js',import.meta.url),'utf8');
  const animations=[];
  const node=()=>({style:{},events:{},animate(frames,options){animations.push({frames,options});return {cancel(){}};},append(){},replaceChildren(){},setAttribute(){},addEventListener(type,fn){this.events[type]=fn;},value:'',dataset:{}});
  const nodes=new Map(),byId=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
  const panes=[{pane_id:'a',terminal_id:'t1',agent_status:'working'},{pane_id:'b',terminal_id:'t2',agent_status:'idle'}];
  let switched,loaded=0;
  const ctx={byId,localStorage:{getItem:()=>null,setItem(){}},navigator:{},window:{},document:{createElement:node,hidden:false},
    state:{panes},page:'terminal',paneSelect:{value:'a'},frame:{pane:panes[0],history:{truncated:true}},historyLines:2000,viewport:{...node(),scrollTop:100,scrollHeight:1000,clientHeight:300},historyPosition(){},renderSessionTabs(){},connected:true,busy:false,
    loadEarlier:()=>loaded++,selectPane:id=>{switched=id;},dismissKeyboard(){},setTimeout:()=>0,fit(){},redraw(){},announce(){}};
  runInNewContext(source,ctx);
  ctx.qol.setName('t1','Frontend');assert.equal(ctx.qol.name(panes[0]),'Frontend');
  ctx.draft={value:'Unsent words'};ctx.qol.checkpoint();const saved=ctx.qol.resume(panes[0]);assert.equal(saved.draft,'Unsent words');assert.equal(saved.position.top,100);assert.equal(ctx.qol.resume(panes[0]),undefined);
  ctx.qol.checkpoint();assert.equal(ctx.qol.resume({...panes[0],terminal_id:'replacement'}),undefined);
  ctx.qol.leaving();ctx.viewport.scrollTop=700;ctx.historyLines=1000;ctx.qol.entering('a');ctx.qol.rendered();
  assert.equal(ctx.historyLines,2000);assert.equal(ctx.viewport.scrollTop,100);
  ctx.viewport.scrollTop=0;ctx.viewport.events.scroll();assert.equal(loaded,1);
  ctx.page='sessions';ctx.qol.activity(panes);ctx.qol.activity([{...panes[0],agent_status:'done'},panes[1]]);assert.equal(ctx.qol.unread('a'),true);
  ctx.page='terminal';ctx.qol.activity([{...panes[0],agent_status:'done'},panes[1]]);assert.equal(ctx.qol.unread('a'),false);
  const strip=byId('session-switcher');strip.events.pointerdown({button:0,clientX:150,clientY:20});strip.events.pointerup({clientX:40,clientY:25});assert.equal(switched,'b');
  const chat=ctx.viewport;
  const gesture=(dx,dy)=>{switched=undefined;chat.events.pointerdown({button:0,clientX:150,clientY:150});chat.events.pointerup({clientX:150+dx,clientY:150+dy});return switched;};
  assert.equal(gesture(-90,5),'b');
  ctx.paneSelect.value='b';assert.equal(gesture(90,5),'a');
  assert.equal(gesture(-90,5),undefined); // No pane after the last one.
  assert.equal(gesture(5,-150),undefined); // Vertical history scrolling.
  assert.equal(gesture(75,90),undefined); // Mostly vertical diagonal.
  assert.equal(gesture(15,2),undefined); // Tap or small movement.
  ctx.busy=true;assert.equal(gesture(90,5),undefined);ctx.busy=false;
  switched=undefined;chat.events.pointerdown({button:0,clientX:150,clientY:150});chat.events.pointercancel();chat.events.pointerup({clientX:250,clientY:150});assert.equal(switched,undefined);
  ctx.paneSelect.value='a';chat.events.pointerdown({button:0,clientX:150,clientY:150});chat.events.pointermove({clientX:90,clientY:154});assert.equal(byId('terminal').style.transform,'translateX(-54px)');
  const beforeRelease=animations.length;chat.events.pointerup({clientX:60,clientY:154});assert.equal(animations.length,beforeRelease);assert.equal(switched,'b');ctx.frame={pane:panes[1]};ctx.qol.rendered();assert.equal(animations.at(-1).options.duration,120);assert.equal(byId('terminal').style.transform,'');
  assert.equal(byId('terminal-stage').style.transform,undefined); // Scrollback is never animated.
  const beforeMotion=animations.length;ctx.window.matchMedia=()=>({matches:true});gesture(-90,2);assert.equal(animations.length,beforeMotion);
  byId('text-size').value='17';byId('text-size').events.change();assert.equal(ctx.qol.fontSize,17);
});

test('push subscriptions reject local endpoints and completion transitions do not notify on initial state',()=>{
  const sub={endpoint:'https://web.push.apple.com/push/token',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}};
  assert.ok(validSubscription(sub));
  for(const endpoint of ['http://web.push.apple.com/token','https://127.0.0.1/token','https://web.push.apple.com.evil.test/token','https://user:pass@web.push.apple.com/token'])assert.ok(!validSubscription({...sub,endpoint}));
  assert.equal(completion(undefined,'done'),false);assert.equal(completion('idle','done'),false);assert.equal(completion('working','done'),true);assert.equal(completion('working','blocked'),true);assert.equal(completion('done','done'),false);
});

test('push service persists subscriptions, delivers a completion, and removes expired endpoints',async()=>{
  const root=await mkdtemp(join(tmpdir(),'herdr-push-test-'));let status='working',sent=0;
  const service=await createPushService({file:join(root,'push.json'),origin:'https://example.ts.net',snapshot:async()=>[{terminal_id:'t',pane_id:'p',machineId:'mac',machineLabel:'iMac',agent:'claude',agent_status:status}],send:async(_,payload)=>{assert.equal(JSON.parse(payload).paneId,'p');assert.equal(JSON.parse(payload).machineId,'mac');assert.equal(JSON.parse(payload).tag,'mac:t');assert.match(JSON.parse(payload).title,/iMac/);sent++;throw Object.assign(new Error('Expired'),{statusCode:410});}});
  try {
    const sub={endpoint:'https://web.push.apple.com/push/token',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}};
    await service.subscribe(sub);assert.equal(JSON.parse(await readFile(join(root,'push.json'),'utf8')).subscriptions.length,1);
    await new Promise(r=>setTimeout(r,3200));status='done';
    const deadline=Date.now()+5000;while(!sent&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
    assert.equal(sent,1);await new Promise(r=>setTimeout(r,50));assert.equal(JSON.parse(await readFile(join(root,'push.json'),'utf8')).subscriptions.length,0);
  }finally{service.stop();await rm(root,{recursive:true,force:true});}
});
