import {createBridge} from '../server.mjs';
const agents=['codex','claude','opencode'];
const outputs=[
 '\x1b[36m>_ OpenAI Codex\x1b[0m\n\n> Build the keyboard shortcuts panel.\n\n\x1b[32m• Added searchable shortcuts.\n• Connected keyboard navigation.\n• Preserved unsent drafts.\x1b[0m\n\nDemo validation\n  12 checks passed\n  0 layout overflows\n\nReady for review.\n\n› Ask Codex to do anything\n gpt-6-astra high · ~/demo',
 '\x1b[38;5;209mClaude Code\x1b[0m\n\n> Review the mobile layout.\n\n• Checked compact and expanded panes.\n• Verified 44px touch targets.\n• Kept the composer above the keyboard.\n\n\x1b[33mReview needed\x1b[0m\nChoose the preferred toolbar layout.\n\n❯ Compact controls\n  Expanded controls',
 '\x1b[36mOPENCODE\x1b[0m\n\n> Add a reconnect screen.\n\n\x1b[32m✓ Connection state detected\n✓ Retry action connected\n✓ Draft restored after reconnect\x1b[0m\n\nRunning the final UI checks…\n\nBuild · Demo provider'
];
const snapshot={version:'demo',protocol:22,focused_pane_id:'w1:p1',workspaces:[{workspace_id:'w1',label:'Demo workspace'}],panes:agents.map((agent,i)=>({pane_id:`w1:p${i+1}`,terminal_id:`demo${i}`,workspace_id:'w1',tab_id:'w1:t1',agent,agent_status:['done','blocked','working'][i],cwd:'~/demo',scroll:{viewport_rows:24}})),layouts:[{workspace_id:'w1',tab_id:'w1:t1',panes:agents.map((_,i)=>({pane_id:`w1:p${i+1}`,rect:{width:46,height:26}}))}]};
const call=async(_,method,params)=>{if(method==='session.snapshot')return {snapshot};if(method==='pane.read')return {read:{text:outputs[Number(params.pane_id.split('p')[1])-1],revision:1,truncated:false}};throw Error('Read-only demo');};
const server=createBridge({endpoint:'demo',machineRouter:async(req,res,url)=>{if(url.pathname!=='/api/machines')return false;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({machines:[{id:'local',label:'Demo PC'}]}));return true;},workspaceId:'w1',session:'demo',followSession:true},call,async()=>{throw Error('No personal wallpaper in demo');},async()=>({providers:[]}),async()=>[]);
server.listen(4319,'127.0.0.1',()=>console.log('Read-only fictional demo: http://127.0.0.1:4319'));
