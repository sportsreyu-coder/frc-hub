// Fill these in from your Supabase project's Settings -> API page.
// SUPABASE_ANON_KEY is safe to expose in frontend code (it's the public/
// publishable key). Never put the secret/service_role key here or
// anywhere in this repo.
//
// Sign-in supports Google OAuth plus email (magic link or email+password --
// js/account.js calls signInWithOAuth / signInWithOtp / signUp /
// signInWithPassword). Before it all works you also need to, in the
// Supabase dashboard:
//   1. Run supabase/schema.sql in the SQL editor -- creates season_data
//      (per-user Season Tracker sync), teams/team_members/team_data/
//      season_history (mentor/student team accounts, see js/team.js), and
//      profiles/forum_posts/forum_replies (the Forum).
//   2. Authentication -> Providers -> Email is on by default (covers both
//      magic-link and password sign-up/in); also enable Google there,
//      using a Client ID / Secret from a Google Cloud OAuth consent
//      screen + credential you create yourself (console.cloud.google.com
//      -> APIs & Services -> Credentials -> OAuth client ID -> Web
//      application).
//   3. Authentication -> URL Configuration -> add every deployed origin's
//      account.html URL (GitHub Pages, Vercel, etc.) to the allowed
//      Redirect URLs.
window.SUPABASE_URL = "https://vtkmcrfaydgmxjlpvbrn.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_gkiAphPGfNPHFRgXCK3EhQ_EsvxQbgU";
