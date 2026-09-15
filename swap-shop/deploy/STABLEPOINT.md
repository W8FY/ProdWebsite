# Stablepoint cPanel / Passenger test setup

Use this guide instead of the systemd/nginx installation for Stablepoint's Starter
plan. Stablepoint confirmed Node 24, SQLite, sharp, SMTP and private home storage.
The code is prepared for local testing; the actual hosted Passenger environment,
proxy behavior, SMTP delivery, and resource usage still require acceptance testing.
Keep `content/swap-shop.md` as `draft: true` throughout backend setup.

## 1. Private directories and application files

In cPanel File Manager, note the account home directory `/home/ACCOUNT`. Create
`/home/ACCOUNT/swap-shop` and `/home/ACCOUNT/swap-private`, outside `public_html`.
Set the private directory's permissions to 700. Upload the contents of this
repository's `swap-shop/` directory into the private application directory.
Do not upload local `node_modules`, `test-results`, databases, `.env`, or the Excel
file with application source. Put the membership workbook only in `swap-private`,
with file permissions 600. Do not put either directory under the FTP document root.

## 2. Create the application

In **Software → Setup Node.js App → Create Application**, select:

| Field | Value |
| --- | --- |
| Node.js version | 24.x, at least 24.15 |
| Application mode | Production |
| Application root | `swap-shop` (relative to the account home) |
| Application URL | `w8fy.org`, path `/swap-api` |
| Application startup file | `app.cjs` |

Use `app.cjs`, not `server.mjs`. This CommonJS entry explicitly starts the ES-module
service when Passenger loads it. Passenger controls the actual listening socket;
do not install PM2, systemd, or the supplied nginx configuration on this account.

Add these environment variables in the application's cPanel settings:

| Variable | Value |
| --- | --- |
| `SWAP_DB` | `/home/ACCOUNT/swap-private/shop.sqlite` |
| `SWAP_ORIGIN` | `https://w8fy.org` (no trailing slash) |
| `SWAP_ADMINS` | `ka8zge@w8fy.org` |
| `SMTP_USER` | `swapshop@w8fy.org` |
| `SMTP_FROM` | `swapshop@w8fy.org` |
| `SMTP_HOST` | The secure outgoing server shown by cPanel Email Accounts → Connect Devices |
| `SMTP_PORT` | `465` or `587`, matching that mail configuration |
| `SMTP_PASS` | The mailbox password; enter it in cPanel only |
| `SWAP_TRUST_PROXY` | `false` |

Do not guess the SMTP hostname. Do not send passwords in chat or commit them.
Leave PORT unset. Save the settings, then open cPanel Terminal. Copy and run the
Node environment activation command displayed by **Setup Node.js App**, then:

```sh
cd /home/ACCOUNT/swap-shop
node --version
npm ci --omit=dev
node -e "require('node:sqlite'); require('sharp'); console.log('Runtime ready')"
```

Use the activated Node environment, not the server's
default Node. Restart the app with cPanel's **Restart** control after installation
and after environment/source changes.

## 3. Test the backend route before enabling the page

Visit `https://w8fy.org/swap-api/health`. Expect `{"ok":true}`. SMTP is no longer
contacted during startup, so temporary mail outages do not prevent public browsing.
The health check does not prove email delivery or current membership data.

If this fails, check the cPanel application error log. For a routing 404, ask
Stablepoint whether Passenger passes `/swap-api/health` intact to Node; this service
expects the complete path. Do not change the Hugo root or FTP deployment to fix it.

Ask Stablepoint to verify that their proxy/WAF never caches `/swap-api/` and that
Node receives a reliable client IP. Keep `SWAP_TRUST_PROXY=false` unless they confirm
the exact supported loopback proxy and overwrite `X-Real-IP` as required by the
service. When all requests appear to come from the same proxy, per-IP limits apply
to all visitors together. Do not bypass this by trusting arbitrary forwarded headers.

## 4. Import current membership privately

Correct membership data in the panel first and obtain a fresh Excel export. The
local workbook correction does not update the membership panel. Upload the export
privately, then run (using the same activated Node environment):

```sh
node import-members.mjs /home/ACCOUNT/swap-private/w8fy-members.xlsx --dry-run
SWAP_DB=/home/ACCOUNT/swap-private/shop.sqlite node import-members.mjs \
  /home/ACCOUNT/swap-private/w8fy-members.xlsx --exported-at ACTUAL_EXPORT_TIMESTAMP
```

Use the actual export time with timezone, e.g. `2026-09-11T14:30:00-04:00`, not a
timestamp invented at import time. YEAR covers December 31 Eastern time. Blank or
expired years never authorize submission. Only email, callsign and cutoff are saved.
Manual updates: the imported list remains authoritative until you replace it. Export and import whenever membership changes, including dues renewals and removals. Paid-through dates remain enforced. No daily job or automatic panel connection is required. Keep the actual export timestamp. See the main README for validation rules.

## 5. Hosted acceptance

Use an isolated HTTPS staging frontend/origin and test membership data if available.
Follow the main README's acceptance checks before making the production page live.
Verify real SMTP delivery, administrator login, pending-photo denial, approval,
edits, renewal, removal and membership revocation through the hosting proxy.

Photo work is sequential, with one native sharp worker and a 16 MiB sharp cache.
A database lease shares one upload slot across Passenger processes, renewed while
active. A crashed worker's lease expires after five minutes. A stalled worker that
cannot renew its lease is also subject to that timeout. The service still accepts
bounded JSON uploads up to 36 MiB; it does not claim to stream-parse them. Check
cPanel resource usage during five-photo uploads and overlapping requests. If WAF
blocks a test, ask support to inspect that specific rule rather than disabling WAF.

Email delivery is awaited inside its HTTP request, avoiding dependence on work
continuing after Passenger idles a process. All syntactically valid email requesters
receive the same verification flow; only a verified mailbox matching current private
membership or the administrator allowlist receives a session. This prevents the
mail-send timing from exposing membership matches. Sign-in codes and rate limits
use database transactions across processes. No automatic renewal worker is needed.

Only after hosted acceptance should the Hugo page's draft flag be changed and the
normal FTP frontend deployment run. No hosting account changes have been made by
the local implementation work.

Reference: [Passenger Node socket handling](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/reverse_port_binding.html).

## Current club setup (September 15, 2026)

The club deployed the backend under /home/vwarc/swap-shop with its private database
at /home/vwarc/swap-private/shop.sqlite. SMTP uses mail.w8fy.org port 465.
Membership is updated manually when records change; paid-through dates still apply.
The password-protected /swap-preview/ was used for hosted checks of sign-in,
approval, photo privacy, edits, renewal, sold, withdrawal, removal and photo uploads.
Nonmember and cross-member permissions have automated coverage, but were not
retested with separate live mailboxes. Full resource-limit stress testing remains
unverified. The public page is enabled in source for the normal GitHub deployment.

The deployed backup.mjs matches the repository copy and has passed an on-host
integrity check. cPanel schedules it daily at midnight server time with:

```sh
/bin/bash -c 'source /home/vwarc/nodevenv/swap-shop/24/bin/activate && node /home/vwarc/swap-shop/backup.mjs'
```

Backups stay private in swap-private/backups. The first scheduled run is not yet
confirmed. Monitor storage; this script retains all copies. Periodically download
a verified copy to secure off-host storage. No mailbox credentials belong in Git.
