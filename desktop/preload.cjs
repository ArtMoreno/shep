const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('shep',{action:(name,value)=>ipcRenderer.invoke('shep:action',name,value)});
