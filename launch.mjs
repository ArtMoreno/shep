import { access, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, delimiter, isAbsolute } from 'node:path';

export const agents = [
  {id:'codex',name:'Codex',icon:'/brands/codex.svg',modes:['default','plan']},
  {id:'claude',name:'Claude',icon:'/brands/claude.svg',models:['fable','opus','sonnet'],efforts:['low','medium','high','xhigh','max'],modes:['default','plan','auto','acceptEdits']},
  {id:'opencode',name:'OpenCode',icon:'/brands/opencode.svg',modes:['default','build','plan']},
  {id:'hermes',name:'Hermes',icon:'/brands/hermes.png',efforts:['none','minimal','low','medium','high','xhigh','max','ultra'],modes:['default']},
  {id:'grok',name:'Grok',icon:'/brands/grok.svg',modes:['default','plan','auto','acceptEdits']},
];
const invalid = message => Object.assign(new Error(message),{status:400});

export async function launchOptions() {
  const found = await Promise.all(agents.map(async agent=>{
    const paths=(process.env.PATH||'').split(delimiter);
    const extensions=process.platform==='win32'?['.exe','.cmd','.ps1']:[''];
    const available=await Promise.all(paths.flatMap(path=>extensions.map(ext=>access(join(path,agent.id+ext)).then(()=>true,()=>false))));
    return available.some(Boolean)?{...agent}:null;
  }));
  const codex=found.find(agent=>agent?.id==='codex');
  if(codex) {
    try {
      const cache=JSON.parse(await readFile(join(process.env.CODEX_HOME||join(homedir(),'.codex'),'models_cache.json'),'utf8'));
      codex.models=cache.models.filter(model=>model.visibility==='list').map(model=>model.slug);
      codex.modelEfforts=Object.fromEntries(cache.models.filter(model=>model.visibility==='list').map(model=>[model.slug,model.supported_reasoning_levels.map(level=>level.effort)]));
      codex.efforts=[...new Set(Object.values(codex.modelEfforts).flat())];
    } catch { codex.efforts=[]; }
  }
  return [...found.filter(Boolean),{id:'empty',name:'Empty terminal · no agent',modes:['default']}];
}

export async function validateLaunch(body, choices, directoryCheck) {
  if(!body||typeof body!=='object'||Array.isArray(body))throw invalid('Expected a new session');
  for(const key of ['id','bridgeId','workspaceId'])if(typeof body[key]!=='string'||!body[key]||body[key].length>160)throw invalid('Invalid '+key);
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(body.id))throw invalid('Invalid launch receipt ID');
  const agent=choices.find(agent=>agent.id===body.agent);
  if(!agent)throw invalid('Choose an installed agent');
  if(!['pane','tab','workspace'].includes(body.destination))throw invalid('Choose where to open the session');
  if(body.destination==='pane') {
    if(typeof body.paneId!=='string'||!body.paneId||body.paneId.length>160||typeof body.terminalId!=='string'||!body.terminalId||body.terminalId.length>160)throw invalid('Choose a live pane to split');
    if(!['right','left','down'].includes(body.direction))throw invalid('Choose Right, Left or Down');
  }
  if(typeof body.cwd!=='string'||body.cwd.length>1024||!(directoryCheck?body.cwd.startsWith('/'):isAbsolute(body.cwd))||/[\x00-\x1f\x7f]/.test(body.cwd))throw invalid('Enter an absolute working folder');
  if(directoryCheck?!await directoryCheck(body.cwd):!(await stat(body.cwd).catch(()=>null))?.isDirectory())throw invalid('That working folder does not exist on the selected computer');
  const model=body.model??'',effort=body.effort??'',mode=body.mode??'default',message=body.message??'';
  if(typeof model!=='string'||(model&&!/^[a-zA-Z0-9][\w./:+-]{0,159}$/.test(model)))throw invalid('Invalid model name');
  if(typeof effort!=='string'||(effort&&!(agent.modelEfforts?.[model]||agent.efforts||[]).includes(effort)))throw invalid('This model does not support that reasoning level');
  if(!agent.modes.includes(mode))throw invalid('This agent does not support that mode');
  if(typeof message!=='string'||message.length>8192||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(message))throw invalid('First message contains unsupported characters or is too long');
  if(agent.id==='empty'&&(model||effort||mode!=='default'||message))throw invalid('Empty terminals start without a model or first message');
  // Phone-created Codex sessions leave software updates to the PC's normal update workflow.
  const args=agent.id==='codex'?['-c','check_for_update_on_startup=false']:[];
  if(model)args.push('--model',model);
  if(effort)args.push(...(agent.id==='codex'?['-c','model_reasoning_effort='+effort]:[agent.id==='claude'?'--effort':'--reasoning',effort]));
  if(effort&&agent.id==='codex')args.push('-c','plan_mode_reasoning_effort='+effort);
  if(mode!=='default'&&['claude','grok'].includes(agent.id))args.push('--permission-mode',mode);
  if(mode!=='default'&&agent.id==='opencode')args.push('--agent',mode);
  return {agent:agent.id,name:agent.name,destination:body.destination,workspaceId:body.workspaceId,paneId:body.paneId,terminalId:body.terminalId,direction:body.direction,cwd:body.cwd,model,effort,mode,message,args};
}
