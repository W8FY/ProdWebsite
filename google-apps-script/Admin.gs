/** Administrator API. Copy alongside Code.gs. All helpers remain private.
 * Configuration and OAuth credentials live exclusively in Script Properties.
 */
const ADMIN_OPERATION_HEADERS = Object.freeze([
  'id', 'net_id', 'actor', 'subject', 'kind', 'previous_owner', 'next_owner',
  'reason', 'actual_end', 'recovery_id', 'revision', 'request_id',
  'created_at', 'expires_at', 'status'
]);
const ADMIN_SESSION_MS = 10 * 60 * 1000;

function adminConfig_() {
  const p = PropertiesService.getScriptProperties();
  const config = {
    clientId: p.getProperty('W8FY_ADMIN_GOOGLE_CLIENT_ID'),
    clientSecret: p.getProperty('W8FY_ADMIN_GOOGLE_CLIENT_SECRET'),
    redirectUri: p.getProperty('W8FY_ADMIN_REDIRECT_URI'),
    emails: String(p.getProperty('W8FY_ADMIN_EMAILS') || '').split(',').map(function (v) { return v.trim().toLowerCase(); }).filter(Boolean)
  };
  if (!config.clientId || !config.clientSecret || !/^https:\/\/[^?#]+\/recover\.html$/.test(config.redirectUri || '') || !config.emails.length) {
    throw new PublicError('Administrator sign-in is not configured. Contact the backend owner.');
  }
  return config;
}

function adminRead_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value ? JSON.parse(value) : null;
}
function adminWrite_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(value));
}
function adminRate_(name, limit) {
  const key = 'W8FY_ADMIN_RATE_' + name;
  const rate = adminRead_(key) || {until: 0, count: 0};
  if (rate.until <= Date.now()) { rate.until = Date.now() + 60000; rate.count = 0; }
  rate.count++;
  adminWrite_(key, rate);
  if (rate.count > limit) throw new PublicError('Too many administrator requests. Wait a minute and try again.');
}
function adminClean_() {
  const p = PropertiesService.getScriptProperties();
  const values = p.getProperties();
  Object.keys(values).filter(function (k) { return /^W8FY_ADMIN_(LOGIN|SESSION)_/.test(k); }).forEach(function (k) {
    if (JSON.parse(values[k]).expires <= Date.now()) p.deleteProperty(k);
  });
}

function adminBeginLogin_(data) {
  const config = adminConfig_();
  adminRate_('LOGIN', 10);
  adminClean_();
  const proof = requireRawToken_(data.proof, 'Sign-in challenge');
  const state = generateSecureToken_(), nonce = generateSecureToken_(), verifier = generateSecureToken_();
  adminWrite_('W8FY_ADMIN_LOGIN_' + hashToken_(state), {
    proofHash: hashToken_(proof), nonce: nonce, verifier: verifier, expires: Date.now() + 5 * 60000
  });
  const params = {
    client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code',
    scope: 'openid email', state: state, nonce: nonce, prompt: 'select_account',
    code_challenge: hashToken_(verifier), code_challenge_method: 'S256'
  };
  return {state: state, url: 'https://accounts.google.com/o/oauth2/v2/auth?' + Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&')};
}

function adminGoogleJson_(url, options) {
  // Never propagate Google response bodies, codes, secrets, or tokens into logs.
  try {
    const response = UrlFetchApp.fetch(url, Object.assign({muteHttpExceptions: true, followRedirects: false}, options));
    if (response.getResponseCode() !== 200) throw new Error('Rejected');
    return JSON.parse(response.getContentText());
  } catch (_) { throw new PublicError('Google sign-in could not be verified. Start sign-in again.'); }
}

function adminCompleteLogin_(data) {
  const config = adminConfig_();
  adminRate_('EXCHANGE', 20);
  const state = requireRawToken_(data.state, 'Sign-in state');
  const proof = requireRawToken_(data.proof, 'Sign-in challenge');
  const key = 'W8FY_ADMIN_LOGIN_' + hashToken_(state), login = adminRead_(key);
  if (!login || login.expires <= Date.now() || !constantTimeEqual_(login.proofHash, hashToken_(proof))) {
    throw new PublicError('Sign-in expired or did not start in this browser. Start sign-in again.');
  }
  PropertiesService.getScriptProperties().deleteProperty(key); // single-use even on failure
  if (typeof data.code !== 'string' || !data.code || data.code.length > 4096) throw new PublicError('Invalid sign-in response.');
  const tokens = adminGoogleJson_('https://oauth2.googleapis.com/token', {
    method: 'post', payload: {code: data.code, client_id: config.clientId, client_secret: config.clientSecret,
      redirect_uri: config.redirectUri, grant_type: 'authorization_code', code_verifier: login.verifier}
  });
  // These claims come ONLY from Google's authenticated TLS token endpoint,
  // never from a browser JWT. UserInfo independently binds the verified subject.
  let claims;
  try { claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(tokens.id_token.split('.')[1])).getDataAsString()); }
  catch (_) { throw new PublicError('Google sign-in could not be verified.'); }
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) || claims.aud !== config.clientId ||
      (claims.azp && claims.azp !== config.clientId) || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now() ||
      !constantTimeEqual_(claims.nonce, login.nonce) || !tokens.access_token) throw new PublicError('Google sign-in could not be verified.');
  const user = adminGoogleJson_('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {Authorization: 'Bearer ' + tokens.access_token}
  });
  const email = String(user.email || '').toLowerCase();
  if (!user.sub || user.sub !== claims.sub || user.email_verified !== true ||
      (!email.endsWith('@gmail.com') && !user.hd) || !config.emails.includes(email)) {
    throw new PublicError('This Google account is not authorized for administrator recovery.');
  }
  const session = generateSecureToken_(), csrf = generateSecureToken_();
  const expires = Math.min(Date.now() + ADMIN_SESSION_MS, claims.exp * 1000);
  adminWrite_('W8FY_ADMIN_SESSION_' + hashToken_(session), {email: email, sub: user.sub, csrfHash: hashToken_(csrf), expires: expires});
  return {session: session, csrf: csrf, email: email, expires: expires};
}

