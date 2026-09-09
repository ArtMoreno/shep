// New sessions use Herdr's own launch operation; browser retries only read its receipt.
(() => {
  const form=byId('new-form'), fields=byId('new-fields'), submit=byId('new-submit'), note=byId('new-status');
  const agentSelect=byId('new-agent'), model=byId('new-model'), effort=byId('new-effort'), mode=byId('new-mode');

  let presets=[];try{const saved=JSON.parse(localStorage.getItem('herdr-session-presets')||'[]');if(Array.isArray(saved))presets=saved.filter(p=>p&&typeof p.name==='string'&&typeof p.agent==='string'&&typeof p.cwd==='string').slice(0,12);}catch{}
  function presetOptions(){byId('session-preset').replaceChildren(new Option('Choose a saved preset',''),...presets.map((p,i)=>new Option(p.name,String(i))));}
  function savePresets(){try{localStorage.setItem('herdr-session-presets',JSON.stringify(presets));}catch{setNote('Preset kept for this visit; storage unavailable.');}presetOptions();}
  byId('preset-save').addEventListener('click',()=>{
    const name=byId('preset-name').value.trim();if(!name){setNote('Name this preset first.');return;}
    const preset={name,agent:agentSelect.value,cwd:byId('new-folder').value,model:model.value,effort:effort.value,mode:mode.value,destination:form.elements.destination.value};
    const i=presets.findIndex(p=>p.name===name);if(i>=0)presets[i]=preset;else if(presets.length<12)presets.push(preset);else{setNote('Remove a preset first (12 maximum).');return;}savePresets();setNote('Preset saved.');
  });
  byId('session-preset').addEventListener('change',()=>{
    const value=byId('session-preset').value;if(value==='')return;const p=presets[Number(value)];if(!p)return;
    if(!agents.some(a=>a.id===p.agent)){setNote('That agent is no longer installed.');return;}
    agentSelect.value=p.agent;updateAgent();model.value=p.model||'';updateEffort();effort.value=p.effort||'';mode.value=p.mode||'default';byId('new-folder').value=p.cwd;byId('preset-name').value=p.name;
    form.elements.destination.value=state.panes.length?p.destination:'workspace';placement();setNote('Preset loaded. Review settings, then open.');
  });
  byId('preset-delete').addEventListener('click',()=>{const value=byId('session-preset').value;if(value==='')return;presets.splice(Number(value),1);savePresets();setNote('Preset removed.');});
  presetOptions();
  let agents=[], pending, pollTimer, opening=false, launchWorkspace;
  try { pending=JSON.parse(sessionStorage.getItem('herdr-mobile-launch')||'null'); } catch {}
  const currentPane=()=>state?.panes.find(p=>p.pane_id===paneSelect.value);
  const setNote=text=>{note.textContent=text;if(byId('quick-pane-dialog').open)byId('quick-pane-status').textContent=text;};
  const savePending=()=>{if(pending)sessionStorage.setItem('herdr-mobile-launch',JSON.stringify(pending));else sessionStorage.removeItem('herdr-mobile-launch');};
  const options=(select,values,labels={})=>select.replaceChildren(...values.map(value=>new Option(labels[value]||value,value)));
  function updateEffort() {
    const agent=agents.find(a=>a.id===agentSelect.value), selected=effort.value;
    const values=agent?.modelEfforts?.[model.value]||agent?.efforts||[];
    options(effort,['',...values],{'':'Default'});
    if(values.includes(selected))effort.value=selected;
    byId('new-effort-label').hidden=!values.length;
  }
  function updateAgent() {
    const agent=agents.find(a=>a.id===agentSelect.value);
    if(!agent)return;
    byId('new-brand').hidden=!agent.icon;if(agent.icon)byId('new-brand').src=agent.icon;
    const empty=agent.id==='empty';model.disabled=empty;byId('new-message').disabled=empty;
    if(empty){model.value='';byId('new-message').value='';}
    byId('new-models').replaceChildren(...(agent.models||[]).map(value=>new Option(value,value)));
    options(mode,agent.modes,{default:'Default',plan:'Plan',auto:'Auto',acceptEdits:'Edit',build:'Build'});
    byId('new-mode-label').hidden=agent.modes.length<2;
    updateEffort();submit.textContent='Open '+agent.name;
  }
  function placement() {
    byId('new-placement').hidden=form.elements.destination.value==='workspace';
  }
  function restore(body) {
    launchWorkspace=body.workspaceId;
    agentSelect.value=body.agent;updateAgent();model.value=body.model;updateEffort();effort.value=body.effort;mode.value=body.mode;
    byId('new-folder').value=body.cwd;byId('new-message').value=body.message;byId('new-name').value=body.displayName||'';
    form.elements.destination.value=body.destination;byId('new-beside').value=body.paneId||'';byId('new-direction').value=body.direction||'right';placement();
  }
  async function openNew(paneId,direction='right') {
    if(busy||opening)return;
    byId('pane-actions-dialog').close();
    dismissKeyboard();dialog('new-dialog');fields.disabled=true;submit.disabled=true;setNote('Loading installed agents…');
    try {
      const [data,next]=await Promise.all([api('/api/launch-options'),api('/api/state')]);state=next;
      if(next.bridgeId!==bridgeId)throw new Error('Reconnect the terminal before creating a session.');
      const target=paneId?next.panes.find(p=>p.pane_id===paneId):currentPane();
      if(paneId&&!target)throw new Error('That pane has closed. Choose another pane in Sessions.');
      launchWorkspace=target?.workspace_id||state.workspaceId||'new';
      agents=data.agents;
      const selected=(paneId&&target?.agent)||agentSelect.value||target?.agent||'codex';
      options(agentSelect,agents.map(a=>a.id),Object.fromEntries(agents.map(a=>[a.id,a.name])));
      if(agents.some(a=>a.id===selected))agentSelect.value=selected;
      options(byId('new-beside'),next.panes.map(p=>p.pane_id),Object.fromEntries(next.panes.map(p=>[p.pane_id,p.pane_id===paneSelect.value?'Current pane':paneName(p)+' · '+p.pane_id])));
      if(target)byId('new-beside').value=target.pane_id;
      const folders=[...new Set(next.panes.map(p=>p.foreground_cwd||p.cwd).filter(Boolean))];
      byId('new-folders').replaceChildren(...folders.map(path=>new Option(path,path)));
      if(paneId||!byId('new-folder').value)byId('new-folder').value=target?.foreground_cwd||target?.cwd||folders[0]||data.home||byId('workspace').textContent;
      if(paneId){form.elements.destination.value='tab';byId('new-direction').value=direction;}
      for(const radio of form.elements.destination)radio.disabled=radio.value!=='workspace'&&!next.panes.length;
      if(!next.panes.length)form.elements.destination.value='workspace';
      updateAgent();placement();
      if(pending){restore(pending);pollLaunch();return;}
      if(!agents.length)throw new Error('No supported agents are installed on your PC.');
      fields.disabled=false;submit.disabled=false;setNote('Opens on your PC');
    } catch(error) {setNote(error.message);}
  }
  async function showCreated(id,view='terminal',placement) {
    byId('new-dialog').close();byId('quick-pane-dialog').close();await connect();
    if(placement?.paneId&&placement.destination!=='workspace') {
      const tile=previews.get(id)?.tile, target=previews.get(placement.paneId)?.tile;
      if(tile&&target) {
        byId('pane-grid').insertBefore(tile,placement.direction==='left'?target:target.nextSibling);
        if(['left','right'].includes(placement.direction)){tile.style.gridColumn='span 1';target.style.gridColumn='span 1';}
        savePaneLayout();applyPaneLayout();
      }
    }
    if(state.panes.some(p=>p.pane_id===id))selectPane(id,false,view);
    else navigate('sessions');
  }
  async function pollLaunch() {
    clearTimeout(pollTimer);
    if(!pending)return;
    fields.disabled=true;submit.disabled=true;setNote('Opening '+(agents.find(a=>a.id===pending.agent)?.name||pending.agent)+' on your PC…');
    try {
      if(pending.bridgeId!==bridgeId)throw Object.assign(new Error('Bridge restarted. Check Sessions before opening another session.'),{status:409});
      const result=await api('/api/launch?id='+encodeURIComponent(pending.id));
      if(result.status==='opening'){setNote(result.stage||'Starting on your PC…');pollTimer=setTimeout(pollLaunch,1000);return;}
      if(result.status==='error') {
        pending.paneIdCreated=result.paneId;savePending();setNote(result.error);
        byId('new-recovery').hidden=false;byId('quick-pane-recovery').hidden=false;byId('new-inspect').textContent=result.paneId?'Open created pane':'Check sessions';return;
      }
      const view=pending.returnPage==='sessions'?'sessions':'terminal', placement=pending;
      globalThis.qol?.setName(result.terminalId,pending.displayName);
      pending=null;savePending();byId('new-message').value='';byId('new-folder').value='';byId('new-name').value='';form.elements.destination.value='tab';byId('new-recovery').hidden=true;
      await showCreated(result.paneId,view,placement);
    } catch(error) {
      setNote(error.message);
      if(error.status){byId('new-recovery').hidden=false;byId('quick-pane-recovery').hidden=false;return;}
      pollTimer=setTimeout(pollLaunch,3000);
    }
  }
  form.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&event.target.matches('input:not([type=radio])'))event.preventDefault();
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(pending||opening||!form.reportValidity())return;
    const beside=state.panes.find(p=>p.pane_id===byId('new-beside').value);
    const body={id:crypto.randomUUID(),bridgeId,returnPage:page,displayName:byId('new-name').value.trim(),agent:agentSelect.value,cwd:byId('new-folder').value.trim(),destination:form.elements.destination.value,
      workspaceId:form.elements.destination.value==='pane'?beside?.workspace_id:launchWorkspace,paneId:beside?.pane_id,terminalId:beside?.terminal_id,direction:byId('new-direction').value,
      model:model.value.trim(),effort:effort.value,mode:mode.value,message:byId('new-message').value};
    await submitLaunch(body);
  });
  async function submitLaunch(body){
    pending=body;opening=true;fields.disabled=true;submit.disabled=true;setNote('Opening on your PC…');
    try {
      savePending();
      await api('/api/launch',{method:'POST',headers:{'Content-Type':'application/json','X-Herdr-Bridge':bridgeId},body:JSON.stringify(pending)});
      pollLaunch();
    } catch(error) {
      if(error.status||error.name==='SecurityError'||error.name==='QuotaExceededError') {
        pending=null;try{savePending();}catch{}fields.disabled=false;submit.disabled=false;setNote(error.message);byId('quick-pane-recovery').hidden=false;
      } else {setNote('Checking whether the session opened…');pollTimer=setTimeout(pollLaunch,1000);}
    } finally {opening=false;}
  }
  byId('new-open').addEventListener('click',()=>openNew());
  if(typeof machineId!=='undefined'&&machineId!=='local'){
    byId('quick-independent').textContent='Choose remote agent';byId('quick-team').hidden=true;
    byId('quick-independent').addEventListener('click',event=>{event.stopImmediatePropagation();byId('quick-pane-dialog').close();openNew();},true);
  }
  byId('empty-new').addEventListener('click',()=>{
    if(opening||busy)return;dismissKeyboard();dialog('quick-pane-dialog');byId('quick-pane-recovery').hidden=true;
    byId('quick-pane-current').disabled=!state.panes.length||!!pending;byId('quick-pane-window').disabled=!!pending;
    setNote(state.panes.length?'Current window splits beside the selected pane. New window opens a separate workspace.':'No window is open. Choose New window.');
    if(pending)pollLaunch();
  });
  for(const [id,destination] of [['quick-pane-current','pane'],['quick-pane-window','workspace']])byId(id).addEventListener('click',async()=>{
    if(pending||opening||busy)return;opening=true;byId('quick-pane-current').disabled=byId('quick-pane-window').disabled=true;setNote('Opening empty terminal…');
    try{
      const next=await api('/api/state');if(next.bridgeId!==bridgeId)throw new Error('Reconnect before opening a pane.');
      if(next.panes.length>=4)throw new Error('Four panes are open. Close one to add another.');
      const target=next.panes.find(p=>p.pane_id===paneSelect.value)||next.panes[0];
      const home=!target?(await api('/api/launch-options')).home:undefined;
      if(destination==='pane'&&!target)throw new Error('The current window closed. Choose New window.');
      const body={id:crypto.randomUUID(),bridgeId,returnPage:'terminal',agent:'empty',destination,workspaceId:target?.workspace_id||next.workspaceId||'new',paneId:target?.pane_id,terminalId:target?.terminal_id,direction:'down',cwd:target?.foreground_cwd||target?.cwd||home||byId('workspace').textContent.trim(),model:'',effort:'',mode:'default',message:''};
      await submitLaunch(body);
    }catch(error){setNote(error.message);}
    finally{opening=false;if(!pending){byId('quick-pane-current').disabled=!state.panes.length;byId('quick-pane-window').disabled=false;}}
  });
  byId('quick-pane-recovery').addEventListener('click',()=>{byId('quick-pane-dialog').close();openNew();});
  byId('pane-actions-new').addEventListener('click',()=>{
    const id=byId('pane-actions-dialog').dataset.paneId;
    openNew(id==='quota'?undefined:id);
  });
  byId('pane-actions-new-left').addEventListener('click',()=>openNew(byId('pane-actions-dialog').dataset.paneId,'left'));
  agentSelect.addEventListener('change',()=>{model.value='';effort.value='';updateAgent();});
  model.addEventListener('input',updateEffort);
  for(const radio of form.elements.destination)radio.addEventListener('change',placement);
  byId('new-inspect').addEventListener('click',()=>showCreated(pending?.paneIdCreated));
  byId('new-edit').addEventListener('click',()=>{
    clearTimeout(pollTimer);pending=null;savePending();byId('new-recovery').hidden=true;fields.disabled=false;submit.disabled=false;
    setNote('Review your sessions before opening another one.');
  });
})();
