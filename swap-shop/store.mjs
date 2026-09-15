import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';

// Constrain native image work on shared hosting. Photos are decoded sequentially.
sharp.concurrency(1);
sharp.cache({ memory: 16, files: 0, items: 20 });

export const DAY = 86400000;
export class Fault extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new Fault(status, message); };
export const hash = value => createHash('sha256').update(value).digest('hex');
export const emailKey = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const emailValid = value => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(value) && value.length <= 254;
const token = () => randomBytes(32).toString('hex');
const text = (value, min, max) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\u0000-\u0008\u000b-\u001f]/.test(value)) fail(400, 'Invalid listing fields.');
  return value.trim();
};

// The only persisted photo bytes are decoded, resized JPEGs, without source metadata.
export async function prepareListing(input) {
  const result = {
    title: text(input.title, 1, 120), description: text(input.description, 1, 5000),
    condition: text(input.condition, 1, 30), contact: text(input.contact, 1, 500)
  };
  if (!['New', 'Like new', 'Good', 'Fair', 'For parts'].includes(result.condition)) fail(400, 'Choose a condition.');
  if (typeof input.price !== 'string' || !/^\d{1,7}(\.\d{1,2})?$/.test(input.price)) fail(400, 'Enter a nonnegative USD price with at most two decimals.');
  result.price_cents = Math.round(Number(input.price) * 100);
  if (!Array.isArray(input.photos) || input.photos.length > 5) fail(400, 'At most five photos are allowed.');
  result.photos = [];
  for (const encoded of input.photos) {
    if (typeof encoded !== 'string' || encoded.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) fail(400, 'Invalid photo.');
    const source = Buffer.from(encoded, 'base64');
    if (source.length > 5 * 1024 * 1024) fail(400, 'Each photo must be at most 5 MB.');
    const isRaster = source.subarray(0,3).equals(Buffer.from([255,216,255])) ||
      source.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
      (source.toString('ascii',0,4) === 'RIFF' && source.toString('ascii',8,12) === 'WEBP');
    if (!isRaster) fail(400, 'Use JPEG, PNG or WebP photos.');
    try {
      const options = { limitInputPixels: 20000000, failOn: 'warning' };
      const metadata = await sharp(source, options).metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw Error();
      result.photos.push(await sharp(source, options).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer());
    } catch { fail(400, 'Use a valid, single-frame JPEG, PNG or WebP photo under 20 megapixels.'); }
  }
  return result;
}

