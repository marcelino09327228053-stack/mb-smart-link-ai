const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
// Codes are high-entropy bearer credentials. Only hashes are retained.
function accessCodes(query,ensureUser){
 return {
  async issue(label,days){
   const id=crypto.randomUUID(),code='MB-'+crypto.randomBytes(24).toString('base64url');
   const user=await ensureUser(id+'@access.invalid');
   const expiresAt=Date.now()+days*86400000;
   await query('INSERT INTO access_codes(id,code_hash,user_id,label,expires_at,created_at) VALUES(?,?,?,?,?,?)',[id,hash(code),user.id,label,expiresAt,Date.now()]);
   return {id,code,label,expiresAt};
  },
  async resolve(code){
   if(typeof code!=='string'||!/^MB-[A-Za-z0-9_-]{32}$/.test(code))return null;
   const rows=await query('SELECT user_id FROM access_codes WHERE code_hash=?',[hash(code)]);
   return rows[0]?.user_id||null;
  },
  async list(){return query('SELECT id,label,expires_at,disabled,created_at FROM access_codes ORDER BY created_at DESC',[]);},
  async revoke(id){await query('UPDATE access_codes SET disabled=1 WHERE id=?',[id]);}
 };
}
module.exports={accessCodes};
