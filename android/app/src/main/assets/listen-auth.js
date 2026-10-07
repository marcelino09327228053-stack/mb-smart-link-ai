(()=>{
 if(window.__mbListenAuth)return;
 const button=document.getElementById('phoneListenToggle');
 if(!button||typeof showAuth!=='function')return;
 window.__mbListenAuth=true;
 const log=event=>console.info('MB_AUTH:'+event);
 const area=document.createElement('div');area.id='androidListenAccount';area.style.cssText='margin:16px 0;padding:12px;border:1px solid var(--line,#46546a);border-radius:12px';
 const label=document.createElement('p');label.setAttribute('role','status');label.textContent='Account: Checking session...';
 const sign=document.createElement('button');sign.type='button';sign.className='small-btn';sign.textContent='SIGN IN';sign.disabled=true;
 area.append(label,sign);button.before(area);
 const gate=document.createElement('fieldset');gate.style.cssText='border:0;margin:0;padding:0;min-width:0';gate.disabled=true;button.before(gate);gate.append(button);
 let signed=false,busy=false,rerun=false,known=null;
 function update(user,offline=false){
  signed=!!user;label.textContent=signed?'Account: Signed in':offline?'Account: Unable to check. Retry sign in.':'Account: Not signed in';
  sign.hidden=signed;sign.disabled=false;gate.disabled=!signed;
  if(known!==signed){log(signed?'SESSION_DETECTED':'LISTEN_BLOCKED');known=signed;}
 }
 async function check(){
  if(busy){rerun=true;return;}busy=true;
  try{const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});const data=await r.json();update(r.ok?data.user:null);}
  catch{update(null,true);log('AUTH_CHECK_FAILED');}
  finally{busy=false;if(rerun){rerun=false;void check();}}
 }
 sign.onclick=()=>{log('SIGN_IN_PRESSED');showAuth('Sign in to use AI Listen.',async()=>{log('AUTH_SUCCESS');window.MBPhone?.navigate('listen');await check();});log('AUTH_FLOW_OPENED');};
 button.addEventListener('click',e=>{if(!signed){e.stopImmediatePropagation();e.preventDefault();log('LISTEN_BLOCKED');}else log('LISTEN_ALLOWED');},true);
 const logout=document.getElementById('logoutBtn');if(logout)new MutationObserver(()=>{if(logout.hidden){update(null);window.MBPhoneListener?.pause();}void check();}).observe(logout,{attributes:true,attributeFilter:['hidden']});
 const authStatus=document.getElementById('authStatus');if(authStatus)new MutationObserver(()=>{if(/invalid|expired|failed|unavailable|could not|unable/i.test(authStatus.textContent))log('AUTH_FAILURE');}).observe(authStatus,{childList:true,subtree:true,characterData:true});
 const detail=document.getElementById('phoneListenDetail');if(detail)new MutationObserver(()=>{if(/sign in first/i.test(detail.textContent)){update(null);void check();}}).observe(detail,{childList:true,subtree:true});
 window.addEventListener('focus',()=>void check());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
 setInterval(()=>{if(!document.hidden)void check();},30000);void check();
})();
