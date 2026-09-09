import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('hardware keyboard distinguishes app chords, native keys and composition',async()=>{
  const source=await readFile(new URL('./public/extras.js',import.meta.url),'utf8');
  const context=vm.createContext({});vm.runInContext(source.slice(0,source.indexOf('(() =>')),context);
  const run=(fn,event,...args)=>context[fn](event,...args);
  assert.equal(run('shortcutKey',{key:'!',code:'Digit1'}),'1');
  assert.equal(run('shortcutMatches',{key:'N',ctrlKey:true,shiftKey:true},'control'),true);
  assert.equal(run('shortcutMatches',{key:'n',ctrlKey:true},'control'),false);
  assert.equal(run('shortcutMatches',{key:'N',ctrlKey:true,shiftKey:true,isComposing:true},'control'),false);
  assert.equal(run('shortcutMatches',{key:'n',ctrlKey:true,altKey:true,getModifierState:()=>true},'option'),false);
  assert.equal(run('terminalKeyboardKey',{key:'c',ctrlKey:true}),'ctrl+c');
  assert.equal(run('terminalKeyboardKey',{key:'c',metaKey:true}),undefined);
  assert.equal(run('terminalKeyboardKey',{key:'Tab'}),'tab');
  assert.equal(run('terminalKeyboardKey',{key:'Tab',shiftKey:true}),undefined);
  assert.equal(run('terminalKeyboardKey',{key:'Enter',isComposing:true}),undefined);
});

test('message view uses real text, joins wrapped prompts and preserves code as output',async()=>{
  const source=await readFile(new URL('./public/extras.js',import.meta.url),'utf8');
  const rows=[['Startup',false],['❯ Review ',false],['my code',true],['',false],['● Found the issue.',false],['```text',false],['> not a new prompt',false],['```',false],['',false]];
  const context=vm.createContext({buffer:{length:rows.length,getLine:y=>rows[y]&&{isWrapped:rows[y][1],translateToString:()=>rows[y][0]}}});
  vm.runInContext(source.slice(0,source.indexOf('(() =>')),context);
  const result=JSON.parse(vm.runInContext('JSON.stringify(messageBlocks(buffer))',context));
  assert.deepEqual(result.map(b=>b.role),['output','user','reply']);
  assert.equal(result[1].text,'Review my code');assert.equal(result[1].row,1);
  assert.match(result[2].text,/> not a new prompt/);assert.ok(!result[2].text.endsWith('\n'));
});

test('Ghostty font changes restore other themes and cannot land after switching away',async()=>{
  const source=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
  const original='"Herdr Mono", "Cascadia Mono", monospace';let finish;
  const terminal={options:{fontFamily:original,theme:{foreground:'#eeeef5'}}};
  const context=vm.createContext({settings:{theme:'ghostty'},terminalOptions:{fontFamily:original,theme:{}},terminal,focusedStatus:undefined,previews:new Map(),ghosttyFontData:'',atob:()=>'',FontFace:class{load(){return new Promise(resolve=>finish=resolve);}},document:{fonts:{add(){}}},requestAnimationFrame:fn=>fn(),fit(){},redraw(){},byId:()=>({})});
  vm.runInContext(source.slice(source.indexOf('let ghosttyFont;'),source.indexOf('let wallpaperRequest=')),context);
  const pending=vm.runInContext('applyThemeFont()',context);
  vm.runInContext('settings.theme="og";applyThemeFont()',context);finish({});await pending;
  assert.equal(terminal.options.fontFamily,original);
  await vm.runInContext('settings.theme="ghostty";applyThemeFont()',context);
  assert.equal(terminal.options.fontFamily,'"Ghostty Mono", monospace');
  await vm.runInContext('settings.theme="matrix";applyThemeFont()',context);
  assert.equal(terminal.options.fontFamily,original);assert.equal(terminal.options.theme.foreground,'#eeeef5');
});

