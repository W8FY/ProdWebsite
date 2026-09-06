/**
 * W8FY Amateur Radio Net Check-In — Google Apps Script backend
 *
 * Copy this file into a container-bound Apps Script project attached to the
 * Google Sheet named "W8FY Net Check-In Database". Run setupW8FYDatabase()
 * once before deploying the script as a web app.
 *
 * Finalized reports can be emailed or generated as operator-requested PDFs.
 */

const W8FY_CONFIG = Object.freeze({
  spreadsheetProperty: 'W8FY_SPREADSHEET_ID',
  netsSheet: 'Nets',
  checkInsSheet: 'CheckIns',
  callsignDirectorySheet: 'CallsignDirectory',
  netControlAccessSheet: 'NetControlAccess',
  netControlRequestsSheet: 'NetControlRequests',
  netControlHistorySheet: 'NetControlHistory',
  netAdministrationSheet: 'NetAdministration',
  reportRecipient: 'info@w8fy.org',
  stationTypes: Object.freeze(['Home', 'Mobile', 'EchoLink', 'Short Time']),
  netTypes: Object.freeze(['current', 'two_meter_ncs', 'weather_special']),
  netTypeNames: Object.freeze({
    current: 'Current Net',
    two_meter_ncs: '2 Meter NCS Net',
    weather_special: 'Weather/Special Net'
  }),
  maxCallsignLength: 20,
  maxNoteLength: 80,
  lockTimeoutMs: 30000,
  requestLifetimeMs: 10 * 60 * 1000,
  activeAccessLifetimeMs: 30 * 24 * 60 * 60 * 1000,
  finalizedAccessLifetimeMs: 7 * 24 * 60 * 60 * 1000
});

const NET_HEADERS = Object.freeze([
  'id',
  'net_date',
  'net_control_callsign',
  'net_control_station_type',
  'net_control_traffic',
  'start_time',
  'end_time',
  'finalized',
  'email_sent',
  'email_sent_at',
  'created_at',
  'updated_at',
  'net_type'
]);

const CHECKIN_HEADERS = Object.freeze([
  'id',
  'net_id',
  'callsign',
  'station_type',
  'traffic',
  'is_net_control',
  'created_at',
  'name',
  'note'
]);

const CALLSIGN_DIRECTORY_HEADERS = Object.freeze([
  'callsign',
  'name',
  'updated_at'
]);

const NET_CONTROL_ACCESS_HEADERS = Object.freeze([
  'net_id',
  'owner_callsign',
  'token_hash',
  'issued_at',
  'updated_at',
  'expires_at',
  'revoked_at'
]);

const NET_CONTROL_REQUEST_HEADERS = Object.freeze([
  'id',
  'net_id',
  'callsign',
  'token_hash',
  'created_at',
  'expires_at',
  'status',
  'decided_at'
]);

const NET_CONTROL_HISTORY_HEADERS = Object.freeze([
  'id',
  'net_id',
  'callsign',
  'started_at',
  'ended_at'
]);

// Append-only administrative audit. It is separate from on-air service history.
const NET_ADMINISTRATION_HEADERS = Object.freeze([
  'id', 'net_id', 'kind', 'recorded_at', 'actor', 'owner_callsign',
  'recovery_id', 'service_end_at', 'reason'
]);

const LEGACY_NET_HEADERS = Object.freeze(NET_HEADERS.slice(0, 12));
const LEGACY_CHECKIN_HEADERS = Object.freeze(CHECKIN_HEADERS.slice(0, 7));

const GET_ACTIONS = Object.freeze(['health', 'getActiveNet', 'getNet', 'lookupCallsign']);
const POST_ACTIONS = Object.freeze([
  'createNet',
  'validateNetControlOwnership',
  'requestNetControl',
  'getNetControlRequestStatus',
  'getPendingNetControlRequests',
  'decideNetControlRequest',
  'releaseNetControlOwnership',
  'addCheckIn',
  'updateCheckInNote',
  'removeCheckIn',
  'finalizeNet',
  'sendReport',
  'downloadReportPdf',
  'adminBeginLogin', 'adminCompleteLogin', 'adminState', 'adminPrepare',
  'adminCommit', 'adminStatus', 'adminSignOut'
]);

/**
 * One-time setup. Run this function from the Apps Script editor while the
 * target spreadsheet is open. It stores the spreadsheet ID in Script
 * Properties and creates/verifies the application sheets.
 */
function setupW8FYDatabase() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Open the target Google Sheet and use Extensions > Apps Script before running setup.');
  }

  PropertiesService.getScriptProperties().setProperty(
    W8FY_CONFIG.spreadsheetProperty,
    spreadsheet.getId()
  );
  ensureApplicationSheets_(spreadsheet);

  return {
    success: true,
    message: 'W8FY Net Check-In sheets are ready.',
    sheets: getApplicationSheetNames_()
  };
}

/**
 * One-time Stage 1 production migration. It validates the legacy schema,
 * creates a versioned copy of the complete spreadsheet, appends only the new
 * headers, and verifies that every pre-existing Nets/CheckIns cell is intact.
 * Run this manually from the Apps Script editor before deploying code that
 * expects the expanded schema.
 */
function migrateW8FYStage1Schema() {
  const spreadsheet = getConfiguredSpreadsheet_();

  return withScriptLock_(function () {
    const migration = inspectStage1Migration_(spreadsheet);
    if (!migration.required) {
      ensureApplicationSheets_(spreadsheet);
      return {
        success: true,
        changed: false,
        message: 'The W8FY Stage 1 schema is already installed.',
        backupId: '',
        backupUrl: '',
        sheets: getApplicationSheetNames_()
      };
    }

    const legacyData = captureLegacyData_(migration.netsSheet, migration.checkInsSheet);
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    const backup = spreadsheet.copy(spreadsheet.getName() + ' - Pre Stage 1 Backup - ' + timestamp);

    try {
      verifyBackupData_(backup, legacyData);
    } catch (error) {
      console.error('W8FY Stage 1 backup verification failed for ' + backup.getId() + ':', error && error.stack ? error.stack : error);
      throw new Error(
        'Stage 1 migration stopped because the backup could not be verified. Production was not modified. ' +
        'The unverified copy is at ' + backup.getUrl() + '. Original error: ' + error.message
      );
    }

    try {
      appendStage1Headers_(migration.netsSheet, migration.checkInsSheet);
      ensureSheet_(
        spreadsheet,
        W8FY_CONFIG.callsignDirectorySheet,
        CALLSIGN_DIRECTORY_HEADERS,
        [1, 2]
      );
      SpreadsheetApp.flush();
      ensureApplicationSheets_(spreadsheet);
      verifyLegacyDataUnchanged_(migration.netsSheet, migration.checkInsSheet, legacyData);
    } catch (error) {
      console.error('W8FY Stage 1 migration failed after backup ' + backup.getId() + ':', error && error.stack ? error.stack : error);
      throw new Error(
        'Stage 1 migration failed. The production spreadsheet may be partially migrated. ' +
        'A pre-migration backup was created at ' + backup.getUrl() + '. Original error: ' + error.message
      );
    }

    return {
      success: true,
      changed: true,
      message: 'W8FY Stage 1 schema installed and legacy data verified unchanged.',
      backupId: backup.getId(),
      backupUrl: backup.getUrl(),
      sheets: getApplicationSheetNames_()
    };
  });
}

/** Handles read-only web-app actions. */
function doGet(e) {
  return handleApiRequest_(function () {
    const action = requireAction_(e && e.parameter ? e.parameter.action : '', GET_ACTIONS);
    const spreadsheet = getConfiguredSpreadsheet_();
    ensureApplicationSheets_(spreadsheet);

    switch (action) {
      case 'health':
        return {
          status: 'ok',
          service: 'W8FY Net Check-In API',
          sheets: getApplicationSheetNames_(),
          emailEnabled: true,
          pdfEnabled: true,
          callsignLookupEnabled: true,
          netTypes: W8FY_CONFIG.netTypes.slice()
        };
      case 'getActiveNet':
        return getActiveNetResponse_(spreadsheet);
      case 'getNet':
        return getNetResponse_(spreadsheet, requireUuid_(e.parameter.netId, 'netId'));
      case 'lookupCallsign':
        return lookupCallsign_(spreadsheet, e.parameter.callsign);
      default:
        throw new PublicError('Unsupported GET action.');
    }
  });
}

/** Handles state-changing web-app actions using a JSON request body. */
function doPost(e) {
  return handleApiRequest_(function () {
    const body = parseJsonBody_(e);
    const action = requireAction_(body.action, POST_ACTIONS);
    const data = isPlainObject_(body.data) ? body.data : body;

    if (action.indexOf('admin') === 0) return adminDispatch_(action, data);

    const spreadsheet = getConfiguredSpreadsheet_();
    ensureApplicationSheets_(spreadsheet);

    switch (action) {
      case 'createNet':
        return withScriptLock_(function () { return createNet_(spreadsheet, data); });
      case 'validateNetControlOwnership':
        return withScriptLock_(function () { return validateNetControlOwnership_(spreadsheet, data); });
      case 'requestNetControl':
        return withScriptLock_(function () { return requestNetControl_(spreadsheet, data); });
      case 'getNetControlRequestStatus':
        return withScriptLock_(function () { return getNetControlRequestStatus_(spreadsheet, data); });
      case 'getPendingNetControlRequests':
        return withScriptLock_(function () { return getPendingNetControlRequests_(spreadsheet, data); });
      case 'decideNetControlRequest':
        return withScriptLock_(function () { return decideNetControlRequest_(spreadsheet, data); });
      case 'releaseNetControlOwnership':
        return withScriptLock_(function () { return releaseNetControlOwnership_(spreadsheet, data); });
      case 'addCheckIn':
        return withScriptLock_(function () { return addCheckIn_(spreadsheet, data); });
      case 'updateCheckInNote':
        return withScriptLock_(function () { return updateCheckInNote_(spreadsheet, data); });
      case 'removeCheckIn':
        return withScriptLock_(function () { return removeCheckIn_(spreadsheet, data); });
      case 'finalizeNet':
        return withScriptLock_(function () { return finalizeNet_(spreadsheet, data); });
      case 'sendReport':
        return withScriptLock_(function () { return sendReport_(spreadsheet, data); });
      case 'downloadReportPdf':
        return withScriptLock_(function () { return downloadReportPdf_(spreadsheet, data); });
      default:
        throw new PublicError('Unsupported POST action.');
    }
  });
}

