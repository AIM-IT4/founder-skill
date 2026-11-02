import { Sandbox } from '@insforge/instabox-sdk';
const key=process.env.INSTABOX_API_KEY;
if(!key) throw Error('INSTABOX_API_KEY secret missing');
const vm=await Sandbox.connect('m_agqt3fp3ttmzygaezcrv3nuwmq',{apiKey:key,requestTimeoutMs:60000,operationTimeoutMs:120000,fetch:(...a)=>fetch(...a)});
const cmd=String.raw`set -euo pipefail
cd /data/home/umami
if ! curl -fsS --max-time 8 http://127.0.0.1:3000/api/heartbeat >/dev/null; then
 echo 'Recovering existing Docker containers (preserving database)'
 docker compose --profile restored up -d db umami
 for i in $(seq 1 30); do curl -fsS --max-time 5 http://127.0.0.1:3000/api/heartbeat >/dev/null && break; sleep 2; done
fi
python3 - <<'PY'
import json,pathlib,urllib.request,urllib.error,subprocess,time
base='http://127.0.0.1:3000'; wid='1a30fbff-9eea-4902-840d-0c5a2d63366e'; event='instabox_verification_20261102'
def api(path,data=None,token=None):
 headers={'Content-Type':'application/json','Origin':'https://desk2quant.com'}
 if token:headers['Authorization']='Bearer '+token
 req=urllib.request.Request(base+path,headers=headers,data=json.dumps(data).encode() if data is not None else None)
 with urllib.request.urlopen(req,timeout=25) as resp:return resp.status,json.load(resp),resp.headers
def query(sql):
 proc=subprocess.run(['docker','compose','exec','-T','db','psql','-U','umami','-d','umami','-At','-c',sql],capture_output=True,text=True,check=True)
 return proc.stdout.strip()
auth=api('/api/auth/login',json.loads(pathlib.Path('admin-credentials.json').read_text()))[1]
assert auth.get('token')
status,site,_=api('/api/websites/'+wid,token=auth['token'])
assert status==200 and site.get('id')==wid
print('ADMIN_AUTH_OK WEBSITE_OK',site.get('domain'))
tables=query("SELECT table_name FROM information_schema.columns WHERE column_name='event_name' AND table_schema='public'").splitlines()
assert 'website_event' in tables,tables
def count(): return int(query("SELECT count(*) FROM " + 'website_event' + " WHERE event_name = '" + event + "'"))
before=count()
payload={'type':'event','payload':{'website':wid,'hostname':'desk2quant.com','url':'https://desk2quant.com/umami-verification','screen':'1920x1080','language':'en-US','title':'Desk2Quant diagnostic','referrer':'','name':event}}
status,_,headers=api('/api/send',payload)
print('EVENT_STATUS',status,'CORS',headers.get('Access-Control-Allow-Origin','absent'))
assert status in (200,201,202)
for i in range(10):
 after=count()
 if after>before:break
 time.sleep(1)
else: raise RuntimeError('Event not saved to PostgreSQL')
print('POSTGRES_PERSISTENCE_OK',before,'TO',after)
for url,label in [('https://3000-agqt3fp3ttmzygaezcrv3nuwmq.instabox.tech/api/heartbeat','PUBLIC_HEARTBEAT'),('https://3000-agqt3fp3ttmzygaezcrv3nuwmq.instabox.tech/script.js','PUBLIC_SCRIPT'),('https://desk2quant.com/umami-analytics.js','DESK2QUANT_TRACKER')]:
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'UmamiCheck/1.0'}),timeout=20) as resp:
   body=resp.read(15000)
   print(label,resp.status,'SIZE',len(body),'EXPECTED_HOST' if b'instabox.tech' in body else '')
 except Exception as e:print(label,'FAILED',type(e).__name__)
PY
`;
await vm.files.write('/data/home/umami/check-current.sh',cmd);
const result=await vm.commands.run('bash /data/home/umami/check-current.sh',{timeoutMs:240000});
console.log(String(result.stdout||'').slice(-10000));
if(result.exitCode!==0){console.error(String(result.stderr||'').slice(-2000));process.exitCode=1;}