test('theme selection preserves OG settings, validates saved choices and ignores stale PC wallpaper loads',async()=>{
  const source=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
  const properties={},nodes={},images=[];
  const context=vm.createContext({localStorage:{getItem:()=>JSON.stringify({opacity:23,tint:42,theme:'not-a-theme',wallpaper:'https://untrusted.invalid'})},
    document:{documentElement:{style:{setProperty:(k,v)=>properties[k]=v,removeProperty:k=>delete properties[k]}}},
    Image:class{constructor(){images.push(this);}},byId:id=>nodes[id]??=( {})});
  vm.runInContext(source.slice(source.indexOf('const themes ='),source.indexOf('let terminal, frame')),context);
  assert.equal(vm.runInContext('themes.length',context),23);
  assert.equal(vm.runInContext('settings.theme',context),'og');
  assert.equal(vm.runInContext('settings.wallpaper',context),'pc');
  assert.equal(vm.runInContext('settings.opacity',context),23);
  assert.equal(vm.runInContext('settings.tint',context),42);
  assert.equal(vm.runInContext('new Set(themes.slice(1).map(themeWallpaper)).size',context),22);
  for(const art of vm.runInContext('themes.slice(1).map(themeWallpaper)',context)){
    const svg=decodeURIComponent(art.slice('url("data:image/svg+xml,'.length,-2));
    assert.ok(svg.startsWith('<svg'));assert.ok(svg.endsWith('</svg>'));assert.ok(!svg.includes('undefined'));
    assert.ok(!/<(?:script|image|foreignObject)\b/.test(svg));
  }
  vm.runInContext(source.slice(source.indexOf('let wallpaperRequest='),source.indexOf('function fit(')),context);
  vm.runInContext('wallpaper();settings.wallpaper="aurora";wallpaper()',context);
  const aurora=properties['--wallpaper'];images[0].onload();assert.equal(properties['--wallpaper'],aurora);
  vm.runInContext('settings.wallpaper="none";wallpaper()',context);assert.equal(properties['--wallpaper'],'none');
  vm.runInContext('settings.wallpaper="pc";wallpaper()',context);images[1].onload();assert.match(properties['--wallpaper'],/api\/wallpaper/);
});

test('search retains wrapped spaces, row anchors and Unicode; copy preserves complete response blocks',async()=>{
  const source=await readFile(new URL('./public/extras.js',import.meta.url),'utf8');
  const context=vm.createContext({});vm.runInContext(source.slice(0,source.indexOf('(() =>')),context);
  const rows=[['Question',false],['● First ',false],['answer 🧠',true],['❯ Next',false],['● Second answer',false]];
  context.buffer={length:rows.length,getLine:y=>rows[y]&&{isWrapped:rows[y][1],translateToString:trim=>trim?rows[y][0].trimEnd():rows[y][0]}};
  assert.equal(vm.runInContext("historyMatches(buffer,'first answer 🧠')[0].row",context),1);
  assert.equal(vm.runInContext("historyMatches(buffer,'  ').length",context),0);
  assert.equal(vm.runInContext("responseChoices('❯ Question\\n● First answer\\ncontinued\\n❯ Next\\n● Second answer')[0]",context),'First answer\ncontinued');
});

