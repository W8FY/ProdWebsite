import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Shop } from '../store.mjs';
import { createServer } from '../server.mjs';

test('Passenger CommonJS entry starts without SMTP network access', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'swap-startup-'));
  const child = spawn(process.execPath, ['app.cjs'], { cwd: new URL('..', import.meta.url), env: {
    ...process.env, PORT: '0', SWAP_DB: join(dir, 'shop.sqlite'),
    SWAP_ORIGIN: 'https://w8fy.test', SWAP_ADMINS: 'admin@example.test',
    SMTP_HOST: 'invalid.example.test', SMTP_PORT: '587', SMTP_USER: 'test', SMTP_PASS: 'test', SMTP_FROM: 'test@example.test'
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  // Use a disposable directory for all persisted state.
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Startup timed out')), 10000);
      child.once('exit', code => { clearTimeout(timer); reject(Error(`Startup exited: ${code}`)); });
      child.stdout.on('data', chunk => { if (chunk.toString().includes('listening')) { clearTimeout(timer); resolve(); } });
    });
  } finally {
    child.kill(); await once(child, 'exit');
    rmSync(dir, { recursive: true, force: true });
  }
});

test('separate database connections share upload leases, rate limits and one-use codes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'swap-passenger-'));
  let now = Date.now();
  const a = new Shop(join(dir, 'shop.sqlite'), { now: () => now, admins: ['admin@example.test'] });
  const b = new Shop(join(dir, 'shop.sqlite'), { now: () => now, admins: ['admin@example.test'] });
  try {
    const lease = a.reserveUpload();
    assert.throws(() => b.reserveUpload(), /busy/);
    b.releaseUpload('wrong-token'); assert.throws(() => b.reserveUpload(), /busy/);
    now += 300001;
    const recovered = b.reserveUpload(); a.releaseUpload(lease);
    assert.throws(() => a.reserveUpload(), /busy/);
    b.releaseUpload(recovered);
    a.limit('shared', 1); assert.throws(() => b.limit('shared', 1), /Too many/);
    const challenge = a.challenge('admin@example.test', 'test');
    for (let i = 0; i < 5; i++) assert.throws(() => (i % 2 ? a : b).verify(challenge.id, 'wrong', 'test'), /Invalid/);
    assert.throws(() => b.verify(challenge.id, challenge.code, 'test'), /Invalid/);
    const fresh = a.challenge('admin@example.test', 'test');
    assert.ok(b.verify(fresh.id, fresh.code, 'test'));
    assert.throws(() => a.verify(fresh.id, fresh.code, 'test'), /Invalid/);
  } finally { a.db.close(); b.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('email delivery finishes before the request ends, without granting nonmember access', async () => {
  const shop = new Shop(':memory:');
  let release, sentCode;
  const delivery = new Promise(resolve => { release = resolve; });
  const server = createServer({ shop, origin: 'https://w8fy.test', sendCode: async (_email, code) => { sentCode = code; await delivery; } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    let completed = false;
    const request = fetch(`http://127.0.0.1:${server.address().port}/swap-api/auth/request`, { method: 'POST', headers: { Origin: 'https://w8fy.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nonmember@example.test' }) }).then(r => { completed = true; return r.json(); });
    while (!sentCode) await new Promise(r => setTimeout(r, 5));
    assert.equal(completed, false);
    release(); const response = await request;
    assert.throws(() => shop.verify(response.challenge, sentCode, 'test'), /Membership/);
  } finally { release(); server.closeAllConnections(); await new Promise(r => server.close(r)); shop.db.close(); }
});
