// Site-wide sign-in / sign-up / onboarding pop-up. Injected on every page so
// visitors can browse and preview the site first and only see this when they
// choose to sign in (header button, any [data-auth-open] link) -- or right
// after they authenticate, to finish setup.
//
// Steps: auth (sign in / create account) -> role (mentor/student) -> team
// (join or create, skippable) -> profile (name, color, reminders, season
// stage) -> done. Everything after "auth" is unskippable except the team
// step, so a new account always lands with the essentials set.
//
// Completion is stored in Supabase auth user_metadata (`onboarded`) so it
// follows the user across devices without a schema change. The chosen
// role / profile prefs live there too; they're copied into the `profiles`
// row once a team exists (profiles.team_number is NOT NULL).
//
// Public API: window.FRCAuth.open({ mode: "signin" | "signup" }).
(function () {
  "use strict";

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) return;
  var sb = window.__frcHubSupabase || (window.__frcHubSupabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY));

  var SEASON_KEY = "frcgrants_season_onboard_answer_v1"; // shared with js/season.js
  var STEPS = ["role", "team", "profile"];
  var GOOGLE_SVG =
    '<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">' +
    '<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>' +
    '<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.87-3.04.87-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>' +
    '<path fill="#FBBC05" d="M3.97 10.73A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.19.29-1.73V4.94H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.06l3.01-2.33z"/>' +
    '<path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>';

  var user = null;
  var overlay = null;
  var step = "auth";
  var mode = "signin";
  var role = null;
  var teamTab = null; // remembered once the user picks a tab; mentors start on "create"
  var avatarColor = "";
  var joinCode = "";
  var teamChanged = false;
  var busy = false;

  // An invite link (?join=CODE) has to survive the email-confirmation
  // round trip, which usually opens in a new tab and redirects to the bare
  // page URL -- so keep it in localStorage (sessionStorage is per-tab) for
  // a week, cleared once the user joins.
  var JOIN_KEY = "frc_join_code";
  var JOIN_TTL = 7 * 24 * 60 * 60 * 1000;
  try { joinCode = (new URLSearchParams(window.location.search).get("join") || "").toUpperCase().slice(0, 6); } catch (e) { /* ignore */ }
  if (joinCode) { try { localStorage.setItem(JOIN_KEY, joinCode + "|" + Date.now()); } catch (e) { /* ignore */ } }
  else {
    try {
      var savedJoin = (localStorage.getItem(JOIN_KEY) || "").split("|");
      if (savedJoin[0] && Date.now() - Number(savedJoin[1]) < JOIN_TTL) joinCode = savedJoin[0];
      else localStorage.removeItem(JOIN_KEY);
    } catch (e) { /* ignore */ }
  }
  function clearJoinCode() {
    joinCode = "";
    try { localStorage.removeItem(JOIN_KEY); } catch (e) { /* ignore */ }
    try {
      var u = new URL(window.location.href);
      if (u.searchParams.has("join")) { u.searchParams.delete("join"); history.replaceState(null, "", u.pathname + u.search + u.hash); }
    } catch (e) { /* ignore */ }
  }

  function $(sel) { return overlay.querySelector(sel); }
  function meta() { return (user && user.user_metadata) || {}; }
  function roleKey() { return "frcgrants_role_" + (user ? user.id : "anon"); }

  function setMsg(sel, msg) {
    var n = $(sel);
    if (!n) return;
    n.textContent = msg || "";
    n.style.display = msg ? "block" : "none";
  }
  function setBusy(btn, on, label) {
    busy = on;
    if (!btn) return;
    btn.disabled = on;
    if (label) btn.textContent = label;
  }

  // ---------- Markup ----------

  var SIDE = {
    signin: { h: "New here?", p: "Create a free account to sync your season, save grants, and join your team.", btn: "Create account", to: "signup" },
    signup: { h: "Welcome back!", p: "Already have an account? Sign in to pick up where you left off.", btn: "Sign in", to: "signin" },
    role: { h: "Let's get you set up", p: "A few quick questions so FRC Hub fits the way your team works.", btn: "" },
    team: { h: "Your team", p: "Teams share the season tracker, budget, and assignments. You can always do this later.", btn: "" },
    profile: { h: "Almost there", p: "Pick how you show up around the hub. All of this is editable in Settings.", btn: "" },
    done: { h: "You're in", p: "Welcome to FRC Hub.", btn: "" },
  };

  function build() {
    overlay = document.createElement("div");
    overlay.className = "am-overlay";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="am-card" role="dialog" aria-modal="true" aria-labelledby="am-title">' +
      '<aside class="am-side"><span class="am-shape am-shape-a"></span><span class="am-shape am-shape-b"></span><span class="am-shape am-shape-c"></span>' +
      '<div class="am-brand">FRC<span>Hub</span></div>' +
      '<div class="am-side-body"><h2 id="am-side-h"></h2><p id="am-side-p"></p><button type="button" class="am-ghost" id="am-side-btn"></button></div></aside>' +
      '<section class="am-main"><button type="button" class="am-close" id="am-close" aria-label="Close">&times;</button>' +
      '<div class="am-dots" id="am-dots" hidden></div>' +

      // -- auth
      '<div class="am-pane" data-pane="auth">' +
      '<h2 class="am-title" id="am-title">Sign in</h2>' +
      '<button type="button" class="google-signin-btn" id="am-google">' + GOOGLE_SVG + '<span>Continue with Google</span></button>' +
      '<div class="am-or">or use your email</div>' +
      '<div class="error-msg" id="am-error"></div><div class="info-msg" id="am-info"></div>' +
      '<form id="am-auth-form" novalidate>' +
      '<div class="field" id="am-name-field" hidden><label for="am-name">Name</label><input type="text" id="am-name" autocomplete="name" placeholder="Your first name"></div>' +
      '<div class="field"><label for="am-email">Email</label><input type="email" id="am-email" autocomplete="email" placeholder="you@school.org" required></div>' +
      '<div class="field" id="am-pass-field"><label for="am-pass">Password</label><input type="password" id="am-pass" autocomplete="current-password" minlength="6" placeholder="At least 6 characters"></div>' +
      '<button type="submit" class="submit-btn" id="am-auth-submit">Sign in</button></form>' +
      '<button type="button" class="auth-link-btn" id="am-magic">Email me a sign-in link instead</button>' +
      '<p class="am-legal">By continuing you agree to the <a href="terms.html">Terms</a> and <a href="privacy.html">Privacy policy</a>.</p>' +
      '</div>' +

      // -- role
      '<div class="am-pane" data-pane="role" hidden>' +
      '<h2 class="am-title">Are you a mentor or a student?</h2><p class="am-sub">This decides what you can do once you create or join a team.</p>' +
      '<div class="role-choice-row am-role-row">' +
      '<button type="button" class="role-choice-btn" data-role="mentor"><strong>Mentor</strong><span>Adults coaching the team. The first mentor on a team is its admin.</span></button>' +
      '<button type="button" class="role-choice-btn" data-role="student"><strong>Student</strong><span>Team members building the robot. You join with a code from a mentor or captain.</span></button>' +
      '</div></div>' +

      // -- team
      '<div class="am-pane" data-pane="team" hidden>' +
      '<h2 class="am-title">What team are you on?</h2><p class="am-sub" id="am-team-sub"></p>' +
      '<div class="modal-tabs" id="am-team-tabs"><button type="button" class="modal-tab" data-tab="join">Join a team</button><button type="button" class="modal-tab" data-tab="create" id="am-tab-create">Create a team</button></div>' +
      '<div class="error-msg" id="am-team-error"></div>' +
      '<form id="am-join-form"><div class="field"><label for="am-join-code">Join code</label><input type="text" id="am-join-code" maxlength="6" placeholder="e.g. 7K2PQ1" style="text-transform:uppercase;" required></div><button type="submit" class="submit-btn">Join team</button></form>' +
      '<form id="am-create-form" hidden>' +
      '<div class="field"><label for="am-team-number">Team number</label><input type="text" id="am-team-number" placeholder="e.g. 4152" required></div>' +
      '<div class="field"><label for="am-team-name">Team name (optional)</label><input type="text" id="am-team-name" placeholder="e.g. RoboCats"></div>' +
      '<div class="field"><label for="am-team-district">District</label><select id="am-team-district" required><option value="" disabled selected>Select your district…</option></select></div>' +
      '<button type="submit" class="submit-btn">Create team</button></form>' +
      '<button type="button" class="am-skip" id="am-skip-team">Skip this step</button></div>' +

      // -- profile
      '<div class="am-pane" data-pane="profile" hidden>' +
      '<h2 class="am-title">Make it yours</h2><p class="am-sub">The essentials before you dive in.</p>' +
      '<div class="error-msg" id="am-profile-error"></div>' +
      '<form id="am-profile-form">' +
      '<div class="field"><label for="am-display-name">Display name</label><input type="text" id="am-display-name" maxlength="40" placeholder="Shown on your profile and forum posts" required></div>' +
      '<div class="field"><label>Avatar color</label><div class="color-swatch-row" id="am-swatches"></div></div>' +
      '<div class="field"><label>Where is your season at?</label><div class="am-chip-row" id="am-season"><button type="button" class="view-tab" data-season="starting" aria-pressed="false">Just starting</button><button type="button" class="view-tab active" data-season="underway" aria-pressed="true">Already underway</button></div></div>' +
      '<div class="settings-toggle-row am-toggle"><div><div class="settings-toggle-label">Deadline reminder emails</div><div class="settings-toggle-desc">Sent 14, 7, and 1 day before a task or grant you\'re on is due.</div></div>' +
      '<label class="switch"><input type="checkbox" id="am-reminders" checked><span class="switch-track"><span class="switch-thumb"></span></span></label></div>' +
      '<button type="submit" class="submit-btn" id="am-profile-submit">Finish setup</button></form></div>' +

      // -- done
      '<div class="am-pane am-done" data-pane="done" hidden>' +
      '<div class="am-check">&#10003;</div><h2 class="am-title">You\'re all set</h2><p class="am-sub" id="am-done-sub"></p>' +
      '<button type="button" class="submit-btn" id="am-done-btn">Start exploring</button></div>' +
      '</section></div>';
    document.body.appendChild(overlay);

    // district list
    var sel = $("#am-team-district");
    (window.FRC_DISTRICTS || [{ value: "none", label: "Not in a district" }]).forEach(function (d) {
      var o = document.createElement("option");
      o.value = d.value;
      o.textContent = d.label;
      sel.appendChild(o);
    });

    renderSwatches();
    wire();
  }

  function renderSwatches() {
    var row = $("#am-swatches");
    row.innerHTML = "";
    [{ value: "", hex: null }].concat(window.FRC_AVATAR_COLORS || []).forEach(function (opt) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "color-swatch" + (opt.hex ? "" : " is-empty") + (opt.value === avatarColor ? " selected" : "");
      if (opt.hex) b.style.background = opt.hex;
      b.setAttribute("aria-label", opt.value || "Default");
      b.addEventListener("click", function () { avatarColor = opt.value; renderSwatches(); });
      row.appendChild(b);
    });
  }

  // ---------- Step / mode rendering ----------

  function show(newStep) {
    step = newStep;
    var panes = overlay.querySelectorAll(".am-pane");
    for (var i = 0; i < panes.length; i++) panes[i].hidden = panes[i].getAttribute("data-pane") !== (newStep === "auth" ? "auth" : newStep);
    var side = newStep === "auth" ? SIDE[mode] : SIDE[newStep];
    $("#am-side-h").textContent = side.h;
    $("#am-side-p").textContent = side.p;
    var sb2 = $("#am-side-btn");
    sb2.hidden = !side.btn;
    sb2.textContent = side.btn;
    // Auth step is dismissible (visitors can keep previewing); onboarding isn't.
    $("#am-close").hidden = newStep !== "auth";
    var dots = $("#am-dots");
    var idx = STEPS.indexOf(newStep);
    dots.hidden = idx === -1;
    if (idx !== -1) {
      dots.innerHTML = "";
      STEPS.forEach(function (s, n) {
        var d = document.createElement("span");
        d.className = "am-dot" + (n === idx ? " active" : n < idx ? " done" : "");
        dots.appendChild(d);
      });
      dots.setAttribute("aria-label", "Step " + (idx + 1) + " of " + STEPS.length);
    }
    if (newStep === "team") prepTeamStep();
    if (newStep === "profile") prepProfileStep();
    if (newStep === "done") {
      $("#am-done-sub").textContent = hasTeamNow
        ? "Your team is connected. Everything you need is one click away."
        : "You can " + (role === "student" ? "join a team" : "join or create a team") + " any time from Settings → Team.";
    }
    var first = overlay.querySelector('.am-pane:not([hidden]) input:not([hidden]), .am-pane:not([hidden]) button.role-choice-btn');
    if (first) setTimeout(function () { try { first.focus(); } catch (e) { /* ignore */ } }, 30);
  }

  var hasTeamNow = false;

  function setMode(m) {
    mode = m;
    var signup = m === "signup";
    $("#am-title").textContent = signup ? "Create Account" : "Sign in";
    $("#am-name-field").hidden = !signup;
    $("#am-pass").autocomplete = signup ? "new-password" : "current-password";
    $("#am-auth-submit").textContent = signup ? "Sign up" : "Sign in";
    $("#am-magic").textContent = signup ? "Email me a sign-up link instead" : "Email me a sign-in link instead";
    setMsg("#am-error", "");
    setMsg("#am-info", "");
    show("auth");
  }

  function prepTeamStep() {
    var student = role === "student";
    $("#am-tab-create").hidden = student;
    $("#am-team-sub").textContent = student
      ? "Enter the join code from your mentor or captain."
      : "Create your team, or join one with a code. Skip it if you're just exploring.";
    setTeamTab(student || joinCode ? "join" : (teamTab || "create"));
    if (joinCode) $("#am-join-code").value = joinCode;
    setMsg("#am-team-error", "");
  }
  function setTeamTab(t) {
    teamTab = t;
    var tabs = overlay.querySelectorAll("#am-team-tabs .modal-tab");
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === t);
    $("#am-join-form").hidden = t !== "join";
    $("#am-create-form").hidden = t !== "create";
  }

  function prepProfileStep() {
    var m = meta();
    var field = $("#am-display-name");
    if (!field.value) field.value = m.display_name || m.full_name || m.name || (user.email || "").split("@")[0] || "";
    if (m.avatar_color && !avatarColor) { avatarColor = m.avatar_color; renderSwatches(); }
  }

  // ---------- Behavior ----------

  function open(opts) {
    opts = opts || {};
    if (!overlay) build();
    overlay.hidden = false;
    document.body.classList.add("am-open");
    if (user) { routeOnboarding(); return; }
    setMode(opts.mode || "signin");
  }
  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove("am-open");
  }

  function redirectUrl() { return window.location.origin + window.location.pathname; }

  function wire() {
    $("#am-close").addEventListener("click", close);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay && step === "auth") close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay && !overlay.hidden && step === "auth") close(); });
    $("#am-side-btn").addEventListener("click", function () { setMode(SIDE[mode].to); });

    $("#am-google").addEventListener("click", async function () {
      setMsg("#am-error", "");
      var r = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectUrl() } });
      if (r.error) setMsg("#am-error", r.error.message);
    });

    $("#am-auth-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      if (busy) return;
      setMsg("#am-error", "");
      setMsg("#am-info", "");
      var email = $("#am-email").value.trim();
      var password = $("#am-pass").value;
      var name = $("#am-name").value.trim();
      if (!email) return setMsg("#am-error", "Enter your email.");
      if (!password) return setMsg("#am-error", "Enter a password, or use the email-link option below.");
      var btn = $("#am-auth-submit");
      var label = btn.textContent;
      setBusy(btn, true, "One moment…");
      try {
        if (mode === "signup") {
          if (password.length < 6) throw new Error("Password must be at least 6 characters.");
          var up = await sb.auth.signUp({ email: email, password: password, options: { emailRedirectTo: redirectUrl(), data: name ? { full_name: name } : {} } });
          if (up.error) throw up.error;
          // With email confirmation on, Supabase answers a sign-up for an
          // already-registered email with a user that has no identities
          // (and sends nothing) instead of an error.
          if (up.data && up.data.user && Array.isArray(up.data.user.identities) && !up.data.user.identities.length) {
            throw new Error("An account with " + email + " already exists. Sign in instead.");
          }
          if (!(up.data && up.data.session)) setMsg("#am-info", "Check " + email + " for a confirmation link to finish creating your account.");
        } else {
          var inn = await sb.auth.signInWithPassword({ email: email, password: password });
          if (inn.error) throw inn.error;
        }
      } catch (err) {
        setMsg("#am-error", err.message);
      }
      setBusy(btn, false, label);
    });

    $("#am-magic").addEventListener("click", async function () {
      setMsg("#am-error", "");
      setMsg("#am-info", "");
      var email = $("#am-email").value.trim();
      if (!email) return setMsg("#am-error", "Enter your email above first.");
      var name = $("#am-name").value.trim();
      var r = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectUrl(), shouldCreateUser: mode === "signup", data: name ? { full_name: name } : {} } });
      if (r.error) {
        var noAccount = mode === "signin" && /signups not allowed/i.test(r.error.message);
        return setMsg("#am-error", noAccount ? "No account uses " + email + " yet. Create one instead." : r.error.message);
      }
      setMsg("#am-info", "Check " + email + " for a " + (mode === "signup" ? "sign-up" : "sign-in") + " link.");
    });

    // role
    overlay.querySelectorAll("[data-role]").forEach(function (b) {
      b.addEventListener("click", function () {
        role = b.getAttribute("data-role");
        try { localStorage.setItem(roleKey(), role); } catch (e) { /* ignore */ }
        sb.auth.updateUser({ data: { role_pref: role } });
        show("team");
      });
    });

    // team
    overlay.querySelectorAll("#am-team-tabs .modal-tab").forEach(function (t) {
      t.addEventListener("click", function () { setTeamTab(t.getAttribute("data-tab")); });
    });
    $("#am-join-form").addEventListener("submit", function (e) {
      e.preventDefault();
      runTeam(e.target, sb.rpc("join_team", { p_code: $("#am-join-code").value.trim() }));
    });
    $("#am-create-form").addEventListener("submit", function (e) {
      e.preventDefault();
      runTeam(e.target, sb.rpc("create_team", {
        p_team_number: $("#am-team-number").value.trim(),
        p_team_name: $("#am-team-name").value.trim(),
        p_district: $("#am-team-district").value,
        p_role: "mentor",
      }));
    });
    $("#am-skip-team").addEventListener("click", function () { show("profile"); });

    // profile
    overlay.querySelectorAll("#am-season [data-season]").forEach(function (b) {
      b.addEventListener("click", function () {
        overlay.querySelectorAll("#am-season [data-season]").forEach(function (o) {
          var on = o === b;
          o.classList.toggle("active", on);
          o.setAttribute("aria-pressed", String(on));
        });
      });
    });
    $("#am-profile-form").addEventListener("submit", finishProfile);
    $("#am-done-btn").addEventListener("click", function () {
      close();
      if (teamChanged) window.location.reload();
    });
  }

  async function runTeam(form, promise) {
    if (busy) return;
    setMsg("#am-team-error", "");
    var btn = form.querySelector("button[type=submit]");
    var label = btn.textContent;
    setBusy(btn, true, "One moment…");
    var res = await promise;
    setBusy(btn, false, label);
    if (res.error) return setMsg("#am-team-error", res.error.message);
    teamChanged = true;
    hasTeamNow = true;
    clearJoinCode();
    show("profile");
  }

  async function finishProfile(e) {
    e.preventDefault();
    if (busy) return;
    setMsg("#am-profile-error", "");
    var name = $("#am-display-name").value.trim();
    if (!name) return setMsg("#am-profile-error", "Add a display name so teammates know who you are.");
    var btn = $("#am-profile-submit");
    var label = btn.textContent;
    setBusy(btn, true, "Saving…");
    var optOut = !$("#am-reminders").checked;
    var seasonEl = overlay.querySelector("#am-season .active");
    var season = seasonEl ? seasonEl.getAttribute("data-season") : "underway";
    try { localStorage.setItem(SEASON_KEY, season); } catch (err) { /* ignore */ }

    var upd = await sb.auth.updateUser({ data: { onboarded: true, display_name: name, avatar_color: avatarColor || null, reminders_opt_out: optOut } });
    if (upd.error) { setBusy(btn, false, label); return setMsg("#am-profile-error", upd.error.message); }
    if (upd.data && upd.data.user) user = upd.data.user;

    // profiles.team_number is NOT NULL, so the row can only exist once the
    // user is on a team; otherwise the metadata above is the source of truth
    // and gets copied over when they join one (see account.js).
    var mem = await sb.from("team_members").select("teams(team_number, team_name, district)").eq("user_id", user.id).maybeSingle();
    var team = mem && mem.data && mem.data.teams;
    hasTeamNow = !!team;
    if (team) {
      await sb.from("profiles").upsert({
        id: user.id,
        team_number: team.team_number,
        team_name: team.team_name || null,
        district: team.district || null,
        display_name: name,
        avatar_color: avatarColor || null,
        reminder_emails_opt_out: optOut,
        updated_at: new Date().toISOString(),
      });
    }
    setBusy(btn, false, label);
    show("done");
  }

  // Decide where an authenticated user should be. Existing users (already on
  // a team, or who finished before) are never interrupted.
  async function routeOnboarding() {
    if (!user) return;
    if (meta().onboarded) { close(); return; }
    var mem = await sb.from("team_members").select("role").eq("user_id", user.id).maybeSingle();
    if (mem && mem.data) {
      sb.auth.updateUser({ data: { onboarded: true } });
      close();
      return;
    }
    if (!overlay) build();
    overlay.hidden = false;
    document.body.classList.add("am-open");
    try { role = localStorage.getItem(roleKey()) || meta().role_pref || null; } catch (e) { role = meta().role_pref || null; }
    // A join code already says what role you're joining as.
    show(joinCode ? "team" : "role");
  }

  function onUser(u) {
    var was = user;
    user = u;
    if (user && (!was || was.id !== user.id)) routeOnboarding();
    if (!user && was && overlay) close();
  }
  sb.auth.onAuthStateChange(function (_e, session) { onUser(session ? session.user : null); });
  sb.auth.getSession().then(function (res) {
    onUser(res.data.session ? res.data.session.user : null);
    if (!user && joinCode) open({ mode: "signup" });
  });

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest('[data-auth-open], a.nav-cta[href="account.html"]');
    if (!t || user) return;
    e.preventDefault();
    open({ mode: t.getAttribute("data-auth-open") === "signup" ? "signup" : "signin" });
  });

  window.FRCAuth = { open: open, close: close };
})();
