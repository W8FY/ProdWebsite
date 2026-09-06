# Website administrator recovery

The roster's **Recover Net** link opens a dedicated sign-in and recovery page.
All changes are local until deliberately published. No real administrator is
configured by source code, and recovery never automatically sends a report.

## Authentication design and compatibility

The static website calls an Apps Script web app running as the spreadsheet
owner. `Session.getEffectiveUser()` identifies that owner, not the visitor, so
it cannot authorize website administrators. Keep **Execute as: Me** and the
existing public roster endpoint. Administrators do not need spreadsheet access.

The new flow uses Google's authorization-code protocol:

1. The website creates a random browser proof and requests a sign-in challenge.
2. Apps Script creates five-minute, single-use state, nonce and PKCE values.
3. The browser keeps its proof in `sessionStorage` and visits Google.
4. Google returns a one-use authorization code to the website's `recover.html`.
   The page immediately removes the callback query from browser history, checks
   the matching browser state, and POSTs the code and proof to Apps Script.
5. Apps Script consumes the challenge and exchanges the code directly with
   Google over HTTPS using its private client secret and PKCE verifier. It checks
   issuer, audience, nonce and expiry on the ID token received directly from
   Google, then checks verified email and matching subject through Google's
   authenticated UserInfo endpoint. Browser-provided ID tokens, emails and
   callsigns are never accepted as authentication. No debugging `tokeninfo` API
   or Apps Script owner's identity is used to verify the visitor.
6. An explicitly allowed account receives a ten-minute application session and
   separate request proof. These stay in page memory and travel in POST bodies.
   Google's tokens stay on the server and are not persisted.

