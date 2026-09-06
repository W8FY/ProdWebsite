/* Local fakes only. No Google, spreadsheet, mail, or deployment access. */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {harness, id, netId, token, now} = require('./historical-finalization.cjs');
function adminHarness(options = {}) {
  const h = harness({legacy:false, ...options}), c = h.context;
  let googleCalls = 0, locked = false;
  const logs=[];
  c.console={error:(...args)=>logs.push(args.join(' '))};
  h.properties.set('W8FY_ADMIN_GOOGLE_CLIENT_ID', 'test-client');
  h.properties.set('W8FY_ADMIN_GOOGLE_CLIENT_SECRET', 'test-secret');
  h.properties.set('W8FY_ADMIN_REDIRECT_URI', 'https://example.test/net-checkin/recover.html');
  h.properties.set('W8FY_ADMIN_EMAILS', 'admin@gmail.com');
  c.Utilities.base64DecodeWebSafe = value => Buffer.from(value, 'base64url');
  c.Utilities.newBlob = value => ({getDataAsString: () => value.toString()});
  c.ContentService = {MimeType:{JSON:'json'}, createTextOutput: text => ({setMimeType: () => JSON.parse(text)})};
  c.LockService = {getScriptLock: () => ({waitLock(){if (locked) throw Error('Lock busy'); locked = true;},hasLock:()=>locked,releaseLock(){locked=false;}})};
  const user = {email:'admin@gmail.com', email_verified:true, sub:'verified-google-subject'};
  const claims = {iss:'https://accounts.google.com',aud:'test-client',sub:user.sub,exp:Date.parse(now)/1000 + 3600};
  let currentNonce;
  c.UrlFetchApp = {fetch(url, request) {
    googleCalls++;
    assert.equal(locked,true,'OAuth exchange also holds lock');
    if (url.endsWith('/token')) {
      assert.equal(request.payload.client_secret,'test-secret');
      assert.equal(request.followRedirects,false);
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({access_token:'server-only',id_token:'header.' + Buffer.from(JSON.stringify({...claims,nonce:currentNonce})).toString('base64url') + '.signature'})};
    }
    assert.equal(request.headers.Authorization,'Bearer server-only');
    return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(user)};
  }};
  const dispatch = (action,data={}) => c.adminDispatch_(action,data);
  const begin = () => {
    const proof = c.generateSecureToken_();
    const login = dispatch('adminBeginLogin',{proof});
    currentNonce = new URL(login.url).searchParams.get('nonce');
    return {proof,state:login.state,code:'one-use-google-code'};
  };
  const login = () => dispatch('adminCompleteLogin',begin());
  const session = () => {
    const credentials = login();
    return (action,data={}) => dispatch(action,{...data,...credentials});
  };
  return {...h,dispatch,begin,login,session,user,claims,logs,googleCalls:()=>googleCalls,
    holdLock: value=>{locked=value;}, setNonce:value=>{currentNonce=value;}};
}
module.exports = {adminHarness};
if (require.main === module) {
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function draft(call,kind='recovery',extra={}) {
  const state=call('adminState');
  return call('adminPrepare',{netId:state.net.id,revision:state.revision,kind,callsign:'KA8ZGE',reason:'Actual end verified from operator log.',...extra});
}
test('default configuration disables login; never infer credentials',()=>{
  const h=adminHarness(); h.properties.delete('W8FY_ADMIN_EMAILS');
  assert.throws(()=>h.login(),/not configured/);assert.equal(h.googleCalls(),0);
});
test('Google authorization code flow binds state, proof, PKCE, identity, and one-use exchange',()=>{
  const h=adminHarness(), attempt=h.begin();
  assert.throws(()=>h.dispatch('adminCompleteLogin',{...attempt,proof:'z'.repeat(43)}),/did not start/);
  assert.equal(h.googleCalls(),0);
  const session=h.dispatch('adminCompleteLogin',attempt);
  assert.equal(session.email,h.user.email);assert.equal(session.expires,Date.parse(now)+600000);
  assert.throws(()=>h.dispatch('adminCompleteLogin',attempt),/expired/);
  assert.equal(h.googleCalls(),2);
  const stored=h.properties.get('W8FY_ADMIN_SESSION_'+h.context.hashToken_(session.session));
  assert.ok(!stored.includes(session.session)&&!stored.includes(session.csrf));
});
test('non-allowlisted, unverified, third-party, wrong-subject and invalid token claims fail closed',()=>{
  for(const scenario of ['email','verified','thirdParty','sub','aud','iss','exp','missingExp']){
    const h=adminHarness();
    if(scenario==='email')h.user.email='stranger@gmail.com';
    if(scenario==='verified')h.user.email_verified=false;
    if(scenario==='thirdParty'){h.user.email='admin@example.test';h.properties.set('W8FY_ADMIN_EMAILS',h.user.email);}
    if(scenario==='sub')h.user.sub='other-subject';
    if(scenario==='aud')h.claims.aud='other-client';
    if(scenario==='iss')h.claims.iss='https://attacker.invalid';
    if(scenario==='exp')h.claims.exp=1;
    if(scenario==='missingExp')delete h.claims.exp;
    assert.throws(()=>h.login(),/not authorized|not be verified/,scenario);
  }
});
test('expired sign-in challenges, nonce mismatch and bounded brute-force exchanges',()=>{
  const h=adminHarness(), attempt=h.begin();
  h.setNonce('wrong');assert.throws(()=>h.dispatch('adminCompleteLogin',attempt),/not be verified/);
  const old=h.begin(), key='W8FY_ADMIN_LOGIN_'+h.context.hashToken_(old.state);
  const record=JSON.parse(h.properties.get(key));record.expires=1;h.properties.set(key,JSON.stringify(record));
  assert.throws(()=>h.dispatch('adminCompleteLogin',old),/expired/);
  for(let i=0;i<18;i++)assert.throws(()=>h.dispatch('adminCompleteLogin',attempt));
  assert.throws(()=>h.dispatch('adminCompleteLogin',attempt),/Too many/);
});
test('all privileged direct POST calls reject browser email, callsign, missing or expired sessions and CSRF',()=>{
  for(const action of ['adminState','adminPrepare','adminCommit','adminStatus','adminSignOut']){
    const h=adminHarness();
    const response=h.context.doPost({postData:{contents:JSON.stringify({action,data:{email:'admin@gmail.com',callsign:'KA8ZGE'}})}});
    assert.equal(response.success,false);assert.equal(h.sheets.has('AdminOperations'),false);
    const auth=h.login();
    assert.throws(()=>h.dispatch(action,{...auth,csrf:'z'.repeat(43)}),/unauthorized/);
    const key='W8FY_ADMIN_SESSION_'+h.context.hashToken_(auth.session), saved=JSON.parse(h.properties.get(key));
    saved.expires=1;h.properties.set(key,JSON.stringify(saved));
    assert.throws(()=>h.dispatch(action,auth),/expired/);
    assert.equal(h.context.doGet({parameter:{action}}).success,false);
  }
});
test('allowlist removal and explicit sign-out revoke every subsequent request',()=>{
  const h=adminHarness(),auth=h.login();
  h.properties.set('W8FY_ADMIN_EMAILS','other@gmail.com');
  assert.throws(()=>h.dispatch('adminState',auth),/unauthorized/);
  h.properties.set('W8FY_ADMIN_EMAILS','admin@gmail.com');
  h.dispatch('adminSignOut',auth);
  assert.throws(()=>h.dispatch('adminState',auth),/unauthorized/);
});
test('review is nonmutating, requires checked-in pending operator, reason and explicit confirmation',()=>{
  const h=adminHarness(), call=h.session(), before=h.readNet().net_control_callsign;
  assert.throws(()=>draft(call,'recovery',{reason:''}),/reason/);
  assert.throws(()=>draft(call,'recovery',{callsign:'NOTCHECKED'}),/checked-in/);
  const review=draft(call);
  assert.equal(h.readNet().net_control_callsign,before);
  assert.throws(()=>call('adminCommit',{operationId:review.id,confirm:'true'}),/confirmation/);
  assert.equal(h.context.getNetAdministration_(h.spreadsheet,netId).length,0);
});
test('ownership recovery preserves check-ins/history, records verified audit, revokes old owner, and reconciles duplicates',()=>{
  const h=adminHarness(),call=h.session();
  h.sheets.get('NetControlRequests').rows[1][3]=h.context.hashToken_('n'.repeat(43));
  const rows=JSON.stringify(h.sheets.get('CheckIns').rows), history=JSON.stringify(h.sheets.get('NetControlHistory').rows);
  const review=draft(call), data={operationId:review.id,confirm:true};
  const result=call('adminCommit',data);
  assert.equal(result.status,'applied');assert.equal(result.state.net.net_control_callsign,'KA8ZGE');
  assert.equal(JSON.stringify(h.sheets.get('CheckIns').rows),rows);assert.equal(JSON.stringify(h.sheets.get('NetControlHistory').rows),history);
  assert.equal(h.context.validateNetControlOwnership_(h.spreadsheet,{netId,ownerToken:token}).valid,false);
  assert.equal(h.context.validateNetControlOwnership_(h.spreadsheet,{netId,ownerToken:'n'.repeat(43)}).valid,true);
  const audit=h.context.getNetAdministration_(h.spreadsheet,netId)[0];
  assert.equal(audit.actor,'admin@gmail.com');assert.equal(audit.id,review.id);assert.equal(audit.reason,review.reason);
  const op=h.context.getRecords_(h.sheets.get('AdminOperations'),vm.runInContext('ADMIN_OPERATION_HEADERS',h.context))[0];
  assert.equal(op.previous_owner,'KC8QHK');assert.equal(op.next_owner,'KA8ZGE');assert.equal(op.subject,'verified-google-subject');
  assert.equal(call('adminStatus',{operationId:review.id}).status,'applied');
  assert.equal(call('adminCommit',data).status,'applied');assert.equal(h.context.getNetAdministration_(h.spreadsheet,netId).length,1);
  assert.equal(h.emails.length,0);assert.equal(h.context.getNetResponse_(h.spreadsheet,netId).checkIns.length,2);
});
test('concurrent administrator reviews and stale net/check-in selections cannot overwrite',()=>{
  const h=adminHarness(),first=h.session(),second=h.session(),a=draft(first),b=draft(second);
  first('adminCommit',{operationId:a.id,confirm:true});
  assert.throws(()=>second('adminCommit',{operationId:b.id,confirm:true}),/changed/);
  const state=second('adminState');h.sheets.get('CheckIns').rows[1][7]='changed name';
  assert.throws(()=>second('adminPrepare',{netId,revision:state.revision,kind:'recovery',reason:'Verified',callsign:'KC8QHK'}),/changed/);
  h.holdLock(true);assert.throws(()=>first('adminState'),/could not complete/);h.holdLock(false);
});
test('expired review and expired operator request cannot commit',()=>{
  const h=adminHarness(),call=h.session(),review=draft(call);
  const sheet=h.sheets.get('AdminOperations');sheet.rows[1][13]='2000-01-01T00:00:00Z';
  assert.throws(()=>call('adminCommit',{operationId:review.id,confirm:true}),/expired/);
  sheet.rows[1][13]='2026-09-05T12:05:00Z';h.sheets.get('NetControlRequests').rows[1][5]='2000-01-01T00:00:00Z';
  assert.throws(()=>call('adminCommit',{operationId:review.id,confirm:true}),/changed|expired/);
});
test('historical recovery/finalization shares display email PDF timing and never automatically sends',()=>{
  const h=adminHarness(),call=h.session();
  const recovery=draft(call);call('adminCommit',{operationId:recovery.id,confirm:true});
  const history=JSON.stringify(h.sheets.get('NetControlHistory').rows);
  const review=draft(call,'historical_finalization',{endAt:'2026-08-29T07:30:00-04:00',recoveryId:recovery.id});
  const result=call('adminCommit',{operationId:review.id,confirm:true});
  assert.equal(result.result.report.durationMinutes,35);assert.equal(result.state.net,null);
  assert.equal(result.result.report.netControlTimes.length,1);assert.equal(result.result.report.netControlTimes[0].callsign,'KC8QHK');
  assert.equal(JSON.stringify(h.sheets.get('NetControlHistory').rows),history);assert.equal(h.emails.length,0);
  h.context.sendReport_(h.spreadsheet,{netId,ownerToken:token});h.context.downloadReportPdf_(h.spreadsheet,{netId,ownerToken:token});
  assert.equal(h.emails[0][2],result.result.report.text);assert.equal(h.pdfLines.join('\n'),result.result.report.text);
});
for(const [label,date,start,end,minutes] of [
  ['same-day','2026-09-05','10:55','2026-09-05T11:30:00+00:00',35],
  ['overnight','2026-08-29','23:30','2026-08-30T00:15:00+00:00',45]
])test('direct '+label+' historical finalization without ownership transfer',()=>{
  const h=adminHarness({date,start}),call=h.session();
  const review=draft(call,'historical_finalization',{endAt:end});
  const result=call('adminCommit',{operationId:review.id,confirm:true});
  assert.equal(result.result.report.durationMinutes,minutes);assert.equal(result.result.net.net_date,date);
  assert.equal(h.context.getNetAdministration_(h.spreadsheet,netId)[0].actor,'admin@gmail.com');
});
test('legacy recovery must be explicitly identified; invalid ends never prepare changes',()=>{
  const h=adminHarness({legacy:true}),call=h.session();
  assert.throws(()=>draft(call,'historical_finalization',{endAt:'2026-08-29T11:30:00Z'}),/segments/);
  const good={endAt:'2026-08-29T11:30:00Z',recoveryId:id(4)};
  for(const endAt of ['', '2026-08-29T11:30:00', '2026-02-30T11:30:00Z', '2026-08-29T10:00:00Z','2026-09-05T11:30:00Z','2027-01-01T11:30:00Z'])assert.throws(()=>draft(call,'historical_finalization',{...good,endAt}));
  const review=draft(call,'historical_finalization',good);
  assert.equal(call('adminCommit',{operationId:review.id,confirm:true}).result.report.durationMinutes,35);
});
test('write failure rolls back net, access and audit, blocks automatic replay and competing prepared reviews',()=>{
  const h=adminHarness(),call=h.session(),review=draft(call),other=draft(call);
  h.context.ensureNetAdministrationSheet_(h.spreadsheet);
  const net=JSON.stringify(h.sheets.get('Nets').rows), access=JSON.stringify(h.sheets.get('NetControlAccess').rows);
  h.injectFailure();assert.throws(()=>call('adminCommit',{operationId:review.id,confirm:true}),/Reconcile/);
  assert.equal(JSON.stringify(h.sheets.get('Nets').rows),net);assert.equal(JSON.stringify(h.sheets.get('NetControlAccess').rows),access);
  assert.equal(h.context.getNetAdministration_(h.spreadsheet,netId).length,0);
  assert.equal(call('adminStatus',{operationId:review.id}).status,'applying');
  assert.throws(()=>call('adminCommit',{operationId:review.id,confirm:true}),/unresolved/);
  assert.throws(()=>call('adminCommit',{operationId:other.id,confirm:true}),/unresolved/);
  assert.throws(()=>draft(call),/unresolved/);
});
test('partial audit after interrupted write is not treated as successful',()=>{
  const h=adminHarness(),call=h.session(),review=draft(call);
  h.sheets.get('AdminOperations').rows[1][14]='applying';
  h.context.appendRecordTracked_(h.context.ensureNetAdministrationSheet_(h.spreadsheet),vm.runInContext('NET_ADMINISTRATION_HEADERS',h.context),{id:review.id,net_id:netId,kind:'recovery'});
  assert.equal(call('adminStatus',{operationId:review.id}).status,'applying');
  assert.throws(()=>call('adminCommit',{operationId:review.id,confirm:true}),/unresolved/);
});
test('verified administrator can close ordinary history with missing or revoked ownership',()=>{
  for(const missing of [false,true]){
    const h=adminHarness(),call=h.session();
    if(missing)h.sheets.get('NetControlAccess').rows.splice(1,1);
    else h.sheets.get('NetControlAccess').rows[1][6]=now;
    const review=draft(call,'historical_finalization',{endAt:'2026-08-29T11:30:00Z'});
    assert.equal(call('adminCommit',{operationId:review.id,confirm:true}).result.report.durationMinutes,35);
    assert.equal(h.context.validateNetControlOwnership_(h.spreadsheet,{netId,ownerToken:token}).valid,false);
  }
});
test('historical commit write failure restores net/access/audit and blocks repetition',()=>{
  const h=adminHarness(),call=h.session(),review=draft(call,'historical_finalization',{endAt:'2026-08-29T11:30:00Z'});
  const net=JSON.stringify(h.sheets.get('Nets').rows),access=JSON.stringify(h.sheets.get('NetControlAccess').rows);
  h.injectFailure();assert.throws(()=>call('adminCommit',{operationId:review.id,confirm:true}),/Reconcile/);
  assert.equal(JSON.stringify(h.sheets.get('Nets').rows),net);assert.equal(JSON.stringify(h.sheets.get('NetControlAccess').rows),access);
  assert.equal(h.context.getNetAdministration_(h.spreadsheet,netId).length,0);
  assert.equal(call('adminStatus',{operationId:review.id}).status,'applying');
});
test('provider errors cannot log code, client secret or tokens',()=>{
  const h=adminHarness(),attempt=h.begin();
  h.context.UrlFetchApp.fetch=()=>{throw Error('test-secret one-use-google-code server-only');};
  const response=h.context.doPost({postData:{contents:JSON.stringify({action:'adminCompleteLogin',data:attempt})}});
  assert.equal(response.success,false);
  assert.doesNotMatch(h.logs.join('\n')+JSON.stringify(response),/test-secret|one-use-google-code|server-only/);
});
console.log(passed+' administrator recovery tests passed');
}
