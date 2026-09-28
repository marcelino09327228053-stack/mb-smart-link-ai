const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
for(const approved of [false,true])test('bulk delete confirmation '+approved,()=>{
 const items=[{id:'a',name:'First'},{id:'b',name:'Second'},{id:'c',name:'Other'}],owner={items};const elements={};let saved=0;
 const c={Set,selectedItems:new Set(['a','b']),hub:()=>owner,itemId:'a',itemSearch:{value:''},$:id=>elements[id]||=( {} ),confirm:()=>approved,showLibraryDetails(){},save(){saved++},renderAll(){},renderItems(){}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function visibleLibraryItems()')),c);
 elements.deleteSelectedItems.onclick();assert.equal(owner.items.length,approved?1:3);assert.equal(owner.items.at(-1).id,'c');assert.equal(saved,approved?1:0);
});