Google explains the trust afforded tokens received directly through this
authenticated HTTPS exchange in its [OpenID Connect server flow](https://developers.google.com/identity/openid-connect/openid-connect#server-flow).
See also [Apps Script execution identity](https://developers.google.com/apps-script/reference/base/session).

No additional hosting service, database, shared PIN or browser secret is needed.
You do need a Google Cloud OAuth web client and consent-screen configuration.
Only Gmail accounts and Google Workspace accounts with Google's verified
hosted-domain claim are accepted. A third-party email attached to a consumer
Google account is insufficient. The account supplied for this task is compatible.

Every privileged POST checks expiry, the current server allowlist and request
proof under the script lock. No privileged GET exists. Sign-out deletes the
server session. Reloading/closing the panel loses its in-memory session. Removing
an allowlist entry immediately blocks that account's existing sessions. Expired
challenge/session properties are cleaned up on subsequent sign-in starts;
validity never depends on cleanup running.

Rate limits are 10 sign-in starts and 20 exchanges per minute deployment-wide,
and 60 authenticated requests per minute per Google subject. Random 256-bit
session/proof values prevent practical guessing. Apps Script does not expose a
trustworthy caller IP here, so a hostile caller can exhaust these global limits.
A separate gateway would be needed for stronger availability protection.

## Setup requiring your account access

First use a **separate test spreadsheet, Apps Script project, OAuth client and
HTTPS staging website**. The deployed project's settings have not been inspected
or changed from this workspace.

1. In Google Cloud, select a project you control. Configure Google Auth Platform
   branding, audience and consent details. Add the intended administrator as a
   test user if required. Request only `openid` and email identity scopes; this
   login does not request Gmail, Drive or Sheets access from administrators.
   Complete any consent/verification requirements for your chosen audience.
2. Create an OAuth client of type **Web application**. Register the exact HTTPS
   recovery page as its authorized redirect URI. For example, use
   `https://w8fy.org/net-checkin/recover.html` if that is the chosen canonical
   production address. Use the staging address for the test client. Hostname,
   path and slash behavior must match. This is the website URL, **not** Apps
   Script's `/exec` URL. No Google browser SDK or JavaScript-origin setting is
   required for the redirect flow.
3. In Apps Script **Project Settings → Script Properties**, set:

   | Property | Value |
   | --- | --- |
   | `W8FY_ADMIN_GOOGLE_CLIENT_ID` | OAuth web client's ID |
   | `W8FY_ADMIN_GOOGLE_CLIENT_SECRET` | Private OAuth client secret |
   | `W8FY_ADMIN_REDIRECT_URI` | Exact redirect URI registered in Google Cloud |
   | `W8FY_ADMIN_EMAILS` | Comma-separated primary Google account addresses explicitly authorized by the owner |

   Use the administrator address supplied in this task. It is intentionally not
   copied into repository configuration or this document. Missing configuration
   disables sign-in. There are no default credentials. Keep these values out of
   browser configuration, source, URLs, command history and logs. Restrict Apps
   Script editors: they can read these properties and control the backend.
4. Back up the spreadsheet and retain the current Apps Script deployment version.
   Copy updated `Code.gs` **and new `Admin.gs`** into the same project, preserving
   live-only changes. The owner must authorize `UrlFetchApp`'s HTTPS requests.
   With an explicit manifest, retain existing scopes and include
   `https://www.googleapis.com/auth/script.external_request`.
5. Once deployment is approved, update the existing Apps Script deployment to a
   new version while retaining its `/exec` URL. Publish `recover.html`, both
   recovery scripts, `recover.css`, updated API client and index alongside the
   existing frontend. The deployment workflow copies these assets explicitly.
   **Do not trigger that workflow until deployment is approved.**
6. Serve the recovery page over HTTPS without callback redirects or analytics
   injection. Suppress query strings for this path in access/analytics logs:
   Google's one-use authorization code arrives in a query in this static-site
   flow. It is not an access token or administrator session. The page clears it
   immediately, sends no referrer and loads no third-party scripts. If supported
   by the host, add HTTP headers `Content-Security-Policy: frame-ancestors 'none'`
   and `Referrer-Policy: no-referrer`. Preserve the page's existing restrictive
   CSP for local scripts and Apps Script requests.
7. Test real Google sign-in, callback handling, Apps Script ContentService CORS
   and scope authorization on staging. Offline fixtures cannot prove these
   account-dependent integration steps. If organization policy prevents OAuth,
   resolve the policy or review a separate gateway design; do not substitute a PIN.

The existing spreadsheet ID remains configured as before. `AdminOperations` is
created lazily on the first review with validated headers. `NetAdministration`
keeps its existing schema. No reset or migration of old rows is required.

## Recovery workflow

1. Open **Recover Net**, sign in with Google, and verify the signed-in identity
   and unfinished net's date, type, Net Control, check-ins and ID. Reload if
   someone is still working on the roster.
2. For **Recover Net Control**, the selected checked-in operator first uses
   **Request Net Control** in their own roster browser. Reload the panel and
   select that operator. An unexpired pending request delivers access to their
   browser without disclosing an ownership token to the administrator. Supply a
   reason, review old/new ownership, and explicitly confirm. The old owner
   becomes read-only; the selected operator receives access via their request.
3. Administrative recovery does not establish on-air service or change check-in
   flags/service history. Next, select **Finalize Historical Net** and enter
   the actual ending date, 24-hour time and UTC offset applicable on that date.
   No end value is defaulted. Determine the historical daylight-saving offset;
   do not blindly use today's offset.
4. Select the matching administrative recovery. Identify a legacy editor segment
   only after verifying it was administrative rather than on-air service. A net
   with ordinary service history can be finalized directly without transferring
   ownership, even if its owner access is missing or revoked. State the source
   of the actual end in the required reason.
5. Review and confirm. Missing/invalid/future ends, ends before the original
   start, durations of 24 hours or more, and contradictory service histories are
   rejected. Unattended days are never added. The authoritative result and next
   action load after success. Display, later email and later PDF use the same
   backend timing/report builder. **Neither administrator action sends email.**
6. Sign out. Return to or refresh the roster to view current state. Finalization
   permits the next net. Email/PDF delivery remains an explicit existing owner
   action, and normal read-only viewing remains available.

Reasons are mandatory, at most 500 characters, and cannot start with a spreadsheet
formula prefix. Reviews expire after at most five minutes. Changes to the net,
check-ins, access, requests, administration or service history invalidate reviews.

## Audit, duplicate submission and rollback

`NetAdministration` records verified administrator email, recording time, net ID,
reason, new administrative owner or actual service end. Its audit ID matches
`AdminOperations.id`. `AdminOperations` also retains Google's stable subject ID,
previous/new owners, reviewed inputs, selected request, state digest, review
times and status. Neither sheet contains tokens/secrets. Uncommitted reviews are
retained for accountability.

Commits use the script lock and the reviewed full-state digest. Repeating a
completed operation ID returns completion and authoritative state without another
mutation. Completion is recorded only after the recovery transaction, flush and
authoritative payload construction succeed.

The browser persists only a pending operation UUID. After timeout, use
**Reconcile result** before another action. If needed, sign in again with the
same administrator account. Completed results reload. A `prepared` operation
was not applied and requires a new review. Other subjects cannot inspect/apply
someone else's review.

Sheets writes are not database transactions. Existing recovery helpers restore
captured rows and remove appended audits on caught errors. If execution stops
between writes or during rollback, durable `applying` status blocks retries and
competing reviews/commits for that net. An audit row alone is not proof that every
write completed. This rare case needs the backend owner:

1. Clear the allowlist temporarily, arrange that operators stop edits, and back
   up the affected spreadsheet. Preserve all operation/audit evidence.
2. Compare the operation against Nets, access, its selected operator request,
   check-ins, service history and audit. Verify whether all changes completed or
   rollback restored the original state; do not assume either from one row.
3. If all intended changes and reports/ownership verify, mark the operation
   `applied`. If the original state is verified restored, mark it `cancelled`.
   For a partial result, reconcile only affected rows against the backup and
   reviewed operation, preserve unrelated later work, and record a resolution
   note separately. Do not overwrite the whole sheet or alter historical dates
   merely to bypass validation.
4. Restore the allowlist, sign in and reconcile. `cancelled` clears the pending
   action and requires a fresh website review.

For deployment rollback, clear the allowlist, restore the prior Apps Script
version and frontend assets, and retain both audit sheets. Reverting code does
not undo completed recoveries. The editor-only
`recoverActiveNetControlToConfiguredCallsign()` and
`finalizeHistoricalNetFromConfiguredEnd()` remain available; neither is exposed
as a public API action. See [historical finalization](HISTORICAL_FINALIZATION.md).

## Local verification

```text
node google-apps-script/tests/historical-finalization.cjs
node net-checkin/tests/connection-recovery.cjs
node google-apps-script/tests/admin-recovery.cjs
node net-checkin/tests/admin-panel.cjs
```

Tests fake Google, Sheets, clocks, email, PDF and browser DOM. They cover auth
failures, replay, expiry, request proofs, rate limits, confirmation, uncertain
submissions, competing reviews, stale state, revocation, timing, audit and rollback.

For manual visual QA, run `node net-checkin/tests/admin-fixture-server.cjs` and
open `http://127.0.0.1:8765/recover.html`. Sign-in is mocked, all data is in memory,
and no live endpoint is loaded. Restarting resets fixtures. Never publish test
files; the workflow copies production assets explicitly. Check desktop/mobile
layout, keyboard focus, confirmation, sign-out and both recovery paths. Test the
real Google flow separately on HTTPS staging before production deployment.

### Verification recorded before initial publication

- 12 historical-finalization, 17 connection-recovery, 19 administrator-server
  and 7 administrator-panel tests passed (55 total).
- JavaScript syntax checks and the local Hugo build passed. Hugo reported
  existing deprecations for `languageCode`, `.Site.LanguageCode` and `.Site.Data`.
- Browser visual testing could not run: no browser was connected, and the
  in-app browser was unavailable. The local fixture and procedure above are
  supplied for that check. DOM tests are not a substitute for visual QA.
- Real Google authorization, hosting callback/log behavior, and deployment
  configuration still need the account-access staging checks described above.
- The owner reports that both Apps Script files are saved, OAuth credentials and
  the allowlist are configured server-side, and a new backend version is deployed
  at the existing URL. The confirmed callback is
  `https://w8fy.org/net-checkin/recover.html`. This release does not redeploy Apps Script.
- The four suites, syntax checks, whitespace check and Hugo build were rerun for
  publication. The workflow's explicit file copies were reproduced locally and
  checked for backend files, local configuration, credentials and fixture data.
- Real Google sign-in remains for the administrator to complete. Hosting query-log
  suppression and optional frame/security headers require host-level verification;
  saving Script Properties does not establish those settings. No live recovery,
  finalization or report sending is part of publication verification.
