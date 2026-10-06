// Public, token-authenticated .ics feed for one team's assigned tasks
// and tracked grant deadlines -- the "subscription" half of G4. The
// one-off Export button in js/season.js downloads a snapshot that goes
// stale; a calendar app that subscribes to this URL re-fetches it on
// its own schedule and stays current.
//
// Deploy: supabase functions deploy calendar-feed --no-verify-jwt
// (no-verify-jwt because calendar apps send a plain GET with no
// Supabase auth header at all -- the ?token= query param, checked
// against teams.calendar_feed_token below, is the only auth here).
// See ../README.md.
import { createClient } from "jsr:@supabase/supabase-js@2";

function icsDateOnly(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function icsEscape(s: string): string {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const teamId = url.searchParams.get("team");
  const token = url.searchParams.get("token");
  if (!teamId || !token) {
    return new Response("Missing team or token.", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: team, error: teamErr } = await supabase
    .from("teams")
    .select("id, team_number, calendar_feed_token")
    .eq("id", teamId)
    .maybeSingle();

  if (teamErr || !team || team.calendar_feed_token !== token) {
    return new Response("Not found.", { status: 404 });
  }

  const { data: deadlines, error } = await supabase
    .from("team_deadlines")
    .select("item_key, title, due_date, kind")
    .eq("team_id", teamId)
    .order("due_date", { ascending: true });

  if (error) {
    return new Response("Could not load deadlines.", { status: 500 });
  }

  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FRC Hub//Team Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:FRC Hub — Team " + team.team_number,
  ];

  (deadlines || []).forEach((d) => {
    const start = icsDateOnly(d.due_date);
    const end = icsDateOnly(
      new Date(new Date(d.due_date + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10),
    );
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + d.item_key + "@frc-hub-deadlines",
      "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + start,
      "DTEND;VALUE=DATE:" + end,
      "SUMMARY:" + icsEscape((d.kind === "grant" ? "💰 " : "") + d.title),
      "END:VEVENT",
    );
  });

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
