const {Pool}=require('pg');
let pool;
function getPool(){
 if(!pool){
  if(process.env.PGHOST){
   pool=new Pool({
    host:process.env.PGHOST,
    port:Number(process.env.PGPORT||5432),
    database:process.env.PGDATABASE||'postgres',
    user:process.env.PGUSER||'postgres',
    password:process.env.PGPASSWORD,
    ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:undefined
   });
  }else if(process.env.DATABASE_URL){
   pool=new Pool({
    connectionString:process.env.DATABASE_URL,
    ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:undefined
   });
  }else{
   throw Error('Postgres connection is not configured.');
  }
 }
 return pool;
}
async function initPostgres(){
 const db=getPool();
 await db.query(`
  CREATE TABLE IF NOT EXISTS users(
   id BIGSERIAL PRIMARY KEY,
   email TEXT NOT NULL UNIQUE,
   password_hash TEXT NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS sessions(
   token_hash TEXT PRIMARY KEY,
   user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   expires_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS access_codes (
 id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, user_id BIGINT NOT NULL UNIQUE REFERENCES users(id),
 label TEXT NOT NULL, expires_at BIGINT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0,
 created_at BIGINT NOT NULL
);
  CREATE TABLE IF NOT EXISTS login_codes(
   email TEXT PRIMARY KEY,
   code_hash TEXT NOT NULL,
   expires_at BIGINT NOT NULL,
   attempts INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS libraries(
   user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
   revision BIGINT NOT NULL,
   document JSONB NOT NULL
  );
  CREATE TABLE IF NOT EXISTS captures(
   user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   request_id TEXT NOT NULL,
   result JSONB NOT NULL,
   PRIMARY KEY(user_id,request_id)
  );
 `);
 await db.query(require('./billing.cjs').schema);
}
async function closePostgres(){if(pool){const p=pool;pool=null;await p.end();}}
module.exports={getPool,initPostgres,closePostgres};
