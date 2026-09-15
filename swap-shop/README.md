# W8FY member Swap Shop

**Stablepoint Starter/cPanel:** use [the Passenger setup guide](deploy/STABLEPOINT.md)
instead of the standalone systemd/nginx instructions below.

This is a real, separately hosted Node 24 service and Hugo frontend. It does not
use or modify the net roster, Apps Script project, net spreadsheet, or historical
Supabase tables. No production accounts or services were configured by this change.

**The page is deliberately `draft: true` in `content/swap-shop.md`.** Normal Hugo
builds omit the page and its menu entry until setup and staging acceptance are
complete. Do not deploy with `--buildDrafts` to enable it accidentally.

## Repository review and architecture

- The current website uses Hugo's universal theme. `.github/workflows/deploy.yml`
  builds Hugo and uploads `public/` to `/public_html/` through FTP. This hosts static
  files, not a Node process. Backend code and private data are never copied there.
- The current net check-in frontend uses Google Apps Script. Its administrator
  recovery uses a separate Google OAuth flow. Those credentials and sessions are
  not reused: they do not prove control of arbitrary membership email addresses.
- `source/membership/README.md` identifies the separate membership panel as the
  source of truth. Its backend, private roster schema and account access are not
  present in this repository. The membership application URL is an intake endpoint,
  not an authenticated member lookup. `static/data/member-roster.json` is public
  and sanitized; it must never be used as proof of membership.
- The Swap Shop service uses its own private SQLite database, including photo
  BLOBs. A same-origin reverse proxy exposes only `/swap-api/` on the website.
  If the FTP hosting account cannot proxy to a backend, the hosting operator must
  add that capability or place a reverse proxy in front of the site. FTP upload
  alone cannot make this feature functional.

## Behavior and security boundaries

Anyone can GET approved, unexpired listings and their photos. Every other listing
and photo is visible only to its authenticated owner and configured administrators.
There are no direct bucket links, signed URLs or static photo copies. API responses,
including images, have `Cache-Control: no-store`; bypass all CDN/proxy caches for
`/swap-api/`. A backend database predicate checks expiration on every read, including
individual photo reads. No scheduled expiration task is needed.

Members sign in using a random eight-digit email code, valid for ten minutes and
five attempts. All valid email requesters receive the same mail verification flow;
membership or administrator eligibility is checked only after mailbox control is
verified. Responses before verification do not reveal whether an email matches. Verification
creates a random eight-hour HttpOnly, Secure, SameSite=Strict cookie. Codes and
session tokens are stored as hashes. POST requests require the exact configured
Origin and JSON. Codes never appear in URLs, logs, browser storage or API responses.
The service normalizes email case and outer whitespace, but does not remove plus
tags or dots. Only conventional ASCII mailbox addresses are supported.

The callsign comes from the private membership snapshot; a submitted callsign,
owner, role, approval flag or expiration date is ignored. Membership validity and
snapshot age are checked again on submission, renewal request and approval. A
snapshot remains usable until replaced; individual paid-through cutoffs still apply. Existing authenticated owners can still
mark equipment sold or withdraw when their membership lapses. Administrators need
not be members, but cannot submit equipment without matching current membership.

Initial submissions are pending. Editing replaces the listing and photos atomically,
clears approval and expiration, and hides everything pending another review. Every
moderator decision includes a version number, preventing a stale browser tab from
approving content that changed after review. Each approval starts exactly 60 days
(60 × 24 hours) at the server's approval time. A renewal request leaves the existing
expiration unchanged. Only an administrator can approve renewal; an expired listing
stays private while waiting. Rejection notes stay private. Sold, withdrawn and removed
listings cannot be reopened or edited. Members can create a new submission instead.

Photos are validated with sharp, restricted to single-frame JPEG/PNG/WebP, at most
5 MiB each, 20 million pixels, and five per listing. The service decodes, rotates,
resizes to fit 1600×1600 and re-encodes to JPEG without EXIF/location metadata. Bytes
are committed with the pending listing in a transaction; no orphan upload route
exists. Text is rendered using `textContent`, not HTML. The seller explicitly chooses
all public contact text; their authentication email is never copied into it.

