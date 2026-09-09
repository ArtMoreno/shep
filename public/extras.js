// Small phone tools reuse the bridge's existing input, history and attachment paths.
function shortcutKey(event) {
  if(event.isComposing||event.key==='Dead'||event.getModifierState?.('AltGraph'))return '';
  const code=event.code||'';
  if(/^Digit[0-9]$/.test(code))return code.slice(-1);
  return {BracketLeft:'[',BracketRight:']',Slash:'/',Comma:','}[code]||(/^[a-z0-9\[\]/,]$/i.test(event.key)?event.key.toLowerCase():'');
}
function shortcutMatches(event,modifier) {
  return !!shortcutKey(event)&&({control:event.ctrlKey&&event.shiftKey&&!event.metaKey&&!event.altKey,command:event.metaKey&&event.shiftKey&&!event.ctrlKey&&!event.altKey,option:event.ctrlKey&&event.altKey&&!event.metaKey&&!event.shiftKey}[modifier]||false);
}
function terminalKeyboardKey(event) {
  if(event.isComposing||event.metaKey||event.altKey)return;
  if(event.ctrlKey)return !event.shiftKey&&event.key.toLowerCase()==='c'?'ctrl+c':undefined;
  if(event.shiftKey)return;
  return {Enter:'enter',Escape:'esc',Tab:'tab',Backspace:'backspace',ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',PageUp:'pageup',PageDown:'pagedown'}[event.key];
}
function messageBlocks(buffer) {
  const blocks=[];let block,fenced=false;
  for(let row=0;row<buffer.length;row++) {
    const line=buffer.getLine(row);if(!line)continue;
    const text=line.translateToString(!buffer.getLine(row+1)?.isWrapped);
    if(line.isWrapped&&block){block.text+=text;continue;}
    // Terminal snapshots have no universal chat schema. Only explicit prompt/answer
    // markers get a speaker; everything else remains labelled terminal output.
    if(/^\s*```/.test(text))fenced=!fenced;
    const user=!fenced&&/^ {0,2}[›❯>]\s+\S/.test(text)&&!/(Ask Codex to do anything|Ask anything|>_ OpenAI)/i.test(text);
    const reply=!fenced&&/^ {0,2}[●•]\s+\S/.test(text);
    const role=user?'user':reply?'reply':'output';
    if(user||reply||!block||block.role==='user') {
      if(!text.trim())continue;
      block={row,role,text:user||reply?text.replace(/^\s*[›❯>●•]\s/,''):text};blocks.push(block);
    }else block.text+='\n'+text;
  }
  return blocks.map(block=>({...block,text:block.text.trimEnd()}));
}
function historyMatches(buffer,query) {
  const hits=[];query=query.trim().toLocaleLowerCase();if(!query)return hits;
  let text='',start=0;
  for(let y=0;y<=buffer.length;y++) {
    const line=buffer.getLine(y);
    if(!line?.isWrapped) {
      if(text.toLocaleLowerCase().includes(query))hits.push({row:start,text});
      text='';start=y;
    }
    if(line)text+=line.translateToString(!buffer.getLine(y+1)?.isWrapped);
  }
  return hits;
}
function responseChoices(text) {
  const answers=[];let current;
  for(const row of text.split('\n')) {
    if(/^\s*[❯›>] /.test(row)){current=undefined;continue;}
    if(/^\s*[●•] /.test(row)){current=[];answers.push(current);current.push(row.replace(/^\s*[●•] /,''));}
    else if(current)current.push(row);
  }
  return answers.map(rows=>rows.join('\n').trim()).filter(Boolean);
}
// Adapted from Heeler 3ac42a7 (Apache-2.0): Snippet, TerminalTextSafety and
// TerminalLinkPolicy. Browser-specific indexing/UI below; see THIRD-PARTY-NOTICES.md.
function makeSnippet(title,body,id) {
  body=body.replace(/\r\n?/g,'\n');
  if(!body.trim())throw Error('Write some text for the snippet.');
  if(body.length>4000)throw Error('Keep snippets within 4,000 characters.');
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(body+title))throw Error('Remove terminal control characters.');
  return {id,title:title.trim().slice(0,80),body};
}
function webTarget(text) {
  if(/[\x00-\x20\x7f-\x9f]/.test(text))return null;
  try {const url=new URL(text);return ['http:','https:'].includes(url.protocol)&&url.hostname&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
function terminalLinks(text) {
  const links=[];
  const add=value=>{const url=webTarget(value);if(url&&!links.includes(url))links.push(url);};
  // ponytail: scan whole snapshots, not PTY chunks; hard newlines are never guessed away.
  // OSC 8 destinations win over their visible labels. Other control payloads stay opaque.
  text=text.replace(/\x1b\]8;[^;\x07\x1b]*;([^\x07\x1b]*)(?:\x07|\x1b\\)([\s\S]*?)\x1b\]8;;(?:\x07|\x1b\\)/g,(_,target)=>{add(target);return ' ';});
  text=text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)|\x1b[P_X^][\s\S]*?(?:\x1b\\|$)/g,' ')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,sequence=>sequence.endsWith('m')?'':' ');
  for(const match of text.matchAll(/https?:\/\/[^\s<>"'`\x00-\x1f\x7f-\x9f]+/gi)) {
    let target=match[0].replace(/[.,;:!]+$/,'');
    for(const [left,right] of [['(',')'],['[',']'],['{','}']])while(target.endsWith(right)&&target.split(right).length>target.split(left).length)target=target.slice(0,-1);
    add(target);
  }
  return links.slice(-20);
}
function messageRows(buffer) {
  const rows=[];
  for(let y=0;y<buffer.length;y++) {
    const line=buffer.getLine(y);if(!line||line.isWrapped)continue;
    const text=line.translateToString(true);
    // Heeler's prompt-glyph approach, limited to loaded agent history; never shell key input.
    if(/^ {0,4}[│┃]?\s*[›❯>]\s+\S/.test(text)&&!/(?:Ask Codex to do anything|Ask anything|Message .+\.\.|>_ OpenAI)/i.test(text))rows.push(y);
  }
  return rows;
}
(() => {
  byId('mac-machine-badge').addEventListener('click',()=>byId('appearance-open').click());
  async function loadMachines(){
    try{const data=await api('/api/machines');byId('machine-select').replaceChildren(...data.machines.map(m=>new Option(m.label,m.id)));byId('machine-select').value=machineId;byId('machine-note').textContent=machineId==='local'?'Saved SSH machines come from Herdr on your PC.':'SSH · Create sessions and use live panes. File transfers, teams and remote mouse are not available yet.';}catch{byId('machine-note').textContent='Machine list unavailable. Check the PC connection.';}
  }
  function switchMachine(id){const url=new URL(location.href);url.hash='';if(id==='local')url.searchParams.delete('machine');else url.searchParams.set('machine',id);location.assign(url);}
  async function showMachines(){
    try{
      const {machines}=await api('/api/machines');
      byId('machine-switcher').replaceChildren(...machines.map(m=>{
        const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(m.id===machineId));b.setAttribute('aria-label','Switch to '+(m.id==='local'?'Windows':m.label));
        const icon=document.createElement('span');icon.className=m.id==='local'?'windows-mark':'remote-mark';icon.setAttribute('aria-hidden','true');
        if(m.id==='local')icon.textContent='⊞';else if(/mac|apple/i.test(m.label)){const img=document.createElement('img');img.src='/assets/rainbow-apple.svg';img.alt='';icon.append(img);}else icon.textContent='SSH';
        b.append(icon,document.createTextNode(m.id==='local'?'Windows':m.label));b.addEventListener('click',()=>{if(m.id!==machineId)switchMachine(m.id);});return b;
      }));
    }catch{byId('machine-switcher').textContent='Computers unavailable · open Appearance to retry';}
  }
  showMachines();
  byId('appearance-open').addEventListener('click',loadMachines);
  byId('machine-select').addEventListener('change',()=>{const url=new URL(location.href);url.hash='';if(byId('machine-select').value==='local')url.searchParams.delete('machine');else url.searchParams.set('machine',byId('machine-select').value);location.assign(url);});
  if(machineId!=='local'){
    byId('machine-note').textContent='SSH machine · open Appearance to switch back to your PC.';
  }
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{announce('Saved for this visit only.',true);}};
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',fn);return b;};
  const open=id=>{dismissKeyboard();dialog(id);};
  const shortcutActions=[['pane1','Pane 1','1'],['pane2','Pane 2','2'],['pane3','Pane 3','3'],['pane4','Pane 4','4'],['grid','All panes','0'],['previous','Previous pane','['],['next','Next pane',']'],['new','New pane / team','n'],['search','Search loaded history','f'],['appearance','Appearance',','],['compose','Focus message draft','i'],['direct','Control terminal directly','t'],['minimize','Minimize / restore selected pane','m'],['quick','Quick actions','k'],['help','Keyboard shortcuts','/']];
  const defaultBindings=Object.fromEntries(shortcutActions.map(([id,,key])=>[id,key]));
  let keyboard={enabled:true,modifier:'control',bindings:{...defaultBindings}};
  try{const saved=JSON.parse(localStorage.getItem('shep-keyboard')||'null');if(saved&&['control','command','option'].includes(saved.modifier)&&typeof saved.enabled==='boolean'&&shortcutActions.every(([id])=>/^[a-z0-9\[\]/,]$/.test(saved.bindings?.[id]))&&new Set(shortcutActions.map(([id])=>saved.bindings[id])).size===shortcutActions.length)keyboard=saved;}catch{}
  function showKeyboard(){
    byId('keyboard-enabled').checked=keyboard.enabled;byId('keyboard-modifier').value=keyboard.modifier;
    byId('keyboard-bindings').replaceChildren(...shortcutActions.map(([id,name])=>{const label=document.createElement('label');label.textContent=name;const field=document.createElement('input');field.value=keyboard.bindings[id];field.maxLength=1;field.dataset.action=id;field.setAttribute('aria-label',name+' shortcut key');field.autocapitalize='off';label.append(field);return label;}));
    byId('keyboard-status').textContent='';open('keyboard-dialog');
  }
  byId('keyboard-open').addEventListener('click',()=>{byId('appearance-dialog').close();showKeyboard();});
  byId('keyboard-reset').addEventListener('click',()=>{byId('keyboard-enabled').checked=true;byId('keyboard-modifier').value='control';for(const field of byId('keyboard-bindings').querySelectorAll('input'))field.value=defaultBindings[field.dataset.action];byId('keyboard-status').textContent='Defaults restored. Save to keep them.';});
  byId('keyboard-form').addEventListener('submit',event=>{
    event.preventDefault();const bindings=Object.fromEntries([...byId('keyboard-bindings').querySelectorAll('input')].map(field=>[field.dataset.action,field.value.toLowerCase()]));
    if(Object.values(bindings).some(key=>!/^[a-z0-9\[\]/,]$/.test(key))||new Set(Object.values(bindings)).size!==shortcutActions.length){byId('keyboard-status').textContent='Use a different letter, number, bracket, comma or slash for each action.';return;}
    const next={enabled:byId('keyboard-enabled').checked,modifier:byId('keyboard-modifier').value,bindings};
    try{localStorage.setItem('shep-keyboard',JSON.stringify(next));keyboard=next;byId('keyboard-status').textContent='Saved on this device.';}catch{byId('keyboard-status').textContent='Could not save. Your edits are still here.';}
  });
  document.addEventListener('keydown',event=>{
    if(!keyboard.enabled||event.defaultPrevented||document.querySelector('dialog[open]')||!shortcutMatches(event,keyboard.modifier))return;
    const action=shortcutActions.find(([id])=>keyboard.bindings[id]===shortcutKey(event))?.[0];if(!action)return;
    event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
    if(action==='help'){showKeyboard();return;}
    if(action==='appearance'){byId('appearance-open').click();return;}
    if(action==='grid'){navigate('sessions');return;}
    if(!connected||busy){announce('Wait for the connection or current action.',true);return;}
    if(action==='new'){byId('empty-new').click();return;}
    const tabs=[...byId('session-switcher').querySelectorAll('button[data-pane-id]')];
    if(action.startsWith('pane')){tabs[Number(action.slice(-1))-1]?.click();return;}
    if(action==='next'||action==='previous'){const index=tabs.findIndex(b=>b.dataset.paneId===paneSelect.value);tabs[(index+(action==='next'?1:-1)+tabs.length)%tabs.length]?.click();return;}
    if(action==='minimize'){const pane=state?.panes.find(p=>p.pane_id===paneSelect.value);if(pane)setPaneMinimized(pane.pane_id,!minimizedPanes.has(pane.terminal_id));navigate('sessions');return;}
    if(!frame||page!=='terminal'){announce('Open a terminal first.',true);return;}
    if(action==='compose'){setDirectInput(false);draft.focus();return;}
    if(action==='direct'){setDirectInput(true);byId('native-type').focus();return;}
    if(action==='search')byId('chat-search-open').click();
    if(action==='quick')byId('quick-open').click();
  },true);
  let attentionSignature='',searchSignature='';
  function attention(){
    const panes=(state?.panes||[]).filter(p=>p.agent_status==='blocked'||p.agent_status==='done'||qol.unread(p.pane_id));
    byId('attention-open').textContent=panes.length?'Inbox '+panes.length:'Inbox';
    const signature=JSON.stringify(panes.map(p=>[p.pane_id,paneName(p),p.agent_status]));if(signature===attentionSignature)return;attentionSignature=signature;
    byId('attention-list').replaceChildren(...panes.map(p=>button(paneName(p)+' · '+(p.agent_status==='blocked'?'Needs attention':'Finished'),()=>p.agent_status==='blocked'&&globalThis.teamUI?teamUI.approval(p):selectPane(p.pane_id,false))));
    if(!panes.length)byId('attention-list').textContent='All clear. Finished sessions and requests for approval appear here.';
  }
  function search(){
    if(!byId('search-dialog').open)return;
    const hits=terminal?historyMatches(terminal.buffer.active,byId('chat-search').value):[];
    const owner=frame?.pane.terminal_id;
    const signature=JSON.stringify([owner,historyLines,frame?.history?.truncated,hits]);if(signature===searchSignature)return;searchSignature=signature;
    byId('search-results').replaceChildren(...hits.slice(0,100).map(hit=>button(hit.text.slice(0,240),()=>{
      if(frame?.pane.terminal_id!==owner)return;
      byId('search-dialog').close();dismissKeyboard();scrollToRow(hit.row);historyPosition();
    })));
    byId('search-status').textContent=hits.length+' matches in loaded history'+(hits.length>100?' · first 100 shown':'');
    byId('search-older').hidden=!frame?.history?.truncated||historyLines>=10000;
  }
  let nativeMessages=false,messageKey='';
  function renderMessages() {
    const available=settings.theme.startsWith('imessage')&&!!frame?.pane.agent;
    const enabled=available&&!nativeMessages&&viewport.dataset.interact!=='true'&&frame.pane.agent_status!=='blocked';
    byId('message-mode').hidden=!available;
    byId('message-mode').textContent=nativeMessages?'Show messages':'Show native TUI';
    viewport.dataset.messages=String(enabled);byId('message-feed').hidden=!enabled;
    byId('terminal-stage').setAttribute('aria-hidden',String(enabled));
    if(!enabled)return;
    const key=frame.pane.terminal_id+'\n'+terminal.cols+'\n'+byId('transcript').textContent;
    if(key===messageKey)return;messageKey=key;
    byId('message-feed').replaceChildren(...messageBlocks(terminal.buffer.active).map(block=>{
      const article=document.createElement('article');article.className='message-bubble '+block.role;article.dataset.row=block.row;
      const label=document.createElement('div');label.className='message-speaker';label.textContent=block.role==='user'?'You':block.role==='reply'?paneName(frame.pane):'Terminal output';
      const body=document.createElement('div');body.className='message-body';body.textContent=block.text;
      article.append(label,body);return article;
    }));
  }
  function scrollToRow(row) {
    if(viewport.dataset.messages==='true') {
      const blocks=[...byId('message-feed').children];
      const block=blocks.reverse().find(b=>Number(b.dataset.row)<=row);
      if(block)viewport.scrollTop=block.offsetTop;
    }else viewport.scrollTop=row*terminalRowHeight();
  }
  byId('message-mode').addEventListener('click',()=>{nativeMessages=!nativeMessages;lastText=undefined;renderMessages();redraw();});
  globalThis.extras={attention,renderMessages,rendered(){search();readingTools();},leaving(){globalThis.voice?.cancel();},connection(message,error){
    byId('offline-banner').hidden=!error||message==='Connecting…';
    byId('offline-banner').querySelector('span').textContent=navigator.onLine===false?'This phone is offline. Reconnect Wi-Fi or cellular.':'Connection unavailable. Check your PC and Tailscale.';
  }};
  byId('offline-reconnect').addEventListener('click',()=>connect());
  window.addEventListener('online',()=>{if(!busy)connect();});
  window.addEventListener('offline',()=>extras.connection('Offline',true));
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  byId('attention-open').addEventListener('click',()=>{attention();open('attention-dialog');});attention();
  byId('chat-search-open').addEventListener('click',()=>{open('search-dialog');search();});
  byId('chat-search').addEventListener('input',search);
  byId('search-older').addEventListener('click',()=>{byId('search-status').textContent='Loading earlier messages…';loadEarlier();});
  let copies=[];
  byId('chat-copy-open').addEventListener('click',()=>{
    const text=byId('transcript').textContent||'';
    copies=responseChoices(text);copies.push(text);
    byId('copy-choice').replaceChildren(...copies.map((_,i)=>new Option(i===copies.length-1?'All loaded text':'Response '+(i+1),String(i))));
    byId('copy-choice').value=String(Math.max(0,copies.length-2));byId('copy-text').value=copies[Number(byId('copy-choice').value)]||'';
    byId('copy-status').textContent='Choose a response, then copy.';open('copy-dialog');
  });
  byId('copy-choice').addEventListener('change',()=>{byId('copy-text').value=copies[Number(byId('copy-choice').value)]||'';});
  byId('copy-confirm').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(byId('copy-text').value);byId('copy-status').textContent='Copied.';}catch{byId('copy-text').focus();byId('copy-text').select();byId('copy-status').textContent='Text selected. Use your phone’s Copy command.';}});
  byId('camera').addEventListener('click',()=>{if(!connected||busy||!frame)return;attachmentTarget={...frame.pane};byId('camera-picker').click();});
  byId('camera-picker').addEventListener('change',pickedAttachments);
  const allowed=['esc','tab','ctrl+c','enter','up','down','/help','/model','/status','/compact'];
  let quick=read('herdr-quick-actions',['esc','tab','ctrl+c']);if(!Array.isArray(quick))quick=['esc','tab','ctrl+c'];quick=[...new Set(quick.filter(x=>allowed.includes(x)))];
  function quickButtons(){byId('quick-buttons').replaceChildren(...quick.map(key=>button(key,()=>{
    byId('quick-dialog').close();if(key.startsWith('/')){if(draft.value.trim()){announce('Finish or clear your draft before inserting a command.',true);return;}draft.value=key;draft.dispatchEvent(new Event('input'));announce('Command ready. Review, then send.');}else input('key',key);
  })));save('herdr-quick-actions',quick);}
  byId('quick-open').addEventListener('click',()=>{quickButtons();open('quick-dialog');});
  byId('quick-add').addEventListener('click',()=>{const key=byId('quick-choice').value;if(allowed.includes(key)&&!quick.includes(key))quick.push(key);quickButtons();});
  byId('quick-reset').addEventListener('click',()=>{quick=['esc','tab','ctrl+c'];quickButtons();});
  let snippets=[],snippetError='',snippetOwner,editing;
  try {
    const stored=JSON.parse(localStorage.getItem('herdr-snippets')||'[]');
    if(!Array.isArray(stored)||stored.length>100)throw Error();
    const ids=new Set();snippets=stored.map(s=>{if(!s||typeof s.id!=='string'||ids.has(s.id)||typeof s.title!=='string'||typeof s.body!=='string')throw Error();ids.add(s.id);return makeSnippet(s.title,s.body,s.id);});
  }catch{snippetError='Saved snippets could not be read. They have been left untouched.';}
  function storeSnippets(next) {
    if(snippetError){byId('snippet-status').textContent=snippetError;return false;}
    try{localStorage.setItem('herdr-snippets',JSON.stringify(next));snippets=next;return true;}
    catch{byId('snippet-status').textContent='Could not save. Your editor text is still here.';return false;}
  }
  function listSnippets() {
    const query=byId('snippet-search').value.trim().toLocaleLowerCase();
    const rows=snippets.filter(s=>(s.title+'\n'+s.body).toLocaleLowerCase().includes(query)).map(s=>{
      const row=document.createElement('div');row.className='snippet-row';
      row.append(button(s.title||s.body.slice(0,80),()=>{
        if(!snippetOwner||frame?.pane.terminal_id!==snippetOwner){byId('snippet-status').textContent='Open snippets again for the current terminal.';return;}
        const next=draft.value+(draft.value?'\n':'')+s.body;
        if(next.length>8192){byId('snippet-status').textContent='The combined draft is too long. Shorten it first.';return;}
        if(viewport.dataset.interact==='true')setDirectInput(false);
        draft.value=next;draft.dispatchEvent(new Event('input'));byId('snippets-dialog').close();announce('Snippet added to draft. Review, then send.');
      }),button('Edit',()=>{editing=s.id;byId('snippet-title').value=s.title;byId('snippet-body').value=s.body;byId('snippet-delete').hidden=false;byId('snippet-status').textContent='Editing snippet.';}));return row;
    });
    byId('snippet-list').replaceChildren(...rows);
    if(!rows.length)byId('snippet-list').textContent=snippets.length?'No matching snippets.':'Save a prompt below, then tap it to add it to your draft.';
  }
  function clearSnippet(){editing=undefined;byId('snippet-title').value='';byId('snippet-body').value='';byId('snippet-delete').hidden=true;}
  byId('snippets-open').addEventListener('click',()=>{snippetOwner=frame?.pane.terminal_id;byId('quick-dialog').close();clearSnippet();byId('snippet-status').textContent=snippetError;listSnippets();open('snippets-dialog');});
  byId('snippet-search').addEventListener('input',listSnippets);
  byId('snippet-new').addEventListener('click',clearSnippet);
  byId('snippet-form').addEventListener('submit',event=>{
    event.preventDefault();
    try{if(!editing&&snippets.length>=100)throw Error('You can save up to 100 snippets.');const item=makeSnippet(byId('snippet-title').value,byId('snippet-body').value,editing||crypto.randomUUID());
      const next=editing?snippets.map(s=>s.id===editing?item:s):[...snippets,item];
      if(storeSnippets(next)){clearSnippet();listSnippets();byId('snippet-status').textContent='Saved on this device.';}
    }catch(error){byId('snippet-status').textContent=error.message;}
  });
  byId('snippet-delete').addEventListener('click',()=>{if(editing&&storeSnippets(snippets.filter(s=>s.id!==editing))){clearSnippet();listSnippets();byId('snippet-status').textContent='Snippet deleted.';}});
  const linkSessions=new Map();let readingKey='',jumpRows=[];
  function readingTools() {
    if(!frame||!terminal)return;
    const owner=frame.pane.terminal_id,key=owner+'\n'+terminal.cols+'\n'+byId('transcript').textContent+'\n'+frame.read.text+'\n'+(frame.history?.text||'');
    if(key!==readingKey){readingKey=key;jumpRows=frame.pane.agent?messageRows(terminal.buffer.active):[];
      const urls=terminalLinks((frame.history?.text||'')+'\n'+frame.read.text);
      const previous=linkSessions.get(owner)||[];linkSessions.set(owner,[...new Set([...previous,...urls])].slice(-20));
      for(const id of linkSessions.keys())if(!state.panes.some(p=>p.terminal_id===id))linkSessions.delete(id);
    }
    byId('message-jumps').hidden=!frame.pane.agent;
    byId('links-open').textContent='Links'+(linkSessions.get(owner)?.length?' '+linkSessions.get(owner).length:'');
  }
  function jumpMessage(direction) {
    readingTools();const row=viewport.dataset.messages==='true'?Number([...byId('message-feed').children].reverse().find(b=>b.offsetTop<=viewport.scrollTop+1)?.dataset.row||0):viewport.scrollTop/terminalRowHeight();
    const target=direction<0?[...jumpRows].reverse().find(y=>y<row-.5):jumpRows.find(y=>y>row+.5);
    if(target===undefined){if(direction>0)jumpLatest();else announce('No earlier message in loaded history. Use Load earlier messages or Search.');return;}
    scrollToRow(target);historyPosition();
  }
  byId('message-previous').addEventListener('click',()=>jumpMessage(-1));
  byId('message-next').addEventListener('click',()=>jumpMessage(1));
  byId('links-open').addEventListener('click',()=>{
    readingTools();const urls=linkSessions.get(frame?.pane.terminal_id)||[];
    byId('link-list').replaceChildren(...urls.map(url=>{const row=document.createElement('div');row.className='snippet-row';const a=document.createElement('a');a.href=url;a.textContent=url;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';row.append(a,button('Copy',async()=>{try{await navigator.clipboard.writeText(url);byId('link-status').textContent='Copied.';}catch{byId('link-status').textContent='Copy unavailable. Hold the link to copy it.';}}));return row;}));
    byId('link-status').textContent=urls.length?'Links from this terminal stay in memory only.':'No web links found in loaded output.';byId('quick-dialog').close();open('links-dialog');
  });
  async function diagnostics(){
    const out=byId('diagnostics-results');out.textContent='Checking…';
    try{const data=await api('/api/health');out.textContent='PC and bridge: reachable\nHerdr: '+(data.herdr?'connected':'unavailable; open Herdr on your PC')+'\nTailscale route: '+(data.privateRoute?'verified for this request':'not tested from this local preview')+'\nBridge uptime: '+Math.floor(data.uptime/60)+' minutes';}
    catch{out.textContent='Bridge: unreachable\nPC / Tailscale: cannot distinguish remotely. Check that the PC is awake, you are signed in, and Tailscale is connected.';}
  }
  byId('diagnostics-open').addEventListener('click',()=>{byId('appearance-dialog').close();open('diagnostics-dialog');diagnostics();});
  byId('diagnostics-retry').addEventListener('click',diagnostics);
})();