function adminAuthenticate_(data) {
  const config = adminConfig_();
  const token = requireRawToken_(data.session, 'Administrator session');
  const csrf = requireRawToken_(data.csrf, 'Administrator request proof');
  const key = 'W8FY_ADMIN_SESSION_' + hashToken_(token), session = adminRead_(key);
  if (!session || session.expires <= Date.now() || !config.emails.includes(session.email) ||
      !constantTimeEqual_(session.csrfHash, hashToken_(csrf))) throw new PublicError('Administrator session expired or unauthorized. Sign in again.');
  return Object.assign({key: key}, session);
}

function adminOperations_(spreadsheet) {
  ensureSheet_(spreadsheet, 'AdminOperations', ADMIN_OPERATION_HEADERS, [1,2,3,4,5,6,7,8,9,10,11,12,15]);
  return spreadsheet.getSheetByName('AdminOperations');
}
function adminRevision_(spreadsheet, net) {
  return hashToken_(JSON.stringify([
    net, getCheckInsForNet_(spreadsheet, net.id), findNetControlAccess_(spreadsheet, net.id),
    getNetControlHistoryForNet_(spreadsheet, net.id), getNetAdministration_(spreadsheet, net.id),
    getRecords_(spreadsheet.getSheetByName(W8FY_CONFIG.netControlRequestsSheet), NET_CONTROL_REQUEST_HEADERS).filter(function (r) { return r.net_id === net.id; })
  ]));
}
function adminState_(spreadsheet) {
  const net = findActiveNet_(spreadsheet);
  if (!net) return {net: null, nextAction: 'Return to the roster to start a new net.'};
  const payload = buildNetPayload_(spreadsheet, net);
  payload.revision = adminRevision_(spreadsheet, net);
  payload.pending = getRecords_(spreadsheet.getSheetByName(W8FY_CONFIG.netControlRequestsSheet), NET_CONTROL_REQUEST_HEADERS)
    .filter(function (r) { return r.net_id === net.id && r.status === 'pending' && dateValue_(r.expires_at).getTime() > Date.now(); })
    .map(function (r) { return {id: r.id, callsign: r.callsign}; });
  payload.recoveries = getNetAdministration_(spreadsheet, net.id).filter(function (r) { return r.kind === 'recovery' && r.owner_callsign === net.net_control_callsign; })
    .map(function (r) { return {id: r.id, label: 'Administrative recovery: ' + r.owner_callsign + ' at ' + r.recorded_at}; });
  const access = findNetControlAccess_(spreadsheet, net.id);
  if (access) getNetControlHistoryForNet_(spreadsheet, net.id).filter(function (r) {
    return r.callsign === net.net_control_callsign && !r.ended_at && sameMinute_(r.started_at, access.issued_at);
  }).forEach(function (r) { payload.recoveries.push({id: r.id, label: 'Only if this was an editor recovery, not on-air service: ' + r.callsign + ' at ' + r.started_at}); });
  payload.nextAction = 'Recover ownership or finalize with the actual service end.';
  return payload;
}