Public content already downloaded, photographed or copied by a visitor cannot be
recalled. Removal and expiration block subsequent API access. Owners and admins
retain private access to closed listings; records are retained for moderation and
can be purged by a trusted database operator under the club's retention policy.
There is no payment integration.

## Exact account and hosting setup

Use a separate HTTPS staging site first. Keep secrets in the server environment
or a root-owned environment file, never in chat, Git, Hugo params or browser JS.

### 1. Provision a service host

Use a Linux host with Node **24.15 or newer in the 24.x LTS line**, persistent local
disk, nginx (or an equivalent reverse proxy), and permission to send outbound SMTP.
Use one service process; SQLite WAL is not intended for a shared network filesystem
or horizontally replicated service instances. The service binds only to loopback.

On the service host, install the application code at `/opt/w8fy-swap` and prepare
private storage. The commands below assume Node/npm and nginx are already installed:

```sh
sudo useradd --system --home /var/lib/w8fy-swap --shell /usr/sbin/nologin w8fy-swap
sudo install -d -o w8fy-swap -g w8fy-swap -m 700 /var/lib/w8fy-swap
sudo install -d -o root -g w8fy-swap -m 750 /etc/w8fy-swap
# Copy swap-shop/ from this checkout to /opt/w8fy-swap (exclude node_modules).
cd /opt/w8fy-swap
npm ci --omit=dev
sudo install -o root -g root -m 644 deploy/w8fy-swap.service /etc/systemd/system/w8fy-swap.service
sudo install -o root -g root -m 600 deploy/service.env.example /etc/w8fy-swap/service.env
sudoedit /etc/w8fy-swap/service.env
```

Configure the environment file using the template. `SWAP_DB` must be outside every
web document root, deployment artifact and static storage location. Photos are
already handled by this private database: no cloud photo-storage account is needed.
Do not expose the database, WAL, SHM, backups, environment file, or membership export
through nginx. File and directory permissions above provide filesystem protection;
use encrypted host volumes/backups if encryption at rest is required.

### 2. Configure email verification and administrator access

Create SMTP credentials with your club's mail provider for a verified sender.
Configure the provider's required SPF/DKIM records and sender/domain verification.
Set `SMTP_HOST`, `SMTP_PORT` (465 for implicit TLS or 587 for STARTTLS), `SMTP_USER`,
`SMTP_PASS`, and `SMTP_FROM` in the private environment file. The service requires
TLS; test actual message delivery during hosted acceptance. SMTP availability does
not block application startup. No Google OAuth client, browser API
key or shared member password is needed.

Set `SWAP_ADMINS` to a comma-separated list of real administrator email addresses
controlled by the people who will moderate. An administrator still must verify an
emailed code. Do not copy the net tool's administrator configuration. To change or
revoke administrators, edit this environment file and restart the service. Every
request then uses the new allowlist, including existing sessions.

Configure SMTP delivery/bounce monitoring with the provider. The service logs a
generic delivery-failure message without codes or addresses. Sending limits are
5 requests/email/hour, 20/IP/hour, 100 globally/hour; verification has 40/IP/hour
and five attempts/code. These persist in SQLite. Configure nginx to overwrite
`X-Real-IP` and set `SWAP_TRUST_PROXY=true` only for the supplied loopback proxy.
Never trust a client-supplied forwarding header at the public edge.

### 3. Connect the private membership source

#### Membership panel Excel export

The panel's `w8fy-members.xlsx` export is supported directly. Use its **Members**
sheet with headers **CALL**, **E-MAIL**, and **YEAR**. The club confirmed that YEAR
is the last calendar year covered by membership. A value of 2026 is valid through
December 31, 2026 in America/New_York, expiring at `2027-01-01T05:00:00Z`.
DUES PAID is a payment date, not the membership cutoff; it is not used to grant
access. Future paid years are supported. Names, addresses and other fields are
discarded. Blank/expired years and missing emails/callsigns are excluded, with
aggregate counts printed. Malformed fields or duplicate eligible emails abort the
import without changing existing membership. Diagnostics identify row numbers,
never member values. Correct problems in the panel and export again.

