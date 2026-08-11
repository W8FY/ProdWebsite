import { createClient } from "npm:@supabase/supabase-js@2";

type NetRecord = {
  id: string;
  net_date: string;
  net_control_callsign: string;
  start_time: string;
  end_time: string | null;
  finalized: boolean;
  email_sent: boolean;
  email_sent_at: string | null;
};

type CheckInRecord = {
  callsign: string;
  station_type: "Home" | "Mobile" | "EchoLink" | "Short Time";
  traffic: boolean;
  is_net_control: boolean;
};

const STATION_TYPES = ["Home", "Mobile", "EchoLink", "Short Time"] as const;
const STATION_ORDER = new Map(STATION_TYPES.map((name, index) => [name, index]));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(value: string | null): string {
  if (!value || !/^\d{2}:\d{2}/.test(value)) return "—";
  const [hourText, minute] = value.slice(0, 5).split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

function sortCheckIns(checkIns: CheckInRecord[]): CheckInRecord[] {
  return [...checkIns].sort((left, right) => {
    const trafficDifference = Number(!left.traffic) - Number(!right.traffic);
    if (trafficDifference !== 0) return trafficDifference;
    const stationDifference = (STATION_ORDER.get(left.station_type) ?? 99)
      - (STATION_ORDER.get(right.station_type) ?? 99);
    if (stationDifference !== 0) return stationDifference;
    return left.callsign.localeCompare(right.callsign, "en", { sensitivity: "base" });
  });
}

function calculateTotals(checkIns: CheckInRecord[]) {
  const totals: Record<string, number> = {
    total: checkIns.length,
    traffic: 0,
    Home: 0,
    Mobile: 0,
    EchoLink: 0,
    "Short Time": 0,
  };
  for (const entry of checkIns) {
    if (entry.traffic) totals.traffic += 1;
    totals[entry.station_type] += 1;
  }
  return totals;
}

function groupedEntries(checkIns: CheckInRecord[], traffic: boolean, stationType: string) {
  return checkIns.filter((entry) => entry.traffic === traffic && entry.station_type === stationType);
}

function buildTextReport(net: NetRecord, checkIns: CheckInRecord[]): string {
  const totals = calculateTotals(checkIns);
  const lines = [
    "W8FY AMATEUR RADIO NET REPORT", "",
    `Net Date: ${net.net_date}`,
    `Net Control: ${net.net_control_callsign}`,
    `Start Time: ${formatTime(net.start_time)}`,
    `End Time: ${formatTime(net.end_time)}`,
  ];

  for (const traffic of [true, false]) {
    lines.push("", "========================================", "", traffic ? "TRAFFIC" : "NO TRAFFIC", "");
    for (const stationType of STATION_TYPES) {
      lines.push(stationType.toUpperCase());
      const entries = groupedEntries(checkIns, traffic, stationType);
      if (!entries.length) lines.push("—");
      for (const entry of entries) {
        lines.push(`${entry.callsign} — ${entry.station_type} — ${entry.traffic ? "Traffic" : "No Traffic"}${entry.is_net_control ? " — NET CONTROL" : ""}`);
      }
      lines.push("");
    }
  }

  lines.push(
    "========================================", "",
    `TOTAL CHECK-INS: ${totals.total}`,
    `TRAFFIC: ${totals.traffic}`,
    `HOME: ${totals.Home}`,
    `MOBILE: ${totals.Mobile}`,
    `ECHOLINK: ${totals.EchoLink}`,
    `SHORT TIME: ${totals["Short Time"]}`,
  );
  return lines.join("\n");
}

function buildGroupHtml(checkIns: CheckInRecord[], traffic: boolean): string {
  return STATION_TYPES.map((stationType) => {
    const rows = groupedEntries(checkIns, traffic, stationType);
    const body = rows.length
      ? rows.map((entry) => `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #d7e1e8;font-family:monospace;font-weight:700;">${escapeHtml(entry.callsign)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #d7e1e8;">${escapeHtml(entry.station_type)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #d7e1e8;">${entry.traffic ? "Traffic" : "No Traffic"}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #d7e1e8;">${entry.is_net_control ? '<span style="padding:4px 8px;background:#0b3559;color:#fff;border-radius:999px;font-size:12px;font-weight:700;">NET CONTROL</span>' : "—"}</td>
        </tr>`).join("")
      : '<tr><td colspan="4" style="padding:10px 12px;color:#617180;">No check-ins</td></tr>';
    return `<h3 style="margin:20px 0 8px;color:#0b3559;font-size:15px;text-transform:uppercase;">${escapeHtml(stationType)}</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d7e1e8;border-collapse:collapse;">
        <thead><tr style="background:#eef3f7;text-align:left;"><th style="padding:9px 12px;">Callsign</th><th style="padding:9px 12px;">Station</th><th style="padding:9px 12px;">Traffic</th><th style="padding:9px 12px;">Notes</th></tr></thead>
        <tbody>${body}</tbody>
      </table>`;
  }).join("");
}

function buildHtmlReport(net: NetRecord, checkIns: CheckInRecord[]): string {
  const totals = calculateTotals(checkIns);
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#eef3f7;color:#17212b;font-family:Arial,sans-serif;">
    <main style="max-width:760px;margin:0 auto;background:#fff;border:1px solid #d7e1e8;border-radius:12px;overflow:hidden;">
      <header style="padding:24px;background:#071b2e;color:#fff;border-bottom:4px solid #2ec4d6;">
        <div style="color:#2ec4d6;font-size:12px;font-weight:700;letter-spacing:1.5px;">VAN WERT AMATEUR RADIO CLUB</div>
        <h1 style="margin:8px 0 0;font-size:25px;">W8FY Amateur Radio Net Report</h1>
      </header>
      <section style="padding:24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;background:#f8fbfd;border-collapse:collapse;">
          <tr><th align="left" style="padding:9px 12px;">Net Date</th><td style="padding:9px 12px;">${escapeHtml(net.net_date)}</td></tr>
          <tr><th align="left" style="padding:9px 12px;">Net Control</th><td style="padding:9px 12px;font-family:monospace;font-weight:700;">${escapeHtml(net.net_control_callsign)}</td></tr>
          <tr><th align="left" style="padding:9px 12px;">Start Time</th><td style="padding:9px 12px;">${escapeHtml(formatTime(net.start_time))}</td></tr>
          <tr><th align="left" style="padding:9px 12px;">End Time</th><td style="padding:9px 12px;">${escapeHtml(formatTime(net.end_time))}</td></tr>
        </table>
        <h2 style="margin:24px 0 10px;color:#d1495b;font-size:20px;">Traffic</h2>
        ${buildGroupHtml(checkIns, true)}
        <h2 style="margin:30px 0 10px;color:#0b3559;font-size:20px;">No Traffic</h2>
        ${buildGroupHtml(checkIns, false)}
        <h2 style="margin:30px 0 10px;color:#0b3559;font-size:20px;">Totals</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f7;border-collapse:collapse;text-align:center;">
          <tr><td style="padding:14px;"><strong>${totals.total}</strong><br><small>Total Check-Ins</small></td><td style="padding:14px;"><strong>${totals.traffic}</strong><br><small>Traffic</small></td><td style="padding:14px;"><strong>${totals.Home}</strong><br><small>Home</small></td></tr>
          <tr><td style="padding:14px;"><strong>${totals.Mobile}</strong><br><small>Mobile</small></td><td style="padding:14px;"><strong>${totals.EchoLink}</strong><br><small>EchoLink</small></td><td style="padding:14px;"><strong>${totals["Short Time"]}</strong><br><small>Short Time</small></td></tr>
        </table>
      </section>
    </main>
  </body></html>`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return jsonResponse(405, { success: false, error: "Method not allowed." });

  try {
    const body = await request.json().catch(() => null);
    const netId = typeof body?.netId === "string" ? body.netId.trim() : "";
    if (!UUID_PATTERN.test(netId)) return jsonResponse(400, { success: false, error: "A valid net ID is required." });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const reportEmail = Deno.env.get("NET_REPORT_EMAIL");
    const reportFrom = Deno.env.get("NET_REPORT_FROM");
    if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !reportEmail || !reportFrom) {
      console.error("send-net-report is missing required server-side configuration.");
      return jsonResponse(500, { success: false, error: "The email service is not configured." });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: net, error: netError } = await supabase.from("nets").select("id,net_date,net_control_callsign,start_time,end_time,finalized,email_sent,email_sent_at").eq("id", netId).maybeSingle();
    if (netError) throw netError;
    if (!net) return jsonResponse(404, { success: false, error: "Net not found." });
    if (!net.finalized) return jsonResponse(409, { success: false, error: "The net must be finalized before emailing its report." });
    if (net.email_sent) return jsonResponse(200, { success: true, alreadySent: true, emailSentAt: net.email_sent_at });

    const { data: rows, error: checkInError } = await supabase.from("net_checkins").select("callsign,station_type,traffic,is_net_control").eq("net_id", netId);
    if (checkInError) throw checkInError;
    const checkIns = sortCheckIns((rows ?? []) as CheckInRecord[]);
    const subject = `W8FY Net Report - ${net.net_date} - ${net.net_control_callsign}`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `w8fy-net-report/${netId}`,
      },
      body: JSON.stringify({
        from: reportFrom,
        to: [reportEmail],
        subject,
        html: buildHtmlReport(net as NetRecord, checkIns),
        text: buildTextReport(net as NetRecord, checkIns),
      }),
    });
    const resendResult = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      console.error("Resend rejected the report email.", resendResponse.status, resendResult);
      return jsonResponse(502, { success: false, error: "Resend could not send the report. Check the Edge Function logs." });
    }

    const sentAt = new Date().toISOString();
    const { data: updatedNet, error: updateError } = await supabase.from("nets")
      .update({ email_sent: true, email_sent_at: sentAt })
      .eq("id", netId)
      .eq("email_sent", false)
      .select("email_sent,email_sent_at")
      .maybeSingle();
    if (updateError) throw updateError;

    // A concurrent request can finish the same idempotent Resend submission
    // first. In that case, return the authoritative recorded state as success.
    if (!updatedNet) {
      const { data: recordedNet, error: recordedError } = await supabase.from("nets")
        .select("email_sent,email_sent_at")
        .eq("id", netId)
        .single();
      if (recordedError) throw recordedError;
      if (!recordedNet.email_sent) throw new Error("The email was sent but its database status was not recorded.");
      return jsonResponse(200, { success: true, alreadySent: true, emailSentAt: recordedNet.email_sent_at });
    }

    return jsonResponse(200, {
      success: true,
      alreadySent: false,
      emailId: typeof resendResult.id === "string" ? resendResult.id : null,
      emailSentAt: updatedNet.email_sent_at,
    });
  } catch (error) {
    console.error("send-net-report failed.", error);
    return jsonResponse(500, { success: false, error: "The report email could not be completed. Check the Edge Function logs." });
  }
});
