import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import sharp from 'sharp';
import { Shop } from '../../store.mjs';
import { createServer } from '../../server.mjs';

test('rendered Hugo page: member submits, admin approves, public browses, edit hides, renewal and withdrawal', async ({ browser }, testInfo) => {
  if (!process.env.HUGO_PREVIEW_DIR) throw Error('Set HUGO_PREVIEW_DIR to the Hugo --buildDrafts output directory.');
  const root = resolve(process.env.HUGO_PREVIEW_DIR);
  const shop = new Shop(':memory:', { admins: ['moderator@example.test'] });
  shop.importMembers([{ email: 'member@example.test', callsign: 'W8TEST', valid_until: '2035-01-01T00:00:00Z' }]);
  const mailbox = [];
  let api;
  const front = http.createServer((req, res) => {
    if (req.url.startsWith('/swap-api/')) return api.emit('request', req, res);
    let path = new URL(req.url, 'http://localhost').pathname;
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + sep)) { res.writeHead(404); return res.end(); }
    try {
      const bytes = readFileSync(file);
      res.setHeader('Content-Type', { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' }[extname(file)] || 'application/octet-stream');
      res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => front.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${front.address().port}`;
  api = createServer({ shop, origin, secureCookies: false, sendCode: (email, code) => mailbox.push({ email, code }) });
  const contexts = [];
  try {
    const pageFor = async width => {
      const context = await browser.newContext({ viewport: { width, height: 1000 } }); contexts.push(context);
      // Hugo's existing theme uses protocol-relative CDNs. Local HTTP must fetch
      // those resources over HTTPS, just as the production HTTPS site does.
      await context.route('http://**/*', route => {
        const url = route.request().url();
        return url.startsWith(origin + '/') ? route.continue() : route.fulfill({ status: 302, headers: { Location: url.replace(/^http:/, 'https:'), 'Access-Control-Allow-Origin': '*' } });
      });
      const page = await context.newPage();
      page.on('requestfailed', request => { if (request.url().includes('bootstrap')) console.error('Theme dependency:', request.url(), request.failure()?.errorText); });
      await page.goto(origin + '/swap-shop/');
      await expect.poll(() => page.evaluate(() => !!document.querySelector('link[href*="bootstrap.min.css"]').sheet), { message: 'Existing theme Bootstrap stylesheet must load for visual validation' }).toBeTruthy();
      await expect(page.locator('#swap-message')).toContainText('Browse freely');
      return page;
    };
    const signIn = async (page, email) => {
      await page.locator('#swap-email').fill(email);
      await page.getByRole('button', { name: 'Email a sign-in code' }).click();
      await expect(page.locator('#swap-verify')).toBeVisible();
      await expect.poll(() => mailbox.findLast(m => m.email === email)?.code).toBeTruthy();
      await page.locator('#swap-code').fill(mailbox.findLast(m => m.email === email).code);
      await page.getByRole('button', { name: 'Verify and sign in' }).click();
      await expect(page.locator('#swap-message')).toContainText('Email verified');
    };
    const member = await pageFor(1280);
    const moderator = await pageFor(1280);
    const visitor = await pageFor(390);
    await signIn(member, 'member@example.test');
    await member.getByRole('button', { name: 'Create a listing' }).click();
    await member.locator('#swap-title').fill('HF transceiver');
    await member.locator('#swap-description').fill('Working transceiver with power cable. <script>window.bad=true</script>');
    await member.locator('#swap-price').fill('150.25');
    await member.locator('#swap-contact').fill('Contact W8TEST on the club repeater.');
    const image = await sharp({ create: { width: 120, height: 90, channels: 3, background: '#275d70' } }).png().toBuffer();
    await member.locator('#swap-photos').setInputFiles({ name: 'equipment.png', mimeType: 'image/png', buffer: image });
    await member.locator('#swap-consent').check();
    await member.getByRole('button', { name: 'Submit for administrator approval' }).click();
    await expect(member.locator('.swap-card')).toContainText('pending');
    const privatePhoto = new URL(await member.locator('.swap-card img').getAttribute('src')).pathname;
    expect((await visitor.request.get(origin + privatePhoto)).status()).toBe(404);
    await visitor.reload(); await expect(visitor.locator('.swap-card')).toHaveCount(0);
    await signIn(moderator, 'moderator@example.test');
    await moderator.getByRole('button', { name: 'Administrator moderation' }).click();
    await expect(moderator.locator('.swap-card')).toContainText('HF transceiver');
    await moderator.getByRole('button', { name: 'Approve for 60 days' }).click();
    await expect(moderator.locator('.swap-card')).toContainText('approved');
    await visitor.reload(); await expect(visitor.locator('.swap-card')).toContainText('$150.25');
    expect((await visitor.request.get(origin + privatePhoto)).status()).toBe(200);
    await expect(visitor.locator('.swap-card')).not.toContainText('member@example.test');
    expect(await visitor.evaluate(() => window.bad)).toBeUndefined();
    await visitor.screenshot({ path: testInfo.outputPath('swap-shop-mobile.png'), fullPage: true });
    await moderator.screenshot({ path: testInfo.outputPath('swap-shop-moderation.png'), fullPage: true });
    expect(await visitor.evaluate(() => [...document.querySelectorAll('#swap-shop, #swap-shop *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ tag: el.tagName, id: el.id, class: el.className, right: el.getBoundingClientRect().right })))).toEqual([]);
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await member.reload();
    await member.getByRole('button', { name: 'My listings', exact: true }).click();
    await member.getByRole('button', { name: 'Edit and resubmit' }).click();
    await member.locator('#swap-title').fill('Updated transceiver');
    await member.locator('#swap-consent').check();
    await member.getByRole('button', { name: 'Submit for administrator approval' }).click();
    await expect(member.locator('.swap-card')).toContainText('pending');
    expect((await visitor.request.get(origin + privatePhoto)).status()).toBe(404);
    await visitor.reload(); await expect(visitor.locator('.swap-card')).toHaveCount(0);
    await moderator.reload();
    await moderator.getByRole('button', { name: 'Administrator moderation' }).click();
    await moderator.getByRole('button', { name: 'Approve for 60 days' }).click();
    await expect(moderator.locator('.swap-card')).toContainText('approved');
    await member.reload(); await member.getByRole('button', { name: 'My listings', exact: true }).click();
    await member.getByRole('button', { name: 'Request 60-day renewal' }).click();
    await expect(member.locator('.swap-card')).toContainText('renewal awaiting approval');
    await moderator.reload(); await moderator.getByRole('button', { name: 'Administrator moderation' }).click();
    await moderator.getByRole('button', { name: 'Approve another 60 days' }).click();
    await expect(moderator.locator('.swap-card')).not.toContainText('renewal awaiting approval');
    await member.reload(); await member.getByRole('button', { name: 'My listings', exact: true }).click();
    member.once('dialog', dialog => dialog.accept());
    await member.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(member.locator('.swap-card')).toContainText('withdrawn');
    await visitor.reload(); await expect(visitor.locator('.swap-card')).toHaveCount(0);
    await expect(member.locator('#swap-error')).toBeHidden();
    await expect(moderator.locator('#swap-error')).toBeHidden();
  } finally {
    await Promise.all(contexts.map(c => c.close()));
    front.closeAllConnections(); await new Promise(r => front.close(r)); shop.db.close();
  }
});
