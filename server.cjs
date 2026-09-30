const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { sessionConfig } = require('./server/session.cjs');
const { helperStatus, startHelper } = require('./server/helper.cjs');
const { videoTitle } = require('./server/video-title.cjs');
const auth = require('./server/auth.cjs');
let library;
function getLibrary(){return library ||= require('./server/library.cjs').repository()}

// Explicit allowlist: never serve .env, backend code, tests, or repository files.
const assets = new Map([
  ['/library-sync.js',['library-sync.js','text/javascript']],
  ['/shared-link.js', ['shared-link.cjs','text/javascript']],
  ['/category-lock.js', ['category-lock.js', 'text/javascript']],
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']],
  ['/ai-listener.js', ['ai-listener.js', 'text/javascript']],
  ['/pc-audio-sources.js', ['pc-audio-sources.js', 'text/javascript']],
  ['/helper-audio-worklet.js', ['helper-audio-worklet.js', 'text/javascript']]
]);
function createServer({ apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime', fetchImpl = fetch } = {}) {
  let pending = 0;
  const publicOrigin=process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN) : null;
  if(publicOrigin&&(publicOrigin.protocol!=='https:'||publicOrigin.pathname!=='/'||publicOrigin.search||publicOrigin.hash||publicOrigin.username))throw Error('PUBLIC_ORIGIN must be an HTTPS origin.');
  return http.createServer(async (req, res) => {
    const send = (code, data, type = 'application/json') => {
      if (res.destroyed) return;
      res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "frame-ancestors 'none'" });
      res.end(type === 'application/json' ? JSON.stringify(data) : data);
    };
    const expectedHost = `127.0.0.1:${req.socket.localPort}`;
    const localHost = `localhost:${req.socket.localPort}`;
    const isLocal=[expectedHost,localHost].includes(req.headers.host);
    const requestOrigin=!isLocal&&publicOrigin?.host===req.headers.host?publicOrigin.origin:`http://${req.headers.host}`;
    if (!isLocal && publicOrigin?.host!==req.headers.host) return send(403, { error: 'Local access only.' });
    const pathname = new URL(req.url, `http://${expectedHost}`).pathname;

    const cookies=Object.fromEntries(
      String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{
        const i=x.indexOf('=');
        return i<0?[x,'']:[x.slice(0,i),decodeURIComponent(x.slice(i+1))];
      })
    );

    const readJson=async()=>{
      const chunks=[];let bytes=0;
      for await(const chunk of req){
        bytes+=chunk.length;
        if(bytes>4200000) throw Error('too-large');
        chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString()||'{}');
    };

    const sameOrigin=()=>req.headers.origin===requestOrigin &&
      String(req.headers['content-type']||'').startsWith('application/json');

    const setSessionCookie=value=>res.setHeader(
      'Set-Cookie',
      `mb_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${!isLocal?'; Secure':''}`
    );

    const clearSessionCookie=()=>res.setHeader(
      'Set-Cookie',
      'mb_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
    );

    if(req.method==='GET'&&pathname==='/api/auth/me'){
      const user=auth.getSessionUser(cookies.mb_session);
      return user?send(200,{user}):send(401,{error:'Not signed in.'});
    }

    if(req.method==='POST'&&pathname==='/api/auth/request-code'){
      if(!sameOrigin()) return send(403,{error:'Same-origin JSON request required.'});
      try{
        const body=await readJson();
        const email=String(body.email||'').trim().toLowerCase();
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)
          return send(400,{error:'Enter a valid email address.'});
        const code=auth.createLoginCode(email,10*60*1000,isLocal);
        console.log('[DEV LOGIN CODE] '+email+': '+code);
        return send(200,{ok:true,message:'Verification code created.',demoMode:isLocal&&process.env.DEV_SAMPLE_LOGIN==='true'&&process.env.NODE_ENV!=='production'});
      }catch{
        return send(400,{error:'Could not create verification code.'});
      }
    }

    if(req.method==='POST'&&pathname==='/api/auth/verify-code'){
      if(!sameOrigin()) return send(403,{error:'Same-origin JSON request required.'});
      try{
        const body=await readJson();
        const email=String(body.email||'').trim().toLowerCase();
        const code=String(body.code||'').trim();
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)
          return send(400,{error:'Enter a valid email address.'});
        if(!/^\d{6}$/.test(code))
          return send(400,{error:'Enter the 6-digit code.'});
        if(!auth.verifyLoginCode(email,code))
          return send(401,{error:'Invalid or expired verification code.'});
        const user=auth.ensureOtpUser(email);
        const token=auth.createSession(user.id);
        setSessionCookie(token);
        return send(200,{user:{id:user.id,email:user.email,created_at:user.created_at}});
      }catch{
        return send(400,{error:'Could not verify code.'});
      }
    }

    if(req.method==='POST'&&pathname==='/api/auth/logout'){
      if(!sameOrigin()) return send(403,{error:'Same-origin JSON request required.'});
      auth.deleteSession(cookies.mb_session);
      clearSessionCookie();
      return send(200,{ok:true});
    }

    if(pathname==='/api/library'||pathname==='/api/library/capture'){
      const library=getLibrary();
      const user=auth.getSessionUser(cookies.mb_session);
      if(!user)return send(401,{error:'Open MB Smart Link and sign in first.'});
      if(req.method==='GET'&&pathname==='/api/library')return send(200,{library:library.get(user.id)});
      if(!sameOrigin())return send(403,{error:'Same-origin JSON request required.'});
      try{
        const body=await readJson();
        if(req.method==='PUT'&&pathname==='/api/library'){
          const result=library.put(user.id,body.revision,body);
          return result?send(200,{library:result}):send(409,{error:'Library changed on another device.',library:library.get(user.id)});
        }
        if(req.method==='POST'&&pathname==='/api/library/capture'){
          if(!/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId||''))return send(400,{error:'Invalid save request.'});
          const url=require('./shared-link.cjs').normalize(body.url);
          // Save before optional metadata lookup; capture never waits on a third-party site.
          const result=library.capture(user.id,body.requestId,url);
          void videoTitle(url).then(title=>library.enrich(user.id,result.itemId,title)).catch(()=>{});
          return send(200,result);
        }
        return send(405,{error:'Method not allowed.'});
      }catch(e){return send(400,{error:e.message||'Could not save link.'})}
    }

    if (req.method === 'GET' && pathname === '/api/health') return send(200, { configured: !!apiKey, model });
    if (req.method === 'GET' && pathname === '/api/helper/status') return isLocal?send(200, await helperStatus()):send(403,{error:'PC helper is local only.'});
    if (req.method === 'GET' && pathname === '/api/video-title') {
      const url = new URL(req.url, `http://${expectedHost}`).searchParams.get('url');
      if (!url || url.length > 4096) return send(400, { error: 'Invalid video URL.' });
      return send(200, { title: await videoTitle(url) });
    }
    if (req.method === 'POST' && pathname === '/api/session') {
      if (!sameOrigin())
        return send(403, { error: 'Same-origin JSON request required.' });
      if(!isLocal&&!auth.getSessionUser(cookies.mb_session))return send(401,{error:'Sign in first.'});
      if (!apiKey) return send(503, { error: 'Set OPENAI_API_KEY in the local .env file and restart START AI LISTENER.bat.' });
      if (pending >= 2) return send(429, { error: 'A connection is already being prepared. Try again shortly.' });
      let body;
      try {
        const chunks = []; let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 100000) { send(413, { error: 'Request too large.' }); return; }
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks).toString());
        if (typeof body.sdp !== 'string' || !body.sdp.startsWith('v=0') || body.sdp.length > 90000) throw Error();
        body.session = sessionConfig(body.settings, model);
      } catch { return send(400, { error: 'Invalid session request or settings.' }); }
      pending++;
      const controller = new AbortController();
      const abort = () => controller.abort();
      res.on('close', abort);
      const timer = setTimeout(abort, 30000);
      try {
        const form = new FormData();
        form.set('sdp', body.sdp);
        form.set('session', JSON.stringify(body.session));
        const upstream = await fetchImpl('https://api.openai.com/v1/realtime/calls', {
          method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: controller.signal
        });
        if (!upstream.ok) {
          // Do not return upstream bodies/headers: they can contain account details.
          const error = upstream.status === 401 ? 'OpenAI rejected the backend API key.'
            : upstream.status === 429 ? 'OpenAI quota or rate limit reached. Check API billing and try later.'
            : 'OpenAI could not create the realtime session. Check model access and backend configuration.';
          send(502, { error });
        } else send(200, await upstream.text(), 'application/sdp');
      } catch { send(502, { error: 'Realtime connection timed out or failed. Check the internet connection.' }); }
      finally { clearTimeout(timer); res.off('close', abort); pending--; }
      return;
    }
    if (req.method !== 'GET' || !assets.has(pathname)) return send(404, { error: 'Not found.' });
    try {
      const [file, type] = assets.get(pathname);
      send(200, await fs.readFile(path.join(__dirname, file), 'utf8'), type);
    } catch { send(500, { error: 'Unable to read website asset.' }); }
  });
}
if (require.main === module) {
  // Explicit project settings take precedence over inherited terminal settings.
  // This avoids silently using an old API key after the user updates .env.
  try {
    const env = require('node:util').parseEnv(require('node:fs').readFileSync(path.join(__dirname, '.env'), 'utf8'));
    for (const name of ['OPENAI_API_KEY', 'OPENAI_REALTIME_MODEL', 'PORT', 'AUDIO_HELPER_PORT', 'DEV_SAMPLE_LOGIN', 'PUBLIC_ORIGIN']) {
      if (env[name]?.trim()) process.env[name] = env[name];
    }
  } catch (error) {
    if (error.code !== 'ENOENT') { console.error('Unable to read .env. Check its format and file permissions.'); process.exit(1); }
  }
  const port = Number(process.env.PORT || 5500);
  createServer().listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Knowledge Hub AI: ${url}`);
    startHelper(port).catch(() => console.log('Helper unavailable. Chrome fallback is available.'));
    if (process.argv.includes('--open')) {
      const locations = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
        .filter(Boolean).map(root => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      const chrome = locations.find(file => require('node:fs').existsSync(file)) || 'chrome.exe';
      // Start only after the server is listening; no shell or fixed startup delay.
      const child = require('node:child_process').spawn(chrome, ['--new-window', url], {
        detached: true, stdio: 'ignore', windowsHide: true
      });
      child.on('error', () => console.error(`Chrome could not open automatically. Open ${url} in Chrome.`));
      child.unref();
    }
  })
    .on('error', () => { console.error('Could not start local server. Check whether the port is already in use.'); process.exitCode = 1; });
}
module.exports = { createServer };

