# Finalizing an administratively recovered historical net

Administrative ownership recovery is not evidence of on-air service. New calls
to `recoverActiveNetControlToConfiguredCallsign()` still approve an existing,
unexpired request from a checked-in operator and issue ownership at the real
recovery time. They now append a `recovery` entry to `NetAdministration` instead
of changing `NetControlHistory` or the operator's check-in flag.

Ordinary web finalization retains its ownership and service-timestamp checks.
After administrative recovery, use the editor-only operation below. It is not
an API action and does not send email. Do not change recovery timestamps or the
original net date to make web finalization pass.

## Prerequisites and explicit inputs

First establish the actual on-air end from an operator log or confirmation.
If it is unknown, leave the net open until that information is available. The
recovery time and today's clock are not substitutes for the actual end.

In the existing Apps Script project's **Project Settings > Script Properties**,
set all four properties:

| Property | Required value |
| --- | --- |
| `NET_HISTORICAL_NET_ID` | Exact `Nets.id` of the unfinished net. No automatic selection of an active net. |
| `NET_HISTORICAL_END_AT` | Actual end date/time with seconds `00` and an explicit UTC offset: `YYYY-MM-DDTHH:mm:00-04:00`, `...-05:00`, or `...Z`. Use the offset applicable on the historical date. |
| `NET_HISTORICAL_RECOVERY_ID` | For a recovery made by the new code: the `NetAdministration.id` of its `recovery` row. For the existing legacy recovery: the `NetControlHistory.id` of the new owner's open segment recorded at recovery time. This is a row ID, not a callsign, request ID, or row number. |
| `NET_HISTORICAL_REASON` | Source of the actual end and an explicit explanation confirming that the identified recovery was administrative, not on-air service (1–500 characters). |

The recovery must belong to this net's current owner and match the current
access issuance time. The supplied end must precede or equal recovery, must
not be in the future, and must be less than 24 hours after the original start.
Same-day and overnight nets are supported. Multi-day or contradictory service
histories are rejected for review rather than assigned guessed durations.

## Deploy and use when approved

1. Review and update the existing project's `Code.gs`, preserving any live-only
   changes. Save it. No frontend changes are needed for this fix.
2. Select **Deploy > Manage deployments**, edit the existing web app deployment,
   choose **New version**, and deploy. Reuse that deployment to retain its URL.
   Saving code alone does not update the web app's report generation.
3. Supply the four verified properties above and manually run
   `finalizeHistoricalNetFromConfiguredEnd()` in the editor. This immediately
   finalizes the identified net; it does not email a report. The properties
   are consumed on success or failure so a later run cannot reuse stale input.
4. Refresh the roster in the recovered owner's browser. Review the actual end,
   total operating minutes, per-operator time, and administrative note before
   deliberately requesting an email or PDF. Existing owner tokens remain in
   place; normal owner checks still govern report delivery and download.

No setup reset or migration of the existing sheets is required. The new audit
sheet is created on the first administrative operation and existing headers
are validated. Existing `CheckIns`, original `net_date`, ownership token hashes,
and `NetControlHistory` rows are preserved. Nets/access modification timestamps
record the actual finalization time, not the historical service end.

## Report and audit behavior

The historical finalization appends an audit with actor, recording time,
recovery row ID, actual service end, and the administrator's reason. Legacy
history is retained verbatim, even where the old recovery code had closed the
previous operator's segment days later. Reports project that service segment
only through the explicitly supplied end; the administrative takeover does not
receive operating minutes. Conflicting segments cause validation failure.

The report lists on-air Net Controls separately from administrative ownership.
Only report copies of check-in flags are derived from service history; saved
check-ins and the current owner's roster access are unchanged. The displayed
authoritative report, email body, and PDF paragraphs share the same backend
report builder, including the explicit end timestamp and administrative note.

## Local verification

```text
node google-apps-script/tests/historical-finalization.cjs
node net-checkin/tests/connection-recovery.cjs
```

The historical tests use in-memory spreadsheet, email, PDF, clock, and property
services. They never access live records, send mail, or create real documents.
