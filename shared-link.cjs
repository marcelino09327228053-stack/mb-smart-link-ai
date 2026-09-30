// Shared by browser and backend: one URL-to-library-item format.
(function(root){
  function normalize(value){
    const text=String(value||'').trim();
    if(!text||text.length>4096||/\s/.test(text))throw Error('Copy a complete URL first.');
    const u=new URL(/^https?:\/\//i.test(text)?text:'https://'+text);
    if(!['http:','https:'].includes(u.protocol)||!u.hostname.includes('.')||u.username||u.password)throw Error('Copy a valid HTTP or HTTPS URL.');
    return u.href;
  }
  function site(url){
    const host=new URL(url).hostname.replace(/^www\./,'');
    const names={'youtube.com':'YouTube','youtu.be':'YouTube','webtoons.com':'Webtoon','webtoon.com':'Webtoon','facebook.com':'Facebook','fb.watch':'Facebook','tiktok.com':'TikTok','instagram.com':'Instagram','vimeo.com':'Vimeo'};
    for(const [domain,name] of Object.entries(names))if(host===domain||host.endsWith('.'+domain))return name;
    return host;
  }
  function make(value,id,entryId,date,title){
    const url=normalize(value),host=new URL(url).hostname;
    const video=/(^|\.)(youtube\.com|youtu\.be|fb\.watch|tiktok\.com)$/.test(host)||/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)||/(facebook|instagram)\.com\/.*(watch|video|reel)/i.test(url);
    const name=title&&title!=='Untitled Video'?title:site(url);
    const entry={id:entryId,url,title:name,savedAt:date};
    return {id,name,links:video?[]:[entry],videos:video?[entry]:[],notes:'',savedAt:date};
  }
  // Three-way merge: preserve remote additions, reject competing field edits.
  function merge(base,local,remote){
    if(JSON.stringify(local)===JSON.stringify(base))return remote;
    if(JSON.stringify(remote)===JSON.stringify(base)||JSON.stringify(local)===JSON.stringify(remote))return local;
    if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)){
      const out=[];
      for(const id of new Set([...remote,...local].map(x=>x.id))){
        const b=base.find(x=>x.id===id),l=local.find(x=>x.id===id),r=remote.find(x=>x.id===id);
        if(!b){out.push(l&&r?merge({},l,r):(l||r));continue}
        const value=merge(b,l,r);if(value!==undefined)out.push(value);
      }return out;
    }
    if(base&&local&&remote&&typeof base==='object'&&typeof local==='object'&&typeof remote==='object'){
      const out={};for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
        const value=merge(base[key],local[key],remote[key]);if(value!==undefined)out[key]=value;
      }return out;
    }
    throw Error('This item changed on another device. Your pending changes are kept on this device; reload after resolving them.');
  }
  const api={normalize,site,make,merge};
  if(typeof module==='object')module.exports=api;else root.MBLink=api;
})(typeof globalThis==='object'?globalThis:this);
