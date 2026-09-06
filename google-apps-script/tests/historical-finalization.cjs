/* Run: node google-apps-script/tests/historical-finalization.cjs
 * All Apps Script services below are in-memory fakes. No network or live records.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const source = fs.readFileSync(path.join(__dirname, "../Code.gs"), "utf8");
const id = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const netId = id(1), recoveryId = id(4), token = "x".repeat(43);
const now = "2026-09-05T12:00:00Z";
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return Date.parse(now); }
}
function harness({legacy = true, date = "2026-08-29", start = "10:55", serviceEnd = ""} = {}) {
  const sheets = new Map(), properties = new Map(), emails = [], pdfLines = [];
  let uuid = 100, failWrite = false;
  function sheet(name, headers, records = []) {
    const rows = headers.length ? [headers.slice(), ...records.map(record => headers.map(key => record[key] ?? ""))] : [];
    const result = {
      rows, getName: () => name, getLastRow: () => rows.length, getMaxRows: () => Math.max(100, rows.length),
      setFrozenRows(){}, appendRow(row){rows.push(row.slice());}, deleteRow(n){rows.splice(n-1, 1);},
      getRange(r,c,h=1,w=1) {
        const range = {
          getValues: () => Array.from({length:h}, (_,i) => Array.from({length:w}, (_,j) => rows[r-1+i]?.[c-1+j] ?? "")),
          getDisplayValues: () => range.getValues().map(row => row.map(String)),
          setValue(v) { return range.setValues([[v]]); },
          setValues(values) {
            if (failWrite && name === "Nets") {failWrite = false; throw Error("Injected net write failure");}
            values.forEach((row,i) => row.forEach((v,j) => {rows[r-1+i] ||= []; rows[r-1+i][c-1+j] = v;})); return range;
          },
          setNumberFormat(){return range;}, setFontWeight(){return range;}
        };
        return range;
      }
    };
    sheets.set(name, result); return result;
  }
  const spreadsheet = {getSheetByName: n => sheets.get(n) || null, insertSheet: n => sheet(n, [])};
  const context = vm.createContext({
    Date: Clock, console,
    Session: {getScriptTimeZone: () => "UTC", getEffectiveUser: () => ({getEmail: () => "admin@example.test"})},
    Utilities: {
      getUuid: () => id(uuid++), DigestAlgorithm: {SHA_256: "sha256"}, Charset: {UTF_8: "utf8"},
      computeDigest: (_, v) => crypto.createHash("sha256").update(v).digest(),
      base64EncodeWebSafe: v => Buffer.from(v).toString("base64url"),
      base64Encode: v => Buffer.from(v).toString("base64"),
      parseDate: v => new Clock(v.replace(" ", "T") + ":00Z"),
      formatDate: (v, tz, format) => format === "HH:mm" ? v.toISOString().slice(11,16) : v.toISOString().slice(0,10)
    },
    SpreadsheetApp: {flush(){}, openById: () => spreadsheet},
    PropertiesService: {getScriptProperties: () => ({
      getProperty: k => properties.get(k) || null, deleteProperty: k => properties.delete(k),
      setProperty: (k,v) => properties.set(k,v), getProperties: () => Object.fromEntries(properties)
    })},
    LockService: {getScriptLock: () => ({waitLock(){}, hasLock: () => true, releaseLock(){}})},
    MailApp: {sendEmail: (...args) => emails.push(args)},
    DocumentApp: {create: () => ({getId: () => "temporary", getBody: () => ({
      clear: () => {pdfLines.length = 0;}, appendParagraph: line => pdfLines.push(line)
    }), saveAndClose(){}})},
    DriveApp: {getFileById: () => ({getAs: () => ({getBytes: () => Buffer.from("%PDF-mock")}), setTrashed(){}})},
    MimeType: {PDF: "application/pdf"}
  });
  vm.runInContext(source, context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../Admin.gs'), 'utf8'), context);
  const headers = vm.runInContext("({Nets:NET_HEADERS, CheckIns:CHECKIN_HEADERS, CallsignDirectory:CALLSIGN_DIRECTORY_HEADERS, NetControlAccess:NET_CONTROL_ACCESS_HEADERS, NetControlRequests:NET_CONTROL_REQUEST_HEADERS, NetControlHistory:NET_CONTROL_HISTORY_HEADERS, NetAdministration:NET_ADMINISTRATION_HEADERS})",context);
  const net = {id:netId, net_date:date, start_time:start, end_time:"", finalized:false, net_type:"two_meter_ncs",
    net_control_callsign:legacy ? "KA8ZGE" : "KC8QHK", net_control_station_type:"Home", net_control_traffic:false};
  const first = {id:id(3), net_id:netId, callsign:"KC8QHK", started_at:date+"T"+start+":00Z", ended_at:legacy ? now : serviceEnd};
  const records = {
    Nets:[net],
    CheckIns:[
      {id:id(8), net_id:netId, callsign:"KC8QHK", name:"Original", is_net_control:true, station_type:"Home"},
      {id:id(9), net_id:netId, callsign:"KA8ZGE", name:"Recovering", is_net_control:legacy, station_type:"Short Time"}
    ],
    NetControlHistory:legacy ? [first,{id:recoveryId, net_id:netId, callsign:"KA8ZGE", started_at:now, ended_at:""}] : [first],
    NetControlAccess:[{net_id:netId, owner_callsign:net.net_control_callsign, token_hash:context.hashToken_(token),
      issued_at:legacy ? now : first.started_at, expires_at:"2026-10-01T12:00:00Z", revoked_at:""}],
    NetControlRequests:[{id:id(5), net_id:netId, callsign:"KA8ZGE", token_hash:context.hashToken_(token),
      created_at:now, expires_at:"2026-09-05T12:10:00Z", status:"pending"}]
  };
  Object.keys(headers).filter(n => n !== "NetAdministration").forEach(n => sheet(n,headers[n],records[n] || []));
  properties.set("W8FY_SPREADSHEET_ID","fixture");
  const data = end => ({NET_HISTORICAL_NET_ID:netId, NET_HISTORICAL_END_AT:end,
    NET_HISTORICAL_RECOVERY_ID:recoveryId, NET_HISTORICAL_REASON:"Administrator confirms legacy recovery was administrative only; actual end from operator log."});
  const readNet = () => context.requireNet_(spreadsheet,netId);
  const snapshot = () => JSON.stringify([...sheets].map(([n,s]) => [n,s.rows]));
  return {context, spreadsheet, sheets, properties, emails, pdfLines, data, readNet, snapshot,
    injectFailure: () => {failWrite = true;}};
}
module.exports = {harness, id, netId, token, now};
if (require.main === module) {
let passed = 0;
function test(name, fn) {fn(); passed++; console.log("PASS " + name);}
test("legacy recovery failure reproduced; explicit historical finalization preserves records", () => {
  const h = harness(), c = h.context;
  const before = h.snapshot();
  assert.throws(() => c.finalizeNet_(h.spreadsheet,{netId,endTime:"11:30",ownerToken:token}), /earlier than/);
  assert.equal(h.snapshot(),before);
  const history = JSON.stringify(h.sheets.get("NetControlHistory").rows);
  const checkins = JSON.stringify(h.sheets.get("CheckIns").rows);
  const result = c.finalizeHistoricalNet_(h.spreadsheet,h.data("2026-08-29T11:30:00Z"));
  assert.equal(result.net.net_date,"2026-08-29");
  assert.equal(result.net.net_control_callsign,"KA8ZGE");
  assert.equal(result.report.durationMinutes,35);
  assert.equal(result.report.netControlTotalMinutes,35);
  assert.equal(result.report.netControlTimes.length,1);
  assert.equal(result.report.netControlTimes[0].callsign,"KC8QHK");
  assert.equal(result.report.netControlTimes[0].minutes,35);
  assert.equal(JSON.stringify(h.sheets.get("NetControlHistory").rows),history);
  assert.equal(JSON.stringify(h.sheets.get("CheckIns").rows),checkins);
  assert.equal(result.net.updated_at,new Date(now).toISOString());
  assert.equal(h.emails.length,0);
  const audit = c.getNetAdministration_(h.spreadsheet,netId)[0];
  assert.equal(audit.recovery_id,recoveryId);
  assert.equal(audit.service_end_at,"2026-08-29T11:30:00.000Z");
  assert.equal(audit.actor,"admin@example.test");
});
test("display, email and PDF consume identical historical report timing", () => {
  const h = harness(), c = h.context;
  const result = c.finalizeHistoricalNet_(h.spreadsheet,h.data("2026-08-29T11:30:00Z"));
  c.sendReport_(h.spreadsheet,{netId,ownerToken:token});
  c.downloadReportPdf_(h.spreadsheet,{netId,ownerToken:token});
  assert.equal(h.emails[0][2],result.report.text);
  assert.equal(h.pdfLines.join("\n"),result.report.text);
  assert.match(result.report.text,/Net Duration: 35 minutes/);
  assert.match(result.report.text,/Administrative ownership: KA8ZGE/);
  assert.doesNotMatch(result.report.text,/KA8ZGE - Recovering - \d+ minute/);
  assert.equal(c.getNetResponse_(h.spreadsheet,netId).report.text,result.report.text);
  assert.throws(() => c.downloadReportPdf_(h.spreadsheet,{netId,ownerToken:"invalid"}),/read-only/);
});
test("future editor recovery records administrative audit without on-air handoff", () => {
  const h = harness({legacy:false}), c = h.context;
  const history = JSON.stringify(h.sheets.get("NetControlHistory").rows);
  const checkins = JSON.stringify(h.sheets.get("CheckIns").rows);
  h.properties.set("NET_CONTROL_RECOVERY_CALLSIGN","KA8ZGE");
  c.recoverActiveNetControlToConfiguredCallsign();
  assert.equal(JSON.stringify(h.sheets.get("NetControlHistory").rows),history);
  assert.equal(JSON.stringify(h.sheets.get("CheckIns").rows),checkins);
  assert.equal(h.properties.has("NET_CONTROL_RECOVERY_CALLSIGN"),false);
  const audit = c.getNetAdministration_(h.spreadsheet,netId)[0];
  assert.equal(audit.kind,"recovery");
  assert.equal(audit.recorded_at,new Date(now).toISOString());
  assert.equal(h.readNet().net_control_callsign,"KA8ZGE");
  assert.throws(() => c.finalizeNet_(h.spreadsheet,{netId,endTime:"11:30",ownerToken:token}),/Administrative recovery/);
  const data = h.data("2026-08-29T11:30:00Z"); data.NET_HISTORICAL_RECOVERY_ID = audit.id;
  const result = c.finalizeHistoricalNet_(h.spreadsheet,data);
  assert.equal(result.report.netControlTotalMinutes,35);
  assert.equal(result.report.netControlTimes[0].callsign,"KC8QHK");
});
for (const [name,date,start,end,minutes] of [
  ["same-day","2026-09-05","10:55","11:30",35],
  ["overnight","2026-09-04","23:30","00:15",45]
]) test("normal " + name + " finalization", () => {
  const h = harness({legacy:false,date,start});
  assert.throws(() => h.context.finalizeNet_(h.spreadsheet,{netId,endTime:end,ownerToken:"bad"}),/read-only/);
  const result = h.context.finalizeNet_(h.spreadsheet,{netId,endTime:end,ownerToken:token});
  assert.equal(result.report.durationMinutes,minutes);
  assert.equal(result.report.netControlTotalMinutes,minutes);
  assert.equal(result.net.net_date,date);
});
test("historical overnight end with explicit UTC offset", () => {
  const h = harness({date:"2026-08-29",start:"23:30"});
  const result = h.context.finalizeHistoricalNet_(h.spreadsheet,h.data("2026-08-29T20:15:00-04:00"));
  assert.equal(result.net.end_time,"00:15");
  assert.equal(result.report.serviceEndAt,"2026-08-30T00:15:00.000Z");
  assert.equal(result.report.durationMinutes,45);
  assert.equal(result.report.netControlTotalMinutes,45);
});
test("historical report retains real on-air handoffs before administrative recovery", () => {
  const h = harness(), c = h.context;
  h.sheets.get("NetControlHistory").rows[1][4] = "2026-08-29T11:10:00Z";
  h.sheets.get("NetControlHistory").rows.splice(2,0,[id(21),netId,"KA8ZGE","2026-08-29T11:10:00Z",now]);
  const result = c.finalizeHistoricalNet_(h.spreadsheet,h.data("2026-08-29T11:30:00Z"));
  assert.equal(result.report.netControlTotalMinutes,35);
  const times = Object.fromEntries(result.report.netControlTimes.map(t => [t.callsign,t.minutes]));
  assert.deepEqual(times,{KA8ZGE:20,KC8QHK:15});
});
test("normal live handoff still records service and validates final end", () => {
  const h = harness({legacy:false,date:"2026-09-05",start:"11:00"}), c = h.context;
  const request = c.getRecords_(h.sheets.get("NetControlRequests"),vm.runInContext("NET_CONTROL_REQUEST_HEADERS",c))[0];
  c.approveNetControlRequest_(h.spreadsheet,h.readNet(),c.findNetControlAccess_(h.spreadsheet,netId),request);
  assert.equal(h.sheets.get("NetControlHistory").rows.length,3);
  assert.equal(h.sheets.get("CheckIns").rows[2][5],true);
  assert.equal(h.sheets.has("NetAdministration"),false);
  assert.throws(() => c.finalizeNet_(h.spreadsheet,{netId,endTime:"11:30",ownerToken:token}),/earlier than/);
  const result = c.finalizeNet_(h.spreadsheet,{netId,endTime:"12:30",ownerToken:token});
  assert.equal(result.report.durationMinutes,90);
  assert.equal(result.report.netControlTotalMinutes,90);
});
test("invalid, missing, future and unattended-day end timestamps do not mutate records", () => {
  for (const value of ["", "11:30", "2026-08-29T11:30:00", "2026-08-29T10:00:00Z", "2026-09-05T12:00:00Z", "2026-09-06T12:00:00Z", "2026-02-30T11:30:00Z"]) {
    const h = harness(), before = h.snapshot();
    assert.throws(() => h.context.finalizeHistoricalNet_(h.spreadsheet,h.data(value)));
    assert.equal(h.snapshot(),before);
  }
});
test("wrong recovery, owner, missing reason and conflicting service history fail closed", () => {
  for (const kind of ["id","owner","reason","history"]) {
    const h = harness(), data = h.data("2026-08-29T11:30:00Z");
    if (kind === "id") data.NET_HISTORICAL_RECOVERY_ID = id(999);
    if (kind === "reason") data.NET_HISTORICAL_REASON = "";
    if (kind === "owner") h.sheets.get("NetControlAccess").rows[1][1] = "OTHER";
    if (kind === "history") h.sheets.get("NetControlHistory").rows.push([id(20),netId,"OTHER","2026-08-29T12:00:00Z",now]);
    const before = h.snapshot();
    assert.throws(() => h.context.finalizeHistoricalNet_(h.spreadsheet,data));
    assert.equal(h.snapshot(),before);
  }
});
test("historical transaction rolls back net, access and audit on write failure", () => {
  const h = harness(), c = h.context;
  c.ensureNetAdministrationSheet_(h.spreadsheet);
  const before = h.snapshot(); h.injectFailure();
  assert.throws(() => c.finalizeHistoricalNet_(h.spreadsheet,h.data("2026-08-29T11:30:00Z")),/Injected/);
  assert.equal(h.snapshot(),before);
});
test("manual properties consumed, no API exposure, no email or duplicate finalization", () => {
  const h = harness(), data = h.data("2026-08-29T11:30:00Z");
  Object.entries(data).forEach(([k,v]) => h.properties.set(k,v));
  h.context.finalizeHistoricalNetFromConfiguredEnd();
  Object.keys(data).forEach(k => assert.equal(h.properties.has(k),false));
  assert.equal(h.emails.length,0);
  assert.throws(() => h.context.finalizeHistoricalNet_(h.spreadsheet,data),/finalized/);
  assert.equal(vm.runInContext("POST_ACTIONS.includes('finalizeHistoricalNetFromConfiguredEnd')",h.context),false);
});
console.log(passed + " historical finalization tests passed");
}
