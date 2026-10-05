/* Native display bridge. No audio or API credentials cross this bridge. */
(()=>{
 if(!['127.0.0.1','localhost'].includes(location.hostname)||!navigator.userAgent.includes('Windows'))return;
 const owner=crypto.randomUUID(),panels=new Set(),buttons={},$=id=>document.getElementById(id);
 const note=document.createElement('p');note.className='desktop-panel-note';note.setAttribute('role','status');
 note.textContent='Drag a panel heading or click FLOAT to open a see-through Windows panel. Keep this tab open; it can be minimized.';
 document.querySelector('.ai-output').append(note);
 let timer,busy=false,disposed=false,running=false,events=null;
 async function update(open=[],point={}){
  if(busy)return;busy=true;clearTimeout(timer);
  try{
   const response=await fetch('/api/overlay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,open,...point,transcript:$('audioTranscript').value,response:$('aiResponse').value,active:$('audioStart').getAttribute('aria-pressed')==='true',status:$('audioStatus').textContent})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Could not open floating panels.');
   running=!!data.running;
   if(data.running)open.forEach(kind=>panels.add(kind));
   applyEvents(data);
   if(running&&!events){events=new EventSource('/api/overlay/events?owner='+encodeURIComponent(owner));events.onmessage=event=>{try{const value=JSON.parse(event.data);applyEvents({commands:value.command?[value.command]:[],closed:value.closed?[value.closed]:[]})}catch{}};}
   if(!running){events?.close();events=null}
   for(const kind of Object.keys(buttons))buttons[kind].textContent=panels.has(kind)?'FLOATING':'FLOAT ↗';
   if(open.length&&data.running)note.textContent='Windows panels are open. Drag their title bars. The background is fully transparent; text and controls stay visible. ON/OFF uses your existing listener.';
  }catch(error){note.textContent=error.message;panels.clear();running=false}
  finally{busy=false;if(running&&!disposed)timer=setTimeout(()=>update(),500)}
 }
 function applyEvents(data){
   for(const kind of data.closed||[])if(kind==='all')panels.clear();else panels.delete(kind);
   for(const command of data.commands||[]){
    if(command==='stop')$('audioStop').click();
    if(command==='start'){
     if($('pcHelperOn').checked&&$('pcHelperStatus').textContent==='CONNECTED'&&$('pcSourceMode').value!=='chrome')$('audioStart').click();
     else {$('audioStatus').textContent='Return to Chrome and click START LISTENING to share audio, or enable Windows Helper.';note.textContent=$('audioStatus').textContent}
    }
   }
   for(const kind of Object.keys(buttons))buttons[kind].textContent=panels.has(kind)?'FLOATING':'FLOAT ↗';
 }
 for(const [kind,id] of [['transcript','audioTranscript'],['response','aiResponse']]){
  const text=$(id),label=text.parentElement.querySelector('label'),head=document.createElement('div');head.className='desktop-panel-head';label.before(head);head.append(label);
  const button=document.createElement('button');button.type='button';button.className='small-btn';button.textContent='FLOAT ↗';button.setAttribute('aria-label','Float '+label.textContent);buttons[kind]=button;head.append(button);
  button.onclick=()=>update([kind]);let down=null;
  head.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0)return;down={x:e.clientX,y:e.clientY};head.setPointerCapture(e.pointerId)});
  head.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>12)update([kind],{x:e.screenX,y:e.screenY});down=null});
  head.addEventListener('pointercancel',()=>down=null);
 }
 window.addEventListener('pagehide',()=>{disposed=true;events?.close();clearTimeout(timer);if(running)fetch('/api/overlay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,close:true}),keepalive:true}).catch(()=>{})});
})();
