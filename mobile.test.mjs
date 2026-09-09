import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('public/app.js', import.meta.url), 'utf8');
test('quick add opens only an empty terminal, validates the current target and blocks duplicate clicks',async()=>{
  const launch=await readFile(new URL('public/launch.js',import.meta.url),'utf8');
  const handlers={},nodes={},sent=[];
  const state={bridgeId:'live',workspaceId:'w1',panes:[{pane_id:'w1:p1',terminal_id:'term1',workspace_id:'w1',cwd:'D:\\project'}]};
  const context={opening:false,pending:null,busy:false,bridgeId:'live',state,paneSelect:{value:'w1:p1'},crypto:{randomUUID:()=> 'quick-test-id'},setNote:()=>{},api:async()=>state,submitLaunch:async body=>sent.push(body),byId:id=>nodes[id]??=( {textContent:'D:\\',addEventListener:(_,fn)=>handlers[id]=fn})};
  runInNewContext(launch.slice(launch.indexOf("  for(const [id,destination]"),launch.indexOf("  byId('quick-pane-recovery').addEventListener")),context);
  await handlers['quick-pane-current']();await handlers['quick-pane-window']();
  assert.deepEqual(sent.map(b=>b.destination),['pane','workspace']);assert.ok(sent.every(b=>b.agent==='empty'&&b.message===''&&b.cwd==='D:\\project'&&b.terminalId==='term1'));
  context.pending={};await handlers['quick-pane-current']();assert.equal(sent.length,2);context.pending=null;
  state.panes=[];await handlers['quick-pane-current']();assert.equal(sent.length,2);
  await handlers['quick-pane-window']();assert.equal(sent.length,3);
  state.panes=Array(4).fill({});await handlers['quick-pane-window']();assert.equal(sent.length,3);
});
const welcomeSource=source.slice(source.indexOf('function providerWelcome('),source.indexOf('function focusedContent('));
const providerWelcome=runInNewContext(source.match(/^const plain = .*$/m)[0]+'\n'+welcomeSource+'\nproviderWelcome;');
const previewContent=runInNewContext(source.match(/^const plain = .*$/m)[0]+'\n'+source.slice(source.indexOf('function previewContent('),source.indexOf('async function refreshPreview('))+'\npreviewContent;', {providerWelcome});
const previewMargins=runInNewContext(source.match(/^const plain = .*$/m)[0]+'\n'+source.slice(source.indexOf('function previewMargins('),source.indexOf('async function refreshPreview('))+'\npreviewMargins;');
const nativeCols=runInNewContext(source.match(/^const plain = .*$/m)[0]+'\n'+source.match(/^const nativeCols = .*$/m)[0]+'\nnativeCols;');
const focusedContent=runInNewContext(source.match(/^const plain = .*$/m)[0]+'\n'+source.match(/^const nativeLayout = .*$/m)[0]+'\n'+source.slice(source.indexOf('function focusedContent('),source.indexOf('function phoneText('))+'\nfocusedContent;', {providerWelcome});

test('Codex startup boxes compact padding without losing content or touching another provider',()=>{
  const text=['╭'+'─'.repeat(70)+'╮','│ OpenAI Codex (v0.153.4)'+ ' '.repeat(45)+'│','│'+ ' '.repeat(70)+'│','│ model: gpt-6-astra xhigh'+ ' '.repeat(43)+'│','╰'+'─'.repeat(70)+'╯','Real response'].join('\n');
  const result=providerWelcome({pane:{agent:'codex'},read:{text}});
  assert.equal(result.length,5);
  assert.ok(result.slice(0,4).every(line=>line.length===result[0].length));
  assert.ok(result[0].length<40);assert.equal(result.at(-1),'Real response');
  assert.equal(providerWelcome({pane:{},read:{text}}).join('\n'),text);
});

test('Claude welcome reserves the full width of all three mascot rows',()=>{
  const rows=[' ▐▛███▛█   Claude Code v2.1.261','▝▜██████▀  Opus 5 with high effort · Claude Pro','  ▝▝ ▝▝    D:\\'];
  const next={pane:{agent:'claude'},read:{text:rows.join('\n')}};
  const result=focusedContent(next);
  assert.equal(result.graphicCols,Math.max(...rows.map(row=>row.length)));
  assert.equal(result.read.text,next.read.text);
  assert.equal(focusedContent({...next,read:{text:'An ordinary answer'}}).graphicCols,1);
});

test('native fit stays stable across repeated resizes and supports readable zoom',()=>{
  const stage={style:{}},terminal={cols:100,options:{fontSize:14,fontFamily:'monospace'}};
  const ctx={terminal,frame:{pane:{}},settings:{view:'wrap'},focusedGraphicCols:0,nativeZoom:1,viewport:{clientWidth:368,dataset:{native:'true'}},byId:()=>stage,document:{createElement:()=>({getContext:()=>({measureText:()=>({width:8.4})})})}};
  const fit=runInNewContext(source.slice(source.indexOf('function fit('),source.indexOf('function phoneCols('))+'\nfit;',ctx);
  for(let i=0;i<10;i++)fit();assert.equal(terminal.options.fontSize,6);
  ctx.nativeZoom=3;fit();assert.equal(terminal.options.fontSize,14);assert.equal(stage.style.minWidth,'840px');
  ctx.nativeZoom=0;terminal.cols=300;fit();assert.equal(terminal.options.fontSize,14);assert.equal(stage.style.minWidth,'2520px');
});

