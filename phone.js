/* Phone presentation only: existing app handlers own all data and authentication. */
(()=>{
 const phone=matchMedia('(max-width:600px)'),body=document.body;
 const home=document.createElement('section');home.id='phoneHome';home.className='phone-only';
 const icon=(name)=>{const paths={home:'<path d="m3 10 9-7 9 7v10H5V10M9 20v-7h6v7"/>',category:'<path d="M3 6h7l2 3h9v11H3z"/>',library:'<path d="M12 5v15M12 6C8 3 4 4 2 5v14c4-2 7-1 10 1 3-2 6-3 10-1V5c-2-1-6-2-10 1Z"/>',listen:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',gear:'<path d="m9 3 1-2h4l1 2 3 2 2 1v4l-2 2-1 3-2 2h-4l-2-2-3-1-2-2V8l2-2z"/><circle cx="11" cy="9" r="3"/>',link:'<path d="m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',bubble:'<circle cx="12" cy="12" r="9"/><path d="M8 15V9l4 4 4-4v6"/>'};return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.link}</svg>`};
 home.innerHTML=`<div id="phoneQuick"><span class="phone-link-icon">${icon('link')}</span></div><p id="phoneTarget" class="phone-muted"></p><div class="phone-actions"><button id="phoneAudio" class="small-btn">AI LISTEN</button><button id="phoneAdd" class="small-btn">Add Category</button><button id="phoneSettings" class="small-btn" aria-label="Settings">${icon('gear')}</button><button id="phoneLogout" class="small-btn">Log Out</button></div><aside id="phoneBubble" class="glass-card" hidden><div class="phone-card-heading">${icon('bubble')}<h2>MB Bubble</h2><a id="phoneBubbleToggle" class="small-btn" href="mb-bubble://toggle" role="switch" aria-checked="false">OFF</a></div><p class="phone-muted">Tap MB to save a copied link. Hold to open Smart Link AI.</p><p id="phoneBubbleStatus" role="status"></p></aside><aside id="phoneInstall" class="glass-card" hidden><div class="phone-card-heading">${icon('bubble')}<h2>Install MB Smart Link AI</h2></div><p class="phone-muted">Includes MB Bubble. One Android app, one install.</p><a class="small-btn phone-install-link" href="/downloads/mb-bubble.apk" download="mb-bubble.apk">Install</a></aside><section id="phoneBrowse" class="glass-card"><h2>Browse by Category</h2><label class="phone-muted" for="phoneBrowseCategory">Category</label><select id="phoneBrowseCategory"></select><div id="phoneBrowseTitles"></div></section>`;
 document.querySelector('.topbar').after(home);
 const nav=document.createElement('nav');nav.id='phoneNav';nav.className='phone-only';nav.setAttribute('aria-label','Phone navigation');
 nav.innerHTML=[['home','HOME'],['category','CATEGORY'],['library','LIBRARY'],['listen','AI LISTEN']].map(([view,name])=>`<button data-view="${view}" type="button">${icon(view)}<span>${name}</span></button>`).join('');document.querySelector('.topbar').after(nav);
 const sheet=document.createElement('dialog');sheet.id='phoneCategorySheet';sheet.innerHTML=`<form><h2>Add New Category</h2><label for="phoneCategoryName">Category Name</label><input id="phoneCategoryName" required maxlength="200" autocomplete="off"><div class="phone-sheet-actions"><button type="button" class="small-btn" id="phoneCancel">Cancel</button><button class="save-btn" type="submit">Create</button></div></form>`;body.append(sheet);
 const quick=document.querySelector('.quick-link-wrap'),status=$('quickLinkStatus'),anchor=document.createComment('quick-link original position');quick.before(anchor);
 const saveButton=document.createElement('button');saveButton.id='phoneSave';saveButton.className='save-btn phone-only';saveButton.textContent='Save Link';quick.after(saveButton);saveButton.onclick=()=>{if(hub()&&!hub().locked)savePastedLink($('quickLink'),true)};
 const brand=document.createElement('span');brand.className='phone-brand phone-only';brand.textContent='Smart Link AI';document.querySelector('.brand-wrap').append(brand);
 const listener=document.createElement('section');listener.id='phoneListen';listener.className='phone-only';
 listener.setAttribute('aria-labelledby','phoneListenTitle');
 listener.innerHTML=`<div class="phone-listen-heading"><span class="eyebrow">YOUR CONVERSATION COMPANION</span><h1 id="phoneListenTitle">AI Listen</h1><p>Hear the conversation. Find your words.</p></div><div class="phone-listen-card"><label for="phoneTopic">Topic / Context</label><input id="phoneTopic" maxlength="200" placeholder="Panel Beater Job Interview" autocomplete="off"><p id="phoneTopicHint" class="phone-muted">Set the topic, then listen. You can change it during the conversation.</p><button id="phoneListenToggle" class="save-btn" type="button" aria-pressed="false" disabled>LISTEN</button><p id="phoneListenStatus" role="status" aria-live="polite">Ready</p><p id="phoneListenDetail" class="phone-muted">Uses this phone's microphone. Keep this screen open while listening.</p><button id="phoneListenReset" class="small-btn" type="button">Clear / Reset conversation</button></div><div class="phone-listen-card"><label for="phoneTranscript">Live Transcript</label><textarea id="phoneTranscript" rows="5" readonly placeholder="The conversation will appear here..."></textarea></div><div class="phone-listen-card phone-answer"><label for="phoneAnswer">AI Suggested Answer</label><textarea id="phoneAnswer" rows="6" readonly placeholder="Your suggested response will appear here..."></textarea></div>`;
 home.after(listener);
 let view='home';
 function navigate(next){
  if(!phone.matches)return;
  if($('hubDashboard').dataset.audioView==='true')$('audioBack').click();
  if(next!=='listen')window.MBPhoneListener?.pause();
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
  refreshBrowse();
 }
 function layout(){
  if(phone.matches){$('phoneQuick').append(quick,saveButton,status);$('quickLink').placeholder='Paste your link here...';hubSearch.placeholder='Search category...';navigate(view)}
  else{window.MBPhoneListener?.pause();anchor.after(quick);quick.after(saveButton);saveButton.after(status);$('quickLink').placeholder='';hubSearch.placeholder='Search categories...';$('quickLink').disabled=false;if(sheet.open)sheet.close();if(settings.open)settings.close()}
 }
 function addCategory(){sheet.showModal();$('phoneCategoryName').value='';$('phoneCategoryName').focus()}
 const oldAdd=$('addHubBtn').onclick;$('addHubBtn').onclick=()=>phone.matches?addCategory():oldAdd();
 $('phoneAdd').onclick=addCategory;$('phoneCancel').onclick=()=>sheet.close();
 sheet.querySelector('form').onsubmit=e=>{e.preventDefault();const name=$('phoneCategoryName').value.trim();if(!name)return;createCategory(name);sheet.close();navigate('category');$('addHubBtn').focus()};
 sheet.addEventListener('click',e=>{if(e.target===sheet)sheet.close()});
 $('phoneAudio').onclick=()=>navigate('listen');$('phoneSettings').onclick=()=>settings.showModal();$('phoneLogout').onclick=()=>$('logoutBtn').click();
 nav.onclick=e=>{const b=e.target.closest('button');if(b)navigate(b.dataset.view)};
 $('phoneInstall').hidden=!/Android/i.test(navigator.userAgent);
 function decorate(row,entry,remove){
  row.querySelector('.part-item').dataset.itemId=entry.id;
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
 const settings=document.createElement('dialog');settings.id='phonePreferences';settings.innerHTML=`<h2>Settings</h2><label for="phoneTheme">Theme Color</label><select id="phoneTheme"><option value="red">Red Neon</option><option value="blue">Blue Neon</option><option value="green">Green Neon</option></select><button id="phonePasswordSettings" class="small-btn">Category password</button><button id="phonePreferencesClose" class="small-btn">Close</button>`;body.append(settings);
 document.querySelector('.topbar').append($('phoneSettings'));$('phoneSettings').classList.add('phone-only');settings.append($('phoneLogout'));
 $('phonePasswordSettings').onclick=()=>{settings.close();$('categorySettingsBtn').click()};$('phonePreferencesClose').onclick=()=>settings.close();
 settings.addEventListener('click',e=>{if(e.target===settings)settings.close()});
 let theme='red';try{const saved=localStorage.getItem('mb_phone_theme');if(['red','blue','green'].includes(saved))theme=saved}catch{}
 function setTheme(value){body.dataset.phoneTheme=value;$('phoneTheme').value=value;}setTheme(theme);
 $('phoneTheme').onchange=e=>{setTheme(e.target.value);try{localStorage.setItem('mb_phone_theme',e.target.value)}catch{}};
 let browseSignature='';
 function refreshBrowse(){
  const signature=JSON.stringify(hubs.map(h=>[h.id,h.name,!!h.locked,h.items.map(i=>[i.id,i.name])]))+hubId;if(signature===browseSignature)return;browseSignature=signature;
  const select=$('phoneBrowseCategory');select.replaceChildren();
  for(const h of hubs){const option=document.createElement('option');option.value=h.id;option.textContent=h.name+(h.locked?' · Locked':'');select.append(option)}select.value=hubId||'';
  const list=$('phoneBrowseTitles');list.replaceChildren();const h=hub();
  if(!h||h.locked||!h.items.length){const text=document.createElement('p');text.className='phone-muted';text.textContent=!h?'Create a category to get started.':h.locked?'Unlock this category to browse its items.':'No saved items yet.';list.append(text);if(h?.locked){const unlock=document.createElement('button');unlock.className='small-btn';unlock.textContent='Unlock category';unlock.onclick=()=>openHub(h);list.append(unlock)}return;}
  for(const i of h.items){const button=document.createElement('button');button.className='phone-browse-title';button.textContent=i.name;button.title=i.name;button.onclick=()=>{if(h.locked)return;itemSearch.value='';openHub(h);const target=[...itemList.querySelectorAll('.part-item')].find(b=>b.dataset.itemId===i.id);target?.click()};list.append(button)}
 }
 $('phoneBrowseCategory').onchange=e=>{const h=hubs.find(h=>h.id===e.target.value);if(!h)return;hubId=h.id;itemId=h.items[0]?.id||null;showLibraryDetails(false);renderAll();refresh()};
 function bubbleState(){const native=window.MBBubble;if(!native?.available)return;$('phoneInstall').hidden=true;$('phoneBubble').hidden=false;const on=native.enabled===true;const control=$('phoneBubbleToggle');control.textContent=on?'ON':'OFF';control.setAttribute('aria-checked',String(on));$('phoneBubbleStatus').textContent=on?'Bubble is running.':'Bubble is stopped.';}
 window.addEventListener('mb-bubble-state',bubbleState);bubbleState();
 window.MBPhone={navigate,decorate};
 new MutationObserver(refresh).observe(hubList,{childList:true});
 new MutationObserver(refresh).observe($('logoutBtn'),{attributes:true,attributeFilter:['hidden']});
 phone.addEventListener('change',layout);renderAll();layout();
})();
