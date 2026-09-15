import http from 'node:http';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';
import nodemailer from 'nodemailer';
import { Shop, Fault, prepareListing, hash } from './store.mjs';

const PREFIX = '/swap-api';
export function createServer({ shop, origin, sendCode, secureCookies = true, trustProxy = false }) {
  let uploads = 0;
  const cookieName = secureCookies ? '__Host-w8fySwap' : 'w8fySwapLocal';
  const cookie = (value, age) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookies ? '; Secure' : ''}`;
  const server = http.createServer(async (req, res) => {
    let reservedUpload = false;
    let uploadLease, leaseTimer;
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    try {
      const url = new URL(req.url, origin);
      const path = url.pathname;
      const remote = req.socket.remoteAddress || 'unknown';
      const proxyIP = req.headers['x-real-ip'];
      const ip = trustProxy && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote) && typeof proxyIP === 'string' && isIP(proxyIP) ? proxyIP : remote;
      shop.limit('request:' + hash(ip), 600, 60000);
      const session = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
      let user = shop.user(session);
      if (req.method === 'GET') {
        if (path === PREFIX + '/health') return reply(200, { ok: true });
        if (path === PREFIX + '/session') return reply(200, { user });
        if (path === PREFIX + '/listings') {
          const offset = Number(url.searchParams.get('offset') || 0);
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Fault(400, 'Invalid page.');
          return reply(200, { listings: shop.list(url.searchParams.get('scope') || 'public', user, offset, url.searchParams.get('q') || '') });
        }
        const photo = path.match(/^\/swap-api\/photos\/([a-f0-9]{64})$/);
        if (photo) {
          const bytes = shop.photo(photo[1], user);
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Disposition': 'inline; filename="equipment.jpg"' });
          return res.end(Buffer.from(bytes));
        }
        throw new Fault(404, 'Not found.');
      }
      if (req.method !== 'POST') throw new Fault(405, 'Method not allowed.');
      // Exact same-origin POST + non-simple content type protects cookie sessions from CSRF.
      if (req.headers.origin !== origin) throw new Fault(403, 'Invalid request origin.');
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new Fault(415, 'JSON required.');
      const save = path === PREFIX + '/listings';
      if (save) {
        shop.requireMember(user);
        if (uploads >= 1) throw new Fault(503, 'Photo processing is busy. Try again shortly.');
        uploadLease = shop.reserveUpload();
        leaseTimer = setInterval(() => {
          try { shop.renewUpload(uploadLease); } catch { req.destroy(); }
        }, 30000);
        leaseTimer.unref();
        uploads++; reservedUpload = true;
      }
      const max = save ? 36 * 1024 * 1024 : 8192;
      if (Number(req.headers['content-length'] || 0) > max) throw new Fault(413, 'Request too large.');
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > max) throw new Fault(413, 'Request too large.');
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Fault(400, 'Invalid JSON.'); }
      finally { chunks.length = 0; }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Fault(400, 'Invalid request.');
      user = shop.user(session);
      if (path === PREFIX + '/auth/request') {
        const challenge = shop.challenge(body.email, ip);
        // Identical response for absent members and eligible members. No codes in responses/logs.
        if (challenge.code) {
          await Promise.resolve().then(() => sendCode(challenge.email, challenge.code)).catch(() => {
            shop.run('DELETE FROM challenges WHERE id=?', challenge.id);
            console.error('Swap Shop verification email delivery failed. Check SMTP configuration.');
          });
        }
        return reply(200, { challenge: challenge.id, message: 'If email delivery succeeds, a code will arrive shortly. It expires in 10 minutes. Membership is checked after email verification.' });
      }
      if (path === PREFIX + '/auth/verify') {
        const value = shop.verify(body.challenge, body.code, ip);
        res.setHeader('Set-Cookie', cookie(value, 8 * 3600));
        return reply(200, { user: shop.user(value) });
      }
      if (path === PREFIX + '/auth/logout') {
        shop.logout(session);
        res.setHeader('Set-Cookie', cookie('', 0));
        return reply(200, { ok: true });
      }
      if (save) {
        shop.requireMember(user);
        shop.limit('save:' + hash(user.email), 30);
        const prepared = await prepareListing(body);
        // Recheck session and membership after asynchronous image work.
        user = shop.user(session);
        return reply(200, { listing: shop.save(user, prepared, body.id, body.version) });
      }
      const action = path.match(/^\/swap-api\/listings\/([a-f0-9]{64})\/action$/);
      if (action) return reply(200, { listing: shop.action(user, action[1], body.action, body.version, body.reason) });
      throw new Fault(404, 'Not found.');
    } catch (error) {
      if (!res.headersSent) reply(error instanceof Fault ? error.status : 500, { error: error instanceof Fault ? error.message : 'The service could not complete this request.' });
      else res.end();
      if (!(error instanceof Fault)) console.error('Swap Shop request failed:', error.code || error.name);
    } finally {
      if (reservedUpload) uploads--;
      if (leaseTimer) clearInterval(leaseTimer);
      if (uploadLease) {
        try { shop.releaseUpload(uploadLease); }
        catch { console.error('Upload lease cleanup failed; the lease will expire automatically.'); }
      }
    }
  });
  server.maxConnections = 100;
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.maxRequestsPerSocket = 100;
  return server;
}

export function startServer() {
  process.umask(0o077);
  const required = ['SWAP_DB','SWAP_ORIGIN','SWAP_ADMINS','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_FROM'];
  for (const key of required) if (!process.env[key]) throw Error(`Set ${key} in the private service environment.`);
  const origin = new URL(process.env.SWAP_ORIGIN);
  const local = ['localhost','127.0.0.1'].includes(origin.hostname);
  if (origin.origin !== process.env.SWAP_ORIGIN || (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))) throw Error('SWAP_ORIGIN must be an exact HTTPS origin (HTTP allowed only for localhost).');
  if (!isAbsolute(process.env.SWAP_DB)) throw Error('SWAP_DB must be an absolute path outside the website document root.');
  const port = Number(process.env.SMTP_PORT);
  if (![465,587].includes(port)) throw Error('Use SMTP port 465 or 587 with TLS.');
  const mail = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000, socketTimeout: 15000, tls: { minVersion: 'TLSv1.2' }
  });
  const shop = new Shop(process.env.SWAP_DB, { admins: process.env.SWAP_ADMINS.split(',') });
  const server = createServer({ shop, origin: origin.origin, secureCookies: origin.protocol === 'https:', trustProxy: process.env.SWAP_TRUST_PROXY === 'true',
    sendCode: (to, code) => mail.sendMail({ from: process.env.SMTP_FROM, to: { address: to }, subject: 'W8FY Swap Shop sign-in code', text: `Your W8FY Swap Shop code is ${code}. It expires in 10 minutes and can be used once. If you did not request this, ignore this email. Never share this code.` })
  });
  server.listen(Number(process.env.PORT || 8787), '127.0.0.1', () => console.log('Swap Shop listening on loopback.'));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => { shop.db.close(); process.exit(0); }));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