test('Hermes restores its native welcome artwork only for an empty prompt in both views',()=>{
  const status='⚕ kimi-k3 │ ctx -- │ [░░░░] -- │ $2.12';
  const frame={pane:{agent:'hermes'},read:{text:[status,'────────','❯','────────'].join('\n')}};
  assert.match(previewContent(frame).body.read.text,/Hermes Agent/);
  assert.match(focusedContent(frame).read.text,/Hermes Agent/);
  for(const text of ['An actual answer','❯ unfinished draft','Hermes Agent']) {
    const next={...frame,read:{text:frame.read.text+'\n'+text}};
    assert.equal(providerWelcome(next).join('\n'),next.read.text);
  }
});

test('expanded native content removes desktop padding while preserving logos, paragraphs and history',()=>{
  const next={pane:{agent:'opencode'},read:{text:['','\x1b[32m   ',' '.repeat(32)+'▄',' '.repeat(20)+'█▀▀█ █▀▀█',' '.repeat(20)+'█  █ █  █','','',' '.repeat(20)+'┃ Ask anything',' '.repeat(20)+'┃ Build · model','','Earlier answer','','Next paragraph',''].join('\n')}};
  const result=focusedContent(next);
  assert.equal(result.graphicCols,13);
  assert.ok(result.read.text.startsWith('\x1b[32m'+' '.repeat(12)+'▄\n█▀▀█ █▀▀█\n█  █ █  █'));
  assert.match(result.read.text,/\n┃ Ask anything\n┃ Build · model\n/);
  assert.match(result.read.text,/Earlier answer\n\nNext paragraph$/);
  assert.equal(result.rows,result.read.text.split('\n').length);
  const old='⚕ kimi-k3 │ ctx -- │ [░░░░░░░░] -- │ 13m │ $2.12';
  const latest=old.replace('13m','14m');
  const hermes={pane:{agent:'hermes'},read:{text:['Earlier answer',old,latest,'─'.repeat(80),'❯'].join('\n')}};
  const body=focusedContent(hermes,{read:{text:latest}});
  assert.equal(body.read.text,'Earlier answer\n'+'─'.repeat(80)+'\n❯');
  const used='⚕ kimi-k3 │ 37.1K/1M │ [░░░░░░░░] 4% │ 3h │ $2.11';
  const active={pane:{agent:'hermes'},read:{text:['Full answer',used,'────────','❯'].join('\n')}};
  assert.equal(previewContent(active).footer.read.text,used);
  assert.equal(focusedContent(active,{read:{text:used}}).read.text,'Full answer\n────────\n❯');
});
const {paneTemplates,readLayoutTemplates}=runInNewContext(source.slice(source.indexOf('function paneTemplates('),source.indexOf('function renderLayoutTemplates('))+'\n({paneTemplates,readLayoutTemplates});');

test('switching terminals keeps each unsent draft with its original process',()=>{
  const draft={value:'',style:{}};
  const select=runInNewContext('const sessionDrafts=new Map();let draftOwner;\n'+source.slice(source.indexOf('function selectDraft('),source.indexOf('const terminalOptions'))+'\nselectDraft;',{draft});
  select({terminal_id:'a'});draft.value='Draft for A';select({terminal_id:'b'});assert.equal(draft.value,'');
  draft.value='Draft for B';select({terminal_id:'a'});assert.equal(draft.value,'Draft for A');
  select({terminal_id:'replacement'});assert.equal(draft.value,'');select({terminal_id:'b'});assert.equal(draft.value,'Draft for B');
});

test('all 16 pane presets fill their grid and saved choices remain independent for each count',()=>{
  assert.deepEqual([1,2,3,4].map(count=>Object.keys(paneTemplates(count)).length),[1,2,6,7]);
  for(const count of [1,2,3,4])for(const layout of Object.values(paneTemplates(count))) {
    assert.equal(layout.cells.length,count);
    assert.equal(layout.cells.reduce((area,cell)=>area+Number(cell.column.match(/span (\d+)/)[1])*cell.rows,0),layout.columns*layout.rows);
  }
  const read=saved=>JSON.parse(JSON.stringify(readLayoutTemplates(saved)));
  assert.deepEqual(read(),{1:'full',2:'stack',3:'bottom',4:'grid'});
  assert.deepEqual(read({template:'columns'}),{1:'full',2:'row',3:'bottom',4:'grid'});
  assert.deepEqual(read({template:'stack'}),{1:'full',2:'stack',3:'stack',4:'stack'});
  assert.deepEqual(read({templates:{1:'constructor',2:'row',3:'top',4:'right'}}),{1:'full',2:'row',3:'top',4:'right'});
});

