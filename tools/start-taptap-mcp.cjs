// Start the pinned, project-local official MCP. No credentials belong in this file.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const state = path.join(root, '.taptap-mcp');
const entry = path.join(state, 'runtime/node_modules/@taptap/instant-games-open-mcp/bin/instant-games-open-mcp');
function serverOptions() {
  return { cwd: root, windowsHide: true, env: {
    ...process.env,
    TAPTAP_MCP_TRANSPORT: 'stdio', TAPTAP_MCP_ENV: 'production',
    TAPTAP_MCP_WORKSPACE_ROOT: root,
    TAPTAP_MCP_CACHE_DIR: path.join(state, 'cache'),
    TAPTAP_MCP_TEMP_DIR: path.join(state, 'temp'),
    TAPTAP_MCP_LOG_ROOT: path.join(state, 'logs'),
    TAPTAP_MCP_VERBOSE: 'false',
  } };
}
function start(stdio = 'inherit') {
  if (!fs.existsSync(entry)) throw new Error('TapTap MCP is not installed. See TAPTAP_MCP_SETUP.md.');
  return spawn(process.execPath, [entry], { ...serverOptions(), stdio });
}
module.exports = { start, root, state };
if (require.main === module) {
  try {
    const child = start();
    child.on('error', e => { console.error(e.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
