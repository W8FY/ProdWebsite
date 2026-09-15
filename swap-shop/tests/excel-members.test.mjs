import test from 'node:test';
import assert from 'node:assert/strict';
import { mapMemberRows, membershipCutoff } from '../excel-members.mjs';
import { Shop, DAY } from '../store.mjs';

const header = ['CALL', 'E-MAIL', 'DUES PAID', 'YEAR', 'FIRST', 'STREET'];
const now = Date.parse('2026-09-11T12:00:00Z');
const map = rows => mapMemberRows([header, ...rows], now);

test('YEAR covers December 31 in club local time, including prepaid future years', () => {
  assert.equal(membershipCutoff(2026), '2027-01-01T05:00:00.000Z');
  assert.equal(membershipCutoff(' 2028 '), '2029-01-01T05:00:00.000Z');
  const result = map([['w8test', ' MEMBER@example.test ', null, 2026, 'Private name', 'Private address']]);
  assert.deepEqual(result.members, [{ email: 'member@example.test', callsign: 'W8TEST', valid_until: '2027-01-01T05:00:00.000Z' }]);
  assert.equal(JSON.stringify(result).includes('Private'), false);
});

test('missing or expired years and missing identity fields never grant membership', () => {
  const result = map([
    ['W8ONE', 'one@example.test', new Date(), null],
    ['W8TWO', 'two@example.test', new Date(), 2025],
    ['W8THREE', null, null, 2026],
    [null, 'four@example.test', null, 2026],
    [],
    ['W8FIVE', 'five@example.test', null, 2028]
  ]);
  assert.deepEqual(result.summary, { eligible: 1, blankRows: 1, missingYear: 1, expired: 1, missingEmail: 1, missingCallsign: 1 });
  assert.equal(result.members[0].callsign, 'W8FIVE');
});

test('membership stops at the exact year boundary even with a fresh roster', () => {
  let time = Date.parse('2027-01-01T04:59:59.999Z');
  const rows = [header, ['W8TEST', 'member@example.test', null, 2026]];
  const shop = new Shop(':memory:', { now: () => time });
  try {
    shop.importMembers(mapMemberRows(rows, time).members, time);
    assert.ok(shop.member('member@example.test'));
    time++;
    assert.equal(shop.member('member@example.test'), undefined);
    assert.equal(mapMemberRows(rows, time).members.length, 0);
  } finally { shop.db.close(); }
});

test('ambiguous emails and malformed or formula years fail without disclosing values', () => {
  assert.throws(() => map([['W8ONE', 'member@example.test', null, 2026], ['W8TWO', 'MEMBER@example.test', null, 2027]]), error => error.message.includes('rows 2 and 3') && !error.message.includes('@'));
  for (const year of [true, 2026.5, '2026 paid', '=YEAR(TODAY())', new Date(), 99999, { formula: '2026', result: 2026 }]) {
    assert.throws(() => map([['W8TEST', 'member@example.test', null, year]]), /row 2: YEAR/);
  }
  assert.throws(() => map([['W8TEST', 'not-an-email', null, 2026]]), /invalid E-MAIL/);
});

test('columns are matched by headers; required headers cannot be missing or duplicated', () => {
  const result = mapMemberRows([['YEAR', 'E-MAIL', 'CALL'], [2026, 'member@example.test', 'W8TEST']], now);
  assert.equal(result.members.length, 1);
  assert.throws(() => mapMemberRows([['CALL', 'E-MAIL'], ['W8TEST', 'member@example.test']], now), /YEAR column/);
  assert.throws(() => mapMemberRows([['CALL', 'YEAR', 'YEAR', 'E-MAIL']], now), /YEAR column/);
});

test('manual workbook import accepts an older export and preserves its timestamp', () => {
  const shop = new Shop(':memory:', { now: () => now + 2 * DAY });
  try { shop.importMembers(map([['W8TEST', 'member@example.test', null, 2026]]).members, now); assert.equal(shop.member('member@example.test').callsign, 'W8TEST'); }
  finally { shop.db.close(); }
});