Keep the original workbook outside the repository and `public_html`. In cPanel,
upload it to a private directory such as `/home/ACCOUNT/swap-private/` with mode 600.
After activating the application's Node environment using the command shown by
cPanel, run these commands from the application directory (replace ACCOUNT):

```sh
node import-members.mjs /home/ACCOUNT/swap-private/w8fy-members.xlsx --dry-run
SWAP_DB=/home/ACCOUNT/swap-private/shop.sqlite node import-members.mjs \
  /home/ACCOUNT/swap-private/w8fy-members.xlsx --exported-at ACTUAL_EXPORT_TIMESTAMP
```

Replace ACTUAL_EXPORT_TIMESTAMP with the actual export time including timezone,
for example `2026-09-11T14:30:00-04:00`. Do not use that example or the current
import time for an older export. No file modification timestamp is trusted.
The dry run uses only memory and prints counts; it does not save a JSON copy or
modify the configured database. An empty eligible Excel roster requires the explicit
`--allow-empty` flag to revoke everyone. Real imports atomically replace membership.

The roster is maintained manually. Export and import a replacement whenever members join, leave, change email/callsign, or renew dues. There is no 48-hour age limit. The last imported roster remains authoritative until replaced, but paid-through dates still expire. Keep the actual export timestamp; do not relabel an old export as new. These import commands do not enable the public page.

#### Alternative private JSON export

The membership system owner must implement or schedule an authenticated export of
**current active members** from the private membership panel. Its private API/schema
is not available here, so this repository cannot configure that source-side export.
Do not scrape the public roster or send membership data to a public frontend.

Produce a UTF-8 JSON file privately on the service host in this exact format:

```json
{
  "generated_at": "2026-09-10T12:00:00Z",
  "members": [
    {"email": "member@example.org", "callsign": "W8ABC", "valid_until": "2027-01-01T00:00:00Z"}
  ]
}
```

The values above are examples, not real membership records. `generated_at` is the
actual UTC export time; `valid_until` is the exclusive membership eligibility cutoff,
with a timezone. Use the panel's real eligibility rules. Only email, callsign and
eligibility cutoff are needed. Do not include names, postal addresses, payment
history or other private fields. Duplicate normalized emails are rejected; resolve
shared-email households in the membership panel before access is enabled. A single
email can map to only one authoritative callsign. A change of member email does not
automatically transfer old listings; the club operator must review any ownership
migration privately.

Transfer the export using an authenticated private channel (for example SFTP) to
`/var/lib/w8fy-swap/members.json`, owned by `w8fy-swap`, mode 600. Import it:

```sh
cd /opt/w8fy-swap
sudo -u w8fy-swap env SWAP_DB=/var/lib/w8fy-swap/shop.sqlite \
  /usr/bin/node import-members.mjs /var/lib/w8fy-swap/members.json
```

The import validates the whole file before atomically replacing the member table.
Removed members lose submission/renewal eligibility immediately after import.
Import an empty `members` array to revoke everyone. A malformed or future-dated export
is rejected, and replaying the same file does not refresh its timestamp. Arrange a
fresh export and this import whenever membership changes, including revocations;
alert the operator on either failure. This import process has no public API and no
roster-read endpoint. Test revocation in staging. Membership source access and the
optional export automation remain operator configuration; manual updates are supported.

### 4. Configure the same-origin proxy and start

Set `SWAP_ORIGIN=https://w8fy.org` for production (no trailing slash). On staging,
use its exact HTTPS origin. Add the locations in `deploy/nginx.conf.example` to the
HTTPS server block which serves the website. The `limit_req_zone` and `limit_conn_zone`
lines belong in nginx's `http` block. Use an existing valid TLS certificate. If the
FTP host is elsewhere, route `/swap-api/` privately to this service through the
fronting proxy; do not expose unencrypted Node traffic publicly. Ask the hosting
operator to configure the equivalent route if nginx is not under your control.

