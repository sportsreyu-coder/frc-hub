// Emails a team join link for an invite a mentor already created
// (create_student_invite). Called by the FRC Hub frontend with the mentor's
// own session, so the invite is looked up through list_student_invites --
// which only returns the caller's team's invites to a mentor -- and nothing
// is sent unless that check passes. Needs RESEND_API_KEY (and optionally
// INVITE_FROM_EMAIL); see ../README.md.
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = "https://frc-hub-nu.vercel.app";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Unauthorized." }, 401);
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "Email isn't configured." }, 500);

  let inviteId: string | undefined;
  try { inviteId = (await req.json()).invite_id; } catch { /* handled below */ }
  if (!inviteId) return json({ error: "Missing invite_id." }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });

  const { data: invites, error } = await supabase.rpc("list_student_invites");
  if (error) return json({ error: error.message }, 400);
  const invite = (invites || []).find((i: { id: string }) => i.id === inviteId);
  if (!invite) return json({ error: "Invite not found." }, 404);
  if (!invite.email) return json({ error: "This invite has no email address." }, 400);
  if (invite.used_at || new Date(invite.expires_at) <= new Date()) {
    return json({ error: "This invite is no longer valid." }, 400);
  }

  const { data: team } = await supabase.from("teams").select("team_number, team_name").eq("id", invite.team_id).single();
  const teamLabel = team ? "Team " + team.team_number + (team.team_name ? " (" + team.team_name + ")" : "") : "an FRC team";
  const role = invite.role === "mentor" ? "mentor" : "student";
  const link = APP_URL + "/account.html?join=" + invite.code;
  const expires = new Date(invite.expires_at).toUTCString().slice(0, 16);
  const greeting = invite.label ? "Hi " + invite.label + "," : "Hi,";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("INVITE_FROM_EMAIL") || Deno.env.get("REMINDER_FROM_EMAIL") || "FRC Hub <invites@frchub.app>",
      to: invite.email,
      subject: "You're invited to join " + teamLabel + " on FRC Hub",
      text: greeting + "\n\nYou've been invited to join " + teamLabel + " on FRC Hub as a " + role +
        ".\n\nJoin here: " + link + "\n\nThis link works once and expires on " + expires +
        ". If it expires, ask your mentor for a new one.\n",
      html: "<p>" + esc(greeting) + "</p><p>You've been invited to join <strong>" + esc(teamLabel) +
        "</strong> on FRC Hub as a " + role + ".</p><p><a href=\"" + esc(link) + "\">Join the team</a></p><p>This link works once and expires on " +
        esc(expires) + ". If it expires, ask your mentor for a new one.</p>",
    }),
  });
  if (!res.ok) {
    console.error("Resend error: " + (await res.text()));
    return json({ error: "Email provider rejected the message." }, 502);
  }

  await supabase.rpc("mark_invite_emailed", { p_invite_id: inviteId });
  return json({ ok: true });
});
