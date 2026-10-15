import { Sandbox } from '@insforge/instabox-sdk';

const apiKey = process.env.INSTABOX_API_KEY;
const accessToken = process.env.FOUNDER_MCP_TOKEN;
const name = 'founder-skill-mcp';
const sha = process.env.GITHUB_SHA;
if (!apiKey || !accessToken) throw Error('Configure INSTABOX_API_KEY and FOUNDER_MCP_TOKEN in GitHub Actions secrets');
if (!/^[A-Za-z0-9_.~-]{32,256}$/.test(accessToken)) throw Error('FOUNDER_MCP_TOKEN must be 32-256 URL-safe characters');
if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Expected valid GitHub commit SHA');

const matches = await Sandbox.list({ metadata: { app: name } });
const existing = matches.find(x => x.name === name);
const vm = existing
  ? await Sandbox.connect(existing.sandboxId)
  : await Sandbox.create('universal', { name, metadata: { app: name }, autoSuspendMs: 0, vault: false });
await vm.setAutoSuspend(0);
await vm.setTimeout(0);
const app = '/data/home/founder-skill-mcp';
const original = '/data/home/founder-skill-upstream';

async function exec(command) {
  const r = await vm.commands.run(command, { timeoutMs: 600000 });
  if (r.exitCode !== 0) throw Error('InstaBox command failed: ' + (r.stderr || r.stdout).slice(-2000));
}

await exec('git clone https://github.com/AIM-IT4/founder-skill.git ' + app + ' 2>/dev/null || true');
await exec('git -C ' + app + ' fetch origin main && git -C ' + app + ' checkout --detach ' + sha);
await exec('git clone https://github.com/Jakeschincariol/founder-skill.git ' + original + ' 2>/dev/null || true');
await exec('git -C ' + original + ' fetch origin main && git -C ' + original + ' checkout --detach fd9385b0cfe1b96bebce3898fbd506d73eff5a9d');
await exec('cd ' + app + ' && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt');
await vm.files.write(app + '/.env', 'FOUNDER_MCP_TOKEN=' + accessToken + '\nFOUNDER_SKILLS_ROOT=' + original + '/skills\n');
await exec('chmod 600 ' + app + '/.env');
await vm.files.write(app + '/start.sh', '#!/bin/sh\nset -a\n. ' + app + '/.env\nset +a\ncd ' + app + '\nexec .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000\n');
await exec('chmod 700 ' + app + '/start.sh');
await exec('if [ -f ' + app + '/server.pid ]; then kill "$(cat ' + app + '/server.pid)" 2>/dev/null || true; fi; nohup ' + app + '/start.sh > ' + app + '/server.log 2>&1 < /dev/null & echo $! > ' + app + '/server.pid');

const result = await fetch('https://api.instabox.sh/v1/machines/' + vm.sandboxId + '/ports', {
  method: 'POST',
  headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ port: 8000, name: 'Founder Skill MCP' }),
});
if (!result.ok) throw Error('Port publish failed: ' + result.status);
const port = await result.json();
console.log('MCP endpoint: ' + port.url.replace(/\/$/, '') + '/mcp');
console.log('Health check: ' + port.url.replace(/\/$/, '') + '/healthz');

const rootUrl = port.url.replace(/\/$/, '');
let healthy = false;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const response = await fetch(rootUrl + '/healthz', {signal: AbortSignal.timeout(8000)});
    const health = await response.json();
    if (response.ok && health.status === 'ok' && health.skills === 11) {
      const unauthenticated = await fetch(rootUrl + '/mcp', {signal: AbortSignal.timeout(8000)});
      if (unauthenticated.status !== 401) throw Error('MCP authentication guard not active');
      healthy = true;
      break;
    }
  } catch (error) {
    console.log('Waiting for MCP startup: ' + String(error.message || error));
  }
  await new Promise(resolve => setTimeout(resolve, 5000));
}
if (!healthy) throw Error('MCP health or authentication verification failed');
console.log('Health and access-control checks passed');