function createNet_(spreadsheet, data) {
  const existingActive = findActiveNet_(spreadsheet);
  if (existingActive) {
    throw new PublicError('An active net already exists. Finalize it before starting another net.');
  }

  const netDate = requireDate_(readField_(data, ['netDate', 'net_date']), 'netDate');
  const netType = requireNetType_(readField_(data, ['netType', 'net_type']));
  const callsign = requireCallsign_(readField_(data, ['netControlCallsign', 'net_control_callsign']));
  const name = normalizeOptionalText_(readField_(data, ['netControlName', 'net_control_name', 'name']), 'netControlName');
  const stationType = requireStationType_(readField_(data, ['netControlStationType', 'netControlStation', 'net_control_station_type']));
  const traffic = requireBoolean_(readField_(data, ['netControlTraffic', 'net_control_traffic']), 'netControlTraffic');
  const startTime = requireTime_(readField_(data, ['startTime', 'start_time']) || currentTime_(), 'startTime');
  const now = new Date();
  const netId = Utilities.getUuid();
  const checkInId = Utilities.getUuid();
  const ownerToken = generateSecureToken_();
  const netsSheet = spreadsheet.getSheetByName(W8FY_CONFIG.netsSheet);
  const checkInsSheet = spreadsheet.getSheetByName(W8FY_CONFIG.checkInsSheet);
  const accessSheet = spreadsheet.getSheetByName(W8FY_CONFIG.netControlAccessSheet);
  const historySheet = spreadsheet.getSheetByName(W8FY_CONFIG.netControlHistorySheet);

  const netRecord = {
    id: netId,
    net_date: netDate,
    net_control_callsign: callsign,
    net_control_station_type: stationType,
    net_control_traffic: traffic,
    start_time: startTime,
    end_time: '',
    finalized: false,
    email_sent: false,
    email_sent_at: '',
    created_at: now,
    updated_at: now,
    net_type: netType
  };
  const controlRecord = {
    id: checkInId,
    net_id: netId,
    callsign: callsign,
    station_type: stationType,
    traffic: traffic,
    is_net_control: true,
    created_at: now,
    name: name,
    note: ''
  };
  const accessRecord = {
    net_id: netId,
    owner_callsign: callsign,
    token_hash: hashToken_(ownerToken),
    issued_at: now,
    updated_at: now,
    expires_at: new Date(now.getTime() + W8FY_CONFIG.activeAccessLifetimeMs),
    revoked_at: ''
  };
  const historyRecord = {
    id: Utilities.getUuid(),
    net_id: netId,
    callsign: callsign,
    started_at: netDateTime_(netDate, startTime),
    ended_at: ''
  };

  const appendedRows = [];
  let payload;
  try {
    appendedRows.push(appendRecordTracked_(netsSheet, NET_HEADERS, netRecord));
    appendedRows.push(appendRecordTracked_(checkInsSheet, CHECKIN_HEADERS, controlRecord));
    appendedRows.push(appendRecordTracked_(accessSheet, NET_CONTROL_ACCESS_HEADERS, accessRecord));
    appendedRows.push(appendRecordTracked_(historySheet, NET_CONTROL_HISTORY_HEADERS, historyRecord));
    SpreadsheetApp.flush();
    payload = buildNetPayload_(spreadsheet, netRecord);
  } catch (error) {
    rollbackAppendedRows_(appendedRows);
    throw error;
  }

  payload.ownerToken = ownerToken;
  return payload;
}

function addCheckIn_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const net = requireNet_(spreadsheet, netId);
  requireOpenNet_(net);
  requireNetControlOwnership_(spreadsheet, net, readField_(data, ['ownerToken', 'owner_token']));

  const callsign = requireCallsign_(data.callsign);
  const name = normalizeOptionalText_(data.name, 'name');
  const stationType = requireStationType_(readField_(data, ['stationType', 'station_type']));
  const traffic = requireBoolean_(data.traffic, 'traffic');
  const note = requireNote_(data.note, net.net_type);
  const checkIns = getCheckInsForNet_(spreadsheet, netId);
  if (checkIns.some(function (entry) { return entry.callsign === callsign; })) {
    throw new PublicError(callsign + ' is already checked into this net.');
  }

  const record = {
    id: Utilities.getUuid(),
    net_id: netId,
    callsign: callsign,
    station_type: stationType,
    traffic: traffic,
    is_net_control: false,
    created_at: new Date(),
    name: name,
    note: note
  };
  appendRecord_(spreadsheet.getSheetByName(W8FY_CONFIG.checkInsSheet), CHECKIN_HEADERS, record);
  return publicRecord_(record);
}

function validateNetControlOwnership_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const net = requireNet_(spreadsheet, netId);
  const access = findNetControlAccess_(spreadsheet, netId);
  const token = readField_(data, ['ownerToken', 'owner_token']);
  if (!access || access.owner_callsign !== String(net.net_control_callsign).trim().toUpperCase() ||
      !isValidOwnershipToken_(access, token, new Date())) {
    return { valid: false, netId: netId, ownerCallsign: '' };
  }
  return {
    valid: true,
    netId: netId,
    ownerCallsign: access.owner_callsign,
    finalized: Boolean(net.finalized),
    expiresAt: access.expires_at
  };
}

function requestNetControl_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const callsign = requireCallsign_(data.callsign);
  const net = requireNet_(spreadsheet, netId);
  requireOpenNet_(net);
  if (!getCheckInsForNet_(spreadsheet, netId).some(function (entry) { return entry.callsign === callsign; })) {
    throw new PublicError('Only an operator already checked into this net may request Net Control.');
  }
  if (callsign === String(net.net_control_callsign).trim().toUpperCase()) {
    throw new PublicError(callsign + ' is already the current Net Control.');
  }

  const now = new Date();
  expirePendingRequests_(spreadsheet, netId, now);
  const requestsSheet = spreadsheet.getSheetByName(W8FY_CONFIG.netControlRequestsSheet);
  const existing = getRecords_(requestsSheet, NET_CONTROL_REQUEST_HEADERS).find(function (entry) {
    return entry.net_id === netId && entry.callsign === callsign && entry.status === 'pending';
  });
  if (existing) {
    throw new PublicError('A pending Net Control request already exists for ' + callsign + '.');
  }

  const requestToken = generateSecureToken_();
  const request = {
    id: Utilities.getUuid(),
    net_id: netId,
    callsign: callsign,
    token_hash: hashToken_(requestToken),
    created_at: now,
    expires_at: new Date(now.getTime() + W8FY_CONFIG.requestLifetimeMs),
    status: 'pending',
    decided_at: ''
  };
  appendRecord_(requestsSheet, NET_CONTROL_REQUEST_HEADERS, request);
  return {
    requestId: request.id,
    netId: netId,
    callsign: callsign,
    requestToken: requestToken,
    status: request.status,
    createdAt: now.toISOString(),
    expiresAt: request.expires_at.toISOString()
  };
}

function getNetControlRequestStatus_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const requestId = requireUuid_(readField_(data, ['requestId', 'request_id']), 'requestId');
  const requestToken = requireRawToken_(readField_(data, ['requestToken', 'request_token']), 'requestToken');
  const sheet = spreadsheet.getSheetByName(W8FY_CONFIG.netControlRequestsSheet);
  let request = getRecords_(sheet, NET_CONTROL_REQUEST_HEADERS).find(function (entry) {
    return entry.id === requestId && entry.net_id === netId;
  });
  if (!request || !constantTimeEqual_(request.token_hash, hashToken_(requestToken))) {
    throw new PublicError('The Net Control request is invalid or no longer available.');
  }
  request = expireRequestIfNeeded_(sheet, request, new Date());
  return publicNetControlRequest_(request);
}

function getPendingNetControlRequests_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const net = requireNet_(spreadsheet, netId);
  requireOpenNet_(net);
  requireNetControlOwnership_(spreadsheet, net, readField_(data, ['ownerToken', 'owner_token']));
  expirePendingRequests_(spreadsheet, netId, new Date());
  return getRecords_(
    spreadsheet.getSheetByName(W8FY_CONFIG.netControlRequestsSheet),
    NET_CONTROL_REQUEST_HEADERS
  ).filter(function (entry) {
    return entry.net_id === netId && entry.status === 'pending';
  }).map(publicNetControlRequest_);
}

