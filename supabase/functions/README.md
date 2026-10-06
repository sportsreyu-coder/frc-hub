# Edge Functions

Two functions back the G4 "deadline reminders" feature. Neither is called
by the FRC Hub frontend itself -- `calendar-feed` is fetched directly by
calendar apps, and `send-reminders` is meant to run on a schedule. Deploy
both after running the updated `supabase/schema.sql` against the live
project:

```bash
supabase functions deploy calendar-feed --no-verify-jwt
supabase functions deploy send-reminders
```

`calendar-feed` needs `--no-verify-jwt` because calendar apps send a plain
GET with no Supabase auth header at all -- the `?token=` query param
(checked against `teams.calendar_feed_token`) is the only auth it has.

`send-reminders` needs two secrets, set once (Supabase dashboard -> Edge
Functions -> Secrets, or `supabase secrets set`):

- `RESEND_API_KEY` -- an API key from [resend.com](https://resend.com).
  `REMINDER_FROM_EMAIL` (optional) should then be an address on a domain
  you've verified with Resend -- the function's placeholder
  `reminders@frchub.app` will not send until you do. Swap the `sendEmail()`
  function in `send-reminders/index.ts` for a different provider if you'd
  rather not use Resend.
- `REMINDER_CRON_SECRET` -- any random string. Whatever calls this
  function must send it back as `Authorization: Bearer <value>`, so a
  stranger who finds the function's URL can't trigger a mass email run.

Then schedule `send-reminders` to run once a day -- either:

- Supabase dashboard -> Edge Functions -> `send-reminders` -> add a Cron
  Trigger (simplest, and where you'd also set the `Authorization` header), or
- `pg_cron` + `pg_net` calling the function's URL directly from Postgres,
  with the same `Authorization` header.

Without that scheduling step, `send-reminders` exists and works if invoked,
but nothing invokes it on its own -- reminders are wired up, not yet turned
on, until this is done.