test('overview enlarges native footer rows without wrapping chat or losing ANSI and OpenCode graphics',()=>{
  const frame=(agent,lines)=>({pane:{agent},cols:100,rows:lines.length,read:{text:lines.join('\n')}});
  const claude=frame('claude',['','A complete chat row','─'.repeat(100),'❯ draft','─'.repeat(100),'\x1b[36m[Opus 5] 🧠 medium [──────────] 4.0% · 5h 1% · 7d 60%'+ ' '.repeat(35)+'/rc\x1b[0m','⏵⏵ auto mode on']);
  const next=previewContent(claude);
  assert.equal(nativeCols(frame('claude',['\x1b[32m'+'─'.repeat(103)+'\x1b[0m'])),103);
  assert.equal(next.body.read.text,claude.read.text.split('\n').slice(1,-2).join('\n'));
  assert.equal(next.footer.rows,2);assert.ok(next.footer.read.text.includes('🧠 medium [──────────] 4.0% · 5h 1% · 7d 60% /rc\x1b[0m'));
  const codex=previewContent(frame('codex',['A full row','› Explain this codebase','','  gpt-5.6-terra xhigh · D:\\']));
  assert.equal(codex.footer.rows,1);assert.match(codex.footer.read.text,/gpt-5.6-terra xhigh/);
  assert.equal(previewContent(frame('codex',['Choose a model','gpt-5.6-terra'])).footer,null);
  const opencode=previewContent(frame('opencode',['\x1b[48;2;1;2;3m   ','',' ▄█▀   ▄█▀','  │ Build · model','']));
  assert.equal(opencode.footer,null);assert.equal(opencode.body.rows,2);
  assert.equal(opencode.body.read.text,'\x1b[48;2;1;2;3m ▄█▀   ▄█▀\n  │ Build · model');
  const welcome=frame('hermes',['\x1b[35mHERMES\x1b[0m','   ','Ready','   ','🧠 Model · 💭 high']);
  const filled=previewContent(welcome,40).body;
  assert.equal(filled.rows,40);
  assert.deepEqual(filled.read.text.split('\n').filter(line=>line.trim()),welcome.read.text.split('\n').filter(line=>line.trim()));
  const compact=previewContent(welcome,3).body;
  assert.equal(compact.rows,3);assert.equal(compact.read.text,welcome.read.text.split('\n').filter(line=>line.trim()).join('\n'));
  const openModel=previewContent(frame('opencode',['                    █▀▀█ █▀▀█                    ','                    ┃  Ask anything              ','                    ┃  Build · DeepSeek V4 Flash OpenRouter','                    ╹'+'▀'.repeat(50),'  D:\\'+' '.repeat(90)+'1.18.29']));
  assert.equal(openModel.footer.rows,2);assert.match(openModel.footer.read.text,/Build · DeepSeek V4 Flash OpenRouter/);assert.match(openModel.footer.read.text,/D:\\ 1.18.29/);
  assert.ok(openModel.body.read.text.startsWith('                    █▀▀█ █▀▀█'));
  const hermes=previewContent(frame('hermes',['Earlier native output',' ⚕ kimi-k3 │ ctx -- │ [░░░░] -- │ 13m │ $2.12','─'.repeat(100),'❯','─'.repeat(100)]));
  assert.equal(hermes.footer.rows,1);assert.match(hermes.footer.read.text,/kimi-k3 │ ctx --/);assert.match(hermes.body.read.text,/Earlier native output/);
  const margins=previewMargins(frame('opencode',[' '.repeat(20)+'\x1b[32m東京 🧠\x1b[0m'+' '.repeat(30),' '.repeat(20)+'█▀▀█'+' '.repeat(20)]),100);
  assert.equal(margins.left,20);assert.equal(margins.cols,60);
});

test('a tap opens reading without the keyboard, a hold opens actions, and scrolling never opens a terminal',()=>{
  const handlers=new Map(), timers=new Map(), opened=[], actions=[];
  let clock=0;
  const button={isConnected:true,addEventListener:(event,fn)=>handlers.set(event,fn)};
  const bind=runInNewContext(source.slice(source.indexOf('function paneGestures('),source.indexOf('function paneActions('))+'\npaneGestures;',{
    setTimeout:(fn,ms)=>{assert.equal(ms,500);timers.set(++clock,fn);return clock;},clearTimeout:id=>timers.delete(id),
    selectPane:(id,keyboard)=>opened.push([id,keyboard]),paneActions:id=>actions.push(id)
  });
  bind(button,'test:p1');
  const fire=(type,values={})=>handlers.get(type)({button:0,isPrimary:true,clientX:40,clientY:40,preventDefault(){},...values});
  const hold=()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());};
  fire('pointerdown');fire('pointerup');fire('click');assert.deepEqual(opened,[['test:p1',false]]);
  fire('pointerdown');hold();fire('pointerup');fire('click');assert.deepEqual(actions,['test:p1']);assert.equal(opened.length,1);
  fire('pointerdown');fire('pointermove',{clientY:60});hold();fire('pointerup');fire('click');assert.equal(actions.length,1);assert.equal(opened.length,1);
  fire('pointerdown');fire('pointercancel');hold();fire('click');assert.equal(opened.length,1);
  fire('pointerdown');fire('pointerup');fire('click');assert.equal(opened.length,2);
  fire('contextmenu');fire('click');assert.equal(actions.length,2);assert.equal(opened.length,2);
  fire('keydown',{key:'Enter'});fire('click');assert.equal(opened.length,3);
  button.isConnected=false;fire('pointerdown');hold();assert.equal(actions.length,2);
});

test('saved layouts constrain sizes; Even layout clears manual sizes and keeps the current order',()=>{
  const tile=id=>({dataset:{layoutId:id},style:{setProperty(name,value){this[name]=value;}},resize:{},querySelector(){return this.resize;},getBoundingClientRect:()=>({left:0})});
  const tiles=[tile('one'),tile('two'),tile('quota')];
  const grid={children:tiles,dataset:{},style:{setProperty(name,value){this[name]=value;}},getBoundingClientRect:()=>({left:0,width:400}),insertBefore(child,next){const index=tiles.indexOf(child);if(index>=0)tiles.splice(index,1);tiles.splice(next?tiles.indexOf(next):tiles.length,0,child);}};
  const context={layoutDrag:undefined,layoutTemplates:readLayoutTemplates(),paneTemplates,renderLayoutTemplates:()=>{},byId:()=>grid,previews:new Map(),fitPreview:()=>{},paneLayout:{order:['two','gone','two','one'],sizes:{two:{columns:2,height:99999},one:{columns:9,height:-20}}}};
  const apply=runInNewContext(source.slice(source.indexOf('function applyPaneLayout('),source.indexOf('function savePaneLayout('))+'\napplyPaneLayout;',context);
  apply();assert.deepEqual(tiles.map(t=>t.dataset.layoutId),['two','one','quota']);
  assert.equal(tiles[0].style.gridColumn,'span 2');assert.equal(tiles[0].style.height,'680px');
  assert.equal(tiles[1].style.gridColumn,'');assert.equal(tiles[1].style.height,'96px');
  context.layoutDrag={};context.paneLayout.order=['quota','one','two'];apply();
  assert.deepEqual(tiles.map(t=>t.dataset.layoutId),['two','one','quota']);
  let even,saved=0;
  context.byId=id=>id==='layout-reset'?{addEventListener:(event,fn)=>{even=fn;}}:grid;
  context.endLayoutDrag=()=>{context.layoutDrag=undefined;};context.applyPaneLayout=apply;context.savePaneLayout=()=>{saved++;};
  context.resetPaneSizes=runInNewContext(source.slice(source.indexOf('function resetPaneSizes('),source.indexOf('function arrangePanes('))+'\nresetPaneSizes;',context);
  runInNewContext(source.slice(source.indexOf("byId('layout-reset').addEventListener"),source.indexOf("byId('pane-actions-close').addEventListener")),context);
  even();assert.equal(saved,1);assert.deepEqual(tiles.map(t=>t.dataset.layoutId),['two','one','quota']);
  assert.ok(tiles.every(tile=>tile.style.height===''&&tile.style.gridColumn===''));
  assert.equal(grid.style['--layout-rows'],2);
  context.layoutTemplates[3]='left';context.resetPaneSizes();assert.equal(grid.dataset.layout,'left');assert.equal(grid.style['--layout-rows'],2);assert.equal(tiles[0].style['--pane-rows'],2);
  context.paneLayout.sizes.two={height:680};context.layoutTemplates[2]='row';
  tiles[2].hidden=true;
  apply();assert.equal(grid.style['--layout-rows'],1);assert.equal(tiles[0].style.height,'');
  assert.equal(context.layoutTemplates[3],'left');
  tiles[1].hidden=true;apply();assert.equal(grid.style['--layout-rows'],1);
});

