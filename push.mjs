import webpush from 'web-push';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

export function validSubscription(s) {
  try {
    const u=new URL(s.endpoint),h=u.hostname;
    const trusted=h==='web.push.apple.com'||h.endsWith('.push.apple.com')||h==='fcm.googleapis.com'||h.endsWith('.push.services.mozilla.com')||h.endsWith('.notify.windows.com');
    return trusted&&u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&s.endpoint.length<=2048&&/^[\w-]{86,88}={0,2}$/.test(s.keys?.p256dh||'')&&/^[\w-]{22,24}={0,2}$/.test(s.keys?.auth||'');
  }catch{return false;}
}
export function completion(previous,current) {
  return !!previous&&previous!==current&&(current==='blocked'||previous==='working'&&['done','idle'].includes(current));
}
export async function createPushService({file,snapshot,origin,send=webpush.sendNotification,deviceAllowed=()=>true}) {
  let data;
  try{data=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;data={...webpush.generateVAPIDKeys(),subscriptions:[]};}
  let queue=Promise.resolve();
  const persist=()=>{queue=queue.catch(()=>{}).then(async()=>{await mkdir(dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(data),{mode:0o600});await rename(file+'.tmp',file);});return queue;};
  const states=new Map();let stopped=false,timer;
  async function tick(){
    try{
      if(data.subscriptions.length){
        const panes=await snapshot(),ids=new Set(panes.map(p=>(p.machineId||'local')+':'+p.terminal_id));
        for(const id of states.keys())if(!ids.has(id))states.delete(id);
        for(const pane of panes){
          const id=(pane.machineId||'local')+':'+pane.terminal_id;
          const old=states.get(id),now=pane.agent_status;states.set(id,now);
          if(!completion(old,now))continue;
          const title=(pane.machineLabel?pane.machineLabel+' · ':'')+(pane.agent||'Session')+(now==='blocked'?' needs attention':' finished');
          const payload=JSON.stringify({title,body:'Tap to open your session.',paneId:pane.pane_id,machineId:pane.machineId||'local',tag:id});
          for(const subscription of [...data.subscriptions])try{if(!deviceAllowed(subscription.deviceId))continue;await send(subscription,payload,{vapidDetails:{subject:origin,publicKey:data.publicKey,privateKey:data.privateKey},TTL:3600,timeout:8000});}catch(e){if([404,410].includes(e.statusCode)){data.subscriptions=data.subscriptions.filter(s=>s.endpoint!==subscription.endpoint);await persist();}}
        }
      }
    }catch{/* Next snapshot retries; no terminal input is ever sent. */}
    finally{if(!stopped){timer=setTimeout(tick,3000);timer.unref();}}
  }
  await persist();tick();
  return {
    publicKey:data.publicKey,
    async subscribe(s,deviceId){if(!validSubscription(s))throw Object.assign(new Error('Unsupported push subscription'),{status:400});if(data.subscriptions.length>=8&&!data.subscriptions.some(old=>old.endpoint===s.endpoint))throw Object.assign(new Error('Eight devices maximum'),{status:400});data.subscriptions=data.subscriptions.filter(old=>old.endpoint!==s.endpoint);data.subscriptions.push({endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth},...(deviceId?{deviceId}:{})});await persist();},
    async unsubscribe(endpoint){data.subscriptions=data.subscriptions.filter(s=>s.endpoint!==endpoint);await persist();},
    stop(){stopped=true;clearTimeout(timer);}
  };
}
