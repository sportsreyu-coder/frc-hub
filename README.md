# FRC Hub

A community-maintained toolkit for FIRST Robotics Competition teams: a grant
finder, scholarship and fundraising directories, a season tracker, a budget
and sponsor tracker, team assignments, and a district forum.

Not affiliated with FIRST®.

## How it's built

A static site — plain HTML, CSS and JavaScript, no build step — backed by
[Supabase](https://supabase.com) for sign-in, the database and file storage.

| Path | What it is |
| --- | --- |
| `*.html` | One file per page |
| `css/styles.css` | All styles, light and dark |
| `js/` | One script per page or feature |
| `data/*.json` | Grant, scholarship, fundraising and resource listings |
| `supabase/schema.sql` | The whole database: tables, row-level security, RPCs |
| `supabase/functions/` | Edge functions for invite emails, reminder emails and the calendar feed |

## Run it locally

```bash
npx serve -l 8752 .
```

Then open <http://localhost:8752>. The pages talk to the Supabase project
named in `js/supabase-config.js`.

## Backend setup

1. Run `supabase/schema.sql` in the Supabase SQL editor. It is safe to re-run
   in full, and needs re-running whenever it changes.
2. Enable the Email and Google providers under Authentication → Providers,
   and add each deployed origin's `account.html` URL under Authentication →
   URL Configuration.
3. Deploy the edge functions and set their secrets — see
   [`supabase/functions/README.md`](supabase/functions/README.md).
4. To moderate the forum and review grant criteria suggestions, add your
   sign-in email as a row in the `site_admins` table.

## Updating listings

Edit the files in `data/`. For grants, set `lastVerified` (`YYYY-MM-DD`) when
you confirm an entry against the grantor's site; dates are written as
`Month Day, Year`.
