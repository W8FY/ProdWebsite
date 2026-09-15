import ExcelJS from 'exceljs';
import { stat } from 'node:fs/promises';
import { emailKey, emailValid, Fault } from './store.mjs';

const blank = value => value == null || (typeof value === 'string' && !value.trim());
const invalid = message => { throw new Fault(400, message); };

// YEAR is the last paid calendar year. January 1 midnight in Van Wert is UTC-05.
export function membershipCutoff(value) {
  const year = typeof value === 'number' ? value : typeof value === 'string' && /^\d{4}$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isInteger(year) || year < 1900 || year > 9998) invalid('YEAR must be a four-digit calendar year.');
  return new Date(Date.UTC(year + 1, 0, 1, 5)).toISOString();
}

export function mapMemberRows(rows, now = Date.now()) {
  if (!Array.isArray(rows) || !Array.isArray(rows[0])) invalid('Members sheet is missing its header row.');
  const headers = rows[0].map(value => typeof value === 'string' ? value.trim().toUpperCase() : '');
  const columns = {};
  for (const name of ['CALL', 'E-MAIL', 'YEAR']) {
    if (headers.filter(header => header === name).length !== 1) invalid(`Members sheet needs exactly one ${name} column.`);
    columns[name] = headers.indexOf(name);
  }
  const members = [], seen = new Map(), issues = [];
  const summary = { eligible: 0, blankRows: 0, missingYear: 0, expired: 0, missingEmail: 0, missingCallsign: 0 };
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index] || [], number = index + 1;
    if (row.every(blank)) { summary.blankRows++; continue; }
    const year = row[columns.YEAR];
    if (blank(year)) { summary.missingYear++; continue; }
    let valid_until;
    try { valid_until = membershipCutoff(year); } catch { issues.push(`Members row ${number}: YEAR must be a four-digit calendar year.`); continue; }
    if (Date.parse(valid_until) <= now) { summary.expired++; continue; }
    const rawEmail = row[columns['E-MAIL']], rawCallsign = row[columns.CALL];
    if (blank(rawEmail)) { summary.missingEmail++; continue; }
    const email = emailKey(rawEmail);
    if (!emailValid(email)) { issues.push(`Members row ${number}: invalid E-MAIL. Correct it in the membership panel.`); continue; }
    if (seen.has(email)) { issues.push(`Members rows ${seen.get(email)} and ${number}: duplicate email. Resolve shared-email ownership in the membership panel.`); continue; }
    seen.set(email, number);
    if (blank(rawCallsign)) { summary.missingCallsign++; continue; }
    if (typeof rawCallsign !== 'string' || !/^[A-Z0-9/ -]{1,20}$/i.test(rawCallsign.trim())) { issues.push(`Members row ${number}: invalid CALL.`); continue; }
    members.push({ email, callsign: rawCallsign.trim().toUpperCase(), valid_until });
  }
  summary.eligible = members.length;
  if (issues.length) invalid(issues.join('\n'));
  return { members, summary };
}

export async function readMemberWorkbook(path, now = Date.now()) {
  const info = await stat(path);
  if (!info.isFile() || info.size > 5 * 1024 * 1024) invalid('Use a membership workbook no larger than 5 MiB.');
  let rows;
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    const sheet = workbook.getWorksheet('Members');
    if (!sheet || sheet.rowCount > 10000 || sheet.columnCount > 100) throw Error();
    rows = [];
    for (let index = 1; index <= sheet.rowCount; index++) {
      rows.push(Array.from({ length: sheet.columnCount }, (_, column) => {
        const value = sheet.getRow(index).getCell(column + 1).value;
        return value && typeof value === 'object' && 'hyperlink' in value && typeof value.text === 'string' ? value.text : value;
      }));
    }
  }
  catch { invalid('Could not read the Members sheet. Use the original .xlsx export from the membership panel.'); }
  // Never execute macros, evaluate formulas, or follow workbook instructions.
  return mapMemberRows(rows, now);
}
