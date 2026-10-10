process.env.MB_AUTH_DB=':memory:';delete process.env.PGHOST;delete process.env.DATABASE_URL;
const {test}=require('node:test'),assert=require('node:assert/strict');const auth=require('../server/auth.cjs'),{cost}=require('../server/usage-cost.cjs'),{week}=require('../server/billing.cjs');
const newUser=()=>auth.ensureOtpUser(require('node:crypto').randomUUID()+'@test.invalid').id;
test('credit code redemption is atomic and account-bound; request is idempotent; debit is idempotent',async()=>{
 const id=newUser(),other=newUser(),c=await auth.credits.issue('Customer',400,id);
 await Promise.all([auth.credits.redeem(c.code,id),auth.credits.redeem(c.code,id)]);assert.equal((await auth.credits.status(id)).balance,240);
 await assert.rejects(auth.credits.redeem(c.code,other),/another account/);
 await Promise.all([auth.credits.request(id),auth.credits.request(id)]);assert.equal((await auth.credits.admin()).requests.filter(r=>r.user_id===id).length,1);
 await Promise.all([auth.credits.debit(id,'unique-paid-event',1234567),auth.credits.debit(id,'unique-paid-event',1234567)]);assert.equal((await auth.credits.status(id)).balance,238.765433);
 const topup=await auth.credits.issue('Customer',400,id);await auth.credits.redeem(topup.code,id);assert.equal((await auth.credits.status(id)).balance,478.765433);
 await auth.credits.debit(id,'exhaust',1e12);assert.equal((await auth.credits.status(id)).balance,0);
});
test('free allowance counts Unicode characters; lease prevents concurrent devices; exhausted remains exhausted',async()=>{
 const id=newUser(),s=await auth.credits.acquire(id);assert.equal(s.plan,'free');await assert.rejects(auth.credits.acquire(id),/another device/);
 const a=await auth.credits.characters(id,s.lease,'\u{1F600}'.repeat(950));assert.equal(a.remaining,50);
 const b=await auth.credits.characters(id,s.lease,'x'.repeat(100));assert.equal(b.text.length,50);assert.equal(b.remaining,0);
 await auth.credits.release(id,s.lease);await assert.rejects(auth.credits.acquire(id),/weekly free limit/);
 assert.equal((await auth.credits.status(id)).freeRemaining,0);
});
test('week uses Monday midnight UTC+8 and billing rate snapshot is configurable',async()=>{
 assert.equal(new Date(week(Date.parse('2026-10-11T15:59:00Z'))).toISOString(),'2026-10-04T16:00:00.000Z');
 assert.equal(new Date(week(Date.parse('2026-10-11T16:00:00Z'))).toISOString(),'2026-10-11T16:00:00.000Z');
 await auth.credits.rate(65);assert.equal((await auth.credits.acquire(newUser())).usdPhp,65);
});
test('official realtime/audio/cached and transcription rates; malformed usage fails closed',()=>{
 const u={input_token_details:{text_tokens:100,audio_tokens:200,image_tokens:0,cached_tokens:30,cached_tokens_details:{text_tokens:10,audio_tokens:20,image_tokens:0}},output_token_details:{text_tokens:50,audio_tokens:0}};
 assert.equal(cost(u,65),450580);
 assert.equal(cost({type:'tokens',input_token_details:{text_tokens:0,audio_tokens:100},output_tokens:20},65,'transcription'),14625);
 assert.throws(()=>cost({},65));assert.throws(()=>cost(u,65,'realtime','unknown-model'));assert.throws(()=>cost(null,65));
});

test('customer denomination never exposes peso budget and preserves positive fractional credits',()=>{
 const {customerCredits}=require('../server/billing.cjs');
 const view=customerCredits({balance:240,freeRemaining:1000,resetAt:123,userId:'9'});
 assert.equal(view.usageCredits,400);assert.equal(view.hasPro,true);assert.equal('balance' in view,false);
 assert.ok(customerCredits({balance:.000001}).usageCredits>0);
 assert.equal(customerCredits({balance:0}).hasPro,false);
});