function decideNetControlRequest_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const requestId = requireUuid_(readField_(data, ['requestId', 'request_id']), 'requestId');
  const decision = normalizeRequestDecision_(data.decision);
  const net = requireNet_(spreadsheet, netId);
  requireOpenNet_(net);
  const access = requireNetControlOwnership_(spreadsheet, net, readField_(data, ['ownerToken', 'owner_token']));
  const sheet = spreadsheet.getSheetByName(W8FY_CONFIG.netControlRequestsSheet);
  let request = getRecords_(sheet, NET_CONTROL_REQUEST_HEADERS).find(function (entry) {
    return entry.id === requestId && entry.net_id === netId;
  });
  if (!request) throw new PublicError('Net Control request not found.');
  request = expireRequestIfNeeded_(sheet, request, new Date());
  if (request.status !== 'pending') throw new PublicError('This Net Control request is no longer pending.');

  if (decision === 'denied') {
    const decidedAt = new Date();
    setRecordCells_(sheet, request._rowNumber, NET_CONTROL_REQUEST_HEADERS, {
      status: 'denied',
      decided_at: decidedAt
    });
    request.status = 'denied';
    request.decided_at = decidedAt.toISOString();
    return { request: publicNetControlRequest_(request), net: null };
  }
  return approveNetControlRequest_(spreadsheet, net, access, request);
}

function releaseNetControlOwnership_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const net = requireNet_(spreadsheet, netId);
  if (!net.finalized) throw new PublicError('Ownership can only be released after the net is finalized.');
  const access = requireNetControlOwnership_(spreadsheet, net, readField_(data, ['ownerToken', 'owner_token']));
  const now = new Date();
  setRecordCells_(
    spreadsheet.getSheetByName(W8FY_CONFIG.netControlAccessSheet),
    access._rowNumber,
    NET_CONTROL_ACCESS_HEADERS,
    { updated_at: now, revoked_at: now }
  );
  return { released: true, netId: netId };
}

function approveNetControlRequest_(spreadsheet, net, access, request, administrative) {
  if (!administrative && getNetAdministration_(spreadsheet, net.id).some(function (entry) { return entry.kind === 'recovery'; })) {
    throw new PublicError('This net was recovered administratively. Complete historical finalization before starting a new on-air net.');
  }
  if (request.callsign === String(net.net_control_callsign).trim().toUpperCase()) {
    throw new PublicError(request.callsign + ' is already the current Net Control.');
  }
  const checkIn = getCheckInsForNet_(spreadsheet, net.id).find(function (entry) {
    return entry.callsign === request.callsign;
  });
  if (!checkIn) throw new PublicError('The requested callsign is no longer checked into this net.');

  const netsSheet = spreadsheet.getSheetByName(W8FY_CONFIG.netsSheet);
  const checkInsSheet = spreadsheet.getSheetByName(W8FY_CONFIG.checkInsSheet);
  const accessSheet = spreadsheet.getSheetByName(W8FY_CONFIG.netControlAccessSheet);
  const requestsSheet = spreadsheet.getSheetByName(W8FY_CONFIG.netControlRequestsSheet);
  const historySheet = spreadsheet.getSheetByName(W8FY_CONFIG.netControlHistorySheet);
  const administrationSheet = administrative ? ensureNetAdministrationSheet_(spreadsheet) : null;
  const handoffAt = floorToMinute_(new Date());
  const openHistory = findOpenNetControlHistory_(spreadsheet, net.id);
  if (openHistory && handoffAt.getTime() < dateValue_(openHistory.started_at).getTime()) {
    throw new PublicError('The Net Control handoff time is earlier than the current service segment.');
  }

  const snapshots = [
    captureRow_(netsSheet, net._rowNumber, NET_HEADERS.length),
    captureRow_(checkInsSheet, checkIn._rowNumber, CHECKIN_HEADERS.length),
    captureRow_(requestsSheet, request._rowNumber, NET_CONTROL_REQUEST_HEADERS.length)
  ];
  if (access) snapshots.push(captureRow_(accessSheet, access._rowNumber, NET_CONTROL_ACCESS_HEADERS.length));
  if (openHistory) snapshots.push(captureRow_(historySheet, openHistory._rowNumber, NET_CONTROL_HISTORY_HEADERS.length));
  const appendedRows = [];

  try {
    if (openHistory && !administrative) {
      setRecordCells_(historySheet, openHistory._rowNumber, NET_CONTROL_HISTORY_HEADERS, { ended_at: handoffAt });
    }
    if (!checkIn.is_net_control && !administrative) {
      setRecordCells_(checkInsSheet, checkIn._rowNumber, CHECKIN_HEADERS, { is_net_control: true });
    }
    setRecordCells_(netsSheet, net._rowNumber, NET_HEADERS, {
      net_control_callsign: checkIn.callsign,
      net_control_station_type: checkIn.station_type,
      net_control_traffic: checkIn.traffic,
      updated_at: handoffAt
    });
    if (administrative) {
      appendedRows.push(appendRecordTracked_(administrationSheet, NET_ADMINISTRATION_HEADERS, {
        id: administrative.operationId || Utilities.getUuid(), net_id: net.id, kind: 'recovery',
        recorded_at: handoffAt, actor: administrative.actor || Session.getEffectiveUser().getEmail(),
        owner_callsign: checkIn.callsign, recovery_id: request.id,
        service_end_at: '', reason: administrative.reason || 'Editor-only administrative ownership recovery; no on-air service asserted.'
      }));
    } else {
      appendedRows.push(appendRecordTracked_(historySheet, NET_CONTROL_HISTORY_HEADERS, {
        id: Utilities.getUuid(),
        net_id: net.id,
        callsign: checkIn.callsign,
        started_at: handoffAt,
        ended_at: ''
      }));
    }

    const accessUpdates = {
      owner_callsign: checkIn.callsign,
      token_hash: request.token_hash,
      issued_at: handoffAt,
      updated_at: handoffAt,
      expires_at: new Date(handoffAt.getTime() + W8FY_CONFIG.activeAccessLifetimeMs),
      revoked_at: ''
    };
    if (access) {
      setRecordCells_(accessSheet, access._rowNumber, NET_CONTROL_ACCESS_HEADERS, accessUpdates);
    } else {
      accessUpdates.net_id = net.id;
      appendedRows.push(appendRecordTracked_(accessSheet, NET_CONTROL_ACCESS_HEADERS, accessUpdates));
    }
    setRecordCells_(requestsSheet, request._rowNumber, NET_CONTROL_REQUEST_HEADERS, {
      status: 'approved',
      decided_at: handoffAt
    });
    SpreadsheetApp.flush();
    const updatedRequest = Object.assign({}, request, {
      status: 'approved',
      decided_at: handoffAt.toISOString()
    });
    return {
      request: publicNetControlRequest_(updatedRequest),
      net: buildNetPayload_(spreadsheet, requireNet_(spreadsheet, net.id))
    };
  } catch (error) {
    rollbackAppendedRows_(appendedRows);
    restoreRows_(snapshots);
    throw error;
  }
}

/** Manual editor-only recovery. This function is intentionally absent from doPost(). */
function recoverActiveNetControlToConfiguredCallsign() {
  const properties = PropertiesService.getScriptProperties();
  try {
    const callsign = requireCallsign_(properties.getProperty('NET_CONTROL_RECOVERY_CALLSIGN'));
    const spreadsheet = getConfiguredSpreadsheet_();
    ensureApplicationSheets_(spreadsheet);
    return withScriptLock_(function () {
      const net = findActiveNet_(spreadsheet);
      if (!net) throw new PublicError('No active net is available for recovery.');
      expirePendingRequests_(spreadsheet, net.id, new Date());
      const request = getRecords_(
        spreadsheet.getSheetByName(W8FY_CONFIG.netControlRequestsSheet),
        NET_CONTROL_REQUEST_HEADERS
      ).find(function (entry) {
        return entry.net_id === net.id && entry.callsign === callsign && entry.status === 'pending';
      });
      if (!request) throw new PublicError('No unexpired pending request exists for ' + callsign + '.');
      const result = approveNetControlRequest_(spreadsheet, net, findNetControlAccess_(spreadsheet, net.id), request, true);
      return {
        success: true,
        netId: net.id,
        ownerCallsign: callsign,
        requestStatus: result.request.status
      };
    });
  } finally {
    properties.deleteProperty('NET_CONTROL_RECOVERY_CALLSIGN');
  }
}

function ensureNetAdministrationSheet_(spreadsheet) {
  ensureSheet_(spreadsheet, W8FY_CONFIG.netAdministrationSheet, NET_ADMINISTRATION_HEADERS, [1, 2, 3, 5, 6, 7, 9]);
  return spreadsheet.getSheetByName(W8FY_CONFIG.netAdministrationSheet);
}

function getNetAdministration_(spreadsheet, netId) {
  const sheet = spreadsheet.getSheetByName(W8FY_CONFIG.netAdministrationSheet);
  if (!sheet) return [];
  validateExactHeaders_(sheet, NET_ADMINISTRATION_HEADERS);
  return getRecords_(sheet, NET_ADMINISTRATION_HEADERS).filter(function (entry) { return entry.net_id === netId; });
}

/** Editor only. Explicitly finalizes one recovered net; never emails a report.
 * See HISTORICAL_FINALIZATION.md for the four required Script Properties.
 */
function finalizeHistoricalNetFromConfiguredEnd() {
  const properties = PropertiesService.getScriptProperties();
  const keys = ['NET_HISTORICAL_NET_ID', 'NET_HISTORICAL_END_AT', 'NET_HISTORICAL_RECOVERY_ID', 'NET_HISTORICAL_REASON'];
  try {
    const data = {};
    keys.forEach(function (key) { data[key] = properties.getProperty(key); });
    return withScriptLock_(function () {
      const spreadsheet = getConfiguredSpreadsheet_();
      ensureApplicationSheets_(spreadsheet);
      return finalizeHistoricalNet_(spreadsheet, data);
    });
  } finally {
    keys.forEach(function (key) { properties.deleteProperty(key); });
  }
}

