const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const handler=source.slice(source.indexOf("$('deleteSavedContent').onclick="),source.indexOf('function showLibraryDetails'));
for(const approve of [false,true])for(const count of [1,2])test(`detail DELETE confirm=${approve}, items=${count}`,()=>{
 const current={id:'a',name:'Example',links:[{url:'https://example.com'}]},other={id:'b',name:'Keep'};
 const owner={items:count===1?[current]:[current,other]},button={};let saved=0,rendered=0,view=true,focused=false;
 const ctx={$:()=>button,item:()=>current,hub:()=>owner,itemId:'a',confirm:()=>approve,showLibraryDetails:open=>view=open,save:()=>saved++,renderAll:()=>rendered++,itemSearch:{focus:()=>focused=true}};
 vm.createContext(ctx);vm.runInContext(handler,ctx);button.onclick();
 assert.equal(owner.items.length,count-(approve?1:0));assert.equal(owner.items.includes(current),!approve);
 assert.equal(view,!approve);assert.equal(saved,approve?1:0);assert.equal(rendered,saved);assert.equal(focused,approve);assert.equal(ctx.itemId,approve?null:'a');
 if(count===2)assert.ok(owner.items.includes(other));
});
