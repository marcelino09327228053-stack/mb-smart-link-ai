'use strict';
const {WebSocket,WebSocketServer}=require('ws');
const {sessionConfig}=require('./session.cjs');
function attachLive(server,{auth,publicOrigin,apiKey,model,geminiKey,geminiModel='gemini-2.5-flash-native-audio-preview-12-2025',connect=(url,options)=>new WebSocket(url,options)}){
 const wss=new WebSocketServer({noServer:true,maxPayload:100000,perMessageDeflate:false});
 const owners=new Set();let cooldown=0;
 server.on('upgrade',async(req,socket,head)=>{
  const reject=code=>{socket.end(`HTTP/1.1 ${code} Rejected\r\nConnection: close\r\n\r\n`);};
  try{
   if(req.url!=='/api/live')return reject(404);
   const local=[`127.0.0.1:${req.socket.localPort}`,`localhost:${req.socket.localPort}`].includes(req.headers.host);
   const origin=local?`http://${req.headers.host}`:publicOrigin?.origin;
   if(!origin||(!local&&req.headers.host!==publicOrigin.host)||req.headers.origin!==origin)return reject(403);
   const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('mb_session='));
   const cookie=raw?decodeURIComponent(raw.slice(11)):'';
   const user=await auth.getSessionUser(cookie);
   if(!local&&!user)return reject(401);
   const owner=user?String(user.id):'local';
   if(owners.has(owner)||owners.size>=30)return reject(429);
   if(!apiKey&&!geminiKey)return reject(503);
   if(socket.destroyed)return;
   owners.add(owner);
   try{wss.handleUpgrade(req,socket,head,client=>run(client,owner,cookie,local));}catch{owners.delete(owner);reject(400);}
  }catch{reject(503);}
 });
 function run(client,owner,cookie,local){
  let upstream=null,settings=null,provider='',ready=false,paused=false,closed=false,serial=0,turn=0,responseId='',inputText='',outputText='';
  const history=[];let setupTimer=setTimeout(()=>fail('Connection timed out. Try again.'),15000);
  const heartbeat=setInterval(async()=>{
   if(closed)return;
   if(!client.isAlive)return client.terminate();client.isAlive=false;client.ping();
   if(!local){try{if(!await auth.getSessionUser(cookie))fail('Sign in first.');}catch{fail('Unable to verify your session.');}}
  },30000);heartbeat.unref();client.isAlive=true;client.on('pong',()=>client.isAlive=true);
  const emit=data=>{if(client.readyState===1){if(client.bufferedAmount>1000000)return client.terminate();client.send(JSON.stringify(data));}};
  function closeUp(){ready=false;serial++;if(upstream){upstream.removeAllListeners();upstream.on('error',()=>{});upstream.terminate();upstream=null;}clearTimeout(setupTimer);}
  function cleanup(){if(closed)return;closed=true;closeUp();clearInterval(heartbeat);owners.delete(owner);}
  function fail(message){emit({type:'error',message});cleanup();client.close(1011);}
  function send(data){if(upstream?.readyState===1){if(upstream.bufferedAmount>1000000)return fail('Connection too slow. Please reconnect.');upstream.send(JSON.stringify(data));}}
  function remember(){if(inputText)history.push({role:'user',text:inputText.slice(-8000)});if(outputText)history.push({role:'assistant',text:outputText.slice(-8000)});while(history.length>12)history.shift();inputText='';outputText='';responseId='';}
  function startResponse(){if(responseId)return;responseId=`live-${serial}-${++turn}`;emit({type:'response.created',response:{id:responseId}});}
  function fallback(){if(provider==='gemini'&&apiKey){console.info('[AI live] quota fallback activated');cooldown=Date.now()+60000;remember();emit({type:'transport.reconnecting'});open('openai');}else fail('AI usage limit reached. Please try again later.');}
  function open(next){
   closeUp();provider=next;const generation=serial;
   const config=sessionConfig({...settings,source:'phone',mode:'text'},model);
   const context=history.length?'\nEarlier conversation for reference only; answer the NEW question, not old questions: '+JSON.stringify(history):'';
   try{upstream=provider==='gemini'?connect('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',{headers:{'x-goog-api-key':geminiKey}}):connect('wss://api.openai.com/v1/realtime?model='+encodeURIComponent(model),{headers:{Authorization:`Bearer ${apiKey}`}});}catch{return fail('AI connection could not start.');}
   setupTimer=setTimeout(()=>fail('AI connection timed out. Please retry.'),25000);
   upstream.on('open',()=>{
    if(provider==='gemini')send({setup:{model:'models/'+geminiModel,generationConfig:{responseModalities:['AUDIO']},systemInstruction:{parts:[{text:config.instructions+context}]},inputAudioTranscription:{},outputAudioTranscription:{},realtimeInputConfig:{automaticActivityDetection:{silenceDurationMs:800}}}});
    else {config.audio.input.format={type:'audio/pcm',rate:24000};config.instructions+=context;send({type:'session.update',session:config});}
   });
   upstream.on('unexpected-response',(_req,res)=>{res.resume();if(generation!==serial)return;if(res.statusCode===429)fallback();else fail('AI configuration or access error. Contact the app owner.');});
   upstream.on('error',()=>{if(generation===serial)fail('AI connection failed. Please retry.');});
   upstream.on('close',(code,reason)=>{if(generation!==serial||closed)return;if(provider==='gemini'&&(code===1008&&/quota|resource.exhausted|rate.limit/i.test(String(reason))))fallback();else fail('AI connection ended. Press LISTEN to reconnect.');});
   upstream.on('message',raw=>{
    if(generation!==serial||closed)return;
    let data;try{data=JSON.parse(raw);}catch{return fail('Invalid AI response.');}
    if(data.error){const e=data.error;if(e.code===429||e.status==='RESOURCE_EXHAUSTED'||['insufficient_quota','rate_limit_exceeded'].includes(e.code))fallback();else fail('AI could not process this session. Please reconnect.');return;}
    if((provider==='gemini'&&data.setupComplete)||(provider==='openai'&&data.type==='session.updated')){clearTimeout(setupTimer);ready=true;console.info('[AI live] '+provider+' connected');emit({type:'session.created'});return;}
    if(provider==='gemini'){
     const c=data.serverContent;if(!c)return;
     if(c.inputTranscription?.text){inputText+=c.inputTranscription.text;emit({type:'conversation.item.input_audio_transcription.delta',item_id:`input-${serial}-${turn+1}`,delta:c.inputTranscription.text});}
     const text=c.outputTranscription?.text;if(text){startResponse();outputText+=text;emit({type:'response.output_text.delta',response_id:responseId,delta:text});}
     // Audio output is intentionally not played or stored; only its transcription is displayed.
     if(c.turnComplete||c.interrupted){if(responseId)emit({type:'response.done',response:{status:'completed'}});remember();}
    }else{
     if(data.type==='conversation.item.input_audio_transcription.completed'){inputText=data.transcript||'';}
     if(data.type==='response.output_text.delta')outputText+=data.delta||'';
     const allowed=['conversation.item.input_audio_transcription.delta','conversation.item.input_audio_transcription.completed','conversation.item.input_audio_transcription.failed','input_audio_buffer.speech_started','input_audio_buffer.speech_stopped','response.created','response.output_text.delta','response.output_text.done','response.done'];
     if(allowed.includes(data.type)){
      if(data.type==='response.done'){if(data.response?.status==='failed')return fail('AI could not complete the answer.');emit({type:data.type,response:{status:'completed'}});remember();}
      else emit({type:data.type,item_id:data.item_id,transcript:data.transcript,delta:data.delta,text:data.text,response_id:data.response_id,response:data.type==='response.created'?{id:data.response.id}:undefined});
     }
    }
   });
  }
  let bytes=0,windowAt=Date.now();
  client.on('message',(raw,binary)=>{
   if(closed)return;
   if(Date.now()-windowAt>1000){windowAt=Date.now();bytes=0;}bytes+=raw.length;if(bytes>250000)return fail('Audio rate exceeds limit.');
   if(binary){if(!ready||paused)return;if(raw.length%2||raw.length>24000)return fail('Invalid audio frame.');if(provider==='gemini')send({realtimeInput:{audio:{data:raw.toString('base64'),mimeType:'audio/pcm;rate=24000'}}});else send({type:'input_audio_buffer.append',audio:raw.toString('base64')});return;}
   try{
    const msg=JSON.parse(raw);
    if(msg.type==='start'&&!settings){sessionConfig({...msg.settings,source:'phone',mode:'text'});settings=msg.settings;open(geminiKey&&Date.now()>=cooldown?'gemini':apiKey?'openai':'gemini');}
    else if(msg.type==='settings'&&settings){sessionConfig({...msg.settings,source:'phone',mode:'text'});settings=msg.settings;remember();emit({type:'transport.reconnecting'});open(provider);}
    else if(msg.type==='pause'){paused=true;if(ready){if(provider==='gemini')send({realtimeInput:{audioStreamEnd:true}});else send({type:'input_audio_buffer.clear'});}}
    else if(msg.type==='resume')paused=false;
    else fail('Invalid listener request.');
   }catch{fail('Invalid listener settings.');}
  });
  client.on('close',cleanup);client.on('error',cleanup);
 }
 server.on('close',()=>{for(const c of wss.clients)c.terminate();wss.close();});
 return wss;
}
module.exports={attachLive};
