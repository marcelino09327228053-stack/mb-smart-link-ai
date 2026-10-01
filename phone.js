/* Phone presentation only: existing app handlers own all data and authentication. */
(()=>{
 const phone=matchMedia('(max-width:600px)'),body=document.body;
 const home=document.createElement('section');home.id='phoneHome';home.className='phone-only';
 home.innerHTML=`<div class="phone-intro"><span class="eyebrow">YOUR LINKS, TOGETHER</span><h1>Save something worth keeping.</h1><p id="phoneTarget"></p></div><div id="phoneQuick"></div><div class="phone-actions"><button id="phoneAudio" class="small-btn">Audio</button><button id="phoneAdd" class="small-btn">Add Category</button><button id="phoneSettings" class="small-btn">Settings</button><button id="phoneLogout" class="small-btn">Log Out</button></div><aside id="phoneInstall" class="glass-card" hidden><h2>Keep MB within reach</h2><p>The Android app adds the floating MB button over your other apps.</p><a class="small-btn phone-install-link" href="/downloads/mb-bubble.apk" download="mb-bubble.apk">Install MB Bubble</a><p class="phone-muted">Download the Android test APK, then open it to install. Android will ask for permission.</p></aside>`;
 document.querySelector('.topbar').after(home);
 const nav=document.createElement('nav');nav.id='phoneNav';nav.className='phone-only';nav.setAttribute('aria-label','Phone navigation');
 nav.innerHTML=['Home','Category','Library','Notes'].map(name=>`<button data-view="${name.toLowerCase()}" type="button">${name}</button>`).join('');body.append(nav);
 const sheet=document.createElement('dialog');sheet.id='phoneCategorySheet';sheet.innerHTML=`<form><h2>Add New Category</h2><label for="phoneCategoryName">Category Name</label><input id="phoneCategoryName" required maxlength="200" autocomplete="off"><div class="phone-sheet-actions"><button type="button" class="small-btn" id="phoneCancel">Cancel</button><button class="save-btn" type="submit">Create</button></div></form>`;body.append(sheet);
 const quick=document.querySelector('.quick-link-wrap'),status=$('quickLinkStatus'),anchor=document.createComment('quick-link original position');quick.before(anchor);
 const saveButton=document.createElement('button');saveButton.id='phoneSave';saveButton.className='save-btn phone-only';saveButton.textContent='Save Link';quick.after(saveButton);saveButton.onclick=()=>{if(hub()&&!hub().locked)savePastedLink($('quickLink'),true)};
 const brand=document.createElement('span');brand.className='phone-brand phone-only';brand.textContent='MB Future Link AI';document.querySelector('.brand-wrap').append(brand);
 let view='home';
 function navigate(next){
  if(!phone.matches)return;
  if($('hubDashboard').dataset.audioView==='true')$('audioBack').click();
  view=next;body.dataset.phoneView=next;
  nav.querySelectorAll('button').forEach(b=>{b.setAttribute('aria-current',b.dataset.view===next?'page':'false')});
  if(next==='library')showLibraryDetails(false);
  if(next==='notes'){
   if(item()&&hub()&&!hub().locked){showLibraryDetails(true);requestAnimationFrame(()=>notesArea.focus())}
   else {view='library';body.dataset.phoneView='library';nav.querySelector('[data-view="notes"]').setAttribute('aria-current','false');nav.querySelector('[data-view="library"]').setAttribute('aria-current','page')}
  }
  window.scrollTo(0,0);refresh();
 }
 function refresh(){
  const h=hub();$('phoneTarget').textContent=h?(h.locked?'Unlock '+h.name+' to paste links here.':'Saving to '+h.name):'Choose or create a category first.';
  $('quickLink').disabled=phone.matches&&(!h||h.locked);saveButton.disabled=!h||h.locked;
  $('phoneLogout').hidden=$('logoutBtn').hidden;
 }
 function layout(){
  if(phone.matches){$('phoneQuick').append(quick,saveButton,status);$('quickLink').placeholder='Paste your link here...';hubSearch.placeholder='Search category...';navigate(view)}
  else{anchor.after(quick);quick.after(saveButton);saveButton.after(status);$('quickLink').placeholder='';hubSearch.placeholder='Search categories...';$('quickLink').disabled=false;if(sheet.open)sheet.close()}
 }
 function addCategory(){sheet.showModal();$('phoneCategoryName').value='';$('phoneCategoryName').focus()}
 const oldAdd=$('addHubBtn').onclick;$('addHubBtn').onclick=()=>phone.matches?addCategory():oldAdd();
 $('phoneAdd').onclick=addCategory;$('phoneCancel').onclick=()=>sheet.close();
 sheet.querySelector('form').onsubmit=e=>{e.preventDefault();const name=$('phoneCategoryName').value.trim();if(!name)return;createCategory(name);sheet.close();navigate('category');$('addHubBtn').focus()};
 sheet.addEventListener('click',e=>{if(e.target===sheet)sheet.close()});
 $('phoneAudio').onclick=()=>$('listenAudioBtn').click();$('phoneSettings').onclick=()=>$('categorySettingsBtn').click();$('phoneLogout').onclick=()=>$('logoutBtn').click();
 nav.onclick=e=>{const b=e.target.closest('button');if(b)navigate(b.dataset.view)};
 $('phoneInstall').hidden=!/Android/i.test(navigator.userAgent);
 function decorate(row,entry,remove){
  const card=row.querySelector('.library-title-card'),url=entry.videos?.at(-1)?.url||entry.links?.at(-1)?.url||'';
  let safe='';try{const parsed=new URL(norm(url));if(['http:','https:'].includes(parsed.protocol))safe=parsed.href}catch{}
  const preview=document.createElement('button');preview.type='button';preview.className='phone-preview phone-only';preview.setAttribute('aria-label','Open '+entry.name);preview.disabled=!safe;
  const fallback=document.createElement('span');fallback.className='phone-preview-label';fallback.textContent='NO PREVIEW';preview.append(fallback);
  const thumb=entry.thumbnail||entry.thumbnailUrl||(yid(safe)?'https://i.ytimg.com/vi/'+encodeURIComponent(yid(safe))+'/hqdefault.jpg':linkType(safe)==='image'?safe:'');
  if(thumb&&/^https?:\/\//i.test(thumb)){const img=document.createElement('img');img.alt='';img.loading='lazy';img.src=thumb;img.onload=()=>fallback.hidden=true;img.onerror=()=>{img.remove();fallback.hidden=false};preview.prepend(img)}
  const play=document.createElement('span');play.className='phone-play';play.textContent='▶';preview.append(play);preview.onclick=()=>{if(safe)window.open(safe,'_blank','noopener,noreferrer')};card.prepend(preview);
  const domain=document.createElement('small');domain.className='phone-domain phone-only';domain.textContent=safe?siteName(safe):'No link saved';card.append(domain);
  const actions=document.createElement('div');actions.className='phone-item-actions phone-only';
  const open=document.createElement('button');open.textContent='Open Link';open.disabled=!safe;open.onclick=preview.onclick;
  const copy=document.createElement('button');copy.textContent='Copy Link';copy.disabled=!safe;copy.onclick=async()=>{try{await navigator.clipboard.writeText(safe);copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy Link',1000)}catch{copy.textContent='Copy unavailable'}};
  const edit=document.createElement('button');edit.textContent='Edit / Notes';edit.onclick=()=>card.querySelector('.part-item').click();
  actions.append(open,copy,edit,remove);card.append(actions);
 }
 window.MBPhone={navigate,decorate};
 new MutationObserver(refresh).observe(hubList,{childList:true});
 new MutationObserver(refresh).observe($('logoutBtn'),{attributes:true,attributeFilter:['hidden']});
 phone.addEventListener('change',layout);renderAll();layout();
})();
