(() => {
  const get=id=>document.getElementById(id), area=get('input-area');
  const handle=document.createElement('button');
  handle.id='drawer-toggle';handle.type='button';handle.setAttribute('aria-controls','session-drawer');
  const panel=document.createElement('section');panel.id='session-drawer';panel.setAttribute('aria-label','Session controls');
  const title=document.createElement('h2');title.textContent='Session controls';panel.append(title);
  for(const id of ['agent-controls','focused-status'])panel.append(get(id));
  panel.append(document.querySelector('.chat-utilities'));
  for(const id of ['history-tools','native-zoom','native-keys','keys'])panel.append(get(id));
  area.prepend(handle,panel);
  // Essential keys stay outside the drawer, independent of provider and old preferences.
  get('pinned-keys').hidden=false;
  const mic=get('dictate');mic.type='button';get('composer').insertBefore(mic,get('send'));
  let gesture,dragged=false;
  function open(expanded) {
    if(!expanded&&panel.contains(document.activeElement))handle.focus({preventScroll:true});
    panel.hidden=!expanded;handle.setAttribute('aria-expanded',String(expanded));
    handle.setAttribute('aria-label',expanded?'Hide session controls':'Show session controls');
    handle.textContent=expanded?'Hide controls':'Controls ↑';
    area.classList.toggle('drawer-open',expanded);
    if(typeof matchMedia==='function'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)area.animate?.([{opacity:.85,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'ease-out'});
    if(typeof redraw==='function')requestAnimationFrame(()=>redraw());
  }
  handle.addEventListener('click',()=>{if(dragged){dragged=false;return;}open(panel.hidden);});
  handle.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0)return;gesture={id:e.pointerId,x:e.clientX,y:e.clientY};dragged=false;handle.setPointerCapture(e.pointerId);});
  handle.addEventListener('pointerup',e=>{
    if(!gesture||gesture.id!==e.pointerId)return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;gesture=null;
    if(Math.abs(dy)>24&&Math.abs(dy)>Math.abs(dx)){dragged=true;open(dy<0);}
  });
  handle.addEventListener('pointercancel',()=>{gesture=null;dragged=false;});
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.target.matches('input,textarea,select')){e.preventDefault();open(false);}});
  get('terminal-options-open').addEventListener('click',()=>open(true));
  // Voice is outside the drawer: collapsing controls never hides Stop.
  open(false);
})();
