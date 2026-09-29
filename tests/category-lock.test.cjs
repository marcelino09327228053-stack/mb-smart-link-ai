const {test}=require('node:test'),assert=require('node:assert/strict');
const {seal,unseal}=require('../category-lock.js');
test('category password encryption roundtrip preserves all content and rejects wrong password',async()=>{
 const items=[{id:'1',name:'Test',notes:'Private notes',links:[{url:'https://example.com'}],videos:[]}];
 const payload=await seal(items,'test-password-123');
 assert.deepEqual(await unseal(payload,'test-password-123'),items);
 await assert.rejects(unseal(payload,'wrong-password'));
 assert.equal(JSON.stringify(payload).includes('Private notes'),false);
 assert.equal(items[0].notes,'Private notes');
});
test('empty categories and long notes survive encrypt/decrypt',async()=>{
 for(const items of [[],[{notes:'text'.repeat(10000)}]])assert.deepEqual(await unseal(await seal(items,'password-123'),'password-123'),items);
});
