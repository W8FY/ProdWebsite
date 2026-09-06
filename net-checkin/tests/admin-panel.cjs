/* Browser logic with a minimal DOM + real backend fixture; no live network. */
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {adminHarness}=require('../../google-apps-script/tests/admin-recovery.cjs');
const source=fs.readFileSync(path.join(__dirname,'../js/recover.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function panel({callback=true}={}){
  const h=adminHarness(), nodes={}, local=new Map(), storage=new Map(), calls=[],timers=[];
  const node=id=>nodes[id]||(nodes[id]={value:'',hidden:false,disabled:false,checked:false,textContent:'',children:[],listeners:{},
    addEventListener(type,fn){this.listeners[type]=fn;},replaceChildren(){this.children=[];},append(...children){this.children.push(...children);},appendChild(child){this.children.push(child);},focus(){this.focused=true;}});
  const document={getElementById:node,createElement:()=>node('generated-'+Object.keys(nodes).length),querySelectorAll:()=>Object.values(nodes)};
  const store=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
  const attempt=h.begin();
  if(callback)storage.set('w8fy.admin.login',JSON.stringify({...attempt,expires:Date.parse('2026-09-05T12:05:00Z')}));
  let dropResponse=false,dropRequest=false;
  const window={localStorage:store(local),sessionStorage:store(storage),crypto:webcrypto,location:{assign(url){window.redirect=url;}},
    setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){},
    W8FY_ADMIN_CALLBACK:callback?attempt:{},W8FYGoogleAppsScript:{adminRequest:async(action,data)=>{
      calls.push({action,data});
      if(action==='adminCommit'&&dropRequest){dropRequest=false;throw Error('Network timeout before send');}
      const result=h.dispatch(action,data);
      if(action==='adminCommit'&&dropResponse){dropResponse=false;throw Error('Network timeout after successful write');}
      return result;
    }}};
  node('kind').value='recovery';
  vm.runInNewContext(source,{window,document,Date:h.context.Date,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64')});
  await tick();
  const click=async id=>{node(id).listeners.click();await tick();};
  const prepare=async()=>{node('operator').value='KA8ZGE';node('reason').value='Confirmed from operator log.';await click('prepare');};
  const confirm=async()=>{node('confirm').checked=true;node('confirm').listeners.change();await click('commit');};
  return {h,node,window,local,storage,calls,timers,click,prepare,confirm,dropResponse:()=>{dropResponse=true;},dropRequest:()=>{dropRequest=true;}};
}
(async()=>{
  let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name);}
  await test('authenticated panel loads authoritative net, check-ins and identity without persisting a session',async()=>{
    const p=await panel();assert.equal(p.node('login').hidden,true);assert.equal(p.node('checkins').children.length,2);
    assert.match(p.node('identity').textContent,/admin@gmail.com/);assert.equal(p.storage.size,0);assert.equal(p.local.size,0);
    assert.equal(p.timers[0].ms,600000);
  });
  await test('review requires explicit confirmation; untrusted reason is rendered as text',async()=>{
    const p=await panel();p.node('operator').value='KA8ZGE';p.node('reason').value='<img src=x onerror=alert(1)> verified log';
    await p.click('prepare');assert.equal(p.node('review').hidden,false);assert.equal(p.node('commit').disabled,true);
    assert.ok(p.node('review-text').children.some(n=>n.textContent.includes('<img')));
    await p.click('commit');assert.equal(p.calls.filter(c=>c.action==='adminCommit').length,0);
    await p.confirm();assert.match(p.node('status').textContent,/completed/);assert.equal(p.local.size,0);
  });
  await test('timeout after successful write locks actions until status reconciliation; never resends',async()=>{
    const p=await panel();await p.prepare();p.dropResponse();await p.confirm();
    assert.equal(p.node('uncertain').hidden,false);assert.equal(p.node('actions').hidden,true);assert.equal(p.local.size,1);
    await p.click('reconcile');assert.equal(p.local.size,0);assert.match(p.node('next-action').textContent,/finalize/);
    assert.equal(p.calls.filter(c=>c.action==='adminCommit').length,1);
  });
  await test('timeout before write reconciles prepared operation before permitting a fresh review',async()=>{
    const p=await panel();await p.prepare();p.dropRequest();await p.confirm();await p.click('reconcile');
    assert.match(p.node('status').textContent,/not applied/);assert.equal(p.node('actions').hidden,false);
    assert.equal(p.h.readNet().net_control_callsign,'KC8QHK');
  });
  await test('explicit historical end is required, reviewed, finalized, and authoritative report displayed',async()=>{
    const p=await panel();p.node('kind').value='historical_finalization';p.node('kind').listeners.change();
    await p.prepare();assert.match(p.node('status').textContent,/actual ending/);
    p.node('end-date').value='2026-08-29';p.node('end-time').value='11:30';p.node('end-zone').value='+00:00';
    await p.prepare();assert.ok(p.node('review-text').children.some(n=>n.textContent.includes('2026-08-29T11:30:00+00:00')));
    await p.confirm();assert.match(p.node('report').textContent,/35 minutes/);assert.equal(p.node('net-panel').hidden,true);
    assert.match(p.node('next-action').textContent,/start a new net/);assert.equal(p.h.emails.length,0);
  });
  await test('sign-out revokes server session and clears privileged UI; expiry also hides controls',async()=>{
    const p=await panel();await p.click('sign-out');assert.equal(p.node('login').hidden,false);assert.equal(p.node('actions').hidden,true);
    const auth=p.calls.find(c=>c.action==='adminSignOut').data;assert.throws(()=>p.h.dispatch('adminState',auth),/expired/);
    const expired=await panel();expired.timers[0].fn();assert.equal(expired.node('actions').hidden,true);assert.match(expired.node('status').textContent,/expired/);
  });
  await test('sign-in stores only a five-minute browser proof then navigates to Google',async()=>{
    const p=await panel({callback:false});await p.click('sign-in');
    assert.match(p.window.redirect,/^https:\/\/accounts.google.com\//);assert.equal(p.local.size,0);
    const saved=JSON.parse(p.storage.get('w8fy.admin.login'));assert.equal(saved.proof.length,43);assert.equal(saved.session,undefined);
  });
  console.log(count+' administrator panel tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
