# Membership Roster Data

The membership panel is the source of truth for roster data. Do not store private membership workbooks in this website repository.

The panel publishes the public, sanitized roster JSON to this path:

```env
ROSTER_REPO_PATH=/website
ROSTER_OUTPUT_PATH=static/data/member-roster.json
ROSTER_FORMAT=json
```

Hugo serves files in `static/` from the site root, so the browser reads this file at `/data/member-roster.json`.