function adminHistoricalData_(operation) {
  return {NET_HISTORICAL_NET_ID: operation.net_id, NET_HISTORICAL_END_AT: operation.actual_end,
    NET_HISTORICAL_RECOVERY_ID: operation.recovery_id, NET_HISTORICAL_REASON: operation.reason};
}
function adminPrepare_(spreadsheet, data, session) {
  const net = requireNet_(spreadsheet, requireUuid_(data.netId, 'netId'));
  requireOpenNet_(net);
  if (!constantTimeEqual_(adminRevision_(spreadsheet, net), data.revision)) throw new PublicError('The net changed. Reload it and review again.');
  const sheet = adminOperations_(spreadsheet);
  if (getRecords_(sheet, ADMIN_OPERATION_HEADERS).some(function (o) {
    return o.net_id === net.id && ['applying','uncertain'].includes(o.status);
  })) throw new PublicError('A previous operation has an unresolved result. Ask the backend owner to inspect AdminOperations before another recovery.');
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (!reason || reason.length > 500 || /^[=+@-]/.test(reason)) throw new PublicError('Enter a reason of 1–500 characters, beginning with a word.');
  const operation = {id: Utilities.getUuid(), net_id: net.id, actor: session.email, subject: session.sub,
    kind: data.kind, previous_owner: net.net_control_callsign, next_owner: net.net_control_callsign,
    reason: reason, actual_end: '', recovery_id: '', revision: data.revision, request_id: '',
    created_at: new Date(), expires_at: new Date(Math.min(session.expires, Date.now() + 5 * 60000)), status: 'prepared'};
  if (data.kind === 'recovery') {
    const callsign = requireCallsign_(data.callsign);
    if (callsign === net.net_control_callsign || !getCheckInsForNet_(spreadsheet, net.id).some(function (r) { return r.callsign === callsign; })) throw new PublicError('Select a different checked-in operator.');
    const request = getRecords_(spreadsheet.getSheetByName(W8FY_CONFIG.netControlRequestsSheet), NET_CONTROL_REQUEST_HEADERS).find(function (r) {
      return r.net_id === net.id && r.callsign === callsign && r.status === 'pending' && dateValue_(r.expires_at).getTime() > Date.now();
    });
    if (!request) throw new PublicError('The selected operator must use Request Net Control in their roster browser first. Then reload this panel.');
    operation.next_owner = callsign; operation.request_id = request.id;
  } else if (data.kind === 'historical_finalization') {
    operation.actual_end = data.endAt;
    operation.recovery_id = data.recoveryId || '';
    if (getNetAdministration_(spreadsheet, net.id).some(function (r) { return r.kind === 'recovery'; }) && !operation.recovery_id) throw new PublicError('Select the current administrative recovery record.');
    finalizeHistoricalNet_(spreadsheet, adminHistoricalData_(operation), {actor: session.email, validateOnly: true});
  } else throw new PublicError('Unsupported administrator action.');
  appendRecordTracked_(sheet, ADMIN_OPERATION_HEADERS, operation);
  SpreadsheetApp.flush();
  return adminReview_(operation);
}
function adminReview_(operation) {
  return {id: operation.id, netId: operation.net_id, kind: operation.kind, previousOwner: operation.previous_owner,
    nextOwner: operation.next_owner, reason: operation.reason, actualEnd: operation.actual_end,
    recoveryId: operation.recovery_id, expires: dateValue_(operation.expires_at).toISOString(),
    changes: operation.kind === 'recovery'
      ? 'Transfer administrative ownership from ' + operation.previous_owner + ' to ' + operation.next_owner + '. The previous ownership token stops working. The selected operator receives access through their pending request. This records no on-air service; historical finalization is required next.'
      : 'Close this net at the explicitly supplied actual service end. Reports count only supported on-air service through that end. Any selected administrative recovery segment is excluded from operating minutes.',
    preserved: 'Preserve all check-ins, original net date and service history. Record your verified identity, reason and changes in the audit trail. No email will be sent.'};
}
function adminOperation_(spreadsheet, data, session) {
  const id = requireUuid_(data.operationId, 'operationId');
  const operation = getRecords_(adminOperations_(spreadsheet), ADMIN_OPERATION_HEADERS).find(function (r) { return r.id === id; });
  if (!operation || operation.subject !== session.sub || operation.actor !== session.email) throw new PublicError('Operation not found for this administrator.');
  return operation;
}
function adminStatus_(spreadsheet, operation) {
  const applied = operation.status === 'applied' && getNetAdministration_(spreadsheet, operation.net_id).some(function (a) { return a.id === operation.id; });
  return {id: operation.id, status: applied ? 'applied' : operation.status,
    state: adminState_(spreadsheet), result: applied ? getNetResponse_(spreadsheet, operation.net_id) : null};
}
function adminCommit_(spreadsheet, data, session) {
  const operation = adminOperation_(spreadsheet, data, session);
  if (operation.status === 'applied') return adminStatus_(spreadsheet, operation);
  if (data.confirm !== true) throw new PublicError('Explicit confirmation is required.');
  if (operation.status !== 'prepared') throw new PublicError('Operation result is unresolved. Reconcile before another attempt.');
  if (getRecords_(adminOperations_(spreadsheet), ADMIN_OPERATION_HEADERS).some(function (o) {
    return o.net_id === operation.net_id && ['applying','uncertain'].includes(o.status);
  })) throw new PublicError('Another operation has an unresolved result. Reconcile it before continuing.');
  if (dateValue_(operation.expires_at).getTime() <= Date.now()) throw new PublicError('Review expired. Reload the net and review again.');
  const net = requireNet_(spreadsheet, operation.net_id);
  requireOpenNet_(net);
  if (!constantTimeEqual_(operation.revision, adminRevision_(spreadsheet, net))) throw new PublicError('The net changed after review. Reload and review again.');
  let request;
  if (operation.kind === 'recovery') {
    request = getRecords_(spreadsheet.getSheetByName(W8FY_CONFIG.netControlRequestsSheet), NET_CONTROL_REQUEST_HEADERS).find(function (r) { return r.id === operation.request_id; });
    if (!request || request.status !== 'pending' || dateValue_(request.expires_at).getTime() <= Date.now()) throw new PublicError('Operator request expired. Ask them to request again and reload.');
  } else finalizeHistoricalNet_(spreadsheet, adminHistoricalData_(operation), {actor: session.email, validateOnly: true});
  const sheet = adminOperations_(spreadsheet);
  setRecordCells_(sheet, operation._rowNumber, ADMIN_OPERATION_HEADERS, {status: 'applying'});
  SpreadsheetApp.flush();
  const administrator = {actor: session.email, operationId: operation.id, reason: operation.reason};
  if (operation.kind === 'recovery') approveNetControlRequest_(spreadsheet, net, findNetControlAccess_(spreadsheet, net.id), request, administrator);
  else finalizeHistoricalNet_(spreadsheet, adminHistoricalData_(operation), administrator);
  // Mark complete only AFTER the entire transaction and report reload succeed.
  // An audit alone is insufficient: execution could stop between sheet writes.
  setRecordCells_(sheet, operation._rowNumber, ADMIN_OPERATION_HEADERS, {status: 'applied'});
  SpreadsheetApp.flush();
  operation.status = 'applied';
  return adminStatus_(spreadsheet, operation);
}

