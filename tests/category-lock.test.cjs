const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
function harness(h,password='test-password'){
 const nodes=new Map(),store=new Map(),alerts=[],saved=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,textContent:'',focus(){},setAttribute(){}});return nodes.get(id)};
 const c=vm.createContext({window:{},crypto:webcrypto,TextEncoder,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},
 $:node,document:{querySelectorAll:()=>[]},currentUser:{id:'7'},alert:x=>alerts.push(x),prompt:()=>password,
 save:()=>saved.push(h.locked),renderAll(){},setTimeout:fn=>fn()});
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
 vm.runInContext(source.slice(source.indexOf("let CATEGORY_PASSWORD_KEY=")),c);
 return {c,store,alerts,saved,node,h};
}
test('current master-password flow locks only for the signed-in owner and selects the capture target',async()=>{
 const h={id:'category',items:[]},t=harness(h);let active;
 t.c.window.MBSync={activate:id=>active=id};
 const hash=await vm.runInContext("hashCategoryPassword('test-password')",t.c);
 t.store.set('mb_category_master_password_hash_v1',hash);
 await t.c.window.categoryLock(h);
 assert.equal(h.locked,true);assert.equal(h.lockOwnerId,'7');assert.equal(active,'category');
 await t.c.window.categoryLock(h);assert.equal(h.locked,false);assert.equal(h.lockOwnerId,undefined);
});
test('wrong password, cancel, or other owner never unlocks a category',async()=>{
 for(const answer of ['wrong',null]){
  const h={id:'c',locked:true,lockOwnerId:'7',items:[]},t=harness(h,answer);
  t.store.set('mb_category_master_password_hash_v1',await vm.runInContext("hashCategoryPassword('test-password')",t.c));
  await t.c.window.categoryLock(h);assert.equal(h.locked,true);assert.equal(t.saved.length,0);
 }
 const h={id:'c',locked:true,lockOwnerId:'other',items:[]},t=harness(h);
 await t.c.window.categoryLock(h);assert.equal(h.locked,true);assert.equal(t.saved.length,0);
});
