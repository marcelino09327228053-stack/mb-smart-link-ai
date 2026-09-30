const {test}=require('node:test'),assert=require('node:assert/strict');
const modulePath=require.resolve('../server/postgres.cjs');
test('Postgres concurrent capture replay is checked again after acquiring the row lock',async()=>{
 const queries=[],prior={saved:true,itemId:'original',categoryId:'a'};let reads=0;
 const client={release(){},async query(sql){
  queries.push(sql);
  if(sql.includes('FROM captures'))return ++reads===1?{rowCount:0,rows:[]}:{rowCount:1,rows:[{result:prior}]};
  if(sql.includes('FOR UPDATE'))return {rowCount:1,rows:[{revision:2,document:{hubs:[{id:'a',locked:true,items:[]}],activeLockedCategoryId:'a'}}]};
  return {rowCount:0,rows:[]};
 }};
 require.cache[modulePath]={id:modulePath,filename:modulePath,loaded:true,exports:{getPool:()=>({connect:async()=>client})}};
 delete require.cache[require.resolve('../server/library-postgres.cjs')];
 const library=require('../server/library-postgres.cjs');
 assert.deepEqual(await library.capture('7','same-request-id','https://example.com'),prior);
 assert.equal(queries.filter(q=>q.includes('FROM captures')).length,2);
 assert.equal(queries.some(q=>q.startsWith('INSERT')||q.startsWith('UPDATE')),false);
 assert.equal(queries.at(-1),'COMMIT');
});
test('Postgres OTP verification holds a row lock through consume or attempt increment',async()=>{
 const queries=[],crypto=require('node:crypto'),hash=crypto.createHash('sha256').update('654321').digest('hex');
 const client={release(){queries.push('RELEASE')},async query(sql){
  queries.push(sql);
  if(sql.includes('SELECT code_hash'))return {rows:[{code_hash:hash,expires_at:Date.now()+60000,attempts:0}]};
  return {rows:[],rowCount:1};
 }};
 require.cache[modulePath].exports.getPool=()=>({connect:async()=>client});
 delete require.cache[require.resolve('../server/auth-postgres.cjs')];
 const auth=require('../server/auth-postgres.cjs');
 assert.equal(await auth.verifyLoginCode('test@example.test','654321'),true);
 assert.match(queries[1],/FOR UPDATE/);assert.match(queries[2],/DELETE FROM login_codes/);
 assert.deepEqual(queries.slice(-2),['COMMIT','RELEASE']);
 queries.length=0;assert.equal(await auth.verifyLoginCode('test@example.test','000000'),false);
 assert.match(queries[2],/attempts=attempts\+1/);
});