function finalizeHistoricalNet_(spreadsheet, data, administrator) {
  const netId = requireUuid_(data.NET_HISTORICAL_NET_ID, 'NET_HISTORICAL_NET_ID');
  const net = requireNet_(spreadsheet, netId);
  requireOpenNet_(net);
  const reason = normalizeOptionalText_(data.NET_HISTORICAL_REASON, 'NET_HISTORICAL_REASON');
  if (!reason || reason.length > 500) throw new PublicError('Supply a historical end-time source and recovery explanation (1-500 characters).');
  const value = data.NET_HISTORICAL_END_AT;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new PublicError('NET_HISTORICAL_END_AT must be a full minute-precision timestamp with UTC offset, e.g. YYYY-MM-DDTHH:mm:00-04:00.');
  }
  requireDate_(value.slice(0, 10), 'Historical end date');
  requireTime_(value.slice(11, 16), 'Historical end time');
  const offset = value.slice(19);
  if (offset !== 'Z' && (!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset) || (/^[+-]14:/.test(offset) && offset.slice(4) !== '00'))) {
    throw new PublicError('Historical end UTC offset must be between -14:00 and +14:00.');
  }
  const endAt = dateValue_(value);
  const now = new Date();
  const startAt = netDateTime_(net.net_date, net.start_time);
  const duration = (endAt.getTime() - startAt.getTime()) / 60000;
  if (duration < 0 || duration >= 1440 || endAt.getTime() > now.getTime()) {
    throw new PublicError('The supplied service end must be after the net start, less than 24 hours later, and not in the future. Unattended days cannot be counted as service.');
  }
  const access = findNetControlAccess_(spreadsheet, netId);
  if (!administrator && (!access || access.owner_callsign !== net.net_control_callsign || access.revoked_at)) {
    throw new PublicError('Recover administrative ownership before historical finalization.');
  }
  const history = getNetControlHistoryForNet_(spreadsheet, netId);
  const administration = getNetAdministration_(spreadsheet, netId);
  const recoveryId = administrator && !data.NET_HISTORICAL_RECOVERY_ID ? '' : requireUuid_(data.NET_HISTORICAL_RECOVERY_ID, 'NET_HISTORICAL_RECOVERY_ID');
  const recovery = administration.find(function (entry) { return entry.id === recoveryId && entry.kind === 'recovery'; });
  const legacyRecovery = !recovery && history.find(function (entry) { return entry.id === recoveryId; });
  const recoveredAt = recovery ? recovery.recorded_at : legacyRecovery && legacyRecovery.started_at;
  const recoveredCallsign = recovery ? recovery.owner_callsign : legacyRecovery && legacyRecovery.callsign;
  if (recoveryId && (!recoveredAt || recoveredCallsign !== net.net_control_callsign ||
      !access || !sameMinute_(recoveredAt, access.issued_at) || endAt.getTime() > dateValue_(recoveredAt).getTime() ||
      (legacyRecovery && legacyRecovery.ended_at))) {
    throw new PublicError('Identify the current administrative recovery audit ID (or its legacy open history ID). The actual end must not follow that recovery.');
  }
  const audit = {
    id: administrator && administrator.operationId || Utilities.getUuid(), net_id: netId, kind: 'historical_finalization', recorded_at: now,
    actor: administrator && administrator.actor || Session.getEffectiveUser().getEmail(), owner_callsign: net.net_control_callsign,
    recovery_id: recoveryId, service_end_at: endAt, reason: reason
  };
  if (history.some(function (entry) {
    return entry.id !== recoveryId && dateValue_(entry.started_at).getTime() >= endAt.getTime();
  })) {
    throw new PublicError('Other service segments start at or after the supplied end. Administrator review is required; no service history was discarded.');
  }
  const finalizedNet = Object.assign({}, net, {
    end_time: Utilities.formatDate(endAt, Session.getScriptTimeZone(), 'HH:mm'), finalized: true
  });
  // Validate the service-only projection before writing anything. Existing
  // recovery timestamps and check-in flags are never rewritten or backdated.
  const projected = historicalServiceHistory_(history, audit);
  if (!buildNetControlTiming_(finalizedNet, getCheckInsForNet_(spreadsheet, netId), projected, duration, endAt).available) {
    throw new PublicError('Service history does not support this end time. Review the original on-air segments; no records were changed.');
  }
  if (administrator && administrator.validateOnly) return { durationMinutes: duration, endAt: endAt.toISOString() };
  const netsSheet = spreadsheet.getSheetByName(W8FY_CONFIG.netsSheet);
  const accessSheet = spreadsheet.getSheetByName(W8FY_CONFIG.netControlAccessSheet);
  const auditSheet = ensureNetAdministrationSheet_(spreadsheet);
  const snapshots = [captureRow_(netsSheet, net._rowNumber, NET_HEADERS.length)];
  if (access) snapshots.push(captureRow_(accessSheet, access._rowNumber, NET_CONTROL_ACCESS_HEADERS.length));
  const appendedRows = [];
  try {
    appendedRows.push(appendRecordTracked_(auditSheet, NET_ADMINISTRATION_HEADERS, audit));
    setRecordCells_(netsSheet, net._rowNumber, NET_HEADERS, {end_time: finalizedNet.end_time, finalized: true, updated_at: now});
    if (access) setRecordCells_(accessSheet, access._rowNumber, NET_CONTROL_ACCESS_HEADERS, {
      updated_at: now, expires_at: new Date(now.getTime() + W8FY_CONFIG.finalizedAccessLifetimeMs)
    });
    SpreadsheetApp.flush();
    return buildNetPayload_(spreadsheet, requireNet_(spreadsheet, netId), true);
  } catch (error) {
    rollbackAppendedRows_(appendedRows);
    restoreRows_(snapshots);
    throw error;
  }
}

function historicalServiceHistory_(history, audit) {
  const endAt = dateValue_(audit.service_end_at);
  return history.filter(function (entry) {
    return entry.id !== audit.recovery_id && dateValue_(entry.started_at).getTime() < endAt.getTime();
  }).map(function (entry) {
    const end = entry.ended_at ? dateValue_(entry.ended_at) : endAt;
    return Object.assign({}, entry, { ended_at: end.getTime() > endAt.getTime() ? endAt : end });
  });
}

function updateCheckInNote_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const checkInId = requireUuid_(readField_(data, ['checkInId', 'checkinId', 'id']), 'checkInId');
  const net = requireNet_(spreadsheet, netId);
  requireOpenNet_(net);
  requireNetControlOwnership_(spreadsheet, net, readField_(data, ['ownerToken', 'owner_token']));
  if (requireNetType_(net.net_type) !== 'weather_special') {
    throw new PublicError('Notes can only be edited for Weather/Special nets.');
  }

  const note = requireNote_(data.note, net.net_type);
  const sheet = spreadsheet.getSheetByName(W8FY_CONFIG.checkInsSheet);
  const record = getRecords_(sheet, CHECKIN_HEADERS).find(function (entry) {
    return entry.id === checkInId && entry.net_id === netId;
  });
  if (!record) {
    throw new PublicError('Check-in not found for this net.');
  }

  setRecordCells_(sheet, record._rowNumber, CHECKIN_HEADERS, { note: note });
  record.note = note;
  return publicRecord_(record);
}

function removeCheckIn_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const checkInId = requireUuid_(readField_(data, ['checkInId', 'checkinId', 'id']), 'checkInId');
  const net = requireNet_(spreadsheet, netId);
  requireOpenNet_(net);
  requireNetControlOwnership_(spreadsheet, net, readField_(data, ['ownerToken', 'owner_token']));

  const sheet = spreadsheet.getSheetByName(W8FY_CONFIG.checkInsSheet);
  const record = getRecords_(sheet, CHECKIN_HEADERS).find(function (entry) {
    return entry.id === checkInId && entry.net_id === netId;
  });
  if (!record) {
    throw new PublicError('Check-in not found for this net.');
  }
  if (record.is_net_control) {
    throw new PublicError('Net Control cannot be removed.');
  }

  sheet.deleteRow(record._rowNumber);
  return { removed: true, checkInId: checkInId };
}

function finalizeNet_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const net = requireNet_(spreadsheet, netId);
  requireOpenNet_(net);
  const access = requireNetControlOwnership_(spreadsheet, net, readField_(data, ['ownerToken', 'owner_token']));
  if (getNetAdministration_(spreadsheet, netId).some(function (entry) { return entry.kind === 'recovery'; })) {
    throw new PublicError('Administrative recovery does not establish on-air time. Ask an administrator to use Recover Net and Finalize Historical Net with the actual historical end. The editor recovery tool remains an emergency fallback.');
  }
  const endTime = requireTime_(readField_(data, ['endTime', 'end_time']) || currentTime_(), 'endTime');
  const endAt = netEndDateTime_(net.net_date, net.start_time, endTime);
  const openHistory = findOpenNetControlHistory_(spreadsheet, netId);
  if (openHistory && endAt.getTime() < dateValue_(openHistory.started_at).getTime()) {
    throw new PublicError('The final end time cannot be earlier than the current Net Control segment. For an administratively recovered historical net, use finalizeHistoricalNetFromConfiguredEnd with the actual end timestamp; do not change the recovery timestamp.');
  }

  const netsSheet = spreadsheet.getSheetByName(W8FY_CONFIG.netsSheet);
  const accessSheet = spreadsheet.getSheetByName(W8FY_CONFIG.netControlAccessSheet);
  const historySheet = spreadsheet.getSheetByName(W8FY_CONFIG.netControlHistorySheet);
  const snapshots = [
    captureRow_(netsSheet, net._rowNumber, NET_HEADERS.length),
    captureRow_(accessSheet, access._rowNumber, NET_CONTROL_ACCESS_HEADERS.length)
  ];
  if (openHistory) snapshots.push(captureRow_(historySheet, openHistory._rowNumber, NET_CONTROL_HISTORY_HEADERS.length));

  try {
    if (openHistory) {
      setRecordCells_(historySheet, openHistory._rowNumber, NET_CONTROL_HISTORY_HEADERS, { ended_at: endAt });
    }
    setRecordCells_(netsSheet, net._rowNumber, NET_HEADERS, {
      end_time: endTime,
      finalized: true,
      updated_at: endAt
    });
    setRecordCells_(accessSheet, access._rowNumber, NET_CONTROL_ACCESS_HEADERS, {
      updated_at: endAt,
      expires_at: new Date(Date.now() + W8FY_CONFIG.finalizedAccessLifetimeMs)
    });
    SpreadsheetApp.flush();
    return buildNetPayload_(spreadsheet, requireNet_(spreadsheet, netId), true);
  } catch (error) {
    restoreRows_(snapshots);
    throw error;
  }
}

