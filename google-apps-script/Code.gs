/**
 * W8FY Amateur Radio Net Check-In — Google Apps Script backend
 *
 * Copy this file into a container-bound Apps Script project attached to the
 * Google Sheet named "W8FY Net Check-In Database". Run setupW8FYDatabase()
 * once before deploying the script as a web app.
 *
 * This stage sends finalized net reports by email. PDF generation remains
 * reserved for a later stage.
 */

const W8FY_CONFIG = Object.freeze({
  spreadsheetProperty: 'W8FY_SPREADSHEET_ID',
  netsSheet: 'Nets',
  checkInsSheet: 'CheckIns',
  reportRecipient: 'info@w8fy.org',
  stationTypes: Object.freeze(['Home', 'Mobile', 'EchoLink', 'Short Time']),
  maxCallsignLength: 20,
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
  'updated_at'
]);

const CHECKIN_HEADERS = Object.freeze([
  'id',
  'net_id',
  'callsign',
  'station_type',
  'traffic',
  'is_net_control',
  'created_at'
]);

const GET_ACTIONS = Object.freeze(['health', 'getActiveNet', 'getNet']);
const POST_ACTIONS = Object.freeze(['createNet', 'addCheckIn', 'removeCheckIn', 'finalizeNet', 'sendReport']);

/**
 * One-time setup. Run this function from the Apps Script editor while the
 * target spreadsheet is open. It stores the spreadsheet ID in Script
 * Properties and creates/verifies the two application sheets.
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
    sheets: [W8FY_CONFIG.netsSheet, W8FY_CONFIG.checkInsSheet]
  };
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
          sheets: [W8FY_CONFIG.netsSheet, W8FY_CONFIG.checkInsSheet],
          emailEnabled: true,
          pdfEnabled: false
        };
      case 'getActiveNet':
        return getActiveNetResponse_(spreadsheet);
      case 'getNet':
        return getNetResponse_(spreadsheet, requireUuid_(e.parameter.netId, 'netId'));
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
      case 'removeCheckIn':
        return withScriptLock_(function () { return removeCheckIn_(spreadsheet, data); });
      case 'finalizeNet':
        return withScriptLock_(function () { return finalizeNet_(spreadsheet, data); });
      case 'sendReport':
        return withScriptLock_(function () { return sendReport_(spreadsheet, data); });
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
  const callsign = requireCallsign_(readField_(data, ['netControlCallsign', 'net_control_callsign']));
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
    updated_at: now
  };
  const controlRecord = {
    id: checkInId,
    net_id: netId,
    callsign: callsign,
    station_type: stationType,
    traffic: traffic,
    is_net_control: true,
    created_at: now
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
  const stationType = requireStationType_(readField_(data, ['stationType', 'station_type']));
  const traffic = requireBoolean_(data.traffic, 'traffic');
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
    created_at: new Date()
  };
  appendRecord_(spreadsheet.getSheetByName(W8FY_CONFIG.checkInsSheet), CHECKIN_HEADERS, record);
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

  const checkIns = sortCheckIns_(getCheckInsForNet_(spreadsheet, netId));
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

/** Reserved integration point for later PDF generation. */
function generatePdfReport_() {
  throw new PublicError('PDF generation is not implemented in this stage.');
}

function getActiveNetResponse_(spreadsheet) {
  const net = findActiveNet_(spreadsheet);
  return net ? buildNetPayload_(spreadsheet, net) : null;
}

function getNetResponse_(spreadsheet, netId) {
  return buildNetPayload_(spreadsheet, requireNet_(spreadsheet, netId));
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

function buildFinalReport_(net, sortedCheckIns) {
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
    netDate: net.net_date,
    netControl: net.net_control_callsign,
    startTime: net.start_time,
    endTime: net.end_time,
    groups: groups,
    totals: totals,
    text: buildTextReport_(net, groups, totals)
  };
}

function buildTextReport_(net, groups, totals) {
  const lines = [
    'W8FY AMATEUR RADIO NET REPORT',
    '',
    'Net Date: ' + net.net_date,
    'Net Control: ' + net.net_control_callsign,
    'Start Time: ' + net.start_time,
    'End Time: ' + (net.end_time || '—')
  ];

  appendTextGroups_(lines, 'TRAFFIC', groups.traffic);
  appendTextGroups_(lines, 'NO TRAFFIC', groups.noTraffic);
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

function appendTextGroups_(lines, heading, grouped) {
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
  ensureSheet_(spreadsheet, W8FY_CONFIG.netsSheet, NET_HEADERS, [1, 2, 3, 4, 6, 7]);
  ensureSheet_(spreadsheet, W8FY_CONFIG.checkInsSheet, CHECKIN_HEADERS, [1, 2, 3, 4]);
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
  }).filter(function (record) { return Boolean(record.id); });
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
