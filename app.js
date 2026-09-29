const selectedItems=new Set();let selectionHub=null;
const OLD_KEY="panel_beater_study_parts_v1",KEY="mb_future_knowledge_hubs_v1";const $=id=>document.getElementById(id);function uid(){return crypto.randomUUID()}function oldItems(){try{return JSON.parse(localStorage.getItem(OLD_KEY)||"[]")}catch{return[]}}function defaults(){return[{id:uid(),name:"New Category",items:[]}]}function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||"null");return Array.isArray(x)?x:defaults()}catch{return defaults()}}let hubs=load(),hubId=hubs[0]?.id||null,itemId=hubs[0]?.items?.[0]?.id||null;function save(){localStorage.setItem(KEY,JSON.stringify(hubs))}function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function norm(v){v=(v||"").trim();return !v?"":/^https?:\/\//i.test(v)?v:"https://"+v}function yid(v){try{const u=new URL(norm(v));if(u.hostname.includes("youtu.be"))return u.pathname.split("/")[1]||"";if(u.hostname.includes("youtube.com")){if(u.pathname==="/watch")return u.searchParams.get("v")||"";return u.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1]||""}}catch{}return""}function linkType(v){const s=(v||"").trim().toLowerCase();if(!s)return"empty";if(yid(s)||/(youtube\.com|youtu\.be|facebook\.com|fb\.watch|tiktok\.com|instagram\.com).*?(watch|video|videos|reel|reels|shorts|\/v\/|youtu)/i.test(s)||/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(s))return"video";if(/\.(jpg|jpeg|png|gif|webp|bmp|svg|avif)(\?|#|$)/i.test(s)||/(images?|photos?|picture|img)[\/.?=_-]/i.test(s))return"image";return"website"}function hub(){return hubs.find(h=>h.id===hubId)}function item(){return hub()?.items.find(i=>i.id===itemId)}function migrate(i){if(!i.links)i.links=i.image?[{id:uid(),title:i.image,url:i.image}]:[];if(!i.videos)i.videos=i.youtube?[{id:uid(),title:i.youtube,url:i.youtube}]:[];if(i.videos.length>1)i.videos=i.videos.slice(-1);if(i.name==="Saved Link"){const url=i.links.at(-1)?.url||i.videos.at(-1)?.url;if(url)i.name=siteName(url)}return i}function warn(m){alert("Warning: "+m)}async function videoTitle(url){try{const r=await fetch('/api/video-title?url='+encodeURIComponent(url));if(r.ok){const data=await r.json();return data.title||'Untitled Video'}}catch{}return 'Untitled Video'}const hubList=$("hubList"),hubSearch=$("hubSearch"),hubEmpty=$("hubEmpty"),hubWorkspace=$("hubWorkspace"),hubTitle=$("hubTitle"),itemList=$("itemList"),itemSearch=$("itemSearch"),libraryCount=$("libraryCount"),itemEmpty=$("itemEmpty"),detailCard=$("detailCard"),detailName=$("detailName"),mainPartName=$("mainPartName"),notesArea=$("notesArea"),videoPreview=$("videoPreview"),videoThumb=$("videoThumb"),noPreview=$("noPreview"),imageLinksList=$("imageLinksList"),videoLinksList=$("videoLinksList");function openHub(h){
  if(h.locked){toggleHubLock(h);return}
  hubId=h.id;itemId=h.items[0]?.id||null;showLibraryDetails(false);renderAll();
}
function toggleHubLock(h,event){
  event?.preventDefault();event?.stopPropagation();
  requireAuth('Login first to use Category Lock.',()=>window.categoryLock(h));
}
function renderHubs(){
  const q=hubSearch.value.trim().toLowerCase();
  hubList.innerHTML='';
  hubs.filter(h=>h.name.toLowerCase().includes(q)).forEach(h=>{
    const b=document.createElement('button');
    b.className='part-item'+(h.id===hubId?' active':'');
    b.innerHTML='<div class="part-icon" aria-label="'+(h.locked?'Locked':'')+'">'+(h.locked?'&#128274;':'')+'</div><div><div class="part-name">'+esc(h.name)+'</div><div class="part-sub">'+(h.locked?(h.lockedCount??h.items.length):h.items.length)+' library items</div></div><div class="chev">&gt;</div>';
    b.onclick=()=>openHub(h);
    appendLibraryRow(b,h,null,true);
  });
}
function renderHub(){const h=hub();if(!h||h.locked){hubEmpty.classList.remove("hidden");hubWorkspace.classList.add("hidden");return}hubEmpty.classList.add("hidden");hubWorkspace.classList.remove("hidden");hubTitle.textContent=h.name;renderItems()}function renderItems(){const h=hub();if(!h)return;if(selectionHub!==h.id){selectedItems.clear();selectionHub=h.id}for(const id of selectedItems)if(!h.items.some(i=>i.id===id))selectedItems.delete(id);libraryCount.textContent=`${h.items.length} saved item${h.items.length===1?"":"s"}`;itemList.innerHTML="";const q=itemSearch.value.trim().toLowerCase();h.items.filter(i=>i.name.toLowerCase().includes(q)).forEach(i=>{migrate(i);const b=document.createElement("button");b.className="part-item"+(i.id===itemId?" active":"");b.innerHTML=`<div class="part-icon">&bull;</div><div><div class="part-name">${esc(i.name)}</div><div class="item-saved-date">${esc(savedDate(i.savedAt))}</div></div><div class="chev">&gt;</div>`;b.onclick=()=>{itemId=i.id;showLibraryDetails(true);renderItems();$("libraryBack").focus()};appendLibraryRow(b,i,h)});updateSelectionControls();renderDetail()}function renderDetail(){const i=item();if(!i){itemEmpty.classList.remove("hidden");detailCard.classList.add("hidden");return}migrate(i);itemEmpty.classList.add("hidden");detailCard.classList.remove("hidden");detailName.textContent=i.name;mainPartName.value=i.name;notesArea.value=i.notes||"";renderSaved(i)}function renderSaved(i){
  imageLinksList.replaceChildren();videoLinksList.replaceChildren();
  i.links.forEach(link=>imageLinksList.appendChild(savedLinkRow(link,false)));
  i.videos.forEach(link=>videoLinksList.appendChild(savedLinkRow(link,true)));
  preview(i.videos.at(-1)?.url||i.links.at(-1)?.url||'');
}
function savedLinkRow(entry,isVideo){
  const url=norm(entry.url),row=document.createElement('div');row.className='share-link-row';
  const link=document.createElement('a');link.className='share-link-url';link.href=url;link.textContent=url;
  if(isVideo)link.onclick=event=>{event.preventDefault();playVideo(url)};
  else{link.target='_blank';link.rel='noopener noreferrer'}
  const actions=document.createElement('div');actions.className='share-link-actions';
  const status=document.createElement('span');status.className='share-link-status';status.setAttribute('role','status');
  const copy=document.createElement('button');copy.type='button';copy.textContent='COPY';copy.setAttribute('aria-label','Copy '+(isVideo?'video':'image')+' link');
  const copyUrl=async()=>{
    try{await navigator.clipboard.writeText(url);status.textContent='Link copied.'}
    catch{status.textContent='Copy the link below:';const field=document.createElement('input');field.value=url;field.readOnly=true;field.setAttribute('aria-label','Link to copy');status.appendChild(field);field.focus();field.select()}
  };
  copy.onclick=copyUrl;
  const share=document.createElement('button');share.type='button';share.textContent='SHARE';share.setAttribute('aria-label','Share '+(isVideo?'video':'image')+' link');
  share.onclick=async()=>{
    if(!navigator.share){await copyUrl();if(status.textContent==='Link copied.')status.textContent='Link copied - paste it to share.';return}
    try{await navigator.share({url});status.textContent='Shared.'}
    catch(error){if(error.name!=='AbortError')status.textContent='Sharing unavailable. Use COPY to share the link.'}
  };
  actions.append(copy,share);row.append(link,actions,status);return row;
}
function preview(v){
  const player=$('inlineVideoPlayer');player.replaceChildren();player.hidden=true;
  const id=yid(v);videoPreview.classList.toggle('hidden',!id);noPreview.classList.toggle('hidden',!!id);
  noPreview.disabled=!v;
  noPreview.textContent=v?'No preview\nClick to Open':'No link saved';
  noPreview.onclick=v?()=>playVideo(v):null;
  videoThumb.onerror=()=>{videoPreview.classList.add('hidden');noPreview.classList.remove('hidden')};
  videoThumb.hidden=!id;if(id)videoThumb.src=`https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  videoPreview.onclick=()=>playVideo(v);
}
function playVideo(v){
  const url=norm(v);let parsed;try{parsed=new URL(url)}catch{return}
  if(!['https:','http:'].includes(parsed.protocol))return;
  window.open(parsed.href,'_blank','noopener,noreferrer');
}
window.editLinkTitle=(type,id)=>{const i=item();if(!i)return;const arr=type==="video"?i.videos:i.links,x=arr.find(a=>a.id===id);if(!x)return;const n=prompt("Edit title:",x.title||x.url)?.trim();if(n){x.title=n;save();renderSaved(i)}};window.removeSaved=(type,id)=>{const i=item();if(!i)return;if(type==="video")i.videos=i.videos.filter(x=>x.id!==id);else i.links=i.links.filter(x=>x.id!==id);save();renderSaved(i);renderItems()};function renderAll(){renderHubs();renderHub()}$("addHubBtn").onclick=()=>{const name=prompt("Category name:","New Category")?.trim();if(!name)return;const h={id:uid(),name,items:[]};hubs.push(h);hubId=h.id;itemId=null;save();renderAll()};$("addItemBtn").onclick=()=>{const h=hub();if(!h)return;const i={id:uid(),name:"New Library Item",savedAt:new Date().toISOString(),links:[],videos:[],notes:""};h.items.push(i);itemId=i.id;showLibraryDetails(true);save();renderAll();mainPartName.focus();mainPartName.select()};$('clearItemName').onclick=()=>{mainPartName.value='';mainPartName.focus()};
async function savePastedLink(field,createNew){
  const status=$(createNew?'quickLinkStatus':'linkSaveStatus');let url;
  try{url=new URL(norm(field.value));if(!['http:','https:'].includes(url.protocol)||!url.hostname.includes('.'))throw Error()}
  catch{status.textContent='Paste a valid website link.';return}
  const h=hub();if(!h)return;
  let i=createNew?null:item();
  if(!i){i={id:uid(),name:'Saved Link',links:[],videos:[],notes:''};h.items.push(i)}
  const kind=linkType(url.href),isVideo=kind==='video',isYouTube=!!yid(url.href),fallback=siteName(url.href);
  const savedAt=new Date().toISOString();
  const entry={id:uid(),url:url.href,title:fallback,savedAt};i.savedAt=savedAt;
  if(isVideo)i.videos=[entry];else i.links=[entry];
  i.name=fallback;
  if(!createNew)i.notes=notesArea.value;
  field.value='';save();renderAll();status.textContent='Link saved. Finding title...';
  const found=await videoTitle(url.href),title=found==='Untitled Video'?fallback:found;
  if(!hubs.includes(h)||!h.items.includes(i)||!(isVideo?i.videos:i.links).includes(entry))return;
  entry.title=title;
  if(i.name===fallback&&(item()!==i||mainPartName.value===fallback)){
    i.name=title;if(item()===i){mainPartName.value=title;detailName.textContent=title}
  }
  save();
  if(hub()===h){
    const rows=document.querySelectorAll('#itemList .part-item');
    // Refresh just the list so another item's unsaved editor text is preserved.
    rows.forEach(row=>{const entry=h.items.find(x=>x.id===row.getAttribute('data-entry-id'));if(entry)row.querySelector('.part-name').textContent=entry.name});
    if(item()===i)renderSaved(i);
    status.textContent='Link saved.';
  }
}
for(const [id,createNew] of [['quickLink',true]]){
  const field=$(id);
  field.addEventListener('paste',event=>{const text=event.clipboardData?.getData('text');if(!text)return;event.preventDefault();field.value=text.trim();savePastedLink(field,createNew)});
  field.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();savePastedLink(field,createNew)}});
}
$("saveChangesBtn").onclick=()=>{const i=item();if(!i)return;i.name=mainPartName.value.trim()||i.name;i.notes=notesArea.value;save();renderAll();const b=$("saveChangesBtn");b.textContent="SAVED";setTimeout(()=>b.textContent="SAVE CHANGES",1200)};hubSearch.oninput=renderHubs;itemSearch.oninput=renderItems;renderAll();
function appendLibraryRow(button, entry, owner, isHub = false) {
  button.setAttribute('data-entry-id',entry.id);
  const row = document.createElement('div');
  row.className = 'library-item-row';
  const menu = document.createElement('details');
  menu.className = 'library-item-menu';
  const trigger = document.createElement('summary');
  trigger.textContent = '\u22ee';
  trigger.setAttribute('aria-label', 'Actions for ' + entry.name);
  const actions = document.createElement('div');
  actions.className = 'library-item-actions';
  const rename = document.createElement('button');
  rename.type = 'button'; rename.textContent = 'Rename';
  rename.disabled = !!(isHub && entry.locked);
  rename.title = rename.disabled ? 'Unlock this category first.' : '';
  rename.onclick = () => {
    menu.open = false;
    if (isHub && entry.locked) { alert('Unlock this category first.'); return; }
    const name = prompt(isHub ? 'Rename category:' : 'Rename library item:', entry.name)?.trim();
    if (!name) return;
    entry.name = name; save(); renderAll();
  };
  const remove = document.createElement('button');
  remove.type = 'button'; remove.textContent = 'Delete';
  remove.className = 'item-delete';
  remove.disabled = !!(isHub && entry.locked);
  remove.title = remove.disabled ? 'Unlock this category first.' : '';
  remove.onclick = () => {
    menu.open = false;
    if (isHub && entry.locked) { alert('Unlock this category first.'); return; }
    const warning = isHub
      ? `Are you sure you want to delete category "${entry.name}" and all ${entry.items.length} library item(s) inside it? This cannot be undone.`
      : `Delete "${entry.name}"?`;
    if (!confirm(warning)) return;
    if (isHub) {
      hubs = hubs.filter(h => h.id !== entry.id);
      if (hubId === entry.id) {
        hubId = hubs[0]?.id || null;
        itemId = hub()?.items[0]?.id || null;
      }
    } else {
      owner.items = owner.items.filter(i => i.id !== entry.id);
      if (itemId === entry.id) itemId = owner.items[0]?.id || null;
    }
    save(); renderAll();
  };
  actions.append(rename, remove);
  if(isHub){const lock=document.createElement('button');lock.type='button';lock.textContent=entry.locked?'Unlock':'Lock';lock.onclick=()=>{menu.open=false;toggleHubLock(entry)};actions.appendChild(lock)}
  menu.append(trigger, actions);
  menu.addEventListener('toggle', () => {
    if (menu.open) document.querySelectorAll('.library-item-menu[open]').forEach(other => {
      if (other !== menu) other.open = false;
    });
  });
  if(!isHub){
    button.querySelector('.part-icon')?.remove();
    row.classList.add('selectable-item');
    const check=document.createElement('input');check.type='checkbox';check.className='item-checkbox';
    check.checked=selectedItems.has(entry.id);check.setAttribute('aria-label','Select '+entry.name);
    check.onchange=()=>{if(check.checked)selectedItems.add(entry.id);else selectedItems.delete(entry.id);updateSelectionControls()};
    row.appendChild(check);
  }
  if(isHub)row.append(button,menu);
  else{
    const card=document.createElement('div');
    card.className='library-title-card'+(entry.id===itemId?' active':'');
    rename.className='small-btn item-rename';rename.textContent='RENAME';
    card.append(button,rename);row.appendChild(card);
  }
  (isHub ? hubList : itemList).appendChild(row);
}
document.addEventListener('click', event => {
  document.querySelectorAll('.library-item-menu[open]').forEach(menu => {
    if (!menu.contains(event.target)) menu.open = false;
  });
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('.library-item-menu[open]').forEach(menu => {
    menu.open = false; menu.querySelector('summary').focus();
  });
});

mainPartName.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.isComposing)return;
  event.preventDefault();const i=item();if(!i)return;
  i.name=mainPartName.value.trim()||'Untitled Video';mainPartName.value=i.name;
  detailName.textContent=i.name;save();
  const row=document.querySelector('#itemList .part-item.active .part-name');if(row)row.textContent=i.name;
  $('itemNameStatus').textContent='Name saved.';
});
mainPartName.addEventListener('input',()=>{$('itemNameStatus').textContent=''});

$('deleteSavedContent').onclick=()=>{
  const current=item(),owner=hub();if(!current||!owner)return;
  if(!confirm(`Delete library item "${current.name}" and all its saved links, videos and notes? This cannot be undone.`))return;
  owner.items=owner.items.filter(entry=>entry.id!==current.id);
  itemId=null;
  showLibraryDetails(false);
  save();renderAll();itemSearch.focus();
};

function showLibraryDetails(open){
  $('libraryLayout').setAttribute('data-details',String(open));
}
$('libraryBack').onclick=()=>{
  showLibraryDetails(false);
  const selected=document.querySelector('#itemList .part-item.active');
  if(selected)selected.focus();else itemSearch.focus();
};

function siteName(url){
  try{
    const host=new URL(norm(url)).hostname.toLowerCase().replace(/^www\./,'');
    const names={'youtube.com':'YouTube','youtu.be':'YouTube','webtoons.com':'Webtoon','webtoon.com':'Webtoon','facebook.com':'Facebook','fb.watch':'Facebook','tiktok.com':'TikTok','instagram.com':'Instagram','vimeo.com':'Vimeo'};
    for(const [domain,name] of Object.entries(names))if(host===domain||host.endsWith('.'+domain))return name;
    return host;
  }catch{return 'Website'}
}

function savedDate(value){
  const date=new Date(value);
  if(!value||Number.isNaN(date.getTime()))return 'Saved date unavailable';
  return 'Saved '+new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
}

function visibleLibraryItems(){const q=itemSearch.value.trim().toLowerCase();return (hub()?.items||[]).filter(i=>i.name.toLowerCase().includes(q))}
function updateSelectionControls(){
  const visible=visibleLibraryItems(),count=visible.filter(i=>selectedItems.has(i.id)).length;
  const all=$('selectAllItems');all.checked=visible.length>0&&count===visible.length;all.indeterminate=count>0&&count<visible.length;all.disabled=!visible.length;
  $('deleteSelectedItems').disabled=!selectedItems.size;
  $('selectionCount').textContent=selectedItems.size+' selected';
}
$('selectAllItems').onchange=event=>{
  for(const i of visibleLibraryItems()){if(event.target.checked)selectedItems.add(i.id);else selectedItems.delete(i.id)}
  renderItems();
};
$('deleteSelectedItems').onclick=()=>{
  const owner=hub();if(!owner)return;
  const targets=owner.items.filter(i=>selectedItems.has(i.id));if(!targets.length)return;
  if(!confirm(`Are you sure you want to delete ${targets.length} selected library item(s) and all their links, videos and notes? This cannot be undone.`))return;
  owner.items=owner.items.filter(i=>!selectedItems.has(i.id));
  if(selectedItems.has(itemId))itemId=null;
  selectedItems.clear();showLibraryDetails(false);save();renderAll();
};





async function authRequest(path,options={}){const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});let data={};try{data=await r.json()}catch{}return {r,data}}
let currentUser=null;
let pendingAuthAction=null;
function hideAuth(){const gate=$('authGate');if(gate)gate.hidden=true;document.body.classList.remove('auth-pending','auth-open');const status=$('authStatus');if(status)status.textContent=''}
function showAuth(message='Verify your email to continue.',afterLogin=null){pendingAuthAction=afterLogin;document.body.classList.remove('auth-pending');document.body.classList.add('auth-open');const gate=$('authGate');if(gate){gate.hidden=false;gate.style.display=''}const msg=$('authMessage');if(msg)msg.textContent=message;const status=$('authStatus');if(status)status.textContent='';const step=$('authCodeStep');if(step)step.hidden=true;const code=$('authCode');if(code)code.value='';setTimeout(()=>$('authEmail')?.focus({preventScroll:true}),0)}
function showAuthenticated(user){currentUser=user||null;document.body.classList.remove('auth-pending');const email=$('accountEmail');if(email)email.textContent=user?.email||'';const out=$('logoutBtn');if(out)out.hidden=!user;hideAuth()}
async function initAuthGate(){try{const {r,data}=await authRequest('/api/auth/me',{method:'GET'});if(r.ok&&data.user){showAuthenticated(data.user);return}}catch{}currentUser=null;document.body.classList.remove('auth-pending');const gate=$('authGate');if(gate)gate.hidden=true;const out=$('logoutBtn');if(out)out.hidden=true}
async function requestAuthCode(){const email=$('authEmail').value.trim();const status=$('authStatus');status.textContent='Sending code...';try{const {r,data}=await authRequest('/api/auth/request-code',{method:'POST',body:JSON.stringify({email})});if(!r.ok){status.textContent=data.error||'Could not send code.';return}status.textContent=data.demoMode?'LOCAL DEMO: Use code 123456. No email was sent.':'Code created. Get the code from the local server window.';const step=$('authCodeStep');if(step)step.hidden=false;setTimeout(()=>$('authCode')?.focus(),0)}catch{status.textContent='Unable to connect to the local server.'}}
async function verifyAuthCode(){const email=$('authEmail').value.trim(),code=$('authCode').value.trim(),status=$('authStatus');status.textContent='Verifying...';try{const {r,data}=await authRequest('/api/auth/verify-code',{method:'POST',body:JSON.stringify({email,code})});if(!r.ok){status.textContent=data.error||'Verification failed.';return}showAuthenticated(data.user);const action=pendingAuthAction;pendingAuthAction=null;if(typeof action==='function')action(data.user)}catch{status.textContent='Unable to connect to the local server.'}}
$('sendCodeBtn').onclick=requestAuthCode;$('verifyCodeBtn').onclick=verifyAuthCode;$('authCancelBtn').onclick=()=>{pendingAuthAction=null;hideAuth()};$('authEmail').addEventListener('keydown',e=>{if(e.key==='Enter')requestAuthCode()});$('authCode').addEventListener('keydown',e=>{if(e.key==='Enter')verifyAuthCode()});$('authCode').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,6)});$('logoutBtn').onclick=async()=>{try{await authRequest('/api/auth/logout',{method:'POST',body:'{}'})}catch{}currentUser=null;const email=$('accountEmail');if(email)email.textContent='';const out=$('logoutBtn');if(out)out.hidden=true;hideAuth()};initAuthGate();
function requireAuth(message,action){if(currentUser){if(typeof action==='function')action(currentUser);return true}showAuth(message,action);return false}



window.categoryLock=async h=>{
  if(h.lockOwnerId&&h.lockOwnerId!==currentUser?.id){alert('Sign in with the account that locked this category.');return}
  if(h.locked){
    h.locked=false;
    delete h.lockOwnerId;
  }else{
    h.locked=true;
    h.lockOwnerId=currentUser.id;
  }
  save();
  renderAll();
};