```sh
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl daemon-reload
sudo systemctl enable --now w8fy-swap
sudo systemctl status w8fy-swap
curl --fail https://w8fy.org/swap-api/health
```

Expect `{"ok":true}`. Check `journalctl -u w8fy-swap` for startup/delivery failures.
Keep clocks synchronized. The health route proves process/database availability;
it does not prove SMTP delivery, membership freshness or correct proxy caching.

### 5. Staging acceptance and enablement

Build the draft with `hugo --buildDrafts` **only for staging/local preview**. Test with
two controlled member mailboxes, one administrator mailbox and one nonmember:

1. Browse signed out; verify email delivery and sign in. Verify the nonmember cannot
   submit, and that only the roster callsign is shown. Check private email is absent
   from public API results unless deliberately entered as public contact text.
2. Submit five photos. Try the raw photo URLs signed out and as the other member:
   both must return 404. Review all content/photos as the administrator and approve.
3. Edit the listing and confirm public content and both old/new photo URLs are
   inaccessible until new approval. Try approving from a stale moderation tab.
4. Exercise renewal, rejection, sold, withdrawal and administrator removal. Use the
   automated clock tests for the exact 60-day boundary; never change the production
   server clock. Check immediate photo denial after removal through the real proxy.
5. Remove the member from a fresh export and import it. Confirm the existing member
   session cannot submit or renew. Remove the admin allowlist entry and restart;
   confirm that existing admin session can no longer moderate.
6. Verify nginx/CDN `no-store` behavior and that database/export/backup paths are not
   served. Restore a database backup in isolated staging to verify recovery.

Only after acceptance, change `draft: true` to `draft: false` in
`content/swap-shop.md`. Its Club Information menu entry then appears automatically.
Deploy the backend separately as above, then use the existing Hugo/FTP workflow for
the frontend. No backend secrets belong in GitHub's frontend deployment. To roll
back the feature, set the page back to draft and redeploy; disable the API route or
service if public listings must also become unavailable. Preserve the private data.

## Local tests and operations

```sh
cd swap-shop
npm ci
npm test
node --check ../static/js/swap-shop.js
cd ..
hugo --baseURL https://w8fy.org/
hugo --buildDrafts --destination /tmp/w8fy-swap-preview
cd swap-shop
npx playwright install chromium
HUGO_PREVIEW_DIR=/tmp/w8fy-swap-preview npm run test:browser
```

On Windows PowerShell set `$env:HUGO_PREVIEW_DIR` to the preview directory. To use
an installed Edge browser instead of downloading Chromium, set
`$env:SWAP_BROWSER_CHANNEL = 'msedge'` before `npm run test:browser`.
The browser test drives the actual Hugo page against the real API with separate
member, administrator and anonymous browser sessions, checks mobile overflow and
stored-HTML escaping, and writes screenshots under ignored `test-results/`.

The API tests use a real HTTP server, SQLite, sharp processing and synthetic members.
Only the outbound mail transport and clock are replaced. No production mail is sent.
Tests cover email control, impersonation, ownership, codes/sessions, CSRF, moderation,
edit races, exact expiration, manual renewal, revocation, closed states and photo
access. No test fixtures are deployed to the public site.

Back up the private SQLite database using SQLite's online backup API/CLI `.backup`,
or stop the service before copying the database. Do not copy just the main file while
WAL writes are active. Protect backups like the live database. Monitor disk space,
service health, SMTP delivery and roster import age. Public endpoints return at most
50 listings/page. Members have at most 20 active submissions, 30 submissions/hour;
photo uploads share one database-backed processing slot. All requests have a 600/IP/minute
application limit, supplemented by nginx limits. Review these limits against club use.

Implementation references: [Node SQLite](https://nodejs.org/api/sqlite.html),
[sharp input](https://sharp.pixelplumbing.com/api-input/),
[sharp output/metadata](https://sharp.pixelplumbing.com/api-output/), and
[Nodemailer SMTP/TLS](https://nodemailer.com/smtp/).
