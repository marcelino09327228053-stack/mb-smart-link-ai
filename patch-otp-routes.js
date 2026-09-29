const fs=require('fs');
const p='server.cjs';
let s=fs.readFileSync(p,'utf8');
const start="    if(req.method==='POST'&&pathname==='/api/auth/register'){";
const end="    if(req.method==='POST'&&pathname==='/api/auth/logout'){";
const a=s.indexOf(start);
const b=s.indexOf(end);
if(a<0||b<0||b<=a) throw new Error('auth route block not found');
const replacement=`    if(req.method==='POST'&&pathname==='/api/auth/request-code'){
      if(!sameOrigin()) return send(403,{error:'Same-origin JSON request required.'});
      try{
        const body=await readJson();
        const email=String(body.email||'').trim().toLowerCase();
        if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)||email.length>254)
          return send(400,{error:'Enter a valid email address.'});
        const code=auth.createLoginCode(email);
        console.log('[DEV LOGIN CODE] '+email+': '+code);
        return send(200,{ok:true,message:'Verification code created.'});
      }catch{
        return send(400,{error:'Could not create verification code.'});
      }
    }

    if(req.method==='POST'&&pathname==='/api/auth/verify-code'){
      if(!sameOrigin()) return send(403,{error:'Same-origin JSON request required.'});
      try{
        const body=await readJson();
        const email=String(body.email||'').trim().toLowerCase();
        const code=String(body.code||'').trim();
        if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)||email.length>254)
          return send(400,{error:'Enter a valid email address.'});
        if(!/^\\d{6}$/.test(code))
          return send(400,{error:'Enter the 6-digit code.'});
        if(!auth.verifyLoginCode(email,code))
          return send(401,{error:'Invalid or expired verification code.'});
        const user=auth.ensureOtpUser(email);
        const token=auth.createSession(user.id);
        setSessionCookie(token);
        return send(200,{user:{id:user.id,email:user.email,created_at:user.created_at}});
      }catch{
        return send(400,{error:'Could not verify code.'});
      }
    }

`;
s=s.slice(0,a)+replacement+s.slice(b);
fs.writeFileSync(p,s,'utf8');
console.log('OTP_ROUTES_ADDED');

