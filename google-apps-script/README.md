# W8FY Net Check-In — Google Apps Script Backend

This folder contains the first backend stage for the new architecture:

```text
GitHub Pages (HTML/CSS/JavaScript)
        ↓
Google Apps Script Web App
        ↓
Google Sheets
        ↓
Gmail/MailApp in a later stage
```

The current frontend has not been changed. The existing Supabase files have not been deleted. Email and PDF generation are deliberately not implemented yet.

## Files

- `Code.gs` — Google Apps Script JSON API, spreadsheet setup, validation, net/check-in storage, finalization, sorting, and report generation.
- `README.md` — manual setup, deployment, API, testing, and security guidance.

## 1. Create and select the Google Sheet

1. Sign in to the Google account that should own the backend.
2. Create a Google Sheet named **W8FY Net Check-In Database**.
3. Set the spreadsheet time zone under **File > Settings** to the time zone used for W8FY nets.
4. With that spreadsheet open, select **Extensions > Apps Script**.

Using a script opened from the target spreadsheet keeps setup simple and avoids putting a spreadsheet ID in GitHub.

## 2. Copy the backend into Apps Script

1. Open `google-apps-script/Code.gs` from this repository.
2. In the Apps Script editor, open the default `Code.gs` file.
3. Replace its contents with the complete repository `Code.gs` file.
4. Save the Apps Script project and name it **W8FY Net Check-In Backend**.

Do not add Google passwords, OAuth tokens, API keys, spreadsheet IDs, or other credentials to the repository version.

## 3. Authorize and initialize the spreadsheet

1. In the function selector at the top of the Apps Script editor, choose `setupW8FYDatabase`.
2. Select **Run**.
3. Google will request authorization to access the bound spreadsheet. Review the requested access and authorize the script using the intended owner account.
4. Wait for the execution to complete successfully.

`setupW8FYDatabase()` stores the selected spreadsheet ID in Apps Script **Script Properties**, not in this repository or browser code. It then creates or verifies these sheets:

### Nets

| Column | Purpose |
|---|---|
| `id` | Generated UUID for the net |
| `net_date` | Net date in `YYYY-MM-DD` format |
| `net_control_callsign` | Uppercase Net Control callsign |
| `net_control_station_type` | Home, Mobile, EchoLink, or Short Time |
| `net_control_traffic` | Google Sheets boolean TRUE/FALSE |
| `start_time` | Start time in 24-hour `HH:MM` format |
| `end_time` | End time after finalization |
| `finalized` | TRUE after finalization |
| `email_sent` | Reserved for the email stage; initially FALSE |
| `email_sent_at` | Reserved email timestamp; initially blank |
| `created_at` | Creation timestamp |
| `updated_at` | Last backend update timestamp |

### CheckIns

| Column | Purpose |
|---|---|
| `id` | Generated UUID for the check-in |
| `net_id` | UUID of the related Nets record |
| `callsign` | Uppercase callsign |
| `station_type` | Home, Mobile, EchoLink, or Short Time |
| `traffic` | Google Sheets boolean TRUE/FALSE |
| `is_net_control` | TRUE only for the protected Net Control row |
| `created_at` | Creation timestamp |

If either sheet already exists with incorrect headers, setup stops with an error instead of overwriting data.

## 4. Deploy as a Web App

Google's official deployment flow is documented in [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web).

1. In Apps Script, select **Deploy > New deployment**.
2. Next to **Select type**, choose **Web app**.
3. Enter a description such as `W8FY Net Check-In API - initial backend`.
4. Set **Execute as** to **Me** (the spreadsheet/backend owner).
5. For private development testing, choose the narrowest access option that works for the testers.
6. When the GitHub Pages frontend is connected in a later stage, it must be able to call the deployed endpoint. If that requires **Anyone**, read the public-endpoint warning below before enabling it.
7. Select **Deploy** and complete any authorization prompt.
8. Copy the `/exec` Web App URL into a secure deployment note. Do not commit it until the frontend integration stage has an agreed configuration approach.

The `/dev` test-deployment URL works only for users who can edit the script and always runs the most recently saved code. The `/exec` URL is the deployed version.

## 5. Test the health endpoint

Open this URL in a browser, replacing the placeholder with the deployed `/exec` URL:

```text
<GOOGLE_APPS_SCRIPT_WEB_APP_URL>?action=health
```

Expected JSON structure:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "W8FY Net Check-In API",
    "sheets": ["Nets", "CheckIns"],
    "emailEnabled": false,
    "pdfEnabled": false
  }
}
```

This health request verifies the deployed script can open the configured spreadsheet and verify both sheet headers. It does not create a net or send email.

## API design

All responses use one of these envelopes:

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "error": "Human-readable error" }
```

Apps Script Content Service responses normally use HTTP 200, including application-level errors. The frontend must inspect the JSON `success` property rather than relying only on HTTP status.

### GET actions

| Action | Request | Result |
|---|---|---|
| `health` | `?action=health` | Verifies configuration and sheet headers |
| `getActiveNet` | `?action=getActiveNet` | Returns the newest open net and its sorted check-ins, or `null` |
| `getNet` | `?action=getNet&netId=<UUID>` | Returns one net, its sorted check-ins, and its report when finalized |

