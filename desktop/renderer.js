const $=id=>document.getElementById(id);
let editing=false;
function render(s){
  $('version').textContent=`v${s.version}`;
  $('notice').textContent=s.message;
  $('herdrStatus').textContent=s.herdr.ok?`Herdr ${s.herdr.version} · ${s.herdr.panes} panes · ${s.bridge?'Shep running':'ready to connect'}`:'Herdr is not reachable. Open Herdr, or choose its CLI executable.';
  $('networkStatus').textContent=s.tailscale.ok?'Tailscale is connected.':'Tailscale is not connected. Install it and sign in, then retry.';
  if(!editing)$('session').value=s.session;
  $('login').checked=s.login;
  $('limits').textContent=s.platform==='win32'?'Windows: terminal touch input additionally needs Python.':'macOS / Linux: terminal reading and keyboard input are supported by the bridge; direct terminal touch and the Neovim size helper currently require Windows.';
  $('devices').replaceChildren(...s.devices.map(d=>{const row=document.createElement('div');row.className='device';const label=document.createElement('span');label.textContent=`Device ${d.id.slice(0,6)} · paired ${new Date(d.created).toLocaleDateString()}`;const button=document.createElement('button');button.textContent='Revoke';button.onclick=()=>act('revoke',d.id);row.append(label,button);return row;}));
}
async function act(name,value){
  const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  $('notice').textContent='Working…';
  try{const reply=await window.shep.action(name,value);if(!reply.ok)throw Error(reply.error);if(name==='pair'){
    $('pairing').hidden=false;$('qr').src=reply.result.qr;$('pairURL').value=reply.result.url;$('expiry').textContent='Valid for five minutes. Keep this link private.';$('notice').textContent='Scan the code with your phone camera.';
    setTimeout(()=>{$('pairing').hidden=true;},300000);
  }else render(reply.result);}catch(e){$('notice').textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}
}
$('session').onfocus=()=>editing=true;$('session').onblur=()=>editing=false;
for(const name of ['connect','pair','binary','open','update'])$(name).onclick=()=>act(name);
$('start').onclick=()=>act('start',$('session').value.trim());
$('refresh').onclick=()=>act('status');$('login').onchange=()=>act('login',$('login').checked);
document.querySelectorAll('[data-help]').forEach(b=>b.onclick=()=>act('help',b.dataset.help));
act('status');
