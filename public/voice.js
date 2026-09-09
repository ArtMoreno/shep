// Speech stays in a reviewable draft; microphone samples never leave this meter.
(() => {
  const panel=byId('voice-panel'),label=byId('voice-state'),text=byId('voice-text'),stop=byId('voice-stop'),mic=byId('dictate'),canvas=byId('voice-wave');
  let active;
  const micIcon=mic.querySelector('svg')?.cloneNode?.(true);
  function draw(values){const c=canvas.getContext('2d');if(!c)return;c.clearRect(0,0,640,120);c.fillStyle='#baff70';for(let i=0;i<40;i++){const h=values?Math.max(4,Math.min(110,values[i]*110)):4;c.fillRect(i*16+4,(120-h)/2,7,h);}}
  function release(s){clearInterval(s.timer);clearTimeout(s.timeout);cancelAnimationFrame(s.animation);s.stream?.getTracks().forEach(t=>t.stop());s.audio?.close().catch(()=>{});s.stream=undefined;s.audio=undefined;draw();}
  function reset(){panel.dataset.active='false';if(micIcon)mic.replaceChildren(micIcon.cloneNode(true));else mic.textContent='🎙';mic.setAttribute('aria-label','Dictate message');stop.disabled=false;stop.textContent='Done';byId('voice-cancel').textContent='Close';}
  function finish(s){
    if(active!==s)return;active=undefined;release(s);reset();
    if(s.cancelled||frame?.pane.terminal_id!==s.owner){panel.hidden=true;return;}
    const words=(s.preview||s.final).trim(),next=draft.value+(draft.value&&words?' ':'')+words;
    if(words&&next.length<=8192){draft.value=next;draft.dispatchEvent(new Event('input'));label.textContent='Ready to review';text.textContent=words;byId('voice-help').textContent='Added to your draft. Review, then send.';}
    else {label.textContent=s.error?'Dictation unavailable':'Stopped';text.textContent=s.error||(words?'Message limit reached. Copy the words below into a shorter draft.':'No words recognized. Try again or use keyboard dictation.');if(words)text.textContent+='\n'+words;}
    announce(label.textContent);
  }
  function cancel(){if(active){const s=active;s.cancelled=true;finish(s);try{s.r.abort();}catch{}}panel.hidden=true;}
  function stopRecording(){
    const s=active;if(!s){panel.hidden=true;return;}if(s.stopping)return;
    s.stopping=true;label.textContent='Stopping…';stop.disabled=true;release(s);
    s.timeout=setTimeout(()=>{try{s.r.abort();}catch{}finish(s);},3000);
    try{s.r.stop();}catch{try{s.r.abort();}catch{}finish(s);}
  }
  async function meter(s){
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio||!navigator.mediaDevices?.getUserMedia)return;
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(active!==s||s.stopping){stream.getTracks().forEach(t=>t.stop());return;}
      s.stream=stream;s.audio=new Audio();await s.audio.resume();
      if(active!==s||s.stopping)return;
      const analyser=s.audio.createAnalyser();analyser.fftSize=256;s.audio.createMediaStreamSource(stream).connect(analyser);const bins=new Uint8Array(analyser.fftSize),levels=Array(40).fill(0);let last=0;
      const tick=(now=0)=>{if(active!==s||s.stopping)return;if(now-last>=50){last=now;analyser.getByteTimeDomainData(bins);const rms=Math.sqrt(bins.reduce((sum,n)=>sum+((n-128)/128)**2,0)/bins.length);levels.shift();levels.push(Math.min(1,rms*3));draw(levels);}s.animation=requestAnimationFrame(tick);};tick();
    }catch{if(active===s){byId('voice-help').textContent='Audio meter unavailable. Stop to review your words.';s.stream?.getTracks().forEach(t=>t.stop());s.audio?.close().catch(()=>{});}}
  }
  function start(){
    if(active){stopRecording();return;}if(!frame||busy)return;
    dismissKeyboard();panel.hidden=false;panel.dataset.active='true';label.textContent='Starting microphone…';text.textContent='Speak after Listening appears.';byId('voice-time').textContent='00:00';byId('voice-help').textContent='Stop to review. Nothing sends automatically.';byId('voice-cancel').textContent='Cancel';stop.textContent='■ Stop dictation';stop.disabled=false;draw();
    const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Speech){reset();label.textContent='Dictation unavailable';text.textContent='Use the microphone on your phone keyboard, then review before sending.';return;}
    const s={r:new Speech(),owner:frame.pane.terminal_id,final:'',started:Date.now()};active=s;const r=s.r;r.lang=navigator.language||'en-US';r.continuous=true;r.interimResults=true;
    mic.textContent='■';mic.setAttribute('aria-label','Stop dictation');
    r.onstart=()=>{if(active!==s||s.stopping)return;clearTimeout(s.timeout);label.textContent='● Listening';s.started=Date.now();s.timer=setInterval(()=>{const seconds=Math.floor((Date.now()-s.started)/1000);byId('voice-time').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');},250);meter(s);};
    r.onresult=event=>{if(active!==s||s.cancelled||frame?.pane.terminal_id!==s.owner)return;const rows=Array.from(event.results);s.final=rows.filter(x=>x.isFinal).map(x=>x[0].transcript).join(' ');s.preview=rows.map(x=>x[0].transcript).join(' ');text.textContent=s.preview||'Listening…';};
    r.onerror=event=>{if(active!==s)return;s.error=event.error==='not-allowed'?'Microphone permission was denied. Allow microphone access or use keyboard dictation.':'Speech recognition stopped ('+event.error+'). Try again or use keyboard dictation.';finish(s);try{r.abort();}catch{}};
    r.onend=()=>finish(s);
    s.timeout=setTimeout(()=>{if(active!==s)return;s.error='The microphone did not start. Try again or check microphone permission.';finish(s);try{r.abort();}catch{}},15000);
    try{r.start();}catch{s.error='Dictation could not start. Try keyboard dictation.';finish(s);}
  }
  globalThis.voice={cancel};mic.addEventListener('click',start);stop.addEventListener('click',stopRecording);byId('voice-cancel').addEventListener('click',cancel);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});window.addEventListener('pagehide',cancel);
})();
