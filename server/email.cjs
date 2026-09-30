const {randomUUID}=require('node:crypto');
function emailDelivery({env=process.env,fetchImpl=fetch}={}){
 const provider=env.EMAIL_PROVIDER||(env.RESEND_API_KEY?'resend':'development');
 const demo=isLocal=>provider==='development'&&isLocal&&env.NODE_ENV!=='production'&&env.DEV_SAMPLE_LOGIN==='true';
 function check(isLocal){
  if(demo(isLocal))return;
  if(provider!=='resend'||!env.RESEND_API_KEY?.trim()||!env.RESEND_FROM_EMAIL?.trim())
   throw Error('Email sign-in is not configured. Please contact the site owner.');
  if(/[\r\n]/.test(env.RESEND_FROM_EMAIL))throw Error('Email sender configuration is invalid.');
 }
 async function send(email,code,isLocal){
  check(isLocal);
  if(demo(isLocal))return {demoMode:true,message:'Local demo mode is enabled. No email was sent.'};
  try{
   const response=await fetchImpl('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'otp-'+randomUUID()},
    signal:AbortSignal.timeout(12000),
    body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[email],subject:'MB Smart Link AI verification code',
      text:'Your MB Smart Link AI verification code is: '+code+'.\n\nThis code expires in 10 minutes and can only be used once. Do not share this code. If you did not request it, ignore this email.'})
   });
   // Never expose provider responses, request headers, addresses, or OTPs in logs/errors.
   if(!response.ok)throw Error('delivery-failed');
   const data=await response.json();if(!data.id)throw Error('delivery-failed');
   return {demoMode:false,message:'Verification email sent. Check your inbox and spam folder. The code expires in 10 minutes.'};
  }catch{throw Error('Could not send the verification email. Please try again shortly.')}
 }
 return {check,send,demo};
}
module.exports={emailDelivery};
