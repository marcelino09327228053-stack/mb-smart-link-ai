const {test}=require('node:test');
const assert=require('node:assert/strict');
const {repository}=require('../server/library.cjs');
const link=require('../shared-link.cjs');
function initial(){return {hubs:[{id:'a',name:'Panel Beater',locked:true,items:[]},{id:'b',name:'Cooking',items:[]}],activeLockedCategoryId:'a',passwordHash:null}}
test('capture saves to the active locked category in the existing item format and survives reopening',()=>{
 const r=repository(':memory:');r.put(1,0,initial());
 const result=r.capture(1,'request-123456789','https://youtu.be/abcdef');
 assert.equal(result.saved,true);assert.equal(result.categoryId,'a');
 const saved=r.get(1);assert.equal(saved.hubs[0].items.length,1);assert.equal(saved.hubs[1].items.length,0);
 assert.equal(saved.hubs[0].items[0].videos[0].url,'https://youtu.be/abcdef');
 assert.equal(saved.hubs[0].items[0].name,'YouTube');assert.ok(saved.hubs[0].items[0].savedAt);
 assert.deepEqual(r.capture(1,'request-123456789','https://youtu.be/abcdef'),result);
 assert.equal(r.get(1).hubs[0].items.length,1);r.close();
});
test('unlock, absent account library, invalid link never silently save elsewhere',()=>{
 const r=repository(':memory:');r.put(1,0,initial());const d=r.get(1);d.hubs[0].locked=false;d.activeLockedCategoryId=null;r.put(1,d.revision,d);
 assert.throws(()=>r.capture(1,'request-123456789','https://example.com'),/No active/);
 assert.throws(()=>r.capture(2,'request-123456789','https://example.com'),/No active/);
 assert.throws(()=>link.make('javascript:alert(1)','x','y','date'));
 assert.equal(r.get(1).hubs[0].items.length,0);r.close();
});
test('switching active lock and accounts stays isolated; stale document cannot erase an overlay save',()=>{
 const r=repository(':memory:');r.put(1,0,initial());r.put(2,0,initial());const old=r.get(1);
 r.capture(1,'request-123456789','https://webtoons.com/test');
 assert.equal(r.put(1,old.revision,old),null);
 assert.equal(r.get(2).hubs[0].items.length,0);
 const d=r.get(1);d.hubs[1].locked=true;d.activeLockedCategoryId='b';r.put(1,d.revision,d);
 assert.equal(r.capture(1,'request-987654321','https://example.com').categoryId,'b');r.close();
});
test('three-way sync keeps both concurrent appends and unrelated rename; rejects conflicting rename/deletion',()=>{
 const b=initial(),l=structuredClone(b),r=structuredClone(b);
 l.hubs[0].name='Auto';l.hubs[0].items.push(link.make('https://a.com','one','entry1','now'));
 r.hubs[0].items.push(link.make('https://b.com','two','entry2','now'));
 const merged=link.merge(b,l,r);
 assert.equal(merged.hubs[0].name,'Auto');assert.equal(merged.hubs[0].items.length,2);
 r.hubs[0].name='Cars';assert.throws(()=>link.merge(b,l,r),/changed/);
 l.hubs=[];assert.throws(()=>link.merge(b,l,r),/changed/);
});
test('active target validation does not accept an unlocked or missing category',()=>{
 const r=repository(':memory:');const d=initial();d.activeLockedCategoryId='b';
 assert.throws(()=>r.put(1,0,d),/locked/);r.close();
});
