const crypto=require('node:crypto');
const {getPool}=require('./postgres.cjs');

const normalizeEmail=value=>String(value||'').trim().toLowerCase();
const token=()=>crypto.randomBytes(32).toString('base64url');
const tokenHash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');

function scryptAsync(password,salt){
 return new Promise((resolve,reject)=>
  crypto.scrypt(password,salt,64,(err,key)=>err?reject(err):resolve(key))
 );
}

async function hashPassword(password){
 const salt=crypto.randomBytes(16);
 const key=await scryptAsync(password,salt);
 return 'scrypt$'+salt.toString('hex')+'$'+key.toString('hex');
}

async function verifyPassword(password,stored){
 try{
  const [alg,saltHex,keyHex]=String(stored).split('$');
  if(alg!=='scrypt')return false;
  const key=await scryptAsync(password,Buffer.from(saltHex,'hex'));
  const expected=Buffer.from(keyHex,'hex');
  return key.length===expected.length&&crypto.timingSafeEqual(key,expected);
 }catch{return false}
}

async function createUser(email,passwordHash){
 const result=await getPool().query(
  'INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email,password_hash,created_at',
  [normalizeEmail(email),passwordHash]
 );
 return result.rows[0];
}

async function findUserByEmail(email){
 const result=await getPool().query(
  'SELECT id,email,password_hash,created_at FROM users WHERE email=$1',
  [normalizeEmail(email)]
 );
 return result.rows[0]||null;
}

async function ensureOtpUser(email){
 email=normalizeEmail(email);
 let user=await findUserByEmail(email);
 if(user)return user;
 await getPool().query(
  'INSERT INTO users(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO NOTHING',
  [email,'otp-only']
 );
 return findUserByEmail(email);
}

function generateLoginCode(){
 return String(crypto.randomInt(0,1000000)).padStart(6,'0');
}

async function createLoginCode(email,maxAgeMs=10*60*1000,allowDemo=true){
 email=normalizeEmail(email);
 const code=allowDemo&&process.env.DEV_SAMPLE_LOGIN==='true'&&process.env.NODE_ENV!=='production'
  ?'123456':generateLoginCode();

 await getPool().query(`
  INSERT INTO login_codes(email,code_hash,expires_at,attempts)
  VALUES($1,$2,$3,0)
  ON CONFLICT(email) DO UPDATE SET
   code_hash=EXCLUDED.code_hash,
   expires_at=EXCLUDED.expires_at,
   attempts=0
 `,[email,tokenHash(code),Date.now()+maxAgeMs]);

 return code;
}

async function verifyLoginCode(email,code){
 email=normalizeEmail(email);
 const result=await getPool().query(
  'SELECT code_hash,expires_at,attempts FROM login_codes WHERE email=$1',
  [email]
 );
 const row=result.rows[0];

 if(!row||Number(row.expires_at)<=Date.now()||row.attempts>=5){
  await getPool().query('DELETE FROM login_codes WHERE email=$1',[email]);
  return false;
 }

 const ok=row.code_hash===tokenHash(code);

 if(ok){
  await getPool().query('DELETE FROM login_codes WHERE email=$1',[email]);
  return true;
 }

 await getPool().query(
  'UPDATE login_codes SET attempts=attempts+1 WHERE email=$1',
  [email]
 );
 return false;
}

async function cleanupSessions(){
 await getPool().query('DELETE FROM sessions WHERE expires_at <= $1',[Date.now()]);
}

async function createSession(userId,maxAgeMs=1000*60*60*24*30){
 await cleanupSessions();
 const raw=token();
 await getPool().query(
  'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',
  [tokenHash(raw),userId,Date.now()+maxAgeMs]
 );
 return raw;
}

async function deleteSession(raw){
 if(raw)await getPool().query(
  'DELETE FROM sessions WHERE token_hash=$1',
  [tokenHash(raw)]
 );
}

async function getSessionUser(raw){
 if(!raw)return null;
 await cleanupSessions();
 const result=await getPool().query(`
  SELECT u.id,u.email,u.created_at
  FROM sessions s
  JOIN users u ON u.id=s.user_id
  WHERE s.token_hash=$1 AND s.expires_at>$2
 `,[tokenHash(raw),Date.now()]);
 return result.rows[0]||null;
}

module.exports={
 hashPassword,
 verifyPassword,
 createUser,
 findUserByEmail,
 createSession,
 deleteSession,
 getSessionUser,
 createLoginCode,
 verifyLoginCode,
 ensureOtpUser
};