test('overview panes advance independently with native rows intact, recover, and ignore an obsolete view', async()=>{
  const pane=id=>({pane_id:id,agent_status:'working'});
  const previews=new Map(['slow','fast'].map(id=>[id,{term:{cols:40},footer:{},output:{clientWidth:300,clientHeight:200,scrollTop:0,scrollHeight:100},activity:{}}]));
  let finishSlow, reads=0, text='First line', fail=false, sourceCols=80, expectedCols=40, fixed=false;
  const painted=[];
  const context={previews,previewContent,previewMargins,providerWelcome,nativeCols,nativeLayout:()=>fixed,plain:text=>text,generation:1,bridgeId:'test',paneSelect:{value:''},quotaModel:()=>{},phoneCols:()=>40,
    fitPreview:()=>{},paint:async(term,value,cols,wrap)=>{assert.equal(cols,expectedCols);assert.equal(wrap,!fixed);painted.push(value.read.text);},
    api:async path=>{
      reads++;
      if(path.endsWith('slow'))await new Promise(resolve=>{finishSlow=resolve;});
      if(fail)throw new Error('Disconnected');
      return {bridgeId:'test',cols:sourceCols,rows:24,read:{text},pane:pane(path.endsWith('slow')?'slow':'fast')};
    }
  };
  const refresh=runInNewContext(source.slice(source.indexOf('async function refreshPreview('),source.indexOf('function fitPreview('))+'\nrefreshPreview;',context);
  const slow=refresh(pane('slow'),1);
  await refresh(pane('fast'),1);
  await refresh(pane('slow'),1);assert.equal(reads,2);
  text='Next line';await refresh(pane('fast'),1);
  assert.deepEqual(painted,['First line','Next line']);
  fail=true;await refresh(pane('fast'),1);
  assert.equal(previews.get('fast').activity.textContent,'Reconnecting…');
  fail=false;text='Recovered';await refresh(pane('fast'),1);
  assert.equal(previews.get('fast').activity.textContent,'working');
  text='└ Native tool output';await refresh(pane('fast'),1);
  context.generation=2;finishSlow();await slow;
  assert.deepEqual(painted,['First line','Next line','Recovered','└ Native tool output']);
  assert.equal(previews.get('slow').updating,false);
  context.generation=1;sourceCols=180;expectedCols=54;
  text='PS D:\\> codex\n╭'+'─'.repeat(52)+'╮\n│ OpenAI Codex'+' '.repeat(40)+'│\n╰'+'─'.repeat(52)+'╯\n\nTip: '+'startup help '.repeat(12);
  await refresh(pane('fast'),1);
  assert.equal(previews.get('fast').viewCols,54);
  assert.ok(painted.at(-1).includes('OpenAI Codex'));
  context.generation=1;sourceCols=13;expectedCols=40;text='[Opus 5…';await refresh(pane('fast'),1);
  fixed=true;expectedCols=80;text='┃ Build';await refresh(pane('fast'),1);
  assert.equal(previews.get('fast').viewCols,13);
  for(const width of [40,61,80,120]) {
    sourceCols=width;expectedCols=Math.max(80,width);text='X'.repeat(width);
    await refresh(pane('fast'),1);
    assert.equal(previews.get('fast').viewCols,width);
    assert.equal(previews.get('fast').cropLeft,0);
  }
});

test('empty Hermes preview uses 40 columns instead of desktop width',async()=>{
  const preview={term:{cols:115},footer:{},output:{clientWidth:175,clientHeight:230},activity:{}};
  let paintedCols;
  const context={previews:new Map([['h',preview]]),generation:1,bridgeId:'b',paneSelect:{},
    api:async()=>({bridgeId:'b',pane:{agent:'hermes'},cols:115,rows:33,read:{text:'empty'}}),
    nativeCols:()=>115,nativeLayout:()=>true,plain:s=>s,providerWelcome,
    previewContent:()=>({body:{read:{text:'Hermes Agent'}},footer:null}),previewMargins:(_,cols)=>({left:0,cols}),
    phoneText:()=> 'Hermes Agent',paint:async(_,__,cols)=>{paintedCols=cols;},fitPreview(){}};
  const refresh=runInNewContext(source.slice(source.indexOf('async function refreshPreview('),source.indexOf('async function paintFooter('))+'\nrefreshPreview;',context);
  await refresh({pane_id:'h'},1);
  assert.equal(paintedCols,40);assert.equal(preview.viewCols,40);
  context.nativeLayout=()=>false;context.focusedContent=()=>({graphicCols:46});
  context.api=async()=>({bridgeId:'b',pane:{agent:'claude'},cols:115,rows:33,read:{text:'Claude welcome'}});
  await refresh({pane_id:'h'},1);
  assert.equal(paintedCols,46);assert.equal(preview.viewCols,46);
});

