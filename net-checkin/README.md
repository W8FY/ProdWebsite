# W8FY Amateur Radio Net Check-In

The W8FY Net Check-In application is a responsive browser tool for conducting an amateur radio net. Net Control can start a session, record and sort check-ins, track traffic and station totals, remove normal check-ins, finalize the net, review a formatted report, and securely email the finalized report.

For the current Apps Script administrator recovery panel, see
[Administrator recovery setup and workflow](../google-apps-script/ADMIN_RECOVERY.md).
The Supabase stage notes below are retained as historical documentation.

## Stage 3

Stage 3 sends the automatic report through the Supabase `send-net-report` Edge Function and Resend. The browser submits only the net UUID. The function retrieves the authoritative net and check-ins from Supabase, verifies the net is finalized, applies the required sorting, generates HTML and plain-text messages, and sends to one server-configured recipient.

The Resend API key and email addresses are Supabase Edge Function secrets. They never belong in `index.html`, `js/app.js`, `js/supabase.js`, Git, or any other browser-accessible file.

### Stage 3 database upgrade

Existing Stage 2 databases must run `supabase/stage3-email-migration.sql` once in the Supabase SQL Editor. It adds these columns without deleting or replacing existing data:

```sql
email_sent boolean not null default false
email_sent_at timestamp with time zone null
```

For a new installation, run the complete `supabase/schema.sql`; it already includes the Stage 3 columns. The browser is not granted permission to change these columns. Only the server-side Edge Function marks a report emailed.

### Configure Resend