GET parameters contain identifiers and action names only. Do not put credentials or private data in query parameters.

### POST actions

Send a JSON object in the request body. The backend accepts either fields beside `action` or inside a `data` object.

#### Create a net

```json
{
  "action": "createNet",
  "data": {
    "netDate": "2026-08-10",
    "netControlCallsign": "W8ABC",
    "netControlStationType": "Home",
    "netControlTraffic": false,
    "startTime": "19:00"
  }
}
```

The backend creates the net and automatically creates the first CheckIns row with `is_net_control = TRUE`.

#### Add a check-in

```json
{
  "action": "addCheckIn",
  "data": {
    "netId": "<NET_UUID>",
    "callsign": "N8XYZ",
    "stationType": "Mobile",
    "traffic": true
  }
}
```

Callsigns are uppercased. A callsign cannot be added more than once to the same net.

#### Remove a normal check-in

```json
{
  "action": "removeCheckIn",
  "data": {
    "netId": "<NET_UUID>",
    "checkInId": "<CHECKIN_UUID>"
  }
}
```

The backend confirms the row belongs to the specified open net. It rejects removal when `is_net_control = TRUE`.

#### Finalize a net

```json
{
  "action": "finalizeNet",
  "data": {
    "netId": "<NET_UUID>",
    "endTime": "20:05"
  }
}
```

The response contains the finalized net, sorted check-ins, totals, grouped report data, and a plain-text final report. It does not send email.

#### Email report placeholder

```json
{
  "action": "sendReport",
  "data": {
    "netId": "<NET_UUID>"
  }
}
```

This action validates the net but intentionally returns `success: false` with an “Email sending is not implemented” message. The later email stage will use `MailApp.sendEmail()` and will update `email_sent` only after a successful send.

## Future GitHub Pages request pattern

The frontend is not changed in this stage. When integration begins, its requests will resemble:

```javascript
const healthResponse = await fetch(
  GOOGLE_APPS_SCRIPT_WEB_APP_URL + '?action=health'
);
const healthResult = await healthResponse.json();
```

For POST requests, use a simple text request containing JSON. This avoids placing data in the URL and avoids relying on a custom authorization header:

```javascript
const response = await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'text/plain;charset=utf-8'
  },
  body: JSON.stringify({
    action: 'addCheckIn',
    data: {
      netId: '<NET_UUID>',
      callsign: 'N8XYZ',
      stationType: 'Mobile',
      traffic: false
    }
  })
});

const result = await response.json();
if (!result.success) {
  throw new Error(result.error);
}
```

The actual Web App URL and integration code will be added only when the frontend migration is explicitly requested.

## Validation and concurrency protections

The backend does not trust browser values. It validates:

- Allowed GET and POST actions.
- UUID format for net and check-in identifiers.
- Callsigns, uppercasing them and allowing only letters, numbers, and `/`.
- Station type against Home, Mobile, EchoLink, and Short Time.
- Traffic as a real boolean or explicit TRUE/FALSE/Yes/No value.
- Date and time formats.
- Net existence and finalized state.
- Duplicate callsigns within a net.
- Net Control identity before allowing removal.

All state-changing operations use an Apps Script Script Lock. This prevents two simultaneous requests from passing the duplicate or active-net checks and writing conflicting rows.

## Sorting

Check-ins returned by `getActiveNet`, `getNet`, and `finalizeNet` are sorted exactly as follows:

1. Traffic TRUE before Traffic FALSE.
2. Within each traffic group: Home, Mobile, EchoLink, Short Time.
3. Within each station type: callsign alphabetically.

Net Control remains in its matching traffic/station group and is identified with `is_net_control = true` and `NET CONTROL` in the text report.

## Security considerations

- Never commit Google credentials, OAuth tokens, passwords, API keys, spreadsheet IDs, or email secrets.
- Never send OAuth tokens or Apps Script authorization data to the browser.
- The selected spreadsheet ID is stored in Apps Script Script Properties by `setupW8FYDatabase()`.
- The web app runs using the script owner's authorized spreadsheet access. The frontend does not need or receive a Google API key.
- Request fields are allow-listed and validated. Internal exception details are logged in Apps Script but replaced with a generic public error.
- The Web App URL is not a strong authentication secret.

### Important public-endpoint limitation

This design intentionally has no user authentication yet. If the deployment is made accessible to **Anyone** so GitHub Pages can call it, anyone who obtains the Web App URL can attempt the same create/add/remove/finalize actions. Input validation and locking protect data integrity, but they do not identify an authorized Net Control operator.

Before treating this as a production system, decide whether public access is acceptable or add an authentication/proxy design that does not embed a reusable secret in browser JavaScript. Do not solve this by placing an API key or password in the GitHub Pages frontend; visitors could read it.

## Email and PDF status

- No call to `MailApp.sendEmail()` or `GmailApp` exists in this stage.
- `email_sent` remains FALSE and `email_sent_at` remains blank.
- `sendReport` is a validated placeholder only.
- `generatePdfReport_()` is a placeholder that does not create a file.

Email destination configuration, Gmail authorization, message formatting, duplicate-send handling, and PDF generation belong to later explicitly requested stages.
