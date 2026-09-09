(() => {
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{announce('Applied for this visit; browser storage is unavailable.',true);return false;}};
  const names=read('herdr-names',{}),favorites=read('herdr-favorites',[]),positions=new Map(),activity=new Map(),unread=new Set();
  let pendingPosition,lastTop=0,renameTarget,slide,slideAnimation;
  let checkpoint;try{checkpoint=JSON.parse(sessionStorage.getItem('herdr-resume')||'null');}catch{}
  const motion=()=>!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Animate only the visible terminal, not the potentially huge scrollback spacer.
  const stage=byId('terminal');
  function settleSwipe(){slideAnimation?.cancel();slideAnimation=undefined;stage.style.transform='';stage.style.opacity='';}
  function springBack(){const from=stage.style.transform;settleSwipe();if(from&&motion())slideAnimation=stage.animate([{transform:from},{transform:'translateX(0)'}],{duration:120,easing:'cubic-bezier(.2,.8,.2,1)'});}
  const chip=document.createElement('button');chip.id='connection-chip';chip.type='button';chip.textContent='Connecting…';chip.title='Connection status';chip.addEventListener('click',()=>{if(!connected&&!busy)connect();});byId('app').append(chip);
  const fontSize=Number(read('herdr-font-size',14));
  globalThis.qol={
    fontSize:[12,14,17].includes(fontSize)?fontSize:14,
    name:p=>typeof names[p?.terminal_id]==='string'?names[p.terminal_id]:'',
    setName(id,value){value=typeof value==='string'?value.trim().slice(0,40):'';if(id&&value&&names[id]!==value){names[id]=value;save('herdr-names',names);}},
    checkpoint(){qol.leaving();if(!frame)return;checkpoint={paneId:frame.pane.pane_id,terminalId:frame.pane.terminal_id,page,draft:typeof draft==='undefined'?'':draft.value,position:positions.get(frame.pane.terminal_id)};try{sessionStorage.setItem('herdr-resume',JSON.stringify(checkpoint));}catch{}},
    resume(pane){const saved=checkpoint;checkpoint=undefined;try{sessionStorage.removeItem('herdr-resume');}catch{}if(!saved||saved.paneId!==pane?.pane_id||saved.terminalId!==pane?.terminal_id)return;if(saved.position&&Number.isFinite(saved.position.top)&&Number.isInteger(saved.position.lines)&&saved.position.lines>=0&&saved.position.lines<=10000)positions.set(pane.terminal_id,saved.position);return saved;},
    unread:id=>unread.has(state?.panes.find(p=>p.pane_id===id)?.terminal_id),
    activity(panes){
      const ids=new Set(panes.map(p=>p.terminal_id));
      for(const id of activity.keys())if(!ids.has(id)){activity.delete(id);unread.delete(id);positions.delete(id);}
      for(const p of panes){
        const old=activity.get(p.terminal_id),current=p.agent_status;
        const changed=old&&old!==current&&(current==='blocked'||old==='working'&&['idle','done'].includes(current));
        if(changed)unread.add(p.terminal_id);
        if(page==='terminal'&&p.pane_id===paneSelect.value&&!document.hidden)unread.delete(p.terminal_id);
        activity.set(p.terminal_id,current);
      }
    },
    leaving(){globalThis.extras?.leaving();if(page==='terminal'&&frame&&!pendingPosition)positions.set(frame.pane.terminal_id,{top:viewport.scrollTop,lines:historyLines,latest:viewport.scrollHeight-viewport.clientHeight-viewport.scrollTop<30});},
    entering(id){if(slide&&slide.id!==id){slide=undefined;settleSwipe();}pendingPosition=positions.get(state?.panes.find(p=>p.pane_id===id)?.terminal_id);if(pendingPosition)historyLines=pendingPosition.lines;lastTop=0;},
    rendered(){globalThis.extras?.rendered();if(page!=='terminal'){slide=undefined;settleSwipe();return;}if(pendingPosition){viewport.scrollTop=pendingPosition.latest?(frame?.pane.agent?viewport.scrollHeight:0):pendingPosition.top;pendingPosition=undefined;historyPosition();}lastTop=viewport.scrollTop;if(slide?.id===frame?.pane.pane_id){const direction=slide.direction;slide=undefined;settleSwipe();if(motion())slideAnimation=stage.animate([{transform:'translateX('+(-direction*16)+'px)'},{transform:'translateX(0)'}],{duration:120,easing:'cubic-bezier(.2,.8,.2,1)'});}},
    connection(message,error){globalThis.extras?.connection(message,error);if(error&&message!=='Connecting…'){slide=undefined;settleSwipe();}chip.dataset.error=String(error);const host=state?.machine?.id!=='local'&&state?.machine?.label;chip.textContent=error?'↻ Reconnect':host?'● '+host+' · SSH':'● Connected';chip.title=message;chip.setAttribute('aria-label',error?'Reconnect: '+message:host?'Connected to '+host:'Connected to your PC');},
    attachment(item){byId('attachment-preview-name').textContent=item.file.name;byId('attachment-preview-info').textContent=(item.file.size/1024).toFixed(1)+' KB · '+(item.file.type||'File');const img=byId('attachment-preview-image');img.hidden=!item.url;if(item.url)img.src=item.url;else img.removeAttribute('src');dialog('attachment-preview-dialog');}
  };
  byId('text-size').value=qol.fontSize;
  byId('text-size').addEventListener('change',()=>{qol.leaving();qol.fontSize=Number(byId('text-size').value);save('herdr-font-size',qol.fontSize);qol.entering(paneSelect.value);fit();redraw();});
  viewport.addEventListener('scroll',()=>{const top=viewport.scrollTop,up=top<lastTop;lastTop=top;if(up&&top<40&&frame?.history?.truncated&&!pendingPosition)loadEarlier();},{passive:true});
  for(const strip of [byId('session-switcher'),viewport]) {
  let swipe,suppressClick=false;
  strip.addEventListener('pointerdown',e=>{if(strip===viewport&&(viewport.dataset.interact==='true'||viewport.scrollWidth>viewport.clientWidth+2))return;if(e.isPrimary!==false&&e.button===0&&!busy){settleSwipe();slide=undefined;swipe={x:e.clientX,y:e.clientY};}},{passive:true});
  strip.addEventListener('pointermove',e=>{if(!swipe||busy||page!=='terminal')return;const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){swipe=undefined;springBack();return;}if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*1.5)return;strip.setPointerCapture?.(e.pointerId);const panes=state?.panes||[],i=panes.findIndex(p=>p.pane_id===paneSelect.value),hasNext=!!panes[i+(dx<0?1:-1)];if(motion())stage.style.transform='translateX('+Math.max(-96,Math.min(96,dx*(hasNext ? .9 : .15)))+'px)';},{passive:true});
  strip.addEventListener('pointercancel',()=>{swipe=undefined;springBack();});
  strip.addEventListener('pointerup',e=>{if(!swipe)return;const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;swipe=undefined;if(Math.abs(dx)<50||Math.abs(dx)<Math.abs(dy)*1.5||busy){springBack();return;}const panes=state?.panes||[],i=panes.findIndex(p=>p.pane_id===paneSelect.value),next=panes[i+(dx<0?1:-1)];if(next){suppressClick=true;settleSwipe();slide={id:next.pane_id,direction:Math.sign(dx)};dismissKeyboard();selectPane(next.pane_id,false);setTimeout(()=>{suppressClick=false;},500);}else springBack();},{passive:true});
  strip.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;}},true);
  }
  byId('pane-actions-rename').addEventListener('click',()=>{const p=state?.panes.find(p=>p.pane_id===byId('pane-actions-dialog').dataset.paneId);if(!p)return;renameTarget=p.terminal_id;byId('session-name').value=names[renameTarget]||'';byId('pane-actions-dialog').close();dialog('rename-dialog');});
  byId('rename-form').addEventListener('submit',e=>{e.preventDefault();if(!renameTarget)return;const value=byId('session-name').value.trim();if(value)names[renameTarget]=value;else delete names[renameTarget];save('herdr-names',names);byId('rename-dialog').close();renderSessionTabs();if(frame)paneTitle(byId('pane-picker'),frame.pane);if(page==='sessions')renderOverview(generation);});
  function renderFavorites(){
    byId('favorite-list').replaceChildren(...favorites.map((f,i)=>{const row=document.createElement('div');row.className='favorite-row';const use=document.createElement('button');use.textContent=f.name;use.addEventListener('click',()=>{paneLayout=structuredClone(f.layout);layoutTemplates=readLayoutTemplates({templates:f.templates});setQuotaView(f.quota);byId('favorite-status').textContent='Applied '+f.name;});const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Delete favorite '+f.name);remove.addEventListener('click',()=>{favorites.splice(i,1);save('herdr-favorites',favorites);renderFavorites();});row.append(use,remove);return row;}));
  }
  byId('favorite-save').addEventListener('click',()=>{const name=byId('favorite-name').value.trim();if(!name){byId('favorite-status').textContent='Give this layout a name first.';return;}savePaneLayout();const f={name,layout:structuredClone(paneLayout),templates:{...layoutTemplates},quota:quotaView};const old=favorites.findIndex(f=>f.name===name);if(old>=0)favorites[old]=f;else if(favorites.length<8)favorites.push(f);else{byId('favorite-status').textContent='Remove a favorite first (8 maximum).';return;}if(save('herdr-favorites',favorites))byId('favorite-status').textContent='Saved '+name;renderFavorites();});
  renderFavorites();
  const note=byId('notifications-status');
  const supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  if(!supported){note.textContent='Notifications are unavailable here. On iPhone, add Shep to the Home Screen and open it there.';byId('notifications-enable').disabled=true;}
  let registration;
  const service=()=>registration||(registration=navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready));
  if(supported)service().then(r=>r.pushManager.getSubscription()).then(s=>{byId('notifications-disable').hidden=!s;if(s)note.textContent='Completion alerts enabled for this device.';}).catch(()=>{});
  byId('notifications-enable').addEventListener('click',async()=>{
    try{
      const permission=await Notification.requestPermission();if(permission!=='granted'){note.textContent='Permission was not granted. You can change it in device settings.';return;}
      note.textContent='Enabling…';const r=await service(),key=await api('/api/push/key');
      const bytes=Uint8Array.from(atob(key.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
      const subscription=await r.pushManager.getSubscription()||await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
      await api('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json','X-Herdr-Bridge':bridgeId},body:JSON.stringify(subscription)});
      byId('notifications-disable').hidden=false;note.textContent='Enabled. The PC must stay on; alerts can arrive while Shep is closed.';
    }catch(e){note.textContent='Could not enable alerts: '+e.message;}
  });
  byId('notifications-disable').addEventListener('click',async()=>{try{const s=await(await service()).pushManager.getSubscription();if(s){await api('/api/push/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json','X-Herdr-Bridge':bridgeId},body:JSON.stringify({endpoint:s.endpoint})});await s.unsubscribe();}byId('notifications-disable').hidden=true;note.textContent='Notifications off.';}catch(e){note.textContent=e.message;}});
  if(supported)navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.paneId&&state?.panes.some(p=>p.pane_id===e.data.paneId))selectPane(e.data.paneId,false);});
  renderSessionTabs();
})();