/** Sends one authoritative plain-text report for a finalized net. */
function sendReport_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const net = requireNet_(spreadsheet, netId);
  requireNetControlOwnership_(spreadsheet, net, readField_(data, ['ownerToken', 'owner_token']));
  if (!net.finalized) {
    throw new PublicError('The net must be finalized before its report can be emailed.');
  }
  if (net.email_sent) {
    return {
      sent: true,
      alreadySent: true,
      netId: netId,
      emailSentAt: net.email_sent_at ? dateValue_(net.email_sent_at).toISOString() : ''
    };
  }

  const checkIns = getCheckInsForNet_(spreadsheet, netId);
  const report = buildStoredFinalReport_(spreadsheet, net, checkIns);
  const subject = 'W8FY Net Report - ' + net.net_date + ' - ' + net.net_control_callsign;

  try {
    MailApp.sendEmail(
      W8FY_CONFIG.reportRecipient,
      subject,
      report.text,
      { name: 'W8FY Net Check-In' }
    );
  } catch (error) {
    console.error('W8FY report email failed:', error && error.stack ? error.stack : error);
    throw new PublicError('The report email could not be sent. No sent status was recorded.');
  }

  const sentAt = new Date();
  try {
    setRecordCells_(
      spreadsheet.getSheetByName(W8FY_CONFIG.netsSheet),
      net._rowNumber,
      NET_HEADERS,
      {
        email_sent: true,
        email_sent_at: sentAt,
        updated_at: sentAt
      }
    );
    SpreadsheetApp.flush();
  } catch (error) {
    console.error('W8FY email status update failed:', error && error.stack ? error.stack : error);
    throw new PublicError('The report email was sent, but its sent status could not be recorded. Contact the administrator before retrying.');
  }

  return {
    sent: true,
    alreadySent: false,
    netId: netId,
    emailSentAt: sentAt.toISOString()
  };
}

function downloadReportPdf_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const net = requireNet_(spreadsheet, netId);
  requireNetControlOwnership_(spreadsheet, net, readField_(data, ['ownerToken', 'owner_token']));
  if (!net.finalized) {
    throw new PublicError('The net must be finalized before its PDF can be downloaded.');
  }

  const checkIns = sortCheckIns_(getCheckInsForNet_(spreadsheet, netId));
  const report = buildStoredFinalReport_(spreadsheet, net, checkIns);
  return generatePdfReport_(net, report);
}

function generatePdfReport_(net, report) {
  const filename = buildReportPdfFilename_(report.netType, report.netDate);
  let temporaryDocument = null;
  let temporaryFile = null;

  try {
    temporaryDocument = DocumentApp.create('Temporary ' + filename.replace(/\.pdf$/i, ''));
    temporaryFile = DriveApp.getFileById(temporaryDocument.getId());
    const body = temporaryDocument.getBody();
    body.clear();
    report.text.split('\n').forEach(function (line) {
      body.appendParagraph(line);
    });
    temporaryDocument.saveAndClose();

    const pdfBlob = temporaryFile.getAs(MimeType.PDF);
    return {
      filename: filename,
      mimeType: 'application/pdf',
      base64: Utilities.base64Encode(pdfBlob.getBytes())
    };
  } finally {
    if (temporaryFile) {
      temporaryFile.setTrashed(true);
    } else if (temporaryDocument) {
      DriveApp.getFileById(temporaryDocument.getId()).setTrashed(true);
    }
  }
}

function buildReportPdfFilename_(netType, netDate) {
  const typeSegment = sanitizeFilenameSegment_(requireNetType_(netType).replace(/_/g, '-'));
  const dateSegment = sanitizeFilenameSegment_(String(netDate || 'undated'));
  return 'W8FY-' + typeSegment + '-' + dateSegment + '.pdf';
}

function sanitizeFilenameSegment_(value) {
  const sanitized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return sanitized || 'report';
}

function getActiveNetResponse_(spreadsheet) {
  const net = findActiveNet_(spreadsheet);
  return net ? buildNetPayload_(spreadsheet, net) : null;
}

function getNetResponse_(spreadsheet, netId) {
  return buildNetPayload_(spreadsheet, requireNet_(spreadsheet, netId));
}

function lookupCallsign_(spreadsheet, value) {
  const callsign = requireCallsign_(value);
  const directoryMatch = getRecords_(
    spreadsheet.getSheetByName(W8FY_CONFIG.callsignDirectorySheet),
    CALLSIGN_DIRECTORY_HEADERS
  ).find(function (entry) {
    return entry.callsign === callsign && Boolean(entry.name);
  });

  // Keep explicitly maintained directory names authoritative. Otherwise reuse
  // the latest nonblank name already saved in any net, including Net Control.
  let match = directoryMatch;
  if (!match) {
    const previousCheckIns = getRecords_(
      spreadsheet.getSheetByName(W8FY_CONFIG.checkInsSheet), CHECKIN_HEADERS
    ).filter(function (entry) {
      return entry.callsign === callsign && Boolean(entry.name);
    });
    previousCheckIns.sort(function (left, right) {
      const leftTime = Date.parse(left.created_at) || 0;
      const rightTime = Date.parse(right.created_at) || 0;
      return rightTime - leftTime || right._rowNumber - left._rowNumber;
    });
    match = previousCheckIns[0];
  }

  return {
    callsign: callsign,
    found: Boolean(match),
    name: match ? match.name : ''
  };
}

function buildNetPayload_(spreadsheet, net, includeReport) {
  const checkIns = sortCheckIns_(getCheckInsForNet_(spreadsheet, net.id));
  const payload = {
    net: publicRecord_(net),
    checkIns: checkIns.map(publicRecord_)
  };
  if (includeReport || net.finalized) {
    payload.report = buildStoredFinalReport_(spreadsheet, net, checkIns);
  }
  return payload;
}

function buildStoredFinalReport_(spreadsheet, net, checkIns) {
  const audits = getNetAdministration_(spreadsheet, net.id).filter(function (entry) { return entry.kind === 'historical_finalization'; });
  if (audits.length > 1) throw new Error('Multiple historical finalization audits exist for this net.');
  return buildFinalReport_(net, checkIns, getNetControlHistoryForNet_(spreadsheet, net.id), audits[0]);
}

function buildFinalReport_(net, checkIns, history, historicalAudit) {
  const administrativeOwner = net.net_control_callsign;
  if (historicalAudit) {
    history = historicalServiceHistory_(history || [], historicalAudit);
    const serviceCallsigns = history.map(function (entry) { return entry.callsign; });
    checkIns = checkIns.map(function (entry) {
      return Object.assign({}, entry, { is_net_control: serviceCallsigns.indexOf(entry.callsign) !== -1 });
    });
    const lastService = history.slice().sort(function (left, right) {
      return dateValue_(right.started_at).getTime() - dateValue_(left.started_at).getTime();
    })[0];
    net = Object.assign({}, net, { net_control_callsign: lastService ? lastService.callsign : '' });
  }
  const sortedCheckIns = sortCheckIns_(checkIns);
  const netControls = buildNetControls_(net, sortedCheckIns);
  const netType = requireNetType_(net.net_type);
  const netTypeName = getNetTypeName_(netType);
  const serviceEndAt = historicalAudit ? dateValue_(historicalAudit.service_end_at) : null;
  const durationMinutes = serviceEndAt
    ? Math.round((serviceEndAt.getTime() - netDateTime_(net.net_date, net.start_time).getTime()) / 60000)
    : calculateDurationMinutes_(net.start_time, net.end_time);
  const timing = buildNetControlTiming_(net, sortedCheckIns, history || [], durationMinutes, serviceEndAt);
  const administrationNote = historicalAudit
    ? 'Administrative ownership: ' + administrativeOwner + '. Recovery and unattended time are excluded from on-air service.\n' +
      'Actual service end: ' + serviceEndAt.toISOString() + '. Historical finalization recorded: ' + dateValue_(historicalAudit.recorded_at).toISOString() + '.'
    : '';
  const totals = {
    total: sortedCheckIns.length,
    traffic: 0,
    Home: 0,
    Mobile: 0,
    EchoLink: 0,
    'Short Time': 0
  };
  const groups = { traffic: {}, noTraffic: {} };
  W8FY_CONFIG.stationTypes.forEach(function (stationType) {
    groups.traffic[stationType] = [];
    groups.noTraffic[stationType] = [];
  });

  sortedCheckIns.forEach(function (entry) {
    totals[entry.station_type] += 1;
    if (entry.traffic) {
      totals.traffic += 1;
      groups.traffic[entry.station_type].push(publicRecord_(entry));
    } else {
      groups.noTraffic[entry.station_type].push(publicRecord_(entry));
    }
  });

  return {
    netType: netType,
    netTypeName: netTypeName,
    netDate: net.net_date,
    netControl: net.net_control_callsign,
    netControls: netControls.map(publicRecord_),
    startTime: net.start_time,
    endTime: net.end_time,
    durationMinutes: durationMinutes,
    serviceEndAt: serviceEndAt ? serviceEndAt.toISOString() : '',
    administrationNote: administrationNote,
    netControlTimes: timing.times,
    netControlTotalMinutes: timing.totalMinutes,
    netControlTimingAvailable: timing.available,
    checkIns: sortedCheckIns.map(publicRecord_),
    groups: groups,
    totals: totals,
    text: buildTextReport_(net, groups, totals, netTypeName, durationMinutes, netControls, timing) +
      (administrationNote ? '\n\n' + administrationNote : '')
  };
}

