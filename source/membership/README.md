# Membership Workbook Source

Place the private membership workbook in this folder, then run:

```powershell
.\tools\Export-MemberRoster.ps1
```

The exporter writes the public, sanitized roster data to `static/data/member-roster.json`.

The membership panel should publish to the same path inside this Hugo repo:

```env
ROSTER_REPO_PATH=/website
ROSTER_OUTPUT_PATH=static/data/member-roster.json
ROSTER_FORMAT=json
```

Hugo serves files in `static/` from the site root, so the browser reads this file at `/data/member-roster.json`.
