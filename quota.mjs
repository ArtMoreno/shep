import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const providers = {
  claude: ['Claude','claude-statusline','#E88461'],
  codex: ['Codex','codex-app-server','#C4D7F5'],
  grok: ['Grok','grok-cli-billing','#D5D5D8'],
  agy: ['Agy','agy-statusline','#8AB4F8'],
  hermes: ['Hermes','hermes-portal','#CFD6E4'],
  openrouter: ['OpenRouter','openrouter-credits','#C9F31D'],
  'opencode-go': ['OpenCode Go','opencode-go.opencode-store','#E8EDF7'],
  opencode: ['OpenCode',null,'#E8EDF7'],
  omp: ['OMP',null,'#AA8EFF'],
};
const defaults = ['claude','codex','grok','hermes','openrouter','opencode-go'].map(provider=>({provider,show:true}));
const percent = value => Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const timestamp = value => typeof value === 'number' && value > 0 ? value : typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value)/1000 : null;
async function json(path) {
  try { return JSON.parse(await readFile(path,'utf8')); }
  catch { return null; }
}

// Read the same snapshots as desktop QuotaDeck. Never expose credentials, account IDs or session maps.
export async function quotaSnapshot(root = process.env.HERDR_MOBILE_QUOTA_DIR || join(process.env.LOCALAPPDATA || join(homedir(),'AppData','Local'),'herdr','plugins','herdr-agent-quota-win'), now = Date.now()/1000) {
  const prefs = await json(join(root,'dashboard-providers.json'));
  const selected = Array.isArray(prefs?.providers) ? prefs.providers : defaults;
  const seen = new Set();
  const rows = await Promise.all(selected.filter(p=>p && Object.hasOwn(providers,p.provider) && p.show !== false && !seen.has(p.provider) && seen.add(p.provider)).map(async pref=>{
    const id = pref.provider, [name,file,color] = providers[id];
    const stored = file ? await json(join(root,file+'.json')) : null;
    const snapshot = typeof stored?.provider === 'string' && stored.provider.replace(/[-_]/g,'') === id.replace(/[-_]/g,'') ? stored : null;
    const fetchedAt = timestamp(snapshot?.fetched_at_unix);
    const fields = Array.isArray(pref.fields) ? new Set(pref.fields) : null;
    const has = field => !fields || fields.has(field);
    const windows = (Array.isArray(snapshot?.windows) ? snapshot.windows : []).flatMap(window=>{
      if (!window || typeof window !== 'object') return [];
      const money = typeof window.source_label === 'string' ? window.source_label.match(/^(plan|top-up|credits|key left)\s+(\$\d+(?:\.\d+)?)$/) : null;
      const label = money?.[1] || ({five_hour:'5h',weekly:'7d',monthly:'30d'})[window.kind];
      if (!label) return [];
      const group = money ? ({'top-up':'top-up','key left':'credits'})[label] || label : window.kind === 'five_hour' ? 'short' : 'long';
      const amount = money && has(group+'-amount') ? money[2] : null;
      const remaining = has(group+'-percent') ? percent(window.remaining_percent) ?? (percent(window.used_percent) === null ? null : 100-window.used_percent) : null;
      const resetsAt = has(group+'-reset') ? timestamp(window.resets_at) : null;
      if (amount === null && remaining === null && resetsAt === null) return [];
      return [{label,amount,remaining,resetsAt}];
    }).sort((a,b)=>['5h','7d','30d','plan','top-up','credits','key left'].indexOf(a.label)-['5h','7d','30d','plan','top-up','credits','key left'].indexOf(b.label));
    return {id,name,icon:'/brands/'+(id==='hermes'?'hermes.png':id.startsWith('opencode')?'opencode.svg':id+'.svg'),color:/^#[0-9a-f]{6}$/i.test(pref.color||'')?pref.color:color,windows,fetchedAt,stale:fetchedAt !== null && now-fetchedAt>300};
  }));
  return {providers:rows};
}