function buildNetControls_(net, checkIns) {
  return checkIns.filter(function (entry) { return entry.is_net_control; }).sort(function (left, right) {
    const currentCallsign = String(net.net_control_callsign).trim().toUpperCase();
    const leftIsCurrent = left.callsign === currentCallsign;
    const rightIsCurrent = right.callsign === currentCallsign;
    if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1;
    return 0;
  });
}

function formatNetControls_(net, netControls) {
  const currentCallsign = String(net.net_control_callsign).trim().toUpperCase();
  const includeHandoffStatus = requireNetType_(net.net_type) === 'weather_special' || netControls.length > 1;
  return netControls.map(function (entry) {
    const status = entry.callsign === currentCallsign ? 'CURRENT' : 'FORMER';
    return (includeHandoffStatus ? status + ' - ' : '') + entry.callsign + ' - ' + (entry.name || 'N/A');
  }).join('; ');
}

function buildNetControlTiming_(net, checkIns, history, durationMinutes, serviceEndAt) {
  const unavailable = { available: false, times: [], totalMinutes: 0 };
  if (!net.finalized || !history.length) return unavailable;

  const ordered = history.slice().sort(function (left, right) {
    return dateValue_(left.started_at).getTime() - dateValue_(right.started_at).getTime();
  });
  if (ordered.some(function (segment) { return !segment.started_at || !segment.ended_at; })) return unavailable;

  const expectedStart = netDateTime_(net.net_date, net.start_time);
  const expectedEnd = serviceEndAt || netEndDateTime_(net.net_date, net.start_time, net.end_time);
  if (!sameMinute_(dateValue_(ordered[0].started_at), expectedStart) ||
      !sameMinute_(dateValue_(ordered[ordered.length - 1].ended_at), expectedEnd)) {
    return unavailable;
  }

  const totalsByCallsign = {};
  const firstServiceOrder = [];
  let totalMinutes = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const segment = ordered[index];
    const startedAt = dateValue_(segment.started_at);
    const endedAt = dateValue_(segment.ended_at);
    if (endedAt.getTime() < startedAt.getTime()) return unavailable;
    if (index > 0 && !sameMinute_(dateValue_(ordered[index - 1].ended_at), startedAt)) return unavailable;
    const callsign = typeof segment.callsign === 'string' ? segment.callsign.trim().toUpperCase() : '';
    if (!new RegExp('^[A-Z0-9/]{1,' + W8FY_CONFIG.maxCallsignLength + '}$').test(callsign)) return unavailable;
    const minutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
    if (!Object.prototype.hasOwnProperty.call(totalsByCallsign, callsign)) {
      totalsByCallsign[callsign] = 0;
      firstServiceOrder.push(callsign);
    }
    totalsByCallsign[callsign] += minutes;
    totalMinutes += minutes;
  }
  if (totalMinutes !== durationMinutes) return unavailable;

  const currentCallsign = String(net.net_control_callsign).trim().toUpperCase();
  const orderedCallsigns = firstServiceOrder.slice().sort(function (left, right) {
    if (left === currentCallsign) return -1;
    if (right === currentCallsign) return 1;
    return firstServiceOrder.indexOf(left) - firstServiceOrder.indexOf(right);
  });
  return {
    available: true,
    totalMinutes: totalMinutes,
    times: orderedCallsigns.map(function (callsign) {
      const checkIn = checkIns.find(function (entry) { return entry.callsign === callsign; });
      return {
        status: callsign === currentCallsign ? 'CURRENT' : 'FORMER',
        callsign: callsign,
        name: checkIn && checkIn.name ? checkIn.name : 'N/A',
        minutes: totalsByCallsign[callsign]
      };
    })
  };
}

function appendNetControlTimingText_(lines, timing) {
  if (!timing.available) {
    lines.push('Net Control Time: unavailable for this net');
    return;
  }
  lines.push('Net Control Time:');
  timing.times.forEach(function (entry) {
    lines.push(
      entry.status + ' - ' + entry.callsign + ' - ' + entry.name + ' - ' +
      entry.minutes + ' ' + (entry.minutes === 1 ? 'minute' : 'minutes')
    );
  });
  lines.push(
    'Total Net Control Time: ' + timing.totalMinutes + ' ' +
    (timing.totalMinutes === 1 ? 'minute' : 'minutes')
  );
}

function buildTextReport_(net, groups, totals, netTypeName, durationMinutes, netControls, timing) {
  const lines = [
    'W8FY AMATEUR RADIO NET REPORT',
    '',
    'Net Type: ' + netTypeName,
    'Net Date: ' + net.net_date,
    'Net Controls: ' + formatNetControls_(net, netControls),
    'Start Time: ' + net.start_time,
    'End Time: ' + (net.end_time || '—'),
    'Net Duration: ' + durationMinutes + ' minutes'
  ];
  appendNetControlTimingText_(lines, timing);

  const includeNotes = requireNetType_(net.net_type) === 'weather_special';
  const includeHandoffStatus = includeNotes || netControls.length > 1;
  appendTextGroups_(lines, 'TRAFFIC', groups.traffic, includeNotes, net.net_control_callsign, includeHandoffStatus);
  appendTextGroups_(lines, 'NO TRAFFIC', groups.noTraffic, includeNotes, net.net_control_callsign, includeHandoffStatus);
  lines.push(
    '',
    '========================================',
    '',
    'TOTAL CHECK-INS: ' + totals.total,
    'TRAFFIC: ' + totals.traffic,
    'HOME: ' + totals.Home,
    'MOBILE: ' + totals.Mobile,
    'ECHOLINK: ' + totals.EchoLink,
    'SHORT TIME: ' + totals['Short Time']
  );
  return lines.join('\n');
}

function appendTextGroups_(lines, heading, grouped, includeNotes, currentNetControlCallsign, includeHandoffStatus) {
  const currentCallsign = String(currentNetControlCallsign).trim().toUpperCase();
  lines.push('', '========================================', '', heading, '');
  W8FY_CONFIG.stationTypes.forEach(function (stationType) {
    lines.push(stationType.toUpperCase());
    const entries = grouped[stationType];
    if (!entries.length) {
      lines.push('—');
    } else {
      entries.forEach(function (entry) {
        lines.push(
          entry.callsign +
          ' - ' + (entry.name || 'N/A') +
          (includeNotes ? ' - Note: ' + (entry.note || 'N/A') : '') +
          ' — ' + entry.station_type +
          ' — ' + (entry.traffic ? 'Traffic' : 'No Traffic') +
          (entry.is_net_control
            ? ' — ' + (includeHandoffStatus
              ? (entry.callsign === currentCallsign ? 'CURRENT NET CONTROL' : 'FORMER NET CONTROL')
              : 'NET CONTROL')
            : '')
        );
      });
    }
    lines.push('');
  });
}

function sortCheckIns_(checkIns) {
  const stationOrder = {};
  W8FY_CONFIG.stationTypes.forEach(function (stationType, index) {
    stationOrder[stationType] = index;
  });

  return checkIns.slice().sort(function (left, right) {
    const trafficDifference = Number(!left.traffic) - Number(!right.traffic);
    if (trafficDifference !== 0) return trafficDifference;
    const stationDifference = stationOrder[left.station_type] - stationOrder[right.station_type];
    if (stationDifference !== 0) return stationDifference;
    return left.callsign.localeCompare(right.callsign);
  });
}

function findActiveNet_(spreadsheet) {
  const records = getRecords_(spreadsheet.getSheetByName(W8FY_CONFIG.netsSheet), NET_HEADERS)
    .filter(function (net) { return !net.finalized; })
    .sort(function (left, right) {
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
  return records.length ? records[0] : null;
}

function requireNet_(spreadsheet, netId) {
  const record = getRecords_(spreadsheet.getSheetByName(W8FY_CONFIG.netsSheet), NET_HEADERS)
    .find(function (net) { return net.id === netId; });
  if (!record) throw new PublicError('Net not found.');
  return record;
}

function requireOpenNet_(net) {
  if (net.finalized) throw new PublicError('This net is finalized and cannot be changed.');
}

function getCheckInsForNet_(spreadsheet, netId) {
  return getRecords_(spreadsheet.getSheetByName(W8FY_CONFIG.checkInsSheet), CHECKIN_HEADERS)
    .filter(function (entry) { return entry.net_id === netId; });
}

function getNetControlHistoryForNet_(spreadsheet, netId) {
  return getRecords_(spreadsheet.getSheetByName(W8FY_CONFIG.netControlHistorySheet), NET_CONTROL_HISTORY_HEADERS)
    .filter(function (entry) { return entry.net_id === netId; });
}

function findOpenNetControlHistory_(spreadsheet, netId) {
  const open = getNetControlHistoryForNet_(spreadsheet, netId).filter(function (entry) {
    return !entry.ended_at;
  });
  if (open.length > 1) throw new Error('Multiple open Net Control timing segments exist for this net.');
  return open.length ? open[0] : null;
}

function findNetControlAccess_(spreadsheet, netId) {
  return getRecords_(
    spreadsheet.getSheetByName(W8FY_CONFIG.netControlAccessSheet),
    NET_CONTROL_ACCESS_HEADERS
  ).find(function (entry) { return entry.net_id === netId; }) || null;
}

function requireNetControlOwnership_(spreadsheet, net, value) {
  const access = findNetControlAccess_(spreadsheet, net.id);
  if (!access || access.owner_callsign !== String(net.net_control_callsign).trim().toUpperCase() ||
      !isValidOwnershipToken_(access, value, new Date())) {
    throw new PublicError('This net is read-only on this device.');
  }
  return access;
}

function isValidOwnershipToken_(access, value, now) {
  let token;
  try {
    token = requireRawToken_(value, 'ownerToken');
  } catch (error) {
    return false;
  }
  if (access.revoked_at || !access.expires_at || dateValue_(access.expires_at).getTime() <= now.getTime()) return false;
  return constantTimeEqual_(access.token_hash, hashToken_(token));
}

function generateSecureToken_() {
  const entropy = [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid(), String(Date.now())].join(':');
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, entropy, Utilities.Charset.UTF_8)
  ).replace(/=+$/g, '');
}

