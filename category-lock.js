/* Password protection for local category contents. Passwords are never stored. */
(()=>{
 const encode=bytes=>btoa(String.fromCharCode(...bytes));
 const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 async function key(password,salt){
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 async function seal(items,password){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(password,salt),new TextEncoder().encode(JSON.stringify(items)));
  const data=new Uint8Array(bytes);let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));
  return {version:1,salt:encode(salt),iv:encode(iv),data:btoa(binary)};
 }
 async function unseal(payload,password){
  if(payload?.version!==1)throw Error('Unsupported lock');
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(payload.iv)},await key(password,decode(payload.salt)),decode(payload.data));
  const items=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(items))throw Error('Invalid category');return items;
 }
 if(typeof module!=='undefined'){module.exports={seal,unseal};return}
 let busy=false;
 window.categoryPasswordDialog=(category,unlocking)=>new Promise(resolve=>{
  if(busy){resolve(null);return}busy=true;
  const overlay=document.createElement('section');overlay.className='auth-gate';
  const card=document.createElement('form');card.className='auth-card glass-card';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');
  const title=document.createElement('h1');title.textContent=unlocking?'Unlock category':'Set category password';
  const note=document.createElement('p');note.textContent=unlocking?'Enter the password for '+category.name:'Use at least 8 characters. Keep this password safe: a forgotten password cannot recover encrypted items.';
  const label=document.createElement('label');label.textContent='PASSWORD';
  const password=document.createElement('input');password.type='password';password.autocomplete=unlocking?'current-password':'new-password';password.required=true;password.minLength=unlocking?1:8;label.appendChild(password);
  const confirmLabel=document.createElement('label');confirmLabel.textContent='CONFIRM PASSWORD';
  const confirmation=document.createElement('input');confirmation.type='password';confirmation.autocomplete='new-password';confirmLabel.appendChild(confirmation);confirmLabel.hidden=unlocking;confirmation.required=!unlocking;
  const status=document.createElement('p');status.setAttribute('role','status');
  const submit=document.createElement('button');submit.type='submit';submit.className='save-btn';submit.textContent=unlocking?'UNLOCK':'SET PASSWORD & LOCK';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='small-btn';cancel.textContent='CANCEL';
  let working=false;const previous=document.activeElement;
  function close(value){overlay.remove();document.body.classList.remove('auth-open');busy=false;previous?.focus({preventScroll:true});resolve(value)}
  cancel.onclick=()=>{if(!working)close(null)};
  card.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();cancel.click()}if(event.key==='Tab'){const inputs=[password,...(unlocking?[]:[confirmation]),submit,cancel];const first=inputs[0],last=inputs.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}};
  card.onsubmit=async event=>{
   event.preventDefault();if(working)return;
   if(!unlocking&&password.value!==confirmation.value){status.textContent='Passwords do not match.';return}
   working=true;submit.disabled=cancel.disabled=true;
   try{
    if(unlocking){const items=await unseal(category.lockPayload,password.value);close({items})}
    else{const payload=await seal(category.items,password.value);await unseal(payload,password.value);close(payload)}
   }catch{status.textContent=unlocking?'Incorrect password or damaged locked data.':'Unable to lock. Your items have not changed.'}
   finally{working=false;submit.disabled=cancel.disabled=false}
  };
  card.append(title,note,label,confirmLabel,status,submit,cancel);overlay.appendChild(card);document.body.appendChild(overlay);document.body.classList.add('auth-open');password.focus({preventScroll:true});
 });
})();