test('miniatures use the full pane width without stretching glyphs and keep native footer rows separate',()=>{
  const fit=runInNewContext(source.slice(source.indexOf('function fitFooter('),source.indexOf('async function refresh()'))+'\nfitPreview;');
  const screen={offsetWidth:800,offsetHeight:400},style={};
  const preview={term:{element:{querySelector:()=>screen,style}},output:{clientWidth:200,clientHeight:300,scrollTop:90}};
  fit(preview);assert.equal(style.transform,'scale(0.25)');assert.equal(style.width,'800px');assert.equal(style.height,'400px');assert.equal(preview.output.scrollTop,0);
  assert.equal(style.top,'0');assert.equal(style.transformOrigin,'top left');
  preview.output.clientHeight=50;fit(preview);assert.equal(style.transform,'scale(0.25)');assert.equal(style.left,'0px');
  assert.equal(style.top,'auto');assert.equal(style.transformOrigin,'bottom left');
  screen.offsetHeight=2400;fit(preview);assert.equal(style.transform,'scale(0.25)');screen.offsetHeight=400;
  preview.output.clientWidth=400;preview.output.clientHeight=500;fit(preview);assert.equal(style.transform,'scale(0.5)');
  preview.footer={hidden:false,clientWidth:200,style:{}};
  preview.footerTerm={cols:100,element:{querySelector:()=>({offsetWidth:800,offsetHeight:32}),style:{}}};preview.footerCols=50;
  fit(preview);assert.equal(preview.footer.style.height,'16px');assert.equal(preview.footerTerm.element.style.transform,'scale(0.5)');
  preview.term.cols=100;preview.viewCols=60;preview.cropLeft=20;preview.output.clientWidth=240;
  fit(preview);assert.equal(style.transform,'scale(0.5)');assert.equal(style.left,'-80px');
});

test('QuotaDeck can minimize or close locally, persists independently of terminals, and remains restorable',()=>{
  const elements=Object.fromEntries(['quota-companion','quota-minimize','quota-restore','pane-grid','session-count','pane-actions-dialog','quota-ticker','quota-placement','sessions','overview-hint'].map(id=>[id,{dataset:{},classList:{toggle(){}},setAttribute(){},close(){},insertBefore(child,before){this.before=before;}}]));
  let saves=0;const context={quotaView:'open',state:{panes:[{pane_id:'keep'}]},byId:id=>elements[id],applyPaneLayout:()=>{},savePaneLayout:()=>{saves++;}};
  const set=runInNewContext(source.slice(source.indexOf('function quotaVisibility('),source.indexOf('function applyPaneLayout('))+'\nsetQuotaView;',context);
  set('minimized');assert.equal(elements['quota-companion'].hidden,false);assert.equal(elements['quota-restore'].hidden,false);assert.equal(elements['pane-grid'].dataset.count,2);
  set('hidden');assert.equal(elements['quota-companion'].hidden,true);assert.equal(elements['pane-grid'].dataset.count,1);
  set('open');assert.equal(elements['quota-companion'].hidden,false);assert.equal(elements['quota-restore'].hidden,true);assert.equal(context.state.panes[0].pane_id,'keep');assert.equal(saves,3);
  set('top');assert.equal(elements['quota-companion'].hidden,true);assert.equal(elements['quota-ticker'].hidden,false);assert.equal(elements['pane-grid'].dataset.count,1);assert.equal(elements.sessions.before,elements['pane-grid']);
  set('bottom');assert.equal(elements.sessions.before,elements['overview-hint']);
  set('hidden');assert.equal(elements['quota-ticker'].hidden,true);
  context.state.panes=Array(4).fill({pane_id:'keep'});
  set('open');assert.equal(elements['quota-companion'].hidden,true);assert.equal(elements['quota-ticker'].hidden,false);assert.equal(elements['pane-grid'].dataset.count,4);
  context.state.panes.pop();set('open');assert.equal(elements['quota-companion'].hidden,false);assert.equal(elements['quota-ticker'].hidden,true);
});

test('shared status painting waits for updated terminal geometry and reuses unchanged rows',async()=>{
  let ready,measurable=false,writes=0;
  const footer={read:{text:'Model status'},rows:1};
  const preview={footer:{},footerTerm:{cols:80,rows:1,buffer:{active:{getLine:()=>({getCell:x=>({getChars:()=>measurable&&x===59?'x':'',getWidth:()=>1})})}}}};
  const paintFooter=runInNewContext(source.match(/^const plain = .*$/m)[0]+'\n'+source.slice(source.indexOf('async function paintFooter('),source.indexOf('function fitFooter('))+'\npaintFooter;',{
    paint:async()=>{writes++;},requestAnimationFrame:callback=>{ready=()=>{measurable=true;callback();};}
  });
  const painting=paintFooter(preview,footer,80);await new Promise(setImmediate);
  assert.equal(preview.footerText,undefined);ready();await painting;
  assert.equal(preview.footerCols,60);assert.equal(preview.footerText,'Model status');
  await paintFooter(preview,footer,80);assert.equal(writes,1);
});

