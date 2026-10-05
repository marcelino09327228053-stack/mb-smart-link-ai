const {spawn}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs');
function overlayBridge({spawnImpl=spawn,platform=process.platform}={}){
 let child=null,owner=null,lastSeen=0,commands=[],closed=[],ready=null,events=null;
 function stop(){events?.end();events=null;child?.kill();child=null;owner=null;ready=null;commands=[];closed=[]}
 async function update(input,port){
  if(platform!=='win32')throw Error('Floating panels require the local Windows backend.');
  if(typeof input.owner!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(input.owner))throw Error('Invalid overlay owner.');
  if(owner&&owner!==input.owner&&Date.now()-lastSeen<10000)throw Error('Another browser tab is using the floating panels.');
  if(owner&&owner!==input.owner)stop();
  if(input.close){if(owner===input.owner)stop();return {running:false,commands:[],closed:['all']}}
  const open=Array.isArray(input.open)?input.open.filter(k=>['transcript','response'].includes(k)):[];
  if(!child&&!open.length)return {running:false,commands:commands.splice(0),closed:['all']};
  if(!child){
   owner=input.owner;
   const bundled=path.join(__dirname,'../windows-helper/.venv/Scripts/python.exe');
   const executable=fs.existsSync(bundled)?bundled:'python';
   const env={};for(const name of ['SystemRoot','WINDIR','PATH','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE'])if(process.env[name])env[name]=process.env[name];
   env.PYTHONIOENCODING='utf-8';
   const c=child=spawnImpl(executable,['-u',path.join(__dirname,'../windows-overlay/overlay.py')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env});
   let buffer='';
   ready=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{stop();reject(Error('Windows overlay did not start. Check Python with Tk support.'))},5000);
    c.once('error',()=>{clearTimeout(timer);stop();reject(Error('Could not launch Windows overlay. Install Python with Tk support.'))});
    c.once('exit',()=>{clearTimeout(timer);if(child===c){child=null;owner=null;closed.push('all')}reject(Error('Windows overlay closed.'))});
    c.stdout.on('data',chunk=>{
     buffer+=chunk.toString();let end;
     while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const value=JSON.parse(line);if(value.ready){clearTimeout(timer);resolve()}
       if(events&&!events.destroyed)events.write('data: '+JSON.stringify(value)+'\n\n');
       else {if(['start','stop'].includes(value.command))commands.push(value.command);if(['transcript','response','all'].includes(value.closed))closed.push(value.closed);}
     }catch{}}
    });
   });
   c.stdin.on('error',()=>{});c.stderr.resume();
  }
  lastSeen=Date.now();await ready;
  if(!child)throw Error('Windows overlay disconnected.');
  child.stdin.write(JSON.stringify({open,active:!!input.active,status:String(input.status||'').slice(0,200),transcript:String(input.transcript||'').slice(-100000),response:String(input.response||'').slice(-100000),x:Math.max(0,Math.min(10000,Number(input.x)||120)),y:Math.max(0,Math.min(10000,Number(input.y)||160))})+'\n');
  return {running:true,commands:commands.splice(0),closed:closed.splice(0)};
 }
 function subscribe(id,res){if(!child||id!==owner)return false;events?.end();events=res;res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});res.write(': connected\n\n');const heartbeat=setInterval(()=>{if(child&&!res.destroyed){child.stdin.write('{"heartbeat":true}\n');res.write(': alive\n\n');lastSeen=Date.now()}},2000);heartbeat.unref();res.on('close',()=>{clearInterval(heartbeat);if(events===res)events=null});return true}
 return {update,stop,subscribe};
}
module.exports={overlayBridge};