export class Shop {
  constructor(path, { now = Date.now, admins = [], rosterMaxAge = Infinity } = {}) {
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.now = now;
    this.admins = new Set(admins.map(emailKey));
    this.rosterMaxAge = rosterMaxAge;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS members(email TEXT PRIMARY KEY, callsign TEXT NOT NULL, valid_until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, email TEXT NOT NULL, digest TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions(digest TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, start INTEGER NOT NULL, count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS upload_lease(key TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY, owner TEXT NOT NULL, callsign TEXT NOT NULL,
        title TEXT NOT NULL, description TEXT NOT NULL, condition TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents>=0), contact TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','sold','withdrawn','removed')),
        version INTEGER NOT NULL DEFAULT 1, approved_at INTEGER, expires_at INTEGER, renewal INTEGER NOT NULL DEFAULT 0,
        reason TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE, position INTEGER NOT NULL, bytes BLOB NOT NULL, UNIQUE(listing_id,position));
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, listing_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, at INTEGER NOT NULL, version INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS public_listings ON listings(status,expires_at);
      CREATE INDEX IF NOT EXISTS owner_listings ON listings(owner,created_at);
    `);
  }
  get(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  importMembers(rows, generatedAt = this.now()) {
    if (!Array.isArray(rows)) fail(400, 'Roster must be an array.');
    if (!Number.isSafeInteger(generatedAt) || generatedAt > this.now() + 300000 || this.now() - generatedAt >= this.rosterMaxAge) fail(400, 'Roster export timestamp is invalid or stale.');
    const seen = new Set();
    const validated = rows.map(row => {
      const email = emailKey(row.email), callsign = text(row.callsign, 1, 20).toUpperCase();
      const until = Date.parse(row.valid_until);
      if (!emailValid(email) || seen.has(email) || !/^[A-Z0-9/ -]+$/.test(callsign) || !Number.isFinite(until)) fail(400, 'Invalid or duplicate member record.');
      seen.add(email);
      return [email, callsign, until];
    });
    this.transaction(() => {
      this.run('DELETE FROM members');
      for (const row of validated) this.run('INSERT INTO members VALUES(?,?,?)', ...row);
      this.run("INSERT OR REPLACE INTO metadata VALUES('roster_updated',?)", generatedAt);
    });
  }
  member(email) {
    const sync = this.get("SELECT value FROM metadata WHERE key='roster_updated'");
    if (!sync || this.now() - sync.value >= this.rosterMaxAge) return null;
    return this.get('SELECT callsign FROM members WHERE email=? AND valid_until>?', email, this.now());
  }
  limit(key, count, window = 3600000) {
    return this.transaction(() => this.limitLocked(key, count, window));
  }
  limitLocked(key, count, window) {
    const now = this.now();
    this.run('DELETE FROM limits WHERE start<?', now - DAY);
    const row = this.get('SELECT * FROM limits WHERE key=?', key);
    if (!row || row.start + window <= now) this.run('INSERT OR REPLACE INTO limits VALUES(?,?,1)', key, now);
    else {
      if (row.count >= count) fail(429, 'Too many requests. Please try again later.');
      this.run('UPDATE limits SET count=count+1 WHERE key=?', key);
    }
  }
  challenge(email, ip) {
    email = emailKey(email);
    if (!emailValid(email)) fail(400, 'Enter a valid email address.');
    this.limit('mail-ip:' + hash(ip), 20);
    this.limit('mail-email:' + hash(email), 5);
    this.limit('mail-global', 100);
    this.run('DELETE FROM challenges WHERE expires<=?', this.now());
    const id = token();
    // Verify mailbox control before checking membership. Sending the same kind
    // of email to every requester avoids revealing roster matches by SMTP timing.
    const code = String(randomInt(0, 100000000)).padStart(8, '0');
    this.run('DELETE FROM challenges WHERE email=?', email);
    this.run('INSERT INTO challenges(id,email,digest,expires) VALUES(?,?,?,?)', id, email, hash(id + code), this.now() + 600000);
    return { id, email, code };
  }
  verify(id, code, ip) {
    this.limit('verify-ip:' + hash(ip), 40);
    const result = this.transaction(() => this.verifyLocked(id, code));
    if (result instanceof Fault) throw result;
    return result;
  }
  verifyLocked(id, code) {
    const row = this.get('SELECT * FROM challenges WHERE id=?', String(id));
    if (!row || row.expires <= this.now() || row.attempts >= 5) return new Fault(401, 'Invalid or expired code.');
    this.run('UPDATE challenges SET attempts=attempts+1 WHERE id=?', id);
    if (!timingSafeEqual(Buffer.from(hash(id + String(code))), Buffer.from(row.digest))) return new Fault(401, 'Invalid or expired code.');
    this.run('DELETE FROM challenges WHERE id=?', id);
    if (!this.member(row.email) && !this.admins.has(row.email)) return new Fault(403, 'Membership is not currently verified. Contact the club.');
    const session = token();
    this.run('DELETE FROM sessions WHERE expires<=?', this.now());
    this.run('INSERT INTO sessions VALUES(?,?,?)', hash(session), row.email, this.now() + 8 * 3600000);
    return session;
  }
  reserveUpload() {
    return this.transaction(() => {
      const current = this.get("SELECT * FROM upload_lease WHERE key='photos'");
      if (current && current.expires > this.now()) fail(503, 'Photo processing is busy. Try again shortly.');
      const owner = token();
      this.run("INSERT OR REPLACE INTO upload_lease VALUES('photos',?,?)", owner, this.now() + 300000);
      return owner;
    });
  }
  renewUpload(owner) { this.run("UPDATE upload_lease SET expires=? WHERE key='photos' AND owner=?", this.now() + 300000, owner); }
  releaseUpload(owner) { this.run("DELETE FROM upload_lease WHERE key='photos' AND owner=?", owner); }
  user(session) {
    if (!session) return null;
    const row = this.get('SELECT email FROM sessions WHERE digest=? AND expires>?', hash(session), this.now());
    if (!row) return null;
    return { email: row.email, admin: this.admins.has(row.email), callsign: this.member(row.email)?.callsign || null };
  }
  logout(session) { this.run('DELETE FROM sessions WHERE digest=?', hash(session || '')); }
  authenticated(user) { if (!user) fail(401, 'Sign in first.'); }
  requireMember(user) { this.authenticated(user); if (!user.callsign) fail(403, 'Current membership verification is unavailable. Contact the club.'); }
  isPublic(row) { return row.status === 'approved' && row.expires_at > this.now(); }
  visible(row, user) { return this.isPublic(row) || (user && (user.admin || user.email === row.owner)); }
  serialize(row, privateView = false) {
    const { owner, reason, ...listing } = row;
    if (privateView) listing.reason = reason;
    listing.status = row.status === 'approved' && !this.isPublic(row) ? 'expired' : row.status;
    listing.photos = this.all('SELECT id FROM photos WHERE listing_id=? ORDER BY position', row.id).map(p => p.id);
    return listing;
  }
  list(scope, user, offset = 0, query = '') {
    let clause = 'status=\'approved\' AND expires_at>?', args = [this.now()];
    if (scope === 'mine') { this.authenticated(user); clause = 'owner=?'; args = [user.email]; }
    else if (scope === 'admin') { if (!user?.admin) fail(403, 'Administrator access required.'); clause = '1=1'; args = []; }
    else if (scope !== 'public') fail(400, 'Invalid view.');
    if (query) { clause += " AND (instr(lower(title),lower(?))>0 OR instr(lower(callsign),lower(?))>0)"; args.push(query.slice(0,120), query.slice(0,120)); }
    return this.all(`SELECT * FROM listings WHERE ${clause} ORDER BY created_at DESC,id LIMIT 50 OFFSET ?`, ...args, offset).map(r => this.serialize(r, scope !== 'public'));
  }
  photo(id, user) {
    const row = this.get('SELECT p.bytes,l.* FROM photos p JOIN listings l ON l.id=p.listing_id WHERE p.id=?', id);
    if (!row || !this.visible(row, user)) fail(404, 'Photo not found.');
    return row.bytes;
  }
  save(user, prepared, id, version) {
    this.requireMember(user);
    return this.transaction(() => {
      const now = this.now();
      if (id) {
        const row = this.get('SELECT * FROM listings WHERE id=?', id);
        if (!row || row.owner !== user.email) fail(404, 'Listing not found.');
        if (version !== row.version) fail(409, 'Listing changed. Reload before trying again.');
        if (!['pending','approved','rejected'].includes(row.status)) fail(409, 'This listing can no longer be edited.');
        this.run(`UPDATE listings SET title=?,description=?,condition=?,price_cents=?,contact=?,callsign=?,status='pending',version=version+1,approved_at=NULL,expires_at=NULL,renewal=0,reason='',updated_at=? WHERE id=?`, prepared.title, prepared.description, prepared.condition, prepared.price_cents, prepared.contact, user.callsign, now, id);
        this.run('DELETE FROM photos WHERE listing_id=?', id);
      } else {
        if (this.get("SELECT count(*) AS n FROM listings WHERE owner=? AND status IN ('pending','approved','rejected')", user.email).n >= 20) fail(409, 'Limit of 20 active submissions reached. Withdraw an old listing first.');
        id = token();
        this.run(`INSERT INTO listings(id,owner,callsign,title,description,condition,price_cents,contact,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'pending',?,?)`, id, user.email, user.callsign, prepared.title, prepared.description, prepared.condition, prepared.price_cents, prepared.contact, now, now);
      }
      prepared.photos.forEach((bytes, i) => this.run('INSERT INTO photos VALUES(?,?,?,?)', token(), id, i, bytes));
      const row = this.get('SELECT * FROM listings WHERE id=?', id);
      this.audit(id, user.email, 'submit', row.version);
      return this.serialize(row, true);
    });
  }
  audit(id, email, action, version) { this.run('INSERT INTO audit(listing_id,actor,action,at,version) VALUES(?,?,?,?,?)', id, email, action, this.now(), version); }
  action(user, id, action, version, reason = '') {
    this.authenticated(user);
    return this.transaction(() => {
      const row = this.get('SELECT * FROM listings WHERE id=?', id);
      const adminAction = ['approve','reject','approve-renewal','reject-renewal','remove'].includes(action);
      if (adminAction && !user.admin) fail(403, 'Administrator access required.');
      if (!row || (!adminAction && row.owner !== user.email)) fail(404, 'Listing not found.');
      if (version !== row.version) fail(409, 'Listing changed. Reload before trying again.');
      let { status, approved_at, expires_at, renewal } = row;
      if (action === 'remove') { status = 'removed'; renewal = 0; }
      else if (['sold','withdraw'].includes(action)) {
        if (['removed','sold','withdrawn'].includes(status)) fail(409, 'Listing is already closed.');
        status = action === 'sold' ? 'sold' : 'withdrawn'; renewal = 0;
      } else if (action === 'renew') {
        this.requireMember(user);
        if (status !== 'approved' || renewal) fail(409, 'Only an unsold, previously approved listing can request renewal.');
        renewal = 1;
      } else if (['approve','approve-renewal'].includes(action)) {
        if (!this.member(row.owner)) fail(409, 'Seller must have current verified membership.');
        if (action === 'approve' ? status !== 'pending' : status !== 'approved' || !renewal) fail(409, 'No matching approval request.');
        status = 'approved'; renewal = 0; approved_at = this.now(); expires_at = approved_at + 60 * DAY;
      } else if (action === 'reject') {
        if (status !== 'pending') fail(409, 'Only pending listings can be rejected.');
        status = 'rejected'; reason = text(reason, 1, 500);
      } else if (action === 'reject-renewal') {
        if (status !== 'approved' || !renewal) fail(409, 'No renewal request.');
        renewal = 0; reason = text(reason, 1, 500);
      } else fail(400, 'Invalid action.');
      this.run('UPDATE listings SET status=?,approved_at=?,expires_at=?,renewal=?,reason=?,version=version+1,updated_at=? WHERE id=?', status, approved_at, expires_at, renewal, reason, this.now(), id);
      this.audit(id, user.email, action, version + 1);
      return this.serialize(this.get('SELECT * FROM listings WHERE id=?', id), true);
    });
  }
}
