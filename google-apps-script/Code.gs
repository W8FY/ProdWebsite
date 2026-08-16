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
  lockTimeoutMs: 30000
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

const LEGACY_NET_HEADERS = Object.freeze(NET_HEADERS.slice(0, 12));
const LEGACY_CHECKIN_HEADERS = Object.freeze(CHECKIN_HEADERS.slice(0, 7));

const GET_ACTIONS = Object.freeze(['health', 'getActiveNet', 'getNet', 'lookupCallsign']);
const POST_ACTIONS = Object.freeze(['createNet', 'addCheckIn', 'updateCheckInNote', 'setNetControlRole', 'removeCheckIn', 'finalizeNet', 'sendReport', 'downloadReportPdf']);

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
    sheets: [W8FY_CONFIG.netsSheet, W8FY_CONFIG.checkInsSheet, W8FY_CONFIG.callsignDirectorySheet]
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
        backupUrl: ''
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
      sheets: [W8FY_CONFIG.netsSheet, W8FY_CONFIG.checkInsSheet, W8FY_CONFIG.callsignDirectorySheet]
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
          sheets: [W8FY_CONFIG.netsSheet, W8FY_CONFIG.checkInsSheet, W8FY_CONFIG.callsignDirectorySheet],
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
    const spreadsheet = getConfiguredSpreadsheet_();
    ensureApplicationSheets_(spreadsheet);

    switch (action) {
      case 'createNet':
        return withScriptLock_(function () { return createNet_(spreadsheet, data); });
      case 'addCheckIn':
        return withScriptLock_(function () { return addCheckIn_(spreadsheet, data); });
      case 'updateCheckInNote':
        return withScriptLock_(function () { return updateCheckInNote_(spreadsheet, data); });
      case 'setNetControlRole':
        return withScriptLock_(function () { return setNetControlRole_(spreadsheet, data); });
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
  const netsSheet = spreadsheet.getSheetByName(W8FY_CONFIG.netsSheet);
  const checkInsSheet = spreadsheet.getSheetByName(W8FY_CONFIG.checkInsSheet);

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

  appendRecord_(netsSheet, NET_HEADERS, netRecord);
  try {
    appendRecord_(checkInsSheet, CHECKIN_HEADERS, controlRecord);
  } catch (error) {
    // Keep the two-sheet create operation consistent if the second append fails.
    netsSheet.deleteRow(netsSheet.getLastRow());
    throw error;
  }

  return buildNetPayload_(spreadsheet, netRecord);
}

function addCheckIn_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const net = requireNet_(spreadsheet, netId);
  requireOpenNet_(net);

  const callsign = requireCallsign_(data.callsign);
  const name = normalizeOptionalText_(data.name, 'name');
  const stationType = requireStationType_(readField_(data, ['stationType', 'station_type']));
  const traffic = requireBoolean_(data.traffic, 'traffic');
  const note = requireNote_(data.note, net.net_type);
  const requestedNetControl = typeof data.isNetControl === 'undefined'
    ? false
    : requireBoolean_(data.isNetControl, 'isNetControl');
  const isNetControl = requireNetType_(net.net_type) === 'weather_special' && requestedNetControl;
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
    is_net_control: isNetControl,
    created_at: new Date(),
    name: name,
    note: note
  };
  appendRecord_(spreadsheet.getSheetByName(W8FY_CONFIG.checkInsSheet), CHECKIN_HEADERS, record);
  return publicRecord_(record);
}

function setNetControlRole_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const checkInId = requireUuid_(readField_(data, ['checkInId', 'checkinId', 'id']), 'checkInId');
  const isNetControl = requireBoolean_(readField_(data, ['isNetControl', 'is_net_control']), 'isNetControl');
  const net = requireNet_(spreadsheet, netId);
  requireOpenNet_(net);
  if (requireNetType_(net.net_type) !== 'weather_special') {
    throw new PublicError('Net Control roles can only be changed for Weather/Special nets.');
  }

  const sheet = spreadsheet.getSheetByName(W8FY_CONFIG.checkInsSheet);
  const record = getRecords_(sheet, CHECKIN_HEADERS).find(function (entry) {
    return entry.id === checkInId && entry.net_id === netId;
  });
  if (!record) {
    throw new PublicError('Check-in not found for this net.');
  }
  if (!isNetControl && record.callsign === String(net.net_control_callsign).trim().toUpperCase()) {
    throw new PublicError('The primary Net Control cannot be demoted.');
  }

  setRecordCells_(sheet, record._rowNumber, CHECKIN_HEADERS, { is_net_control: isNetControl });
  record.is_net_control = isNetControl;
  return publicRecord_(record);
}

