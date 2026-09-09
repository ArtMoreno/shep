import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const code=await readFile(new URL('public/drawer.js',import.meta.url),'utf8');
test('shared drawer preserves controls and drafts, supports tap/swipe, and leaves voice Stop visible',()=>{
 const nodes=new Map();let active=null;
 class Element {
  constructor(id){this.id=id;this.children=[];this.attributes={};this.events={};this.classList={toggle(){}};this.hidden=false;}
  append(...items){for(const item of items){if(item.parent)item.parent.children=item.parent.children.filter(x=>x!==item);item.parent=this;this.children.push(item);}}
  prepend(...items){this.append(...items);this.children=[...items,...this.children.filter(x=>!items.includes(x))];}
  insertBefore(item,before){this.append(item);this.children.splice(this.children.indexOf(item),1);this.children.splice(this.children.indexOf(before),0,item);}
  setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}
  addEventListener(k,fn){this.events[k]=fn;}setPointerCapture(){}focus(){active=this;}
  contains(node){return this===node||this.children.some(n=>n.contains(node));}
  click(){this.events.click?.({});}
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
 const area=get('input-area'),voice=get('voice-panel'),draft=get('draft');draft.value='Keep my draft';
 area.append(voice,get('agent-controls'),get('utilities'),get('native-interaction'),get('pinned-keys'),get('composer'));get('composer').append(draft,get('send'));
 get('native-interact').setAttribute('aria-pressed','true');
 get('native-interact').addEventListener('click',()=>assert.fail('Collapsing must not disable terminal control'));
 const document={getElementById:get,createElement:()=>new Element(),querySelector:()=>get('utilities'),get activeElement(){return active;}};
 runInNewContext(code,{document});
 const handle=area.children[0],panel=area.children[1];
 assert.equal(panel.hidden,true);assert.equal(voice.parent,area);assert.equal(get('dictate').parent,get('composer'));
 assert.equal(get('pinned-keys').parent,area);assert.equal(get('pinned-keys').hidden,false);
 assert.equal(get('agent-controls').parent,panel);assert.equal(draft.value,'Keep my draft');
 handle.click();assert.equal(panel.hidden,false);assert.equal(handle.getAttribute('aria-expanded'),'true');
 assert.equal(get('native-interaction').parent,area);
 handle.events.pointerdown({isPrimary:true,button:0,pointerId:1,clientX:50,clientY:50});
 handle.events.pointerup({pointerId:1,clientX:52,clientY:90});handle.click();assert.equal(panel.hidden,true);
 handle.events.pointerdown({isPrimary:true,button:0,pointerId:2,clientX:50,clientY:90});
 handle.events.pointerup({pointerId:2,clientX:50,clientY:40});handle.click();assert.equal(panel.hidden,false);
 handle.events.pointerdown({isPrimary:true,button:0,pointerId:3,clientX:50,clientY:90});handle.events.pointercancel();
 assert.equal(panel.hidden,false);assert.equal(draft.value,'Keep my draft');assert.equal(voice.parent,area);
});