function hashToken_(token) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8)
  ).replace(/=+$/g, '');
}

function requireRawToken_(value, fieldName) {
  const token = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new PublicError(fieldName + ' is invalid.');
  return token;
}

function constantTimeEqual_(left, right) {
  const leftValue = String(left || '');
  const rightValue = String(right || '');
  let difference = leftValue.length ^ rightValue.length;
  const length = Math.max(leftValue.length, rightValue.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftValue.charCodeAt(index % Math.max(leftValue.length, 1)) || 0) ^
      (rightValue.charCodeAt(index % Math.max(rightValue.length, 1)) || 0);
  }
  return difference === 0;
}

function expirePendingRequests_(spreadsheet, netId, now) {
  const sheet = spreadsheet.getSheetByName(W8FY_CONFIG.netControlRequestsSheet);
  getRecords_(sheet, NET_CONTROL_REQUEST_HEADERS).filter(function (entry) {
    return entry.net_id === netId && entry.status === 'pending';
  }).forEach(function (entry) {
    expireRequestIfNeeded_(sheet, entry, now);
  });
}

function expireRequestIfNeeded_(sheet, request, now) {
  if (request.status === 'pending' && dateValue_(request.expires_at).getTime() <= now.getTime()) {
    setRecordCells_(sheet, request._rowNumber, NET_CONTROL_REQUEST_HEADERS, {
      status: 'expired',
      decided_at: now
    });
    request.status = 'expired';
    request.decided_at = now.toISOString();
  }
  return request;
}

function publicNetControlRequest_(request) {
  return {
    id: request.id,
    netId: request.net_id,
    callsign: request.callsign,
    createdAt: request.created_at,
    expiresAt: request.expires_at,
    status: request.status,
    decidedAt: request.decided_at || ''
  };
}

function normalizeRequestDecision_(value) {
  const decision = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (decision !== 'approved' && decision !== 'denied') {
    throw new PublicError('Decision must be approved or denied.');
  }
  return decision;
}

function floorToMinute_(value) {
  const date = dateValue_(value);
  date.setSeconds(0, 0);
  return date;
}

function netDateTime_(netDate, time) {
  return Utilities.parseDate(
    requireDate_(netDate, 'netDate') + ' ' + requireTime_(time, 'time'),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm'
  );
}

function netEndDateTime_(netDate, startTime, endTime) {
  const start = netDateTime_(netDate, startTime);
  return new Date(start.getTime() + calculateDurationMinutes_(startTime, endTime) * 60000);
}

function dateValue_(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (isNaN(date.getTime())) throw new Error('Invalid stored timestamp.');
  return date;
}

function sameMinute_(left, right) {
  return floorToMinute_(left).getTime() === floorToMinute_(right).getTime();
}

function getConfiguredSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty(W8FY_CONFIG.spreadsheetProperty);
  if (!spreadsheetId) {
    throw new PublicError('Backend setup is incomplete. Run setupW8FYDatabase() from the Apps Script editor.');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function ensureApplicationSheets_(spreadsheet) {
  ensureSheet_(spreadsheet, W8FY_CONFIG.netsSheet, NET_HEADERS, [1, 2, 3, 4, 6, 7, 13]);
  ensureSheet_(spreadsheet, W8FY_CONFIG.checkInsSheet, CHECKIN_HEADERS, [1, 2, 3, 4, 8, 9]);
  ensureSheet_(spreadsheet, W8FY_CONFIG.callsignDirectorySheet, CALLSIGN_DIRECTORY_HEADERS, [1, 2]);
  ensureSheet_(spreadsheet, W8FY_CONFIG.netControlAccessSheet, NET_CONTROL_ACCESS_HEADERS, [1, 2, 3]);
  ensureSheet_(spreadsheet, W8FY_CONFIG.netControlRequestsSheet, NET_CONTROL_REQUEST_HEADERS, [1, 2, 3, 4, 7]);
  ensureSheet_(spreadsheet, W8FY_CONFIG.netControlHistorySheet, NET_CONTROL_HISTORY_HEADERS, [1, 2, 3]);
}

function getApplicationSheetNames_() {
  return [
    W8FY_CONFIG.netsSheet,
    W8FY_CONFIG.checkInsSheet,
    W8FY_CONFIG.callsignDirectorySheet,
    W8FY_CONFIG.netControlAccessSheet,
    W8FY_CONFIG.netControlRequestsSheet,
    W8FY_CONFIG.netControlHistorySheet
  ];
}

function inspectStage1Migration_(spreadsheet) {
  const netsSheet = requireMigrationSheet_(spreadsheet, W8FY_CONFIG.netsSheet);
  const checkInsSheet = requireMigrationSheet_(spreadsheet, W8FY_CONFIG.checkInsSheet);

  validateMigrationHeaders_(netsSheet, LEGACY_NET_HEADERS, ['net_type']);
  validateMigrationHeaders_(checkInsSheet, LEGACY_CHECKIN_HEADERS, ['name', 'note']);

  const directorySheet = spreadsheet.getSheetByName(W8FY_CONFIG.callsignDirectorySheet);
  if (directorySheet && directorySheet.getLastRow() > 0) {
    validateExactHeaders_(directorySheet, CALLSIGN_DIRECTORY_HEADERS);
  }

  return {
    netsSheet: netsSheet,
    checkInsSheet: checkInsSheet,
    required: !hasExactHeaders_(netsSheet, NET_HEADERS) ||
      !hasExactHeaders_(checkInsSheet, CHECKIN_HEADERS) ||
      !directorySheet || directorySheet.getLastRow() === 0
  };
}

function requireMigrationSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet || sheet.getLastRow() === 0) {
    throw new Error('Cannot migrate because the existing ' + name + ' sheet was not found. No backup or schema changes were made.');
  }
  return sheet;
}

function validateMigrationHeaders_(sheet, legacyHeaders, appendedHeaders) {
  const expected = legacyHeaders.concat(appendedHeaders);
  const width = expected.length;
  const actual = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];

  legacyHeaders.forEach(function (header, index) {
    if (actual[index] !== header) {
      throw new Error('The ' + sheet.getName() + ' legacy headers do not match the required W8FY schema. No backup or schema changes were made.');
    }
  });

  appendedHeaders.forEach(function (header, index) {
    const actualHeader = actual[legacyHeaders.length + index];
    if (actualHeader && actualHeader !== header) {
      throw new Error(
        'The ' + sheet.getName() + ' sheet has unexpected data in the column reserved for ' + header +
        '. No backup or schema changes were made.'
      );
    }
  });
}

function appendStage1Headers_(netsSheet, checkInsSheet) {
  if (!hasExactHeaders_(netsSheet, NET_HEADERS)) {
    netsSheet.getRange(1, LEGACY_NET_HEADERS.length + 1).setValue('net_type');
    netsSheet.getRange(2, LEGACY_NET_HEADERS.length + 1, Math.max(netsSheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  }

  if (!hasExactHeaders_(checkInsSheet, CHECKIN_HEADERS)) {
    checkInsSheet.getRange(1, LEGACY_CHECKIN_HEADERS.length + 1, 1, 2).setValues([['name', 'note']]);
    checkInsSheet.getRange(2, LEGACY_CHECKIN_HEADERS.length + 1, Math.max(checkInsSheet.getMaxRows() - 1, 1), 2).setNumberFormat('@');
  }
}

function captureLegacyData_(netsSheet, checkInsSheet) {
  return {
    nets: captureSheetRange_(netsSheet, LEGACY_NET_HEADERS.length),
    checkIns: captureSheetRange_(checkInsSheet, LEGACY_CHECKIN_HEADERS.length)
  };
}

function captureSheetRange_(sheet, columnCount) {
  return JSON.stringify(sheet.getRange(1, 1, sheet.getLastRow(), columnCount).getValues());
}

function verifyLegacyDataUnchanged_(netsSheet, checkInsSheet, before) {
  const netsAfter = captureSheetRange_(netsSheet, LEGACY_NET_HEADERS.length);
  const checkInsAfter = captureSheetRange_(checkInsSheet, LEGACY_CHECKIN_HEADERS.length);
  if (netsAfter !== before.nets || checkInsAfter !== before.checkIns) {
    throw new Error('Legacy Nets or CheckIns data changed during migration verification.');
  }
}

function verifyBackupData_(backup, expected) {
  const backupNets = backup.getSheetByName(W8FY_CONFIG.netsSheet);
  const backupCheckIns = backup.getSheetByName(W8FY_CONFIG.checkInsSheet);
  if (!backupNets || !backupCheckIns) {
    throw new Error('The pre-migration backup is missing Nets or CheckIns. Production was not modified.');
  }

  const backupData = captureLegacyData_(backupNets, backupCheckIns);
  if (backupData.nets !== expected.nets || backupData.checkIns !== expected.checkIns) {
    throw new Error('The pre-migration backup could not be verified. Production was not modified.');
  }
}

function validateExactHeaders_(sheet, headers) {
  if (!hasExactHeaders_(sheet, headers)) {
    throw new Error('The ' + sheet.getName() + ' sheet headers do not match the required W8FY schema. No backup or schema changes were made.');
  }
}

function hasExactHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) return false;
  const actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  return headers.every(function (header, index) { return actual[index] === header; });
}

