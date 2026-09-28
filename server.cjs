const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { sessionConfig } = require('./server/session.cjs');
const { helperStatus, startHelper } = require('./server/helper.cjs');
const { videoTitle } = require('./server/video-title.cjs');

// Explicit allowlist: never serve .env, backend code, tests, or repository files.
const assets = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']],
  ['/ai-listener.js', ['ai-listener.js', 'text/javascript']],
  ['/pc-audio-sources.js', ['pc-audio-sources.js', 'text/javascript']],
  ['/helper-audio-worklet.js', ['helper-audio-worklet.js', 'text/javascript']]
]);
function createServer({ apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime', fetchImpl = fetch } = {}) {
  let pending = 0;
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
    if (![expectedHost, localHost].includes(req.headers.host)) return send(403, { error: 'Local access only.' });
    const pathname = new URL(req.url, `http://${expectedHost}`).pathname;
    if (req.method === 'GET' && pathname === '/api/health') return send(200, { configured: !!apiKey, model });
    if (req.method === 'GET' && pathname === '/api/helper/status') return send(200, await helperStatus());
    if (req.method === 'GET' && pathname === '/api/video-title') {
      const url = new URL(req.url, `http://${expectedHost}`).searchParams.get('url');
      if (!url || url.length > 4096) return send(400, { error: 'Invalid video URL.' });
      return send(200, { title: await videoTitle(url) });
    }
    if (req.method === 'POST' && pathname === '/api/session') {
      if (req.headers.origin !== `http://${req.headers.host}` || req.headers['content-type'] !== 'application/json')
        return send(403, { error: 'Same-origin JSON request required.' });
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
    for (const name of ['OPENAI_API_KEY', 'OPENAI_REALTIME_MODEL', 'PORT', 'AUDIO_HELPER_PORT']) {
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