test('offline worker caches only a generic page; failed navigation falls back without bypassing authentication',async()=>{
  const handlers={},cached=[];let fail=false,status=200;
  const context=vm.createContext({URL,Response,self:{location:{origin:'http://test'},addEventListener:(name,fn)=>(handlers[name]??=[]).push(fn),skipWaiting(){}},caches:{open:async()=>({add:async path=>cached.push(path)}),match:async()=>new Response('offline')},fetch:async()=>{if(fail)throw Error('offline');return new Response('network',{status});}});
  vm.runInContext(await readFile(new URL('./public/sw.js',import.meta.url),'utf8'),context);
  const work=[];for(const fn of handlers.install)fn({waitUntil:p=>work.push(p)});await Promise.all(work);
  assert.deepEqual(cached,['/offline.html']);
  const navigate=()=>{let reply;handlers.fetch[0]({request:{mode:'navigate',url:'http://test/'},respondWith:p=>reply=p});return reply;};
  status=401;assert.equal((await navigate()).status,401);
  status=503;assert.equal(await(await navigate()).text(),'offline');
  fail=true;assert.equal(await(await navigate()).text(),'offline');
  let intercepted=false;handlers.fetch[0]({request:{mode:'cors',url:'http://test/api/history'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
});

test('camera targets its original pane and dictation only appends a reviewed draft for the same terminal',async()=>{
  const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',dataset:{},handlers:{},getContext:()=>({clearRect(){},fillRect(){}}),addEventListener(type,fn){this.handlers[type]=fn;},replaceChildren(){},setAttribute(){},dispatchEvent(){},querySelector(){return get('span');},click(){this.clicked=true;}});return elements.get(id);};
  let speech,uploads=0,sends=0;
  class Speech {constructor(){speech=this;}start(){this.onstart?.();}stop(){this.onend?.();}abort(){this.aborted=true;this.onend?.();}}
  const draft=get('draft');draft.value='Existing';
  const context=vm.createContext({machineId:'local',setTimeout:()=>1,clearTimeout(){},setInterval:()=>2,clearInterval(){},cancelAnimationFrame(){},document:{createElement:()=>get('button'),addEventListener(){}},window:{SpeechRecognition:Speech,addEventListener(){}},navigator:{language:'en'},localStorage:{getItem:()=>null,setItem(){}},byId:get,state:{panes:[]},qol:{unread:()=>false},frame:{pane:{terminal_id:'one',pane_id:'p1'}},connected:true,busy:false,attachmentTarget:undefined,pickedAttachments:()=>uploads++,draft,announce(){},dismissKeyboard(){},dialog(){},input:()=>sends++,Event:class{}});
  vm.runInContext(await readFile(new URL('./public/extras.js',import.meta.url),'utf8'),context);
  vm.runInContext(await readFile(new URL('./public/voice.js',import.meta.url),'utf8'),context);
  get('camera').handlers.click();assert.equal(context.attachmentTarget.terminal_id,'one');assert.equal(get('camera-picker').clicked,true);
  get('camera-picker').handlers.change();assert.equal(uploads,1);
  get('dictate').handlers.click();const result=[{transcript:'spoken words'}];result.isFinal=true;
  speech.onresult({results:[result]});assert.equal(draft.value,'Existing');assert.equal(get('voice-text').textContent,'spoken words');assert.equal(get('voice-panel').hidden,false);
  get('voice-stop').handlers.click();assert.equal(draft.value,'Existing spoken words');assert.equal(sends,0);
  get('dictate').handlers.click();speech.onresult({results:[result]});const cancelled=speech;get('voice-cancel').handlers.click();cancelled.onresult({results:[result]});assert.equal(draft.value,'Existing spoken words');assert.equal(cancelled.aborted,true);assert.equal(get('voice-panel').hidden,true);
  get('dictate').handlers.click();
  context.frame={pane:{terminal_id:'two'}};speech.onresult({results:[result]});assert.equal(draft.value,'Existing spoken words');
  context.extras.leaving();assert.equal(get('dictate').textContent,'🎙');
  get('dictate').handlers.click();speech.onerror({error:'not-allowed'});assert.match(get('voice-text').textContent,/permission was denied/);assert.equal(get('voice-panel').dataset.active,'false');
  let resolveMic,tracksStopped=0;context.navigator.mediaDevices={getUserMedia:()=>new Promise(resolve=>resolveMic=resolve)};context.window.AudioContext=class{};
  get('dictate').handlers.click();get('voice-cancel').handlers.click();resolveMic({getTracks:()=>[{stop:()=>tracksStopped++}]});await new Promise(resolve=>setImmediate(resolve));assert.equal(tracksStopped,1);
});

test('Heeler web adaptations validate snippets, isolate links from control payloads, and find prompt rows',async()=>{
  const source=await readFile(new URL('./public/extras.js',import.meta.url),'utf8');
  const context=vm.createContext({URL});vm.runInContext(source.slice(0,source.indexOf('(() => {')),context);
  assert.equal(vm.runInContext("makeSnippet(' name ','first\\r\\nsecond\\rthird','id').body",context),'first\nsecond\nthird');
  assert.throws(()=>vm.runInContext("makeSnippet('', '\\x1b[31m', 'id')",context),/control/);
  assert.throws(()=>vm.runInContext("makeSnippet('', ' '.repeat(10), 'id')",context),/Write/);
  assert.throws(()=>vm.runInContext("makeSnippet('', 'x'.repeat(4001), 'id')",context),/4,000/);
  const scan=text=>{context.text=text;return Array.from(vm.runInContext('terminalLinks(text)',context));};
  assert.deepEqual(scan('See https://example.com/a(b). and https://example.com/a(b).'),['https://example.com/a(b)']);
  assert.deepEqual(scan('\x1b]8;;https://real.example/a\x07https://fake.example\x1b]8;;\x07'),['https://real.example/a']);
  assert.deepEqual(scan('\x1b]52;c;https://hidden.example\x07\x1bPhttps://hidden2.example\x1b\\'),[]);
  assert.deepEqual(scan('https://user:pass@example.com https://exa\x1b[32mmple.com/path'),['https://example.com/path']);
  assert.deepEqual(scan('https://a.example/one\ntwo'),['https://a.example/one']);
  assert.equal(scan(Array.from({length:30},(_,i)=>'https://example.com/'+i).join(' ')).length,20);
  context.buffer={length:5,getLine:y=>({isWrapped:y===2,translateToString:()=>['>_ OpenAI Codex','❯ Review this','› wrapped continuation','› Ask Codex to do anything','> Next question'][y]})};
  assert.deepEqual(Array.from(vm.runInContext('messageRows(buffer)',context)),[1,4]);
});
test('computer switching clears pane IDs and scopes the destination host',async()=>{
 const code=await readFile(new URL('public/extras.js',import.meta.url),'utf8');
 const fn=code.slice(code.indexOf('  function switchMachine('),code.indexOf('  async function showMachines('));
 let target;
 const context={URL,location:{href:'http://localhost:4317/?machine=mac#pane=w1:p1',assign:url=>{target=url;}}};
 vm.runInNewContext(fn+';switchMachine("local")',context);
 assert.equal(target.search,'');assert.equal(target.hash,'');
 vm.runInNewContext(fn+';switchMachine("mac-two")',context);
 assert.equal(target.searchParams.get('machine'),'mac-two');assert.equal(target.hash,'');
});