test('phone wrapping preserves text and ANSI while removing desktop padding', () => {
  // Exercise the shipped browser helper without starting a browser or a real terminal.
  const phoneText = runInNewContext(source.match(/^const plain = .*$/m)[0] + '\n' + source.match(/^const nativeLayout = .*$/m)[0] + '\n' +
    source.slice(source.indexOf('function phoneText('), source.indexOf('async function paint(')) + '\nphoneText;');
  const message = '\x1b[32mHello from your shared terminal, including 🧠 and 東京.\x1b[0m';
  const next = { pane: { agent: 'claude' }, agentControls: {}, read: { text: [
    message + ' '.repeat(100), '─'.repeat(105), 'Opus 5' + ' '.repeat(80) + '7d 59%', 'Auto'
  ].join('\n') } };
  const result = phoneText(next, 40);
  assert.equal(result.replace(/[\r\n ]/g,''), next.read.text.replace(/─{105}/,'─'.repeat(40)).replace(/[\r\n ]/g,''));
  assert.ok(result.includes('\x1b[32m'));
  assert.ok(result.includes('\x1b[0m'));
  assert.ok(!result.includes(' '.repeat(40)));
  assert.ok(result.includes('Opus 5 7d 59%'));
  assert.ok(result.includes('\r\nincluding'));
  next.read.text = '[Opus 5] 🧠 medium [──────────] 4.0% · 7d 59%';
  const footer = phoneText(next,40);
  assert.ok(!footer.includes('[──────────]'));
  assert.ok(footer.includes('4.0% · 7d 59%'));
  next.pane.agent='opencode';next.read.text='╹'+Array(80).fill('\x1b[32m▀\x1b[0m').join('');
  const border=phoneText(next,40);
  assert.equal(border.replace(/\x1b\[[0-9;]*m/g,''),'╹'+'▀'.repeat(39));
});

test('closing the selected pane clears its draft even when the overview observes removal first; failure keeps it', async()=>{
  let resolve,reject,closed=0;
  const elements={'close-pane-confirm':{},'close-pane-status':{},'close-pane-dialog':{close(){closed++;}}};
  const context={busy:false,closingPane:{id:'close-once',paneId:'test:p1',terminalId:'term1',kind:'close'},bridgeId:'test',paneSelect:{value:'test:p1'},lastTerminalPane:'test:p1',
    draft:{value:'Unsent',style:{height:'80px'}},byId:id=>elements[id],controls:()=>{},navigate:()=>{},history:{replaceState(){}},location:{pathname:'/'},
    api:()=>new Promise((yes,no)=>{resolve=yes;reject=no;})};
  const close=runInNewContext(source.slice(source.indexOf('async function closePane('),source.indexOf('async function input('))+'\nclosePane;',context);
  let pending=close();context.paneSelect.value='';resolve({});await pending;
  assert.equal(context.draft.value,'');assert.equal(context.lastTerminalPane,undefined);assert.equal(closed,1);
  context.paneSelect.value='test:p1';context.draft.value='Keep on failure';
  pending=close();reject(new Error('Terminal changed'));await pending;
  assert.equal(context.draft.value,'Keep on failure');assert.equal(closed,1);
  assert.match(elements['close-pane-status'].textContent,/Terminal changed/);
});

test('Return sends once; Shift+Return and composition keep editing; iOS input-only Return sends', () => {
  const handlers = new Map(), sent = [];
  runInNewContext(source.slice(source.indexOf('let shiftLineBreak ='), source.indexOf("byId('write').addEventListener")), {
    draft: { addEventListener: (name,fn) => handlers.set(name,fn) }, input: kind => sent.push(kind)
  });
  const fire = (name, values) => {
    const event = { prevented:false, preventDefault(){this.prevented=true;}, ...values };
    handlers.get(name)(event); return event.prevented;
  };
  assert.equal(fire('keydown',{key:'a'}),false);
  assert.equal(sent.length,0);
  assert.equal(fire('keydown',{key:'Enter'}),true);
  assert.deepEqual(sent,['send']);
  assert.equal(fire('keydown',{key:'Enter',shiftKey:true}),false);
  assert.equal(fire('beforeinput',{inputType:'insertLineBreak'}),false);
  assert.equal(fire('keydown',{key:'Enter',isComposing:true}),false);
  assert.equal(fire('beforeinput',{inputType:'insertParagraph',isComposing:true}),false);
  assert.equal(fire('keydown',{key:'Enter',keyCode:229}),false);
  assert.deepEqual(sent,['send']);
  assert.equal(fire('beforeinput',{inputType:'insertLineBreak'}),true);
  assert.deepEqual(sent,['send','send']);
});

test('mobile send dismisses the keyboard only after success, preserving failures and newer drafts', async () => {
  let resolve, reject, dismissals = 0, coarse = true;
  const draft = { value:'Hello', style:{height:'80px'} };
  const input = runInNewContext(source.slice(source.indexOf('async function input('), source.indexOf('function currentAttachments(')) + '\ninput;', {
    connected:true, busy:false, frame:{pane:{pane_id:'test:p1',terminal_id:'test-terminal'}}, bridgeId:'test', draft,
    crypto:{randomUUID:()=> 'test-input'}, controls:()=>{}, announce:()=>{}, byId:()=>({}),
    currentAttachments:()=>[],removeAttachment:()=>{},jumpLatest:()=>{},
    window:{matchMedia:()=>({matches:coarse})}, dismissKeyboard:()=>{dismissals++;},
    api:()=>new Promise((yes,no)=>{resolve=yes;reject=no;})
  });
  let sending = input('send');
  assert.equal(dismissals,0);
  assert.equal(await input('send'),false);
  resolve({});
  assert.equal(await sending,true);
  assert.equal(dismissals,1);
  assert.equal(draft.value,'');
  assert.equal(draft.style.height,'');

  draft.value='Keep this';
  sending=input('send');reject(new Error('Offline'));
  assert.equal(await sending,false);
  assert.equal(draft.value,'Keep this');
  assert.equal(dismissals,1);

  sending=input('send');draft.value='Still typing';resolve({});await sending;
  assert.equal(draft.value,'Still typing');
  assert.equal(dismissals,1);
  sending=input('text');resolve({});await sending;
  assert.equal(dismissals,1);

  coarse=false;draft.value='Desktop';
  sending=input('send');resolve({});await sending;
  assert.equal(dismissals,1);
});

test('empty Return sends one native Enter for model confirmation, and attachments wait for successful delivery',async()=>{
  const draft={value:'',style:{}},frame={pane:{pane_id:'opencode:p1',terminal_id:'native'}};
  const sent=[],attached=[],removed=[];let fail=false;
  const input=runInNewContext(source.slice(source.indexOf('async function input('),source.indexOf('function currentAttachments('))+'\ninput;',{
    connected:true,busy:false,frame,bridgeId:'bridge',draft,currentAttachments:()=>attached,removeAttachment:file=>removed.push(file),
    crypto:{randomUUID:()=> 'native-enter'},controls(){},announce(){},jumpLatest(){},byId:()=>({}),window:{matchMedia:()=>({matches:false})},
    api:async(path,options)=>{if(fail)throw new Error('Offline');sent.push(JSON.parse(options.body));}
  });
  assert.equal(await input('send'),true);assert.equal(sent[0].kind,'key');assert.equal(sent[0].key,'enter');assert.equal(sent[0].text,undefined);
  const file={id:'upload-file',bridgeId:'old'};attached.push(file);
  assert.equal(await input('send'),false);assert.equal(sent.length,1);
  file.bridgeId='bridge';fail=true;assert.equal(await input('send'),false);assert.equal(removed.length,0);
  fail=false;assert.equal(await input('send'),true);assert.equal(sent[1].kind,'send');assert.deepEqual(sent[1].attachments,['upload-file']);assert.deepEqual(removed,[file]);
});

test('painting a long answer no longer drops its first thousand rows',async()=>{
  const sizes=[],writes=[];
  const paint=runInNewContext(source.match(/^const plain = .*$/m)[0]+'\n'+source.slice(source.indexOf('async function paint('),source.indexOf('async function render('))+'\npaint;',{
    phoneText:next=>next.read.text
  });
  const text=Array.from({length:1400},(_,i)=>'Answer line '+i).join('\n');
  const term={resize:(cols,rows)=>sizes.push([cols,rows]),write:(value,done)=>{writes.push(value);done();},buffer:{active:{cursorY:1399}}};
  await paint(term,{cols:80,rows:1400,read:{text}},40,true);
  assert.ok(sizes[0][1]>=1400);assert.equal(sizes.at(-1)[1],1400);assert.ok(writes[0].includes('Answer line 0\n'));assert.ok(writes[0].includes('Answer line 1399'));
});

test('live history stays still while reading, prepends earlier rows in place, and follows Latest',async()=>{
  let top=0,paints=0;const painted=[];
  const viewport={dataset:{},style:{},clientWidth:208,clientHeight:100,scrollHeight:100,get scrollTop(){return top;},set scrollTop(value){top=Math.max(0,Math.min(value,this.scrollHeight-this.clientHeight));}};
  const elements=new Map(),byId=id=>{if(!elements.has(id))elements.set(id,{style:{},querySelector:()=>({})});return elements.get(id);};
  const context={generation:1,frame:undefined,lastText:undefined,lastCols:undefined,lastRows:undefined,lastView:undefined,historyPrepend:false,historyLines:1000,settings:{view:'wrap'},page:'terminal',state:undefined,
    machineId:'local',sessionStorage:{getItem:()=>null},viewport,terminal:{cols:40,rows:5},terminalRowHeight:()=>20,nativeLayout:()=>false,nativeCols:next=>next.cols,focusedContent,previewContent,fit(){},phoneCols:()=>40,plain:text=>text,byId,draft:{},paneTitle(){},renderSessionTabs(){},selectDraft(){},quotaModel(){},renderAttachments(){},historyPosition(){},
    paint:async(term,next,cols,wrap,rows)=>{paints++;painted.push(next.read.text);term.rows=rows;term.buffer={active:{baseY:next.rows-rows,cursorY:rows-1}};viewport.scrollHeight=next.rows*20;}};
  const render=runInNewContext(source.slice(source.indexOf('async function render('),source.indexOf('function historyPosition('))+'\nrender;',context);
  const frame=text=>({pane:{pane_id:'one',terminal_id:'term1',agent:'codex'},cols:80,rows:3,workspaces:[],read:{text:'visible'},history:{text}});
  await render(frame(Array(30).fill('History').join('\n')),1);assert.equal(paints,1);assert.equal(top,500);
  viewport.scrollTop=100;
  const updated=Array(31).fill('Updated history').join('\n');await render(frame(updated),1);assert.equal(paints,1);assert.equal(top,100);
  context.historyPrepend=true;await render(frame(Array(50).fill('Earlier').join('\n')),1);assert.equal(paints,2);assert.equal(top,500);
  viewport.scrollTop=viewport.scrollHeight;await render(frame(updated),1);assert.equal(paints,3);assert.equal(top,520);
  context.nativeLayout=()=>true;
  for(const agent of ['hermes','opencode']) {
    const native={...frame('Earlier output'),pane:{...frame('').pane,agent}};
    context.historyLines=1000;context.lastText=undefined;await render(native,1);
    assert.equal(painted.at(-1),agent==='hermes'?'Earlier output':'visible');
    context.historyLines=2000;context.historyPrepend=true;await render(native,1);
    assert.equal(painted.at(-1),'Earlier output');
  }
  const grid='┌──────┐\n│      │\n│  CPU │\n└──────┘';
  const app={...frame('stale scrollback'),pane:{pane_id:'shell',terminal_id:'shell1'},read:{text:grid},rows:4};
  context.historyLines=1000;context.lastText=undefined;await render(app,1);
  assert.equal(painted.at(-1),grid);assert.equal(context.terminal.cols,40);assert.equal(context.terminal.rows,4);
  assert.equal(previewContent(app).body.read.text,grid);
});

test('minimizing is local, restorable and scoped to a terminal process',()=>{
  const tile={hidden:false}, minimizedPanes=new Set(),saved=[];let layouts=0;
  const context={state:{panes:[{pane_id:'p1',terminal_id:'t1'}]},minimizedPanes,previews:new Map([['p1',{tile}]]),localStorage:{setItem:(_,value)=>saved.push(JSON.parse(value))},byId:()=>({close(){}}),renderMinimizedPanes(){},applyPaneLayout(){layouts++;}};
  const minimize=runInNewContext(source.slice(source.indexOf('function setPaneMinimized('),source.indexOf('function renderMinimizedPanes('))+'\nsetPaneMinimized;',context);
  minimize('p1',true);assert.equal(tile.hidden,true);assert.deepEqual(saved.at(-1),['t1']);
  minimize('missing',true);assert.equal(layouts,1);
  minimize('p1',false);assert.equal(tile.hidden,false);assert.deepEqual(saved.at(-1),[]);
  minimize('p1',true);context.state.panes[0].terminal_id='replacement';assert.equal(minimizedPanes.has('replacement'),false);
});

test('navigation auto-hides, stays hidden when typing, and can always be restored',()=>{
  let hidden=false,timeout;const toggle={};
  const context={settings:{bars:'auto'},barsTimer:undefined,arranging:false,draft:{},document:{activeElement:null,querySelector:()=>null},
    byId:id=>id==='app'?{classList:{contains:()=>hidden,toggle:(_,value)=>{hidden=value;},add:()=>{hidden=true;}}}:toggle,
    clearTimeout(){timeout=undefined;},setTimeout:fn=>{timeout=fn;return 1;}};
  const navigation=runInNewContext(source.slice(source.indexOf('function navigation('),source.indexOf('function saveSettings('))+'\nnavigation;',context);
  navigation();assert.equal(hidden,false);timeout();assert.equal(hidden,true);assert.equal(toggle.hidden,false);
  navigation(true);assert.equal(hidden,false);context.document.activeElement=context.draft;navigation();assert.equal(hidden,true);
  context.settings.bars='visible';navigation();assert.equal(hidden,false);assert.equal(timeout,undefined);
  context.settings.bars='hidden';navigation();assert.equal(hidden,true);navigation(true);assert.equal(hidden,false);timeout();assert.equal(hidden,true);
});



test('tab reorder swaps neighbors, preserves companion placement and pane sizes, and ignores edges',()=>{
  const context={paneLayout:{order:['a','quota','b','c'],sizes:{a:{height:180}}},byId:id=>id==='pane-actions-dialog'?{dataset:{paneId:'b'}}:{children:['a','b','c'].map(paneId=>({dataset:{paneId}}))},applyPaneLayout(){},savePaneLayout(){},renderSessionTabs(){},paneActions(){}};
  const move=runInNewContext(source.slice(source.indexOf('function moveTab('),source.indexOf("byId('pane-actions-move-left').addEventListener"))+'\nmoveTab;',context);
  move(-1);assert.equal(context.paneLayout.order.join(','),'b,quota,a,c');assert.equal(context.paneLayout.sizes.a.height,180);
  context.byId=id=>id==='pane-actions-dialog'?{dataset:{paneId:'b'}}:{children:['b','a','c'].map(paneId=>({dataset:{paneId}}))};
  move(-1);assert.equal(context.paneLayout.order.join(','),'b,quota,a,c');
});

test('switching terminal identity recreates announcements once before new output',()=>{
  const changes=[];const options={set screenReaderMode(value){changes.push(value);}};
  const terminal={options,element:{dataset:{terminalId:'old'}},reset(){changes.push('reset');}};
  const start=source.indexOf('  // Recreate xterm');const end=source.indexOf("  const view = next.pane.agent?",start);
  const context={terminal,next:{pane:{terminal_id:'new'}}};
  runInNewContext(source.slice(start,end),context);assert.deepEqual(changes,[false,'reset',true]);
  assert.equal(terminal.element.dataset.terminalId,'new');
  runInNewContext(source.slice(start,end),context);assert.equal(changes.length,3);
});
test('sparse shell screens use occupied columns instead of desktop padding',()=>{
 const snippet=source.slice(source.indexOf('const plain ='),source.indexOf('function paneTitle'));
 const cols=runInNewContext(snippet+';nativeCols({cols:500,pane:{},read:{text:"  Rainbow Apple"+" ".repeat(485)}})');
 assert.equal(cols,40);
 assert.equal(runInNewContext(snippet+';nativeCols({cols:120,pane:{agent:"codex"},read:{text:"hello"}})'),120);
 assert.equal(runInNewContext(snippet+';nativeCols({cols:120,pane:{},read:{text:"x".repeat(90)}})'),90);
});
test('native rendering removes padded rows without dropping ANSI or internal layout',()=>{
 const start=source.indexOf('  if(!next.pane.agent){',source.indexOf('async function render('));
 const block=source.slice(start,source.indexOf('  focusedGraphicCols=',start));
 const result=runInNewContext(block+';content',{next:{pane:{}},content:{rows:50,read:{text:'\x1b[32mApple   \x1b[0m\n\nPrompt>    \n    \n'}},plain:s=>s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'')});
 assert.equal(result.rows,3);
 assert.equal(result.read.text,'\x1b[32mApple\x1b[0m\n\nPrompt>');
});