function updateCheckInNote_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const checkInId = requireUuid_(readField_(data, ['checkInId', 'checkinId', 'id']), 'checkInId');
  const net = requireNet_(spreadsheet, netId);
  requireOpenNet_(net);
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
  const endTime = requireTime_(readField_(data, ['endTime', 'end_time']) || currentTime_(), 'endTime');
  const sheet = spreadsheet.getSheetByName(W8FY_CONFIG.netsSheet);

  setRecordCells_(sheet, net._rowNumber, NET_HEADERS, {
    end_time: endTime,
    finalized: true,
    updated_at: new Date()
  });

  const finalizedNet = requireNet_(spreadsheet, netId);
  return buildNetPayload_(spreadsheet, finalizedNet, true);
}

/** Sends one authoritative plain-text report for a finalized net. */
function sendReport_(spreadsheet, data) {
  const netId = requireUuid_(readField_(data, ['netId', 'net_id']), 'netId');
  const net = requireNet_(spreadsheet, netId);
  if (!net.finalized) {
    throw new PublicError('The net must be finalized before its report can be emailed.');
  }
  if (net.email_sent) {
    throw new PublicError('This net report has already been sent.');
  }

  const checkIns = getCheckInsForNet_(spreadsheet, netId);
  const report = buildFinalReport_(net, checkIns);
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
  if (!net.finalized) {
    throw new PublicError('The net must be finalized before its PDF can be downloaded.');
  }

  const checkIns = sortCheckIns_(getCheckInsForNet_(spreadsheet, netId));
  const report = buildFinalReport_(net, checkIns);
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
  const match = getRecords_(
    spreadsheet.getSheetByName(W8FY_CONFIG.callsignDirectorySheet),
    CALLSIGN_DIRECTORY_HEADERS
  ).find(function (entry) {
    return String(entry.callsign).toUpperCase() === callsign;
  });

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
    payload.report = buildFinalReport_(net, checkIns);
  }
  return payload;
}

function buildFinalReport_(net, checkIns) {
  const sortedCheckIns = sortCheckIns_(checkIns);
  const netControls = buildNetControls_(net, sortedCheckIns);
  const netType = requireNetType_(net.net_type);
  const netTypeName = getNetTypeName_(netType);
  const durationMinutes = calculateDurationMinutes_(net.start_time, net.end_time);
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
    checkIns: sortedCheckIns.map(publicRecord_),
    groups: groups,
    totals: totals,
    text: buildTextReport_(net, groups, totals, netTypeName, durationMinutes, netControls)
  };
}

function buildNetControls_(net, checkIns) {
  return checkIns.filter(function (entry) { return entry.is_net_control; }).sort(function (left, right) {
    const primaryCallsign = String(net.net_control_callsign).trim().toUpperCase();
    const leftIsPrimary = left.callsign === primaryCallsign;
    const rightIsPrimary = right.callsign === primaryCallsign;
    if (leftIsPrimary !== rightIsPrimary) return leftIsPrimary ? -1 : 1;
    return 0;
  });
}

function formatNetControls_(netControls) {
  return netControls.map(function (entry) {
    return entry.callsign + ' - ' + (entry.name || 'N/A');
  }).join('; ');
}

function buildTextReport_(net, groups, totals, netTypeName, durationMinutes, netControls) {
  const lines = [
    'W8FY AMATEUR RADIO NET REPORT',
    '',
    'Net Type: ' + netTypeName,
    'Net Date: ' + net.net_date,
    'Net Controls: ' + formatNetControls_(netControls),
    'Start Time: ' + net.start_time,
    'End Time: ' + (net.end_time || '—'),
    'Net Duration: ' + durationMinutes + ' minutes'
  ];

  const includeNotes = requireNetType_(net.net_type) === 'weather_special';
  appendTextGroups_(lines, 'TRAFFIC', groups.traffic, includeNotes);
  appendTextGroups_(lines, 'NO TRAFFIC', groups.noTraffic, includeNotes);
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

function appendTextGroups_(lines, heading, grouped, includeNotes) {
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
          (entry.is_net_control ? ' — NET CONTROL' : '')
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
