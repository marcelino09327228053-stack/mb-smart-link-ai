const https = require('node:https');
const dns = require('node:dns').promises;
function publicIP(ip) {
  const [a,b] = ip.split('.').map(Number);
  return !(a===0 || a===10 || a===127 || a>=224 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&b===168) || (a===100&&b>=64&&b<=127) || (a===198&&(b===18||b===19)));
}
async function page(url, signal, redirects=0) {
  const u=new URL(url);
  if(u.protocol!=='https:' || u.username || u.password || (u.port&&u.port!=='443') || redirects>3) throw Error();
  // Use the Windows resolver (VPN/proxy DNS included), not a separate DNS query.
  const records=await new Promise((resolve,reject)=>{
    if(signal.aborted)return reject(Error('Timeout'));
    const abort=()=>reject(Error('Timeout'));
    signal.addEventListener('abort',abort,{once:true});
    dns.lookup(u.hostname,{family:4,all:true}).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
  const ips=records.map(record=>record.address);
  if(!ips.length || !ips.every(publicIP) || signal.aborted) throw Error();
  return new Promise((resolve,reject)=>{
    const req=https.get(u,{signal,headers:{'User-Agent':'Mozilla/5.0 KnowledgeHub/1.0','Accept':'text/html,application/json'},lookup:(host,options,cb)=>cb(null, options.all ? [{address:ips[0],family:4}] : ips[0],4)},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();resolve(page(new URL(res.headers.location,u).href,signal,redirects+1));return}
      if(res.statusCode!==200){res.resume();reject(Error());return}
      let bytes=0;const chunks=[];
      res.on('data',c=>{bytes+=c.length;if(bytes>1500000){res.destroy(Error('Too large'));return}chunks.push(c)});
      res.on('end',()=>resolve(Buffer.concat(chunks).toString()));res.on('error',reject);
    });req.on('error',reject);
  });
}
function clean(text) {
  return String(text||'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code<=0x10ffff?String.fromCodePoint(code):''}).replace(/&(amp|quot|apos|lt|gt|nbsp);/gi,(_,n)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[n.toLowerCase()]).replace(/\s+/g,' ').trim().slice(0,300);
}
function extract(html){
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
    const attrs={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs))attrs[m[1].toLowerCase()]=m[3];
    if(['og:title','twitter:title'].includes((attrs.property||attrs.name||'').toLowerCase())&&attrs.content)return clean(attrs.content);
  }
  return clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
}
async function videoTitle(url, load=page){
  try{
    const u=new URL(url),host=u.hostname.toLowerCase(),signal=AbortSignal.timeout(7000);
    let endpoint;
    if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host)){
      const id=host==='youtu.be'?u.pathname.split('/')[1]:u.searchParams.get('v')||u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
      if(id&&/^[\w-]{11}$/.test(id))url='https://www.youtube.com/watch?v='+id;
      endpoint='https://www.youtube.com/oembed?format=json&url='+encodeURIComponent(url);
    }
    else if(host==='tiktok.com'||host.endsWith('.tiktok.com'))endpoint='https://www.tiktok.com/oembed?url='+encodeURIComponent(url);
    else if(host==='vimeo.com'||host==='www.vimeo.com')endpoint='https://vimeo.com/api/oembed.json?url='+encodeURIComponent(url);
    let title='';
    if(endpoint)try{title=clean(JSON.parse(await load(endpoint,signal)).title)}catch{}
    if(!title)title=extract(await load(url,signal));
    if(/^(facebook|tiktok|youtube|vimeo|log in.*|login.*|access denied.*|just a moment.*|error.*)$/i.test(title))title='';
    return title||'Untitled Video';
  }catch{return 'Untitled Video'}
}
module.exports={videoTitle,extract,publicIP};
