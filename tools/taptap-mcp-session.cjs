// Local interactive MCP client for configuration/authentication when the editor
// has not yet reloaded its MCP catalog. Keeps OAuth's in-memory flow alive.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { start, root, state } = require('./start-taptap-mcp.cjs');
fs.mkdirSync(state, { recursive: true });
const child = start(['pipe', 'pipe', 'pipe']);
const pending = new Map();let nextId = 0;
const send = payload => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...payload }) + '\n');
function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP request timed out')); }, 150000);
    pending.set(id, { resolve, reject, timer });send({ id, method, params });
  });
}
readline.createInterface({ input: child.stdout }).on('line', line => {
  let msg;try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === 'roots/list') return send({ id: msg.id, result: { roots: [{ uri: require('node:url').pathToFileURL(root).href, name: '留一格' }] } });
  if (msg.method && msg.id !== undefined) return send({ id: msg.id, error: { code: -32601, message: 'Unsupported client request' } });
  const p = pending.get(msg.id);if (!p) return;
  clearTimeout(p.timer);pending.delete(msg.id);
  if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));else p.resolve(msg.result);
});
// Avoid forwarding server internals or credentials into conversation output.
child.stderr.on('data', () => {});
child.on('error', err => { console.error(JSON.stringify({ error: err.message })); process.exit(1); });
child.on('exit', code => { console.log(JSON.stringify({ serverExited: code })); process.exit(code || 0); });
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/^(mac_key|access_token|refresh_token|device_code|client_secret|kid)$/i.test(k)?'[redacted]':clean(v)]));
  if (typeof value === 'string') {
    try { return JSON.stringify(clean(JSON.parse(value))); } catch {}
    return value.replace(/("(?:mac_key|access_token|refresh_token|device_code|client_secret|kid)"\s*:\s*")[^"]*/gi, '$1[redacted]');
  }
  return value;
}
function output(result) {
  const safe = { ...result };
  if (Array.isArray(safe.content)) safe.content = safe.content.map(block => {
    if (block.type !== 'image') return clean(block);
    if (block.mimeType !== 'image/png') return { type: 'text', text: 'Image returned with unsupported MIME type.' };
    const file = path.join(state, 'oauth-qr.png');fs.writeFileSync(file, Buffer.from(block.data, 'base64'));
    return { type: 'text', text: 'MCP image saved: '+file };
  });
  console.log(JSON.stringify(clean(safe)));
}
(async()=>{
  const init = await request('initialize', { protocolVersion: '2024-11-05', capabilities: { roots: { listChanged: false } }, clientInfo: { name: 'liuyige-local-setup', version: '1.0.0' } });
  send({ method: 'notifications/initialized' });
  const catalog = await request('tools/list');
  fs.writeFileSync(path.join(state, 'tool-catalog.json'), JSON.stringify(catalog, null, 2));
  console.log(JSON.stringify({ ready: true, server: init.serverInfo, tools: catalog.tools.map(t=>t.name) }));
  const input = readline.createInterface({ input: process.stdin });
  let chain = Promise.resolve();
  input.on('line', line => { if(!line.trim())return; chain=chain.then(async()=>{
    const command=JSON.parse(line);
    if(command.quit){child.kill();return;}
    if(command.method==='resources/list'||command.method==='resources/read') output(await request(command.method,command.params||{}));
    else {
      if(!catalog.tools.some(t=>t.name===command.tool)) throw new Error('Unknown MCP tool');
      output(await request('tools/call',{name:command.tool,arguments:command.args||{}}));
    }
  }).catch(error=>console.log(JSON.stringify({error:error.message}))); });
})().catch(error=>{console.error(JSON.stringify({error:error.message}));child.kill();});
