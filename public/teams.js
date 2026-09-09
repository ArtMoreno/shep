(() => {
  let agents=[],poll,approvalFrame;
  const orchestrated=()=>byId('session-kind').value==='orchestrated';
  const post=(path,body)=>api(path,{method:'POST',headers:{'Content-Type':'application/json','X-Herdr-Bridge':bridgeId},body:JSON.stringify(body)});
  const button=(text,run)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=run;return b;};
  function members(){
    const host=byId('team-members'),count=Number(byId('team-count').value);
    while(host.children.length>count)host.lastChild.remove();
    while(host.children.length<count){
      const i=host.children.length,row=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=orchestrated()?(i?'Worker '+i:'Orchestrator'):'Pane '+(i+1);row.append(legend);
      for(const [key,title] of [['agent','Provider'],['model','Model'],['effort','Reasoning']]){
        const label=document.createElement('label'),input=document.createElement(key==='model'?'input':'select');input.dataset.field=key;input.id='team-'+i+'-'+key;label.htmlFor=input.id;label.textContent=title;row.append(label,input);
      }
      const provider=row.querySelector('select'),model=row.querySelector('input'),effort=row.querySelector('[data-field=effort]');
      provider.replaceChildren(...agents.filter(a=>!orchestrated()||a.id!=='empty').map(a=>new Option(a.name,a.id)));
      const choices=document.createElement('datalist');choices.id='team-models-'+i;row.append(choices);model.setAttribute('list',choices.id);model.placeholder='Provider default';model.autocapitalize='off';
      const levels=()=>{const a=agents.find(a=>a.id===provider.value),value=effort.value;effort.replaceChildren(new Option('Default',''),...(a?.modelEfforts?.[model.value]||a?.efforts||[]).map(v=>new Option(v,v)));if([...effort.options].some(o=>o.value===value))effort.value=value;};
      const update=()=>{choices.replaceChildren(...(agents.find(a=>a.id===provider.value)?.models||[]).map(v=>new Option(v,v)));model.disabled=effort.disabled=provider.value==='empty';levels();};provider.onchange=()=>{model.value='';effort.value='';update();};model.oninput=levels;update();host.append(row);
      const nameLabel=document.createElement('label'),name=document.createElement('input');name.id='team-'+i+'-name';name.dataset.field='displayName';name.maxLength=40;name.placeholder=i?'Tests, Research…':'Frontend…';nameLabel.htmlFor=name.id;nameLabel.textContent='Pane name (optional)';row.append(nameLabel,name);
    }
    byId('team-layout').replaceChildren(...Object.entries(paneTemplates(Math.min(4,count+(state?.panes.length||0)))).map(([key,value])=>new Option(value.name,key)));
  }
  function sessionKind(){
    const team=orchestrated();byId('team-dialog').querySelector('h2').textContent=team?'Start a team':'Start independent panes';byId('team-dialog').setAttribute('aria-label',team?'Start a team':'Start independent panes');
    for(const id of ['team-checkout','team-branch','team-task']){byId(id).hidden=!team;byId(id).disabled=!team;document.querySelector('label[for="'+id+'"]').hidden=!team;}
    document.querySelector('label[for="team-folder"]').textContent=team?'Git project folder':'Working folder';document.querySelector('label[for="team-count"]').textContent=team?'Team size':'Number of panes';
    for(const option of byId('team-count').options){const n=Number(option.value);option.textContent=team?(n===1?'Orchestrator only':'Orchestrator + '+(n-1)+' worker'+(n===2?'':'s')):n+' pane'+(n===1?'':'s');}
    byId('team-submit').textContent=team?'Start team':'Open panes';byId('team-explanation').textContent=team?'Each worker gets a separate worktree. The orchestrator delegates and reviews; it asks before merging.':'You control each pane independently. Choose an agent or an empty terminal for each. No orchestrator, automatic assignments, or worktrees.';
    byId('team-members').replaceChildren();members();
  }
  byId('session-kind').onchange=sessionKind;
  async function showTeams(){
    clearTimeout(poll);
    try{
      const result=await api('/api/teams'),host=byId('team-list');host.replaceChildren();
      for(const team of result.teams.slice().reverse()){
        const section=document.createElement('section'),title=document.createElement('p');title.textContent=(team.branch||'Independent panes')+' · '+team.status;section.append(title);
        for(const member of team.members)if(member.paneId){globalThis.qol?.setName(member.terminalId,member.displayName);section.append(button((member.displayName||member.role)+' · '+member.agent+' · '+(member.stage||member.status),()=>selectPane(member.paneId,false)));}
        if(team.error){const p=document.createElement('p');p.textContent=team.error;section.append(p);}
        if(team.brief&&team.status!=='ready'){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Saved assignment · review before sending';pre.textContent=team.brief;details.append(summary,pre);section.append(details);}
        const note=document.createElement('p');note.className='muted';note.textContent=team.orchestrated===false?'Independent panes stay open when you close this screen.':'Merges require your approval in the orchestrator chat. Closing this screen leaves the team running.';section.append(note);host.append(section);
      }
      if(!result.teams.length)host.textContent='No saved launches yet.';
      if(result.teams.some(t=>['opening','sending'].includes(t.status)))poll=setTimeout(showTeams,2000);
    }catch(e){byId('team-list').textContent=e.message;}
  }
  const openTeams=()=>{byId('new-dialog').close();dialog('teams-dialog');showTeams();};
  byId('team-open').after(button('Recent launches',openTeams));
  byId('teams-refresh').onclick=showTeams;
  async function openSetup(kind){
    byId('session-kind').value=kind;
    byId('new-dialog').close();byId('quick-pane-dialog').close();dialog('team-dialog');byId('team-submit').disabled=true;
    try{agents=(await api('/api/launch-options')).agents;const available=4-state.panes.length;for(const option of byId('team-count').options)option.disabled=Number(option.value)>available;if(Number(byId('team-count').value)>available)byId('team-count').value=String(Math.max(1,available));sessionKind();byId('team-folder').value=byId('new-folder').value||state.panes.find(p=>p.pane_id===paneSelect.value)?.foreground_cwd||state.panes.find(p=>p.pane_id===paneSelect.value)?.cwd||byId('workspace').textContent.trim();byId('team-branch').value='mobile/team-'+Date.now().toString(36);byId('team-submit').disabled=!agents.length||available<1;byId('team-status').textContent=available<1?'Close a session first. Four panes are already open.':'Up to four panes total, including existing sessions.';}catch(e){byId('team-status').textContent=e.message;}
  }
  byId('team-open').onclick=()=>openSetup('orchestrated');byId('independent-open').onclick=()=>openSetup('independent');
  byId('quick-independent').onclick=()=>openSetup('independent');byId('quick-team').onclick=()=>openSetup('orchestrated');
  byId('team-count').onchange=members;
  byId('team-form').onsubmit=async event=>{
    event.preventDefault();if(!event.currentTarget.reportValidity())return;byId('team-submit').disabled=true;
    const body={id:crypto.randomUUID(),bridgeId,orchestrated:orchestrated(),workspaceId:state.workspaceId,cwd:byId('team-folder').value.trim(),branch:byId('team-branch').value.trim(),checkout:byId('team-checkout').value,task:byId('team-task').value,members:[...byId('team-members').children].map(row=>Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value.trim()])))};
    byId('team-status').textContent='Starting on your PC…';
    try{await post('/api/teams',body);layoutTemplates[Math.min(4,body.members.length+state.panes.length)]=byId('team-layout').value;savePaneLayout();byId('team-dialog').close();openTeams();}
    catch(e){byId('team-status').textContent=e.message;if(!e.status){byId('team-status').textContent+=' Check Recent launches before trying again.';openTeams();}}
    finally{byId('team-submit').disabled=false;}
  };
  async function refreshApproval(pane){
    const next=await api('/api/frame?pane='+encodeURIComponent(pane.pane_id));
    if(next.pane.terminal_id!==pane.terminal_id)throw new Error('That session changed. Open it again from Sessions.');
    approvalFrame=next;byId('approval-text').textContent=plain(next.read.text);byId('approval-status').textContent=next.pane.agent_status==='blocked'?'Waiting for your decision.':'This pane is no longer waiting for approval.';
    for(const b of document.querySelectorAll('[data-approval-key]'))b.disabled=next.pane.agent_status!=='blocked';
  }
  globalThis.teamUI={async approval(pane){byId('attention-dialog').close();dialog('approval-dialog');approvalFrame=undefined;try{await refreshApproval(pane);}catch(e){byId('approval-status').textContent=e.message;}}};
  for(const b of document.querySelectorAll('[data-approval-key]'))b.onclick=async()=>{
    const previous=approvalFrame;if(!previous)return;
    for(const key of document.querySelectorAll('[data-approval-key]'))key.disabled=true;
    try{await refreshApproval(previous.pane);if(approvalFrame.pane.agent_status!=='blocked')return;if(b.dataset.approvalKey==='enter'&&previous.read.text!==approvalFrame.read.text){byId('approval-status').textContent='The choices changed. Review them before confirming.';return;}await post('/api/input',{id:crypto.randomUUID(),bridgeId,paneId:previous.pane.pane_id,terminalId:previous.pane.terminal_id,kind:'key',key:b.dataset.approvalKey});await refreshApproval(previous.pane);}catch(e){byId('approval-status').textContent=e.message;}
  };
  byId('approval-open').onclick=()=>{if(approvalFrame)selectPane(approvalFrame.pane.pane_id,false);};
})();