function adminDispatch_(action, data) {
  // No ambient cookie identity: session + independent CSRF proof are mandatory
  // in POST bodies. The public GET API cannot perform privileged operations.
  try {
    return withScriptLock_(function () {
      if (action === 'adminBeginLogin') return adminBeginLogin_(data);
      if (action === 'adminCompleteLogin') return adminCompleteLogin_(data);
      const session = adminAuthenticate_(data);
      if (action === 'adminSignOut') { PropertiesService.getScriptProperties().deleteProperty(session.key); return {signedOut: true}; }
      adminRate_('USER_' + hashToken_(session.sub), 60);
      const spreadsheet = getConfiguredSpreadsheet_();
      ensureApplicationSheets_(spreadsheet);
      switch (action) {
        case 'adminState': return adminState_(spreadsheet);
        case 'adminPrepare': return adminPrepare_(spreadsheet, data, session);
        case 'adminCommit': return adminCommit_(spreadsheet, data, session);
        case 'adminStatus': return adminStatus_(spreadsheet, adminOperation_(spreadsheet, data, session));
        default: throw new PublicError('Unsupported administrator action.');
      }
    });
  } catch (error) {
    // Do not let provider/library exceptions containing credentials reach the
    // general API logger. Only deliberately constructed public errors escape.
    if (error instanceof PublicError) throw error;
    throw new PublicError('Administrator request could not complete. Reconcile any pending action before continuing.');
  }
}
