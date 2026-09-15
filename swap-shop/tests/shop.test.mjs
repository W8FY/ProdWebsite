import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { Shop, DAY } from '../store.mjs';
import { createServer } from '../server.mjs';

const member = 'member@example.test', other = 'other@example.test', admin = 'admin@example.test';
const photo = (await sharp({ create: { width: 12, height: 10, channels: 3, background: '#123456' } }).png().withMetadata().toBuffer()).toString('base64');
const fields = { title: 'HF transceiver', description: 'Tested on the air.', condition: 'Good', price: '150.25', contact: 'Call me on the club repeater', photos: [photo] };

async function fixture(t) {
  let time = Date.parse('2026-09-10T12:00:00Z');
  const dir = mkdtempSync(join(tmpdir(), 'w8fy-swap-test-'));
  const shop = new Shop(join(dir, 'shop.sqlite'), { now: () => time, admins: [admin] });
  const rows = [member, other].map((email, i) => ({ email, callsign: i ? 'W8OTHER' : 'W8TEST', valid_until: '2030-01-01T00:00:00Z' }));
  shop.importMembers(rows);
  const mail = [];
  const origin = 'https://w8fy.test';
  const server = createServer({ shop, origin, sendCode: (email, code) => mail.push({ email, code }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/swap-api`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); shop.db.close(); rmSync(dir, { recursive: true, force: true }); });
  async function req(path, body, cookie, headers = {}) {
    const response = await fetch(url + path, { headers: { ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    const content = response.headers.get('content-type') || '';
    return { status: response.status, headers: response.headers, data: content.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
  }
  async function login(email) {
    const request = await req('/auth/request', { email }); assert.equal(request.status, 200);
    const sent = mail.findLast(m => m.email === email.toLowerCase().trim()); assert.ok(sent);
    const verified = await req('/auth/verify', { challenge: request.data.challenge, code: sent.code }); assert.equal(verified.status, 200);
    return verified.headers.get('set-cookie').split(';')[0];
  }
  const submit = async (cookie, body = fields) => { const r = await req('/listings', body, cookie); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.listing; };
  const act = (cookie, listing, action, reason) => req(`/listings/${listing.id}/action`, { action, version: listing.version, reason }, cookie);
  return { shop, mail, req, login, submit, act, advance: ms => { time += ms; }, refresh: () => shop.importMembers(rows) };
}

test('email control is required; no roster enumeration, callsign or role impersonation', async t => {
  const f = await fixture(t);
  assert.equal((await f.req('/listings', fields)).status, 401);
  const outsider = await f.req('/auth/request', { email: 'outsider@example.test', callsign: 'W8TEST' });
  const eligible = await f.req('/auth/request', { email: member });
  assert.deepEqual(Object.keys(outsider.data), Object.keys(eligible.data));
  assert.equal(outsider.data.message, eligible.data.message);
  assert.equal(f.mail.length, 2);
  assert.equal((await f.req('/auth/verify', { challenge: outsider.data.challenge, code: f.mail[1].code })).status, 401);
  assert.equal((await f.req('/auth/verify', { challenge: outsider.data.challenge, code: f.mail[0].code })).status, 403);
  assert.equal((await f.req('/auth/verify', { challenge: eligible.data.challenge, code: 'incorrect', email: member })).status, 401);
  const verified = await f.req('/auth/verify', { challenge: eligible.data.challenge, code: f.mail[1].code });
  assert.equal(verified.status, 200);
  assert.match(verified.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
  assert.equal((await f.req('/auth/verify', { challenge: eligible.data.challenge, code: f.mail[1].code })).status, 401);
  const cookie = verified.headers.get('set-cookie').split(';')[0];
  const row = await f.submit(cookie, { ...fields, callsign: 'FAKE', owner: other, status: 'approved', admin: true, expires_at: 9999999999999 });
  assert.equal(row.callsign, 'W8TEST'); assert.equal(row.status, 'pending'); assert.equal(row.expires_at, null);
  assert.equal((await f.req('/listings?scope=admin', undefined, cookie)).status, 403);
  assert.equal((await f.req('/listings?scope=mine')).status, 401);
  assert.equal((await f.req('/listings?scope=mine', undefined, '__Host-w8fySwap=forged')).status, 401);
});

test('codes expire, have an attempt limit, and sending is rate limited', async t => {
  const f = await fixture(t);
  const challenge = (await f.req('/auth/request', { email: member })).data.challenge;
  for (let i = 0; i < 5; i++) assert.equal((await f.req('/auth/verify', { challenge, code: 'bad' })).status, 401);
  assert.equal((await f.req('/auth/verify', { challenge, code: f.mail[0].code })).status, 401);
  const second = (await f.req('/auth/request', { email: member })).data.challenge;
  f.advance(600000);
  assert.equal((await f.req('/auth/verify', { challenge: second, code: f.mail.at(-1).code })).status, 401);
  for (let i = 0; i < 3; i++) assert.equal((await f.req('/auth/request', { email: member })).status, 200);
  assert.equal((await f.req('/auth/request', { email: member })).status, 429);
});

test('approval gates content and photos; another member cannot read or mutate private data', async t => {
  const f = await fixture(t), owner = await f.login(member), stranger = await f.login(other), moderator = await f.login(admin);
  const row = await f.submit(owner);
  assert.deepEqual((await f.req('/listings')).data.listings, []);
  const path = '/photos/' + row.photos[0];
  assert.equal((await f.req(path)).status, 404);
  assert.equal((await f.req(path, undefined, stranger)).status, 404);
  assert.equal((await f.req(path, undefined, owner)).status, 200);
  assert.equal((await f.req(path, undefined, moderator)).status, 200);
  assert.equal((await f.act(stranger, row, 'withdraw')).status, 404);
  assert.equal((await f.act(owner, row, 'approve')).status, 403);
  assert.equal((await f.req('/listings', { ...fields, id: row.id, version: row.version }, stranger)).status, 404);
  const approved = await f.act(moderator, row, 'approve'); assert.equal(approved.status, 200);
  assert.equal(approved.data.listing.expires_at - approved.data.listing.approved_at, 60 * DAY);
  const publicRow = (await f.req('/listings')).data.listings[0];
  assert.equal(publicRow.title, fields.title); assert.equal(publicRow.contact, fields.contact);
  assert.equal('owner' in publicRow, false); assert.equal('reason' in publicRow, false);
  assert.equal(JSON.stringify(publicRow).includes(member), false);
  const publicPhoto = await f.req(path); assert.equal(publicPhoto.status, 200);
  assert.match(publicPhoto.headers.get('cache-control'), /no-store/);
  assert.equal(publicPhoto.headers.get('content-type'), 'image/jpeg');
  const meta = await sharp(publicPhoto.data).metadata(); assert.equal(meta.exif, undefined); assert.equal(meta.xmp, undefined);
});

test('edits immediately hide the entire posting; stale moderation cannot approve a different revision', async t => {
  const f = await fixture(t), owner = await f.login(member), moderator = await f.login(admin);
  const pending = await f.submit(owner);
  const approved = (await f.act(moderator, pending, 'approve')).data.listing;
  const edited = await f.submit(owner, { ...fields, id: approved.id, version: approved.version, title: 'Changed title' });
  assert.equal(edited.status, 'pending'); assert.equal(edited.expires_at, null);
  assert.deepEqual((await f.req('/listings')).data.listings, []);
  assert.equal((await f.req('/photos/' + approved.photos[0])).status, 404);
  assert.equal((await f.req('/photos/' + edited.photos[0])).status, 404);
  assert.equal((await f.act(moderator, approved, 'approve')).status, 409);
  assert.equal((await f.req('/listings', { ...fields, id: approved.id, version: approved.version }, owner)).status, 409);
  assert.equal((await f.act(moderator, edited, 'approve')).status, 200);
  assert.equal((await f.req('/listings')).data.listings[0].title, 'Changed title');
});

test('expiration is exact, applies to photos without a scheduled job, and renewal needs an administrator', async t => {
  const f = await fixture(t);
  let owner = await f.login(member), moderator = await f.login(admin);
  let row = (await f.act(moderator, await f.submit(owner), 'approve')).data.listing;
  f.advance(60 * DAY - 1);
  assert.equal((await f.req('/listings')).data.listings.length, 1);
  f.advance(1);
  assert.deepEqual((await f.req('/listings')).data.listings, []);
  assert.equal((await f.req('/photos/' + row.photos[0])).status, 404);
  f.refresh(); owner = await f.login(member); moderator = await f.login(admin);
  assert.equal((await f.req('/listings?scope=mine', undefined, owner)).data.listings[0].status, 'expired');
  row = (await f.act(owner, row, 'renew')).data.listing;
  const oldExpiry = row.expires_at;
  assert.equal(row.renewal, 1); assert.equal(row.status, 'expired');
  assert.equal((await f.act(owner, row, 'approve-renewal')).status, 403);
  assert.equal((await f.act(owner, row, 'renew')).status, 409);
  assert.equal((await f.req('/photos/' + row.photos[0])).status, 404);
  f.advance(3600000);
  row = (await f.act(moderator, row, 'approve-renewal')).data.listing;
  assert.equal(row.expires_at, oldExpiry + 3600000 + 60 * DAY);
  assert.equal(row.renewal, 0); assert.equal((await f.req('/photos/' + row.photos[0])).status, 200);
  assert.equal((await f.act(moderator, row, 'approve-renewal')).status, 409);
});

test('removal, sold and withdrawal close public access immediately and cannot be renewed or edited', async t => {
  const f = await fixture(t), owner = await f.login(member), moderator = await f.login(admin);
  for (const action of ['remove','sold','withdraw']) {
    let row = (await f.act(moderator, await f.submit(owner), 'approve')).data.listing;
    row = (await f.act(owner, row, 'renew')).data.listing;
    const old = row;
    row = (await f.act(action === 'remove' ? moderator : owner, row, action)).data.listing;
    assert.deepEqual((await f.req('/listings')).data.listings, []);
    assert.equal((await f.req('/photos/' + row.photos[0])).status, 404);
    assert.equal((await f.act(moderator, old, 'approve-renewal')).status, 409);
    assert.equal((await f.act(moderator, row, 'approve-renewal')).status, 409);
    assert.equal((await f.act(owner, row, 'renew')).status, 409);
    assert.equal((await f.req('/listings', { ...fields, id: row.id, version: row.version }, owner)).status, 409);
  }
});

test('rejection stays private, resubmission needs approval, and declined renewal never extends expiration', async t => {
  const f = await fixture(t), owner = await f.login(member), moderator = await f.login(admin);
  let row = await f.submit(owner);
  assert.equal((await f.act(moderator, row, 'reject', '')).status, 400);
  row = (await f.act(moderator, row, 'reject', 'Please clarify condition.')).data.listing;
  assert.equal(row.status, 'rejected'); assert.equal(row.reason, 'Please clarify condition.');
  assert.equal((await f.req('/photos/' + row.photos[0])).status, 404);
  row = await f.submit(owner, { ...fields, id: row.id, version: row.version });
  row = (await f.act(moderator, row, 'approve')).data.listing;
  const expires = row.expires_at;
  row = (await f.act(owner, row, 'renew')).data.listing;
  row = (await f.act(moderator, row, 'reject-renewal', 'Please update the listing first.')).data.listing;
  assert.equal(row.expires_at, expires); assert.equal(row.renewal, 0);
  assert.equal((await f.req('/listings')).data.listings.length, 1);
});

test('membership revocation and paid-through expiration fail closed; owners can still withdraw', async t => {
  const f = await fixture(t), owner = await f.login(member);
  let moderator = await f.login(admin);
  let row = await f.submit(owner);
  f.shop.importMembers([]);
  assert.equal((await f.req('/listings', fields, owner)).status, 403);
  assert.equal((await f.act(moderator, row, 'approve')).status, 409);
  assert.equal((await f.act(owner, row, 'withdraw')).status, 200);
  f.refresh(); row = await f.submit(owner);
  f.advance(Date.parse('2030-01-01T00:00:00Z') - f.shop.now());
  assert.ok(!f.shop.member(member));
  const before = f.mail.length;
  const denied = await f.req('/auth/request', { email: member }); assert.equal(f.mail.length, before + 1);
  assert.equal((await f.req('/auth/verify', { challenge: denied.data.challenge, code: f.mail.at(-1).code })).status, 403);
  moderator = await f.login(admin);
  assert.equal((await f.act(moderator, row, 'approve')).status, 409);
});

test('sessions expire, logout revokes the server session, admin revocation is enforced per request, and CSRF is rejected', async t => {
  const f = await fixture(t), owner = await f.login(member), moderator = await f.login(admin);
  assert.equal((await f.req('/listings', fields, owner, { Origin: 'https://attacker.test' })).status, 403);
  assert.equal((await f.req('/listings', fields, owner, { Origin: '' })).status, 403);
  assert.equal((await f.req('/listings', fields, owner, { 'Content-Type': 'text/plain' })).status, 415);
  f.shop.admins.delete(admin);
  assert.equal((await f.req('/listings?scope=admin', undefined, moderator)).status, 403);
  await f.req('/auth/logout', {}, owner);
  assert.equal((await f.req('/listings?scope=mine', undefined, owner)).status, 401);
  const renewed = await f.login(member); f.advance(8 * 3600000);
  assert.equal((await f.req('/listings?scope=mine', undefined, renewed)).status, 401);
});

test('photos and field validation reject malicious or excessive uploads atomically', async t => {
  const f = await fixture(t), owner = await f.login(member);
  for (const body of [
    { ...fields, photos: Array(6).fill(photo) },
    { ...fields, photos: [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')] },
    { ...fields, photos: [Buffer.from('not an image').toString('base64')] },
    { ...fields, photos: [Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')] },
    { ...fields, title: '' }, { ...fields, price: '-1' }, { ...fields, price: '1.001' }, { ...fields, contact: '' }, { ...fields, condition: 'unknown' }
  ]) assert.equal((await f.req('/listings', body, owner)).status, 400);
  assert.deepEqual((await f.req('/listings?scope=mine', undefined, owner)).data.listings, []);
  const clean = await f.submit(owner, { ...fields, photos: [] }); assert.deepEqual(clean.photos, []);
  assert.equal((await f.req('/photos/../../members')).status, 404);
  assert.equal((await f.req('/members', undefined, owner)).status, 404);
});

test('duplicate membership emails do not replace the valid roster and inactive memberships cannot sign in', async t => {
  const f = await fixture(t);
  assert.throws(() => f.shop.importMembers([
    { email: member, callsign: 'ONE', valid_until: '2030-01-01' },
    { email: member.toUpperCase(), callsign: 'TWO', valid_until: '2030-01-01' }
  ]));
  assert.equal(f.shop.member(member).callsign, 'W8TEST');
  f.shop.importMembers([{ email: member, callsign: 'W8TEST', valid_until: '2020-01-01' }]);
  const denied = await f.req('/auth/request', { email: member }); assert.equal(f.mail.length, 1);
  assert.equal((await f.req('/auth/verify', { challenge: denied.data.challenge, code: f.mail[0].code })).status, 403);
  assert.equal((await f.req('/auth/request', { email: 'Member <member@example.test>' })).status, 400);
});

test('two moderator decisions cannot both win and pending removal cannot later be approved', async t => {
  const f = await fixture(t), owner = await f.login(member), moderator = await f.login(admin);
  const row = await f.submit(owner);
  const outcomes = await Promise.all([f.act(moderator, row, 'approve'), f.act(moderator, row, 'reject', 'Not suitable')]);
  assert.deepEqual(outcomes.map(x => x.status).sort(), [200,409]);
  const pending = await f.submit(owner);
  const removed = (await f.act(moderator, pending, 'remove')).data.listing;
  assert.equal((await f.act(moderator, removed, 'approve')).status, 409);
  assert.equal(f.shop.get('SELECT count(*) AS n FROM audit WHERE listing_id=?', row.id).n, 2);
});

test('manual roster persists beyond 48 hours but never extends paid-through eligibility', async t => {
  const f = await fixture(t);
  const generated = f.shop.now();
  const rows = [{ email: member, callsign: 'W8TEST', valid_until: '2030-01-01' }];
  f.advance(DAY);
  f.shop.importMembers(rows, generated);
  assert.equal(f.shop.member(member).callsign, 'W8TEST');
  f.advance(30 * DAY);
  assert.equal(f.shop.member(member).callsign, 'W8TEST');
  f.shop.importMembers(rows, generated);
  f.advance(Date.parse('2030-01-01T00:00:00Z') - f.shop.now());
  assert.ok(!f.shop.member(member));
  f.shop.importMembers(rows, generated);
  assert.ok(!f.shop.member(member));
  assert.throws(() => f.shop.importMembers(rows, f.shop.now() + DAY));
});

test('approved photos and private sessions survive a database reopen; five photos are accepted', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'w8fy-swap-persistence-'));
  const path = join(dir, 'shop.sqlite');
  let shop = new Shop(path, { admins: [admin] });
  t.after(() => { shop.db.close(); rmSync(dir, { recursive: true, force: true }); });
  shop.importMembers([{ email: member, callsign: 'W8TEST', valid_until: '2035-01-01' }]);
  const challenge = shop.challenge(member, 'local');
  const session = shop.verify(challenge.id, challenge.code, 'local');
  const { prepareListing } = await import('../store.mjs');
  const row = shop.save(shop.user(session), await prepareListing({ ...fields, photos: Array(5).fill(photo) }));
  shop.action({ email: admin, admin: true }, row.id, 'approve', row.version);
  shop.db.close();
  shop = new Shop(path, { admins: [admin] });
  assert.equal(shop.user(session).email, member);
  assert.equal(shop.list('public', null)[0].photos.length, 5);
  assert.ok(shop.photo(row.photos[0], null).length > 0);
});
