import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {herdrBinary} from './herdr.mjs';
const exec=promisify(execFile);
export function validMachine(m){return /^[a-f0-9]{32}$/.test(m?.id)&&typeof m.target==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.@:-]{0,253}$/.test(m.target)&&/^[a-zA-Z0-9_-]{1,80}$/.test(m.session)&&m.enabled===true;}
export async function savedMachines(){
  const {stdout}=await exec(await herdrBinary(),['machine','list','--json'],{windowsHide:true,timeout:5000,maxBuffer:1048576});
  return JSON.parse(stdout).filter(validMachine);
}
// One SSH process per selected saved machine. No request is replayed after failure.
// Python uses the Mac/Linux standard library; no remote packages or files are installed.
const worker=`import os,sys,json,socket,subprocess,shutil,concurrent.futures,threading
session=sys.argv[1]
candidates=[shutil.which('herdr'),os.path.expanduser('~/.local/bin/herdr'),'/opt/homebrew/bin/herdr','/usr/local/bin/herdr']
binary=next((p for p in candidates if p and os.access(p,os.X_OK)),None)
if not binary: raise RuntimeError('Herdr unavailable')
status=json.loads(subprocess.check_output([binary,'--session',session,'status','--json'],timeout=8))
if not status['server']['running']: raise RuntimeError('Herdr offline')
endpoint=status['server']['socket']
os.environ['PATH']=os.path.expanduser('~/.local/bin')+':/opt/homebrew/bin:/usr/local/bin:'+os.environ.get('PATH','')
lock=threading.Lock()
def call(line):
 request=json.loads(line)
 try:
  if request['method']=='shep.launch-info':
   result={'agents':[name for name in ['codex','claude','opencode','hermes','grok'] if shutil.which(name)],'home':os.path.expanduser('~'),'directory':os.path.isdir(request.get('params',{}).get('cwd',''))}
   with lock: print(json.dumps({'id':request['id'],'result':result}),flush=True)
   return
  with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
   s.settimeout(max(15,min(75,request.get('params',{}).get('timeout_ms',0)/1000+5)));s.connect(endpoint);s.sendall((line+'\\n').encode());data=b''
   while b'\\n' not in data:
    chunk=s.recv(65536)
    if not chunk: raise RuntimeError('Connection ended')
    data+=chunk
    if len(data)>2097152: raise RuntimeError('Reply too large')
   reply=data.split(b'\\n')[0].decode()
   if request['method']=='session.snapshot':
    decoded=json.loads(reply)
    if 'snapshot' in decoded.get('result',{}): decoded['result']['snapshot']['host_platform']=sys.platform
    reply=json.dumps(decoded)
 except Exception:
  reply=json.dumps({'id':request['id'],'error':{'message':'Remote request failed; input was not retried'}})
 with lock: print(reply,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for line in sys.stdin:
  if len(line)>1048576: break
  pool.submit(call,line.rstrip('\\n'))
`;
export function remoteTransport(machine,spawnProcess=spawn){
  if(!validMachine(machine))throw Error('Invalid saved machine');
  let child,buffer='';const pending=new Map();
  const stop=()=>{const old=child;child=undefined;old?.kill();buffer='';for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('SSH disconnected. Reconnect the machine in Herdr; input was not retried.'));}pending.clear();};
  function start(){
    const encoded=Buffer.from(worker).toString('base64');
    child=spawnProcess('ssh',['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2',machine.target,`python3 -u -c "import base64;exec(base64.b64decode('${encoded}'))" ${machine.session}`],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const current=child;child.on('error',()=>{if(child===current)stop();});child.on('exit',()=>{if(child===current)stop();});child.stdin.on('error',()=>{if(child===current)stop();});child.stderr.resume();
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
      if(child!==current)return;buffer+=chunk;if(buffer.length>4194304){stop();return;}
      let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const reply=JSON.parse(line),p=pending.get(reply.id);if(!p)continue;pending.delete(reply.id);clearTimeout(p.timer);reply.error?p.reject(Error(reply.error.message)):p.resolve(reply.result);}catch{stop();return;}}
    });
  }
  return {close:stop,call(_endpoint,method,params={},timeout=15000){return new Promise((resolve,reject)=>{
    if(pending.size>=32){reject(Error('Remote machine is busy'));return;}
    if(!child)start();const id=randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(Error('SSH timed out; input was not retried.'));},Math.max(timeout,15000));
    pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+'\n');
  });}};
}