1. Create an account at [resend.com](https://resend.com/).
2. In Resend, create an API key with sending access.
3. Add and verify the sending domain in **Domains**. Complete the DNS records Resend provides and wait for the domain to show as verified.
4. Choose a sender using that verified domain, such as `W8FY Net Reports <reports@verified-domain.example>`. Do not assume or commit a real address.
5. Choose the destination mailbox that should receive finalized reports.

### Set Edge Function secrets

From the `net-checkin` directory, install/login to the Supabase CLI and link the correct project. Then set the three private configuration values in Supabase:

```text
supabase login
supabase link --project-ref <project-ref>
supabase secrets set RESEND_API_KEY=<resend-api-key>
supabase secrets set NET_REPORT_EMAIL=<destination-address>
supabase secrets set NET_REPORT_FROM="W8FY Net Reports <sender@verified-domain.example>"
supabase secrets list
```

Required secrets:

- `RESEND_API_KEY`: private Resend sending credential.
- `NET_REPORT_EMAIL`: the single destination address.
- `NET_REPORT_FROM`: the verified Resend sender, optionally with a display name.

Do not place real values in this README or a committed `.env` file. Supabase automatically provides its database URL and privileged server credential to the hosted function. That credential is read only inside the Edge Function and must never be copied into browser code.

### Deploy the Edge Function

Run from the `net-checkin` directory:

```text
supabase functions deploy send-net-report --no-verify-jwt
```

`supabase/config.toml` records the same public-function setting. Stage 3 intentionally has no user accounts or authentication, so the GitHub Pages client must be able to invoke the function. The endpoint still accepts only a valid net UUID, reads the report from Supabase, sends only finalized/unsent nets, and sends only to `NET_REPORT_EMAIL`.

The Resend request uses `w8fy-net-report/<net-uuid>` as its idempotency key. The database also records `email_sent` and `email_sent_at`; later calls for a successfully recorded net return success without sending again.

### Test Stage 3

Use a non-production net and mailbox for testing:

1. Confirm **Database: Connected**.
2. Start a net and add Traffic and No Traffic check-ins covering Home, Mobile, EchoLink, and Short Time. Include Net Control.
3. Select **Finalize Net & Email Report** and confirm.
4. Verify the report appears immediately and the database row has `finalized = true` with an end time.
5. In the browser Network panel, verify a request to `send-net-report` returns HTTP 200.
6. Verify the page shows **NET FINALIZED — REPORT EMAILED** and **Report emailed**.
7. Verify `email_sent = true` and `email_sent_at` is populated in Supabase.
8. Check the recipient inbox and Resend logs. Confirm the subject uses `W8FY Net Report - YYYY-MM-DD - CALLSIGN`, Net Control is labeled, every station is sorted correctly, and all totals match.
9. Inspect both HTML and plain-text versions in an email client or Resend preview.

To test failure and retry safely, use a test Supabase/Resend setup, temporarily replace `RESEND_API_KEY` with a deliberately invalid test value, and finalize a new test net. Confirm **NET FINALIZED — EMAIL FAILED**, the final report remains visible, the database net remains finalized, and **Retry Email** appears. Restore the valid Resend key in Supabase secrets, select **Retry Email**, and verify success plus the two email fields. Do not put either value in the repository, and do not reuse a net already marked `email_sent = true` for the failure test.

For server errors, inspect **Supabase Dashboard > Edge Functions > send-net-report > Logs** and the browser Console/Network panels. Common causes are a missing secret, an unverified `NET_REPORT_FROM`, the Stage 3 migration not having been run, or a Resend rejection.

## Stage 2A foundation

Stage 2A keeps the Stage 1 HTML/CSS/JavaScript interface and moves permanent net data to Supabase:

- `nets` stores each net's date, Net Control details, times, and finalized state.
- `net_checkins` stores the Net Control and normal check-ins associated with a net.
- Supabase is authoritative for all net and check-in records.
- `localStorage` stores only the last net UUID so the same browser can restore a finalized net.
- Row Level Security limits the public browser client's operations.
- No PHP, MySQL, authentication, user accounts, or browser-side private key is used.

Stage 3 retains this data model and adds server-side email after finalization.

## Project structure

```text
net-checkin/
├── index.html
├── css/
│   └── style.css
├── images/
│   └── .gitkeep
├── js/
│   ├── app.js
│   └── supabase.js
├── roster/
│   └── .gitkeep
├── supabase/
│   └── schema.sql
└── README.md
```

## Create and configure Supabase

### 1. Create a project

1. Sign in at [supabase.com](https://supabase.com/).
2. Create a new project and wait for its database to become available.
3. Open the project's **SQL Editor**.
4. Open `supabase/schema.sql` from this repository, copy the complete SQL, and run it once in the SQL Editor.

The SQL creates both tables, constraints, indexes, the updated-time trigger, grants, and Row Level Security policies. Re-running the file is designed to refresh policies and indexes safely, but it does not delete existing records.

### 2. Find the browser configuration

In the Supabase dashboard, use the project's **Connect** dialog or open **Settings > API**. Copy:

- The **Project URL**, which resembles `https://project-reference.supabase.co`.
- The public **publishable** key, or the legacy public **anon** key.

The publishable/anon key is intended for browser use when Row Level Security is enabled. Database access is controlled by the policies in `schema.sql`.

### 3. Configure the application

Open `js/supabase.js` and replace only these placeholders:

```javascript
var SUPABASE_URL = runtimeConfig.url || "YOUR_SUPABASE_URL";
var SUPABASE_ANON_KEY = runtimeConfig.anonKey || "YOUR_SUPABASE_ANON_KEY";
```

Use the Project URL and public publishable/anon key. After configuration, reload the page and confirm the header displays **Database: Connected**.

### Security warning

**Never put the Supabase `service_role` key, secret key, database password, Resend API key, or access token in browser code or a committed file.** A service-role credential bypasses RLS and is used only through Supabase's protected, automatically supplied Edge Function environment.

Before committing, inspect changed files and search for private values. If a private key is ever committed, revoke and rotate it immediately in Supabase; deleting it from the latest file is not enough because Git retains history.

The public publishable/anon key is safe to expose in this browser app, but it is only safe because RLS is enabled and the public policies are deliberately constrained.

## Database security and limitations

`supabase/schema.sql` applies these Stage 2A rules:

- Callsigns must be nonempty, trimmed, and uppercase.
- Station type is restricted to Home, Mobile, EchoLink, or Short Time.
- Traffic and Net Control flags are PostgreSQL booleans.
- `(net_id, callsign)` is unique.
- Each net can have only one Net Control check-in.
- Deleting a net through an administrative database operation cascades to its check-ins.
- The public browser can read and create nets, but cannot delete nets.
- The public browser can only update a net's end time and finalized state.
- Check-ins can only be added to an open net.
- Normal check-ins can only be deleted while their net is open.
- Net Control check-ins cannot be deleted by the browser.
- Check-ins cannot be updated by the public browser.

Because Stage 2A intentionally has no authentication, anonymous visitors cannot be tied to an individual operator. RLS limits the available operations, but authenticated ownership and stronger operator authorization require a later stage.

## Open and run locally

1. In Visual Studio Code, select **File > Open Folder** and choose `net-checkin`.
2. Install the **Live Server** extension if needed.
3. Right-click `index.html` and select **Open with Live Server**.
4. Confirm **Database: Connected** appears before starting a net.

A local web server is recommended because browsers restrict PDF detection when opening `index.html` directly through `file://`.

## Test Stage 2A

### Connection

1. Temporarily leave the placeholders in `js/supabase.js` and reload.
2. Confirm **Database: Offline** and the friendly connection message appear.
3. Add the correct public configuration and reload.
4. Confirm **Database: Connected** appears.

### Create a net and Net Control check-in

1. Enter a lowercase Net Control callsign, station type, and traffic selection.
2. Select **Start Net**.
3. Confirm the interface shows **NET ACTIVE** and the callsign is uppercase.
4. In Supabase **Table Editor**, open `nets` and verify the new row.
5. Open `net_checkins` and verify Net Control has `is_net_control = true` and the correct `net_id`.

### Add and sort check-ins

1. Add a second station and verify it appears in `net_checkins`.
2. Add several callsigns using both traffic values and all station types.
3. Confirm traffic stations display first, followed by Home, Mobile, EchoLink, Short Time, then alphabetical callsign.
4. Try an existing callsign and confirm it is rejected.
5. Refresh the browser and confirm the active net and roster reload from Supabase.

### Remove a check-in

1. Remove a normal station and confirm the prompt.
2. Verify its row disappears from Supabase and the totals update.
3. Confirm Net Control has no Remove button.
4. Optionally attempt a Net Control delete with the public client and confirm RLS blocks it.

### Finalize and restore

1. Select **Finalize Net & Email Report** and confirm.
2. Verify `end_time` is saved and `finalized` is `true` in `nets`.
3. Confirm the controls lock and the final report appears.
4. Refresh the same browser and confirm the finalized net and report return.
5. Select **Start New Net**. The completed net remains in Supabase while the browser returns to the setup screen.

## Browser storage

Stage 2A uses `localStorage` only for this key:

```text
w8fy.netCheckin.lastNetId
```

It contains a Supabase UUID, not the net record or roster. If the key is missing, the app asks Supabase for the newest non-finalized net. Supabase remains the authoritative database.

## Logo and roster PDF

Place the real club logo at:

```text
images/w8fy-logo.png
```

Place the real roster PDF at:

```text
roster/net-roster.pdf
```

The application shows a W8FY text placeholder and the expected PDF fallback when those files are absent. Stage 2A does not generate PDFs.

## Publish to GitHub Pages

Commit the complete `net-checkin` folder to a GitHub repository. In that repository, open **Settings > Pages**, select deployment from a branch, and choose the branch/folder containing `index.html`.

The Supabase client is loaded with the official browser CDN build of `@supabase/supabase-js` v2, so no package manager or build step is required.

Stage 3 does not include authentication, accounts, an admin dashboard, net history, automatic PDF generation, payments, SMS, or push notifications.
