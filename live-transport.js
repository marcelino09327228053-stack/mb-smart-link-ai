/* Same-origin streaming transport. No API credentials or provider URLs. */
(()=>{
 window.MBLive={async connect({stream,settings,onEvent,signal}){
  let socket,node,source,context,closed=false,ready=false,paused=false;
  function close(){if(closed)return;closed=true;ready=false;node?.disconnect();source?.disconnect();if(node)node.port.onmessage=null;context?.close().catch(()=>{});socket?.close();signal?.removeEventListener('abort',close);}
  signal?.addEventListener('abort',close,{once:true});
  try{
   context=new AudioContext();await context.resume();await context.audioWorklet.addModule('/live-capture-worklet.js');
   if(closed||signal?.aborted)throw Error('Connection cancelled.');
   node=new AudioWorkletNode(context,'mb-capture');source=context.createMediaStreamSource(stream);source.connect(node);node.connect(context.destination);
   socket=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/live');socket.binaryType='arraybuffer';
   node.port.onmessage=e=>{if(ready&&!paused&&socket.readyState===1){if(socket.bufferedAmount>250000){onEvent({type:'error'});close();}else socket.send(e.data);}};
   socket.onopen=()=>socket.send(JSON.stringify({type:'start',settings}));
   socket.onmessage=e=>{try{const event=JSON.parse(e.data);if(event.type==='session.created')ready=true;if(event.type==='transport.reconnecting')ready=false;onEvent(event);}catch{onEvent({type:'error'});close();}};
   socket.onclose=()=>{if(!closed){onEvent({type:'error'});close();}};
   socket.onerror=()=>{if(!closed){onEvent({type:'error'});close();}};
   const send=data=>{if(!closed&&socket.readyState===1)socket.send(JSON.stringify(data));};
   return {close,pause(){paused=true;send({type:'pause'});},resume(){paused=false;send({type:'resume'});},update(settings){ready=false;send({type:'settings',settings});}};
  }catch(error){close();throw error;}
 }};
})();
