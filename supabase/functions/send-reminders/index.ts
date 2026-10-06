// Daily job: emails each assigned user a reminder 14, 7, and 1 day(s)
// before their task or tracked grant deadline is due, unless they've
// opted out (profiles.reminder_emails_opt_out) -- the email half of
// G4; ../calendar-feed is the subscription half.
//
// NOT called by the app. The site owner schedules this (Supabase
// dashboard -> Edge Functions -> this function -> Cron Trigger, or
// pg_cron + pg_net hitting its URL) to run once a day, after setting
// the RESEND_API_KEY and REMINDER_CRON_SECRET secrets. See
// ../README.md -- without that scheduling step this function exists
// but never runs on its own.
import { createClient } from "jsr:@supabase/supabase-js@2";

const DAYS_BEFORE = [14, 7, 1];
const APP_URL = "https://frc-hub-nu.vercel.app/season.html";

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set -- skipping send to " + to);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("REMINDER_FROM_EMAIL") || "FRC Hub <reminders@frchub.app>",
      to,
      subject,
      text,
    }),
  });
  if (!res.ok) {
    console.error("Resend error for " + to + ": " + (await res.text()));
    return false;
  }
  return true;
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
  if (cronSecret && req.headers.get("Authorization") !== "Bearer " + cronSecret) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let sent = 0;
  let skipped = 0;

  for (const daysBefore of DAYS_BEFORE) {
    const targetDate = todayPlus(daysBefore);
    const { data: deadlines, error } = await supabase
      .from("team_deadlines")
      .select("item_key, title, kind, assignee_user_ids")
      .eq("due_date", targetDate);

    if (error) {
      console.error("Query failed for " + targetDate + ": " + error.message);
      continue;
    }

    for (const d of deadlines || []) {
      for (const userId of d.assignee_user_ids || []) {
        const { data: already } = await supabase
          .from("reminder_sent")
          .select("user_id")
          .eq("user_id", userId)
          .eq("item_key", d.item_key)
          .eq("days_before", daysBefore)
          .maybeSingle();
        if (already) { skipped++; continue; }

        const { data: profile } = await supabase
          .from("profiles")
          .select("reminder_emails_opt_out")
          .eq("id", userId)
          .maybeSingle();
        if (profile && profile.reminder_emails_opt_out) { skipped++; continue; }

        const { data: userRes } = await supabase.auth.admin.getUserById(userId);
        const email = userRes && userRes.user ? userRes.user.email : null;
        if (!email) { skipped++; continue; }

        const whenText = daysBefore === 1 ? "tomorrow" : "in " + daysBefore + " days";
        const kindText = d.kind === "grant" ? "grant deadline" : "task";
        const ok = await sendEmail(
          email,
          "FRC Hub: " + d.title + " is due " + whenText,
          "Reminder from FRC Hub: your " + kindText + " \"" + d.title + "\" is due " + whenText +
            " (" + targetDate + ").\n\nOpen the Season Tracker: " + APP_URL +
            "\n\nTo stop these emails, turn off \"Email me deadline reminders\" in Account > Profile customization.",
        );
        if (!ok) { skipped++; continue; }

        await supabase.from("reminder_sent").insert({ user_id: userId, item_key: d.item_key, days_before: daysBefore });
        sent++;
      }
    }
  }

  return new Response(JSON.stringify({ sent, skipped }), {
    headers: { "Content-Type": "application/json" },
  });
});
