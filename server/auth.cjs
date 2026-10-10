const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');

const db = new DatabaseSync(process.env.MB_AUTH_DB||path.join(__dirname,'..','data','mb-smart-link.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS access_codes (
 id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, user_id BIGINT NOT NULL UNIQUE REFERENCES users(id),
 label TEXT NOT NULL, expires_at BIGINT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0,
 created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
`);

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
  }catch{
    return false;
  }
}

function token(){
  return crypto.randomBytes(32).toString('base64url');
}

function tokenHash(value){
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function generateLoginCode(){
  return String(crypto.randomInt(0,1000000)).padStart(6,'0');
}

function createLoginCode(email,maxAgeMs=10*60*1000,allowDemo=true){
  const code=allowDemo && process.env.DEV_SAMPLE_LOGIN==='true' && process.env.NODE_ENV!=='production' ? '123456' : generateLoginCode();
  const result=db.prepare(`
    INSERT INTO login_codes(email,code_hash,expires_at,attempts)
    VALUES(?,?,?,0)
    ON CONFLICT(email) DO UPDATE SET
      code_hash=excluded.code_hash,
      expires_at=excluded.expires_at,
      attempts=0
    WHERE login_codes.expires_at<=?
  `).run(email,tokenHash(code),Date.now()+maxAgeMs,Date.now()+maxAgeMs-60000);
  if(!result.changes)throw Object.assign(Error('OTP cooldown'),{code:'OTP_COOLDOWN'});
  return code;
}

function discardLoginCode(email,code){db.prepare('DELETE FROM login_codes WHERE email=? AND code_hash=?').run(email,tokenHash(code))}

function verifyLoginCode(email,code){
  const row=db.prepare(
    'SELECT code_hash,expires_at,attempts FROM login_codes WHERE email=?'
  ).get(email);

  if(!row||row.expires_at<=Date.now()||row.attempts>=5){
    return false;
  }

  const ok=row.code_hash===tokenHash(code);

  if(ok){
    db.prepare('DELETE FROM login_codes WHERE email=?').run(email);
    return true;
  }

  db.prepare(
    'UPDATE login_codes SET attempts=attempts+1 WHERE email=?'
  ).run(email);

  return false;
}

function cleanupSessions(){
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}

function createUser(email,passwordHash){
  return db.prepare(
    'INSERT INTO users(email,password_hash) VALUES(?,?)'
  ).run(email,passwordHash);
}

function findUserByEmail(email){
  return db.prepare(
    'SELECT id,email,password_hash,created_at FROM users WHERE email=?'
  ).get(email);
}

function ensureOtpUser(email){
  let user=findUserByEmail(email);
  if(user)return user;

  db.prepare(
    'INSERT INTO users(email,password_hash) VALUES(?,?)'
  ).run(email,'otp-only');

  return findUserByEmail(email);
}

function createSession(userId,maxAgeMs=1000*60*60*24*30){
  cleanupSessions();
  const raw=token();
  db.prepare(
    'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)'
  ).run(tokenHash(raw),userId,Date.now()+maxAgeMs);
  return raw;
}

function deleteSession(raw){
  if(raw){
    db.prepare(
      'DELETE FROM sessions WHERE token_hash=?'
    ).run(tokenHash(raw));
  }
}

function getSessionUser(raw){
  if(!raw)return null;
  cleanupSessions();
  return db.prepare(`
    SELECT u.id,u.email,u.created_at
    FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN access_codes a ON a.user_id=u.id
    WHERE s.token_hash=? AND s.expires_at>? AND (a.id IS NULL OR (a.disabled=0 AND a.expires_at>?))
  `).get(tokenHash(raw),Date.now(),Date.now())||null;
}

const access=require('./access-codes.cjs').accessCodes(async(sql,args)=>{const stmt=db.prepare(sql);return /^SELECT/.test(sql)?stmt.all(...args):(stmt.run(...args),[]);},ensureOtpUser);

module.exports={
  access,
  hashPassword,
  verifyPassword,
  createUser,
  findUserByEmail,
  createSession,
  deleteSession,
  getSessionUser,
  createLoginCode,
  discardLoginCode,
  verifyLoginCode,
  ensureOtpUser
};

