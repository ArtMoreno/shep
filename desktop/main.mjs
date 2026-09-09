import {app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog, nativeImage} from 'electron';
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {join, dirname, delimiter} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {homedir} from 'node:os';
import net from 'node:net';
import QRCode from 'qrcode';
import updater from 'electron-updater';
import {pairing} from './pairing.mjs';
import {connectPhone, tailscaleBinary, identity, run} from './setup.mjs';
import {discover, rpc} from '../herdr.mjs';
import {startBridge} from '../server.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const smoke=process.argv.includes('--smoke-test');
if(smoke)app.disableHardwareAcceleration();
if(process.env.SHEP_TEST_HOME) app.setPath('userData',process.env.SHEP_TEST_HOME);
app.setName('Shep');
if(!app.requestSingleInstanceLock()) app.quit();
else {
  let win,tray,bridge,pairs,settings={},message='Open Herdr, then check your connection.',busy=false,quitting=false;
  let data, timer;
  const logo=join(root,'../public/assets/herdr-icon-512.png');
  const setupURL=pathToFileURL(join(root,'index.html')).href;
  const persist=async()=>{await writeFile(join(data,'settings.tmp'),JSON.stringify(settings),{mode:0o600});await rename(join(data,'settings.tmp'),join(data,'settings.json'));};
  const show=()=>{win?.show();win?.focus();};
  const stop=async()=>{const old=bridge;bridge=undefined;if(old){old.closeAllConnections();await new Promise(resolve=>old.close(resolve));}};
  async function freePort(){
    if(settings.port) return settings.port;
    for(let port=4317;port<4330;port++){
      const available=await new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});
      if(available)return port;
    }
    throw Error('No free local port between 4317 and 4329. Close an unused Shep instance and try again.');
  }
  async function start(){
    if(bridge)return;
    process.env.HERDR_MOBILE_SESSION=settings.session||'default';
    if(settings.binary)process.env.HERDR_MOBILE_BIN=settings.binary;
    process.env.HERDR_MOBILE_PORT=String(await freePort());
    bridge=await startBridge({authorize:pairs.authorize});
    settings.port=bridge.address().port;settings.enabled=true;
    await persist();message='Shep is running. You can now connect your phone.';
  }
  async function status(){
    let herdr,tailscale;
    try{const c=await discover(settings.session||'default');const s=(await rpc(c.endpoint,'session.snapshot')).snapshot;herdr={ok:true,version:c.version,panes:s.panes.length};}catch{herdr={ok:false};}
    try{tailscale={ok:true,...identity(JSON.parse(await run(await tailscaleBinary(),['status','--json'])))};}catch{tailscale={ok:false};}
    return {platform:process.platform,version:app.getVersion(),bridge:!!bridge,herdr,tailscale,session:settings.session||'default',origin:settings.access?.origin,login:settings.login===true,devices:pairs.list(),message};
  }
  async function action(name,value){
    if(name==='status')return status();
    if(busy)throw Error('Please wait for the current step to finish.');
    busy=true;
    try {
      if(name==='start'){
        if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(value))throw Error('Use a session name containing letters, numbers, underscores or hyphens.');
        if(settings.session!==value){await stop();settings.session=value;}
        await start();
      }else if(name==='binary'){
        const result=await dialog.showOpenDialog(win,{title:'Choose the Herdr CLI executable',properties:['openFile']});
        if(!result.canceled){settings.binary=result.filePaths[0];process.env.HERDR_MOBILE_BIN=settings.binary;await persist();}
      }else if(name==='connect'){
        await start();
        const access=await connectPhone(settings.port);
        await writeFile(join(data,'access.json'),JSON.stringify(access),{mode:0o600});
        settings.access=access;await persist();await stop();await start();
        message='Private connection ready. Sign in to the same Tailscale account on your phone.';
      }else if(name==='pair'){
        if(!bridge||!settings.access)throw Error('Connect your phone network first.');
        const url=`${settings.access.origin}/pair?code=${pairs.invite()}`;
        return {qr:await QRCode.toDataURL(url,{width:256,margin:2}),url};
      }else if(name==='revoke'){
        if(typeof value!=='string')throw Error('Invalid device.');
        await pairs.revoke(value);message='Device access revoked.';
      }else if(name==='login'){
        if(typeof value!=='boolean')throw Error('Invalid startup preference.');
        if(process.platform==='linux'){
          const folder=join(process.env.XDG_CONFIG_HOME||join(homedir(),'.config'),'autostart');
          await mkdir(folder,{recursive:true});
          const executable=(process.env.APPIMAGE||app.getPath('exe')).replace(/(["\\`$])/g,'\\$1');
          await writeFile(join(folder,'shep.desktop'),`[Desktop Entry]\nType=Application\nName=Shep\nExec="${executable}" --background\nHidden=${!value}\nX-GNOME-Autostart-enabled=${value}\n`);
        }else app.setLoginItemSettings({openAtLogin:value,args:['--background']});
        settings.login=value;await persist();
      }else if(name==='open'){
        if(!bridge)throw Error('Start Shep first.');
        await shell.openExternal(`http://127.0.0.1:${settings.port}`);
      }else if(name==='help'){
        const urls={herdr:'https://github.com/ogulcancelik/herdr',tailscale:'https://tailscale.com/download',https:'https://login.tailscale.com/admin/dns',releases:'https://github.com/ArtMoreno/shep/releases'};
        if(!urls[value])throw Error('Unknown help link.');
        await shell.openExternal(urls[value]);
      }else if(name==='update'){
        if(!app.isPackaged)throw Error('Updates are available in installed builds.');
        updater.autoUpdater.autoDownload=false;
        updater.autoUpdater.autoInstallOnAppQuit=false;
        const result=await updater.autoUpdater.checkForUpdates();
        if(!result||result.updateInfo.version===app.getVersion())message='You have the latest release.';
        else {
          const answer=await dialog.showMessageBox(win,{type:'question',message:`Download Shep ${result.updateInfo.version}?`,buttons:['Download','Later'],defaultId:1,cancelId:1});
          if(answer.response===0){await updater.autoUpdater.downloadUpdate();const install=await dialog.showMessageBox(win,{message:'Update downloaded. Restart Shep to install?',buttons:['Restart','Later'],defaultId:1,cancelId:1});if(install.response===0){quitting=true;updater.autoUpdater.quitAndInstall();}}
        }
      }else throw Error('Unknown setup action.');
      return status();
    } finally{busy=false;}
  }
  app.on('second-instance',show);
  app.on('activate',show);
  app.on('before-quit',()=>{quitting=true;clearInterval(timer);bridge?.closeAllConnections();bridge?.close();});
  app.whenReady().then(async()=>{
    data=app.getPath('userData');await mkdir(data,{recursive:true});process.env.SHEP_STATE_DIR=data;
    if(smoke)await writeFile(join(data,'smoke-start.json'),JSON.stringify({data,node:process.versions.node}));
    // GUI launches on macOS often omit Homebrew and user CLI directories.
    if(process.platform!=='win32')process.env.PATH=[join(homedir(),'.local/bin'),'/opt/homebrew/bin','/usr/local/bin',process.env.PATH||''].join(delimiter);
    try{settings=JSON.parse(await readFile(join(data,'settings.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')message='Saved settings could not be read. Run setup again.';}
    if(settings.binary)process.env.HERDR_MOBILE_BIN=settings.binary;
    pairs=await pairing(join(data,'devices.json'));
    win=new BrowserWindow({width:890,height:820,minWidth:600,minHeight:650,title:'Shep · Setup',icon:logo,backgroundColor:'#130d20',show:false,webPreferences:{preload:join(root,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    win.removeMenu();win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(url!==setupURL)event.preventDefault();});
    win.on('close',event=>{if(!quitting&&!smoke){event.preventDefault();win.hide();}});
    ipcMain.handle('shep:action',async(event,name,value)=>{
      if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==setupURL)throw Error('Untrusted setup window.');
      try{return {ok:true,result:await action(name,value)};}catch(e){message=e.message;return {ok:false,error:e.message};}
    });
    await win.loadURL(setupURL);
    if(!process.argv.includes('--background'))show();
    tray=new Tray(nativeImage.createFromPath(logo).resize({width:20,height:20}));tray.setToolTip('Shep');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Shep setup',click:show},{label:'Open terminal',click:()=>action('open').catch(()=>show())},{type:'separator'},{label:'Quit Shep',click:()=>app.quit()}]));tray.on('click',show);
    if(smoke){
      await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+35000;const timer=setInterval(()=>{if(document.getElementById('version').textContent&&!document.getElementById('start').disabled){clearInterval(timer);resolve();}else if(Date.now()>end){clearInterval(timer);reject(Error('Setup IPC did not become ready'));}},100);})`);
      await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const image=await win.webContents.capturePage();await writeFile(join(data,'setup-smoke.png'),image.toPNG());
      await writeFile(join(data,'smoke.json'),JSON.stringify({title:win.getTitle(),loaded:!win.webContents.isLoading(),node:process.versions.node,platform:process.platform}));
      app.quit();return;
    }
    if(settings.enabled)await start().catch(e=>{message=e.message;});
    timer=setInterval(()=>{if(settings.enabled&&!bridge&&!busy){busy=true;start().catch(e=>{message=e.message;}).finally(()=>{busy=false;});}},15000);
    updater.autoUpdater.on('error',()=>{message='Update check unavailable. Use GitHub Releases; private repositories require manual downloads.';});
  }).catch(async error=>{console.error(error);if(smoke){await writeFile(join(app.getPath('userData'),'smoke-error.txt'),error.stack||error.message);app.exit(1);}else{dialog.showErrorBox('Shep could not start',error.message);app.quit();}});
}
