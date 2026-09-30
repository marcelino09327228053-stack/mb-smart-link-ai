/* Original guest storage is never replaced by account synchronization. */
window.MBSync=(()=>{
 let base=null,active=null,userId=null,running=false,pending=false,epoch=0;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const guestPassword='mb_category_master_password_hash_v1';
 const status=text=>{let n=document.getElementById('librarySyncStatus');if(!n){n=document.createElement('p');n.id='librarySyncStatus';n.setAttribute('role','status');n.style.cssText='color:#bcd7f5;margin:6px 0;font-size:14px';document.querySelector('.sidebar').prepend(n)}n.textContent=text};
 const storageKey=()=>userId?'mb_account_library_'+userId:KEY;
 const doc=()=>({hubs:clone(hubs),activeLockedCategoryId:active,passwordHash:localStorage.getItem(CATEGORY_PASSWORD_KEY)||null});
 const clean=d=>({hubs:d.hubs,activeLockedCategoryId:d.activeLockedCategoryId||null,passwordHash:d.passwordHash||null});
 async function request(method,body){const r=await fetch('/api/library',{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok&&r.status!==409)throw Error(data.error||'Library sync failed.');return {r,data}}
 function apply(value){
  const editing=document.querySelector('#libraryLayout[data-details="true"]');
  const old=item(),draft=editing&&old?{id:old.id,name:mainPartName.value!==old.name?mainPartName.value:null,notes:notesArea.value!==(old.notes||'')?notesArea.value:null}:null;
  hubs=clone(value.hubs);active=value.activeLockedCategoryId||null;
  localStorage.setItem(CATEGORY_PASSWORD_KEY,value.passwordHash||'');
  if(!hubs.some(h=>h.id===hubId)){hubId=hubs[0]?.id||null;itemId=null}
  localStorage.setItem(storageKey(),JSON.stringify(hubs));renderAll();
  if(draft&&item()?.id===draft.id){if(draft.name!==null)mainPartName.value=draft.name;if(draft.notes!==null)notesArea.value=draft.notes;}
 }
 function message(){const h=base?.hubs.find(h=>h.id===base.activeLockedCategoryId);status(h?'Synced • MB saves to '+h.name:'Synced • Lock a category to enable MB tap saving.')}
 async function login(user){
  const token=++epoch;status('Connecting shared library…');
  const local=doc();
  let remote=(await request('GET')).data.library;
  if(token!==epoch)return;
  if(!remote){
   // Import only once and leave the original guest library/password untouched.
   const imported=localStorage.getItem('mb_guest_imported_by');
   const initial={hubs:!imported||imported===String(user.id)?local.hubs:defaults(),passwordHash:!imported||imported===String(user.id)?local.passwordHash:null,activeLockedCategoryId:null};
   remote=(await request('PUT',{revision:0,...initial})).data.library;
   localStorage.setItem('mb_guest_imported_by',String(user.id));
  }
  if(token!==epoch)return;
  if(!localStorage.getItem('mb_guest_imported_by')&&local.hubs.some(h=>h.items?.length)){
   const imported=clone(remote);
   for(const h of local.hubs)if(!imported.hubs.some(x=>x.id===h.id))imported.hubs.push(h);
   imported.passwordHash ||= local.passwordHash;
   const result=await request('PUT',imported);
   if(result.r.status===409)throw Error('Library changed during import. Sign in again; the original library is retained.');
   remote=result.data.library;localStorage.setItem('mb_guest_imported_by',String(user.id));
  }
  const retained=localStorage.getItem('mb_library_pending_'+user.id);
  base=remote;userId=user.id;CATEGORY_PASSWORD_KEY=guestPassword+'_account_'+userId;pending=false;
  if(retained){
   const saved=JSON.parse(retained);
   try{const merged=MBLink.merge(clean(saved.base),saved.local,clean(remote));apply(merged);pending=true;void flush()}
   catch(e){base=saved.base;apply(saved.local);pending=true;status('Pending edits retained. '+e.message);return}
  }else{apply(remote);message()}
 }
 function changed(){
  if(!base||!userId)return;
  if(active&&!hubs.some(h=>h.id===active&&h.locked))active=null;
  pending=true;localStorage.setItem('mb_library_pending_'+userId,JSON.stringify({base,local:doc()}));
  status('Saving to shared library…');void flush();
 }
 async function flush(){
  if(running||!pending||!base)return;running=true;const token=epoch;
  try{
   while(pending&&token===epoch){
    pending=false;const before=base,original=doc();let sent=original;
    let response=await request('PUT',{revision:before.revision,...sent});
    if(response.r.status===409){
     const remote=response.data.library;sent=MBLink.merge(clean(before),sent,clean(remote));
     response=await request('PUT',{revision:remote.revision,...sent});
     if(response.r.status===409)throw Error('Library changed again. Retrying.');
    }
    if(token!==epoch)return;
    if(pending){const rebased=MBLink.merge(original,doc(),clean(response.data.library));apply(rebased)}
    base=response.data.library;
    if(pending)localStorage.setItem('mb_library_pending_'+userId,JSON.stringify({base,local:doc()}));
    if(!pending){if(JSON.stringify(clean(base))!==JSON.stringify(doc()))apply(base);localStorage.removeItem('mb_library_pending_'+userId);message()}
   }
  }catch(e){pending=true;status('Not synced: '+e.message)}
  finally{running=false}
 }
 async function refresh(){
  if(!base||running||pending||document.hidden)return;
  if(document.querySelector('#libraryLayout[data-details="true"]')||document.querySelector('#categoryPasswordGate:not([hidden])')||/INPUT|TEXTAREA/.test(document.activeElement?.tagName||''))return;
  const token=epoch;
  try{const remote=(await request('GET')).data.library;if(token===epoch&&!pending&&remote&&remote.revision!==base.revision){base=remote;apply(remote);message()}}catch(e){status(e.message)}
 }
 function logout(){
  epoch++;base=null;userId=null;active=null;pending=false;
  CATEGORY_PASSWORD_KEY=guestPassword;hubs=load();hubId=hubs[0]?.id||null;itemId=null;renderAll();status('Guest library. Bubble saving requires sign-in.');
 }
 setInterval(()=>{if(pending)void flush();else void refresh()},5000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
 return {login,changed,logout,storageKey,activate:id=>{active=id},refresh};
})();
