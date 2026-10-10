const crypto=require('node:crypto');
const UNIT=1000000, WEEK=7*86400000;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const schema=`
CREATE TABLE IF NOT EXISTS credit_accounts(user_id BIGINT PRIMARY KEY REFERENCES users(id), balance BIGINT NOT NULL DEFAULT 0, free_used INTEGER NOT NULL DEFAULT 0, week_start BIGINT NOT NULL, lease TEXT, lease_until BIGINT NOT NULL DEFAULT 0, label TEXT NOT NULL DEFAULT 'Customer');
CREATE TABLE IF NOT EXISTS credit_codes(id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL, paid BIGINT NOT NULL, credit BIGINT NOT NULL, target_user BIGINT, redeemed_user BIGINT, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS credit_events(id TEXT PRIMARY KEY, user_id BIGINT NOT NULL, amount BIGINT NOT NULL, vendor_cost BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS topup_requests(user_id BIGINT PRIMARY KEY, requested_at BIGINT NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS guest_issues(peer_hash TEXT PRIMARY KEY, week_start BIGINT NOT NULL, issued INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS billing_config(id INTEGER PRIMARY KEY, usd_php INTEGER NOT NULL);
INSERT INTO billing_config(id,usd_php) VALUES(1,6500) ON CONFLICT(id) DO NOTHING;
`;
// Monday 00:00 UTC+8; persistent accounting uses integer micro-pesos.
function week(now=Date.now()){const d=new Date(now+8*3600000);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-((d.getUTCDay()+6)%7))-8*3600000;}
function billing(tx,ensureUser){
 async function account(q,id){await q('INSERT INTO credit_accounts(user_id,week_start) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING',[id,week()]);await q('UPDATE credit_accounts SET free_used=0,week_start=? WHERE user_id=? AND week_start<>?',[week(),id,week()]);return (await q('SELECT * FROM credit_accounts WHERE user_id=?',[id]))[0];}
 function view(a){return {balance:Number(a.balance)/UNIT,freeRemaining:Math.max(0,1000-a.free_used),resetAt:Number(a.week_start)+WEEK,label:a.label,userId:String(a.user_id)};}
 return {
  guestSlot:peer=>tx(async q=>{const key=hash(peer);await q('INSERT INTO guest_issues(peer_hash,week_start,issued) VALUES(?,?,0) ON CONFLICT(peer_hash) DO NOTHING',[key,week()]);const row=(await q('SELECT * FROM guest_issues WHERE peer_hash=?',[key]))[0];const count=Number(row.week_start)===week()?row.issued:0;if(count>=3)throw Error('Free activation limit reached on this network. Use your existing session or redeem a code.');await q('UPDATE guest_issues SET issued=?,week_start=? WHERE peer_hash=?',[count+1,week(),key]);}),
  status:id=>tx(async q=>view(await account(q,id))),
  async issue(label,pesos,target){
   if(!label||label.length>100||!Number.isInteger(pesos)||pesos<400||pesos>100000)throw Error('Enter a label and a payment of at least ₱400 (whole pesos).');
   const code='MB-'+crypto.randomBytes(24).toString('base64url'),id=crypto.randomUUID();
   await tx(async q=>{if(target&&!(await q('SELECT id FROM users WHERE id=?',[target])).length)throw Error('Customer not found.');await q('INSERT INTO credit_codes(id,code_hash,label,paid,credit,target_user,created_at) VALUES(?,?,?,?,?,?,?)',[id,hash(code),label,pesos*UNIT,pesos*600000,target||null,Date.now()]);});return {id,code,credit:pesos*.6};
  },
  async redeem(code,currentId){
   if(!/^MB-[A-Za-z0-9_-]{32}$/.test(code))throw Error('Invalid code.');
   // A code also recovers its account on another device, without allocating twice.
   const existing=await tx(q=>q('SELECT * FROM credit_codes WHERE code_hash=?',[hash(code)]));
   if(!existing.length)return null;
   const row=existing[0];let id=currentId||row.redeemed_user||row.target_user;
   if(!id)id=(await ensureUser(crypto.randomUUID()+'@access.invalid')).id;
   return tx(async q=>{
    const c=(await q('SELECT * FROM credit_codes WHERE code_hash=?',[hash(code)]))[0];
    if((c.redeemed_user&&String(c.redeemed_user)!==String(id))||(c.target_user&&String(c.target_user)!==String(id)))throw Error('This code belongs to another account.');
    await account(q,id);
    if(!c.redeemed_user){await q('UPDATE credit_codes SET redeemed_user=? WHERE id=?',[id,c.id]);await q('UPDATE credit_accounts SET balance=balance+?,label=? WHERE user_id=?',[c.credit,c.label,id]);await q('INSERT INTO credit_events(id,user_id,amount,created_at) VALUES(?,?,?,?)',['code:'+c.id,id,c.credit,Date.now()]);await q("UPDATE topup_requests SET status='completed' WHERE user_id=?",[id]);}
    return id;
   });
  },
  request:id=>tx(async q=>{await account(q,id);await q("INSERT INTO topup_requests(user_id,requested_at,status) VALUES(?,?,'pending') ON CONFLICT(user_id) DO UPDATE SET requested_at=CASE WHEN topup_requests.status='pending' THEN topup_requests.requested_at ELSE excluded.requested_at END,status='pending'",[id,Date.now()]);}),
  admin:()=>tx(async q=>({codes:await q('SELECT id,label,paid,credit,target_user,redeemed_user,created_at FROM credit_codes ORDER BY created_at DESC',[]),accounts:await q('SELECT user_id,label,balance,free_used FROM credit_accounts ORDER BY user_id DESC',[]),requests:await q('SELECT t.user_id,t.requested_at,t.status,a.label,a.balance FROM topup_requests t JOIN credit_accounts a ON a.user_id=t.user_id ORDER BY requested_at DESC',[]),usdPhp:Number((await q('SELECT usd_php FROM billing_config WHERE id=1',[]))[0].usd_php)/100})),
  rate:value=>tx(async q=>{if(!Number.isFinite(value)||value<1||value>1000)throw Error('Invalid billing exchange rate.');await q('UPDATE billing_config SET usd_php=? WHERE id=1',[Math.round(value*100)]);}),
  acquire:id=>tx(async q=>{const a=await account(q,id);if(a.lease&&Number(a.lease_until)>Date.now())throw Error('Already listening on another device.');const plan=Number(a.balance)>0?'pro':'free';if(plan==='free'&&a.free_used>=1000)throw Error('You’ve reached your weekly free limit. Redeem a Pro code or wait for your weekly reset.');const lease=crypto.randomUUID();await q('UPDATE credit_accounts SET lease=?,lease_until=? WHERE user_id=?',[lease,Date.now()+90000,id]);return {...view(a),plan,lease,usdPhp:Number((await q('SELECT usd_php FROM billing_config WHERE id=1',[]))[0].usd_php)/100};}),
  renew:(id,lease)=>tx(async q=>{const a=await account(q,id);if(a.lease!==lease||Number(a.lease_until)<=Date.now())throw Error('Listening session expired.');await q('UPDATE credit_accounts SET lease_until=? WHERE user_id=? AND lease=?',[Date.now()+90000,id,lease]);return view(a);}),
  release:(id,lease)=>tx(q=>q('UPDATE credit_accounts SET lease=NULL,lease_until=0 WHERE user_id=? AND lease=?',[id,lease])),
  characters:(id,lease,text)=>tx(async q=>{const a=await account(q,id);if(a.lease!==lease||Number(a.lease_until)<=Date.now())throw Error('Listening session expired.');const chars=Array.from(text),n=Math.min(chars.length,Math.max(0,1000-a.free_used));await q('UPDATE credit_accounts SET free_used=free_used+? WHERE user_id=?',[n,id]);return {text:chars.slice(0,n).join(''),remaining:1000-a.free_used-n};}),
  debit:(id,event,cost)=>tx(async q=>{if(!Number.isSafeInteger(cost)||cost<0)throw Error('Invalid usage cost.');const a=await account(q,id);if((await q('SELECT id FROM credit_events WHERE id=?',[event])).length)return view(a);const amount=Math.min(Number(a.balance),cost);await q('INSERT INTO credit_events(id,user_id,amount,vendor_cost,created_at) VALUES(?,?,?,?,?)',[event,id,-amount,cost,Date.now()]);await q('UPDATE credit_accounts SET balance=balance-? WHERE user_id=?',[amount,id]);a.balance-=amount;return view(a);})
 };
}
module.exports={schema,billing,week,UNIT};
