import { Sandbox } from '@insforge/instabox-sdk';

const machineId = 'm_agqt3fp3ttmzygaezcrv3nuwmq';
const key = process.env.INSTABOX_API_KEY;
if (!key) throw new Error('INSTABOX_API_KEY is unavailable');
const options = {
  apiKey: key,
  requestTimeoutMs: 60000,
  operationTimeoutMs: 120000,
  fetch: (...args) => fetch(...args),
};
const vm = await Sandbox.connect(machineId, options);
const script = "set -eu\numask 077\ncd /data/home/umami\npython3 - <<'PY'\nimport pathlib,secrets,os\np=pathlib.Path('app.env')\nif 'APP_SECRET=' not in p.read_text():\n p.write_text('APP_SECRET='+secrets.token_hex(32)+'\\nTWO_FACTOR_ENCRYPTION_KEY='+secrets.token_hex(32)+'\\n')\nos.chmod(p,0o600)\nPY\ndocker compose --profile restored up -d umami\npython3 - <<'PY'\nimport urllib.request,urllib.error,json,time,pathlib,secrets,os\nbase='http://127.0.0.1:3000'\ndef api(path,data=None,token=None):\n h={'Content-Type':'application/json'}\n if token:h['Authorization']='Bearer '+token\n req=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers=h)\n with urllib.request.urlopen(req,timeout=20) as r:return json.load(r)\nfor i in range(90):\n try:api('/api/heartbeat');break\n except Exception:time.sleep(2)\nelse:raise SystemExit('Umami heartbeat failed')\np=pathlib.Path('admin-credentials.json')\nif not p.exists():\n creds={'username':'admin','password':secrets.token_urlsafe(30)}\n p.write_text(json.dumps(creds));os.chmod(p,0o600)\nelse:creds=json.loads(p.read_text())\ntry:login=api('/api/auth/login',creds)\nexcept urllib.error.HTTPError:\n login=api('/api/auth/login',{'username':'admin','password':'umami'})\n api('/api/users/'+login['user']['id'],creds,login['token'])\n login=api('/api/auth/login',creds)\ntry:\n api('/api/auth/login',{'username':'admin','password':'umami'})\n raise SystemExit('Default password still accepted')\nexcept urllib.error.HTTPError as e:\n if e.code!=401:raise\nwid='1a30fbff-9eea-4902-840d-0c5a2d63366e'\ntry:site=api('/api/websites/'+wid,token=login['token'])\nexcept urllib.error.HTTPError as e:\n if e.code!=404:raise\n site=api('/api/websites',{'id':wid,'name':'Desk2Quant','domain':'desk2quant.com'},login['token'])\nassert site['id']==wid\nprint('Authenticated admin verified; default password rejected; Desk2Quant website configured.')\np=pathlib.Path('compose.yaml')\ns=p.read_text().replace('127.0.0.1:3000:3000','0.0.0.0:3000:3000')\np.write_text(s)\npathlib.Path('RECOVERY.md').write_text('Fresh start authorized 2026-11-02. Render data NOT imported or modified. Admin credentials: admin-credentials.json (private). Free VM sleeps; continuous analytics not guaranteed.\\n')\nPY\ndocker compose --profile restored up -d umami\npython3 - <<'PY'\nimport urllib.request,time\nfor i in range(45):\n try:\n  with urllib.request.urlopen('http://127.0.0.1:3000/api/heartbeat',timeout=10) as r: assert r.status==200\n  break\n except Exception:time.sleep(2)\nelse:raise SystemExit('Published app not healthy')\nprint('FRESH_UMAMI_READY')\nPY\ndocker compose exec -T db pg_dump -U umami -d umami -Fc > backups/fresh-initial.dump\ndocker compose exec -T db pg_restore --list < backups/fresh-initial.dump > /dev/null\ncurl -fsS --max-time 10 http://127.0.0.1:8000/healthz\n";
try {
  await vm.files.write('/data/home/start-fresh-umami.sh', script);
  const result = await vm.commands.run('bash /data/home/start-fresh-umami.sh', { timeoutMs: 600000 });
  console.log(String(result.stdout || '').split(key).join('[REDACTED]').slice(-12000));
  if (result.exitCode !== 0) {
    console.error(String(result.stderr || '').split(key).join('[REDACTED]').slice(-2000));
    throw new Error('Staging command failed');
  }
} catch (error) {
  console.error('Staging failed:', String(error?.code || error?.name || 'unknown'));
  for (const output of [error?.stdout, error?.stderr]) {
    if (output) console.error(String(output).split(key).join('[REDACTED]').slice(-8000));
  }
  process.exitCode = 1;
}
