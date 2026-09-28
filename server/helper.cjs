const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
function helperPort() {
  const port = Number(process.env.AUDIO_HELPER_PORT || 5502);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : 5502;
}
async function helperStatus(port = helperPort()) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(800) });
    const data = await response.json();
    if (!response.ok || data.service !== 'knowledge-hub-wasapi' || data.version !== 1) throw Error();
    return { connected: true, capturing: !!data.capturing, url: `ws://127.0.0.1:${port}/audio` };
  } catch { return { connected: false, capturing: false, url: `ws://127.0.0.1:${port}/audio` }; }
}
async function startHelper(sitePort) {
  if (process.platform !== 'win32') return;
  const port = helperPort();
  if ((await helperStatus(port)).connected) return;
  const root = path.join(__dirname, '..', 'windows-helper');
  const python = path.join(root, '.venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(python)) { console.log('Audio helper not installed. Chrome capture remains available.'); return; }
  const child = spawn(python, [path.join(root, 'helper.py'), '--port', String(port),
    '--origin', `http://127.0.0.1:${sitePort}`, '--origin', `http://localhost:${sitePort}`],
  { detached: true, windowsHide: true, stdio: 'ignore' });
  child.on('error', () => console.log('Audio helper could not start. Chrome capture remains available.'));
  child.unref();
}
module.exports = { helperStatus, startHelper };
