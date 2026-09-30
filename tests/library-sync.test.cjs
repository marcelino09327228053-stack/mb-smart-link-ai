const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const {repository}=require('../server/library.cjs');const MBLink=require('../shared-link.cjs');
test('browser sync preserves guest library, pending edits and concurrent overlay appends',async()=>{
 const r=repository(':memory:'),memory=new Map(),guest=[{id:'cat',name:'Guest',items:[]}];
 memory.set('guest',JSON.stringify(guest));
 let release,hold=false;
 const status={textContent:''};
 const c=vm.createContext({MBLink,console,URL,setInterval:()=>0,document:{hidden:false,activeElement:{tagName:'BODY'},getElementById:()=>status,querySelector:()=>null,addEventListener:()=>{}},
 localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
 fetch:async(path,options)=>{
  if(hold&&options.method==='PUT'){hold=false;await new Promise(resolve=>release=resolve)}
  let data,code=200;
  if(options.method==='GET')data={library:r.get(1)};
  else{const d=JSON.parse(options.body),result=r.put(1,d.revision,d);data={library:result||r.get(1)};if(!result)code=409}
  return {ok:code===200,status:code,json:async()=>data};
 }});
 vm.runInContext(`window=globalThis;const KEY='guest';let CATEGORY_PASSWORD_KEY='mb_category_master_password_hash_v1';let hubs=JSON.parse(localStorage.getItem(KEY)),hubId='cat',itemId=null;function item(){return null}function defaults(){return []}function load(){return JSON.parse(localStorage.getItem(KEY))}function renderAll(){}`,c);
 vm.runInContext(fs.readFileSync(require.resolve('../library-sync.js'),'utf8'),c);
 await c.MBSync.login({id:1});
 const tick=async()=>{for(let i=0;i<10;i++)await new Promise(setImmediate)};
 vm.runInContext("hubs[0].locked=true;MBSync.activate('cat');MBSync.changed()",c);await tick();
 assert.equal(r.get(1).activeLockedCategoryId,'cat');
 hold=true;
 vm.runInContext("hubs[0].name='Panel Beater';MBSync.changed()",c);
 await tick();
 r.capture(1,'request-123456789','https://youtube.com/watch?v=abc');
 vm.runInContext("hubs[0].items.push(MBLink.make('https://example.com','web-item','web-entry','now'));MBSync.changed()",c);
 release();await tick();
 assert.equal(r.get(1).hubs[0].items.length,2);
 assert.equal(r.get(1).hubs[0].name,'Panel Beater');
 assert.equal(memory.get('guest'),JSON.stringify(guest));
 c.MBSync.logout();
 assert.equal(vm.runInContext('hubs[0].name',c),'Guest');
 assert.equal(r.get(1).hubs[0].items.length,2);r.close();
});