function ensureSheet_(spreadsheet, name, headers, textColumns) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    textColumns.forEach(function (column) {
      sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
    return;
  }

  const actualHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const valid = headers.every(function (header, index) { return actualHeaders[index] === header; });
  if (!valid) {
    throw new PublicError('The ' + name + ' sheet headers do not match the required W8FY schema.');
  }
}

function getRecords_(sheet, headers) {
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.map(function (row, rowIndex) {
    const record = { _rowNumber: rowIndex + 2 };
    headers.forEach(function (header, columnIndex) {
      record[header] = normalizeStoredValue_(header, row[columnIndex]);
    });
    return record;
  }).filter(function (record) { return Boolean(record[headers[0]]); });
}

function normalizeStoredValue_(header, value) {
  if (header === 'finalized' || header === 'email_sent' || header === 'traffic' ||
      header === 'is_net_control' || header === 'net_control_traffic') {
    return value === true || String(value).toUpperCase() === 'TRUE';
  }
  if (value instanceof Date) {
    if (header === 'net_date') return Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd');
    if (header === 'start_time' || header === 'end_time') {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
    }
    return value.toISOString();
  }
  if (header === 'callsign') {
    return value === null || typeof value === 'undefined' ? '' : String(value).trim().toUpperCase();
  }
  if (header === 'net_type') {
    const netType = value === null || typeof value === 'undefined' ? '' : String(value).trim();
    return netType ? netType.toLowerCase() : 'current';
  }
  return value === null || typeof value === 'undefined' ? '' : String(value).trim();
}

function appendRecord_(sheet, headers, record) {
  sheet.appendRow(headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
  }));
}

function appendRecordTracked_(sheet, headers, record) {
  const rowNumber = sheet.getLastRow() + 1;
  appendRecord_(sheet, headers, record);
  return { sheet: sheet, rowNumber: rowNumber };
}

function rollbackAppendedRows_(rows) {
  rows.slice().reverse().forEach(function (entry) {
    try {
      if (entry.rowNumber <= entry.sheet.getLastRow()) entry.sheet.deleteRow(entry.rowNumber);
    } catch (rollbackError) {
      console.error('W8FY appended-row rollback failed:', rollbackError && rollbackError.stack ? rollbackError.stack : rollbackError);
    }
  });
  try {
    SpreadsheetApp.flush();
  } catch (rollbackError) {
    console.error('W8FY rollback flush failed:', rollbackError && rollbackError.stack ? rollbackError.stack : rollbackError);
  }
}

function captureRow_(sheet, rowNumber, width) {
  return {
    sheet: sheet,
    rowNumber: rowNumber,
    values: sheet.getRange(rowNumber, 1, 1, width).getValues()
  };
}

function restoreRows_(snapshots) {
  try {
    snapshots.forEach(function (snapshot) {
      snapshot.sheet.getRange(snapshot.rowNumber, 1, 1, snapshot.values[0].length).setValues(snapshot.values);
    });
    SpreadsheetApp.flush();
  } catch (rollbackError) {
    console.error('W8FY transaction rollback failed:', rollbackError && rollbackError.stack ? rollbackError.stack : rollbackError);
    throw new Error('The operation failed and its rollback could not be completed. Administrator review is required.');
  }
}

function setRecordCells_(sheet, rowNumber, headers, updates) {
  Object.keys(updates).forEach(function (header) {
    const columnIndex = headers.indexOf(header);
    if (columnIndex === -1) throw new Error('Unknown internal column: ' + header);
    sheet.getRange(rowNumber, columnIndex + 1).setValue(updates[header]);
  });
}

function publicRecord_(record) {
  const copy = {};
  Object.keys(record).forEach(function (key) {
    if (key !== '_rowNumber') {
      copy[key] = record[key] instanceof Date ? record[key].toISOString() : record[key];
    }
  });
  return copy;
}

function requireAction_(value, allowedActions) {
  const action = typeof value === 'string' ? value.trim() : '';
  if (!action || allowedActions.indexOf(action) === -1) {
    throw new PublicError('Invalid or unsupported action.');
  }
  return action;
}

function requireCallsign_(value) {
  const callsign = typeof value === 'string' ? value.trim().toUpperCase() : '';
  const pattern = new RegExp('^[A-Z0-9/]{1,' + W8FY_CONFIG.maxCallsignLength + '}$');
  if (!pattern.test(callsign)) {
    throw new PublicError('Callsign must contain only letters, numbers, or / and be 1–20 characters.');
  }
  return callsign;
}

function requireNetType_(value) {
  const netType = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const normalized = netType || 'current';
  if (W8FY_CONFIG.netTypes.indexOf(normalized) === -1) {
    throw new PublicError('Net type must be current, two_meter_ncs, or weather_special.');
  }
  return normalized;
}

function getNetTypeName_(netType) {
  return W8FY_CONFIG.netTypeNames[requireNetType_(netType)];
}

function normalizeOptionalText_(value, fieldName) {
  if (value === null || typeof value === 'undefined') return '';
  if (typeof value !== 'string') {
    throw new PublicError(fieldName + ' must be text.');
  }
  return value.trim();
}

function requireNote_(value, netType) {
  const note = normalizeOptionalText_(value, 'note');
  if (note.length > W8FY_CONFIG.maxNoteLength) {
    throw new PublicError('Note must be 80 characters or fewer.');
  }
  if (requireNetType_(netType) !== 'weather_special' && note) {
    throw new PublicError('Notes are only allowed for Weather/Special nets.');
  }
  return note;
}

function requireStationType_(value) {
  if (W8FY_CONFIG.stationTypes.indexOf(value) === -1) {
    throw new PublicError('Station type must be Home, Mobile, EchoLink, or Short Time.');
  }
  return value;
}

function requireBoolean_(value, fieldName) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    if (normalized === 'TRUE' || normalized === 'YES') return true;
    if (normalized === 'FALSE' || normalized === 'NO') return false;
  }
  throw new PublicError(fieldName + ' must be TRUE/FALSE or Yes/No.');
}

function requireUuid_(value, fieldName) {
  const uuid = typeof value === 'string' ? value.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new PublicError(fieldName + ' must be a valid UUID.');
  }
  return uuid;
}

function requireDate_(value, fieldName) {
  const date = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new PublicError(fieldName + ' must use YYYY-MM-DD.');
  }
  const parsed = new Date(date + 'T00:00:00Z');
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new PublicError(fieldName + ' is not a valid calendar date.');
  }
  return date;
}

function requireTime_(value, fieldName) {
  const time = typeof value === 'string' ? value.trim() : '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new PublicError(fieldName + ' must use 24-hour HH:MM.');
  }
  return time;
}

function calculateDurationMinutes_(startTime, endTime) {
  const startParts = requireTime_(startTime, 'startTime').split(':');
  const endParts = requireTime_(endTime, 'endTime').split(':');
  const startMinutes = Number(startParts[0]) * 60 + Number(startParts[1]);
  const endMinutes = Number(endParts[0]) * 60 + Number(endParts[1]);
  const elapsedMinutes = endMinutes - startMinutes;
  return elapsedMinutes < 0 ? elapsedMinutes + 1440 : elapsedMinutes;
}

function currentTime_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm');
}

function readField_(data, names) {
  for (let index = 0; index < names.length; index += 1) {
    if (Object.prototype.hasOwnProperty.call(data, names[index])) return data[names[index]];
  }
  return undefined;
}

function parseJsonBody_(e) {
  const contents = e && e.postData && typeof e.postData.contents === 'string'
    ? e.postData.contents.trim()
    : '';
  if (!contents) throw new PublicError('A JSON request body is required.');
  try {
    const parsed = JSON.parse(contents);
    if (!isPlainObject_(parsed)) throw new Error('Body is not an object.');
    return parsed;
  } catch (error) {
    throw new PublicError('Request body must be a valid JSON object.');
  }
}

function isPlainObject_(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function withScriptLock_(callback) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(W8FY_CONFIG.lockTimeoutMs);
    return callback();
  } catch (error) {
    if (error instanceof PublicError) throw error;
    if (!lock.hasLock()) throw new PublicError('The backend is busy. Please try again.');
    throw error;
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function handleApiRequest_(callback) {
  try {
    return jsonResponse_({ success: true, data: callback() });
  } catch (error) {
    console.error('W8FY API error:', error && error.stack ? error.stack : error);
    const message = error instanceof PublicError
      ? error.message
      : 'The backend could not complete the request.';
    return jsonResponse_({ success: false, error: message });
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function PublicError(message) {
  this.name = 'PublicError';
  this.message = message;
  if (Error.captureStackTrace) Error.captureStackTrace(this, PublicError);
}
PublicError.prototype = Object.create(Error.prototype);
PublicError.prototype.constructor = PublicError;
