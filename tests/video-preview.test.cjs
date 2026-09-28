const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('video preview opens original URL externally without embedding a player',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
 const code=source.slice(source.indexOf('function playVideo(v)'),source.indexOf('window.editLinkTitle'));
 const opened=[];
 const context={URL,norm:v=>v,window:{open:(...args)=>opened.push(args)}};
 vm.createContext(context);vm.runInContext(code,context);
 const url='https://www.youtube.com/watch?v=jfKfPfyJRdk&list=example';
 context.playVideo(url);
 assert.deepEqual(opened,[[url,'_blank','noopener,noreferrer']]);
 context.playVideo('javascript:alert(1)');assert.equal(opened.length,1);
});
