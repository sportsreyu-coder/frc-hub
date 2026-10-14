(function () {
  "use strict";

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    document.getElementById("config-warning").hidden = false;
    return;
  }

  var sb = window.__frcHubSupabase || window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  document.getElementById("app").hidden = false;

  var currentUser = null;
  var authError = document.getElementById("auth-error");

  function showError(el, msg) {
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  }

  document.getElementById("google-signin-btn").addEventListener("click", async function () {
    showError(authError, "");
    var { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) showError(authError, error.message);
  });

  // ---- Sign in/up with email: tabs (sign in vs sign up) and, within
  // sign up, a choice between email-only (magic link) and email+password.
  var authInfo = document.getElementById("auth-info");
  function showInfo(msg) { showError(authInfo, msg); }

  var authTabSignin = document.getElementById("auth-tab-signin");
  var authTabSignup = document.getElementById("auth-tab-signup");
  var signinEmailPanel = document.getElementById("signin-email-panel");
  var signupEmailPanel = document.getElementById("signup-email-panel");
  var authHeading = document.getElementById("auth-heading");
  var authSubhead = document.getElementById("auth-subhead");

  function setAuthMode(mode) {
    showError(authError, "");
    showInfo("");
    var isSignup = mode === "signup";
    authTabSignin.classList.toggle("active", !isSignup);
    authTabSignin.setAttribute("aria-pressed", String(!isSignup));
    authTabSignup.classList.toggle("active", isSignup);
    authTabSignup.setAttribute("aria-pressed", String(isSignup));
    signinEmailPanel.hidden = isSignup;
    signupEmailPanel.hidden = !isSignup;
    authHeading.textContent = isSignup ? "Create your account" : "Sign in";
    authSubhead.textContent = isSignup
      ? "Sign up with Google, or with just your email."
      : "One click, no account or password to manage.";
  }
  authTabSignin.addEventListener("click", function () { setAuthMode("signin"); });
  authTabSignup.addEventListener("click", function () { setAuthMode("signup"); });

  var signupMethodEmail = document.getElementById("signup-method-email");
  var signupMethodPassword = document.getElementById("signup-method-password");
  var signupPasswordField = document.getElementById("signup-password-field");
  var signupPasswordInput = document.getElementById("signup-password");
  var signupSubmitBtn = document.getElementById("signup-submit-btn");

  function setSignupMethod(method) {
    var usePassword = method === "password";
    signupMethodEmail.classList.toggle("active", !usePassword);
    signupMethodEmail.setAttribute("aria-pressed", String(!usePassword));
    signupMethodPassword.classList.toggle("active", usePassword);
    signupMethodPassword.setAttribute("aria-pressed", String(usePassword));
    signupPasswordField.hidden = !usePassword;
    signupPasswordInput.required = usePassword;
    signupSubmitBtn.textContent = usePassword ? "Create account" : "Email me a sign-up link";
  }
  signupMethodEmail.addEventListener("click", function () { setSignupMethod("email"); });
  signupMethodPassword.addEventListener("click", function () { setSignupMethod("password"); });

  document.getElementById("signup-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    showError(authError, "");
    showInfo("");
    var email = document.getElementById("signup-email").value.trim();
    var redirectTo = window.location.origin + window.location.pathname;
    if (signupMethodPassword.classList.contains("active")) {
      var password = signupPasswordInput.value;
      var signUpRes = await sb.auth.signUp({ email: email, password: password, options: { emailRedirectTo: redirectTo } });
      if (signUpRes.error) return showError(authError, signUpRes.error.message);
      if (!(signUpRes.data && signUpRes.data.session)) {
        showInfo("Check " + email + " for a confirmation link to finish creating your account.");
      }
    } else {
      var otpRes = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
      if (otpRes.error) return showError(authError, otpRes.error.message);
      showInfo("Check " + email + " for a sign-up link.");
    }
  });

  document.getElementById("signin-password-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    showError(authError, "");
    showInfo("");
    var email = document.getElementById("signin-email").value.trim();
    var password = document.getElementById("signin-password").value;
    var { error } = await sb.auth.signInWithPassword({ email: email, password: password });
    if (error) showError(authError, error.message);
  });

  document.getElementById("signin-magic-link-btn").addEventListener("click", async function () {
    showError(authError, "");
    showInfo("");
    var email = document.getElementById("signin-email").value.trim();
    if (!email) return showError(authError, "Enter your email above first.");
    var redirectTo = window.location.origin + window.location.pathname;
    var { error } = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
    if (error) return showError(authError, error.message);
    showInfo("Check " + email + " for a sign-in link.");
  });

  document.getElementById("signout-btn").addEventListener("click", async function () {
    await sb.auth.signOut();
  });

  // G5: self-serve data export/deletion -- see delete_my_data() in
  // supabase/schema.sql for exactly what deletion covers (profile,
  // forum posts/replies, solo season_data) and what it deliberately
  // doesn't (team data, the auth account itself).
  document.getElementById("export-data-btn").addEventListener("click", async function () {
    if (!currentUser) return;
    var exportInfo = document.getElementById("export-info");
    showError(exportInfo, "Gathering your data…");
    var data = {
      account: { id: currentUser.id, email: currentUser.email, created_at: currentUser.created_at },
      profile: null,
      season_data: null,
      team: null,
    };
    try {
      var profileRes = await sb.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
      data.profile = profileRes.data || null;
      var seasonRes = await sb.from("season_data").select("data, updated_at").eq("user_id", currentUser.id).maybeSingle();
      data.season_data = seasonRes.data || null;
      if (window.FRCTeam && window.FRCTeam.state.team) {
        data.team = {
          team_number: window.FRCTeam.state.team.team_number,
          team_name: window.FRCTeam.state.team.team_name,
          role: window.FRCTeam.state.membership && window.FRCTeam.state.membership.role,
        };
      }
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "frc-hub-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showError(exportInfo, "Downloaded.");
    } catch (err) {
      showError(exportInfo, "Couldn't gather your data: " + err.message);
    }
  });

  document.getElementById("delete-account-btn").addEventListener("click", async function () {
    if (!currentUser) return;
    var errEl = document.getElementById("delete-account-error");
    if (window.FRCTeam && window.FRCTeam.state.team) {
      showError(errEl, "Leave your team first (see the Team tab), then come back to delete your account data.");
      return;
    }
    if (!confirm("Delete your FRC Hub profile, forum posts, and season progress? This can't be undone.")) return;
    var res = await sb.rpc("delete_my_data");
    if (res.error) { showError(errEl, res.error.message); return; }
    await sb.auth.signOut();
    location.href = "index.html";
  });

  var selectedAvatarColor = "";
  var swatchRow = document.getElementById("color-swatch-row");

  function renderSwatches() {
    swatchRow.innerHTML = "";
    var options = [{ value: "", hex: null }].concat(window.FRC_AVATAR_COLORS || []);
    options.forEach(function (opt) {
      var sw = document.createElement("button");
      sw.type = "button";
      sw.className = "color-swatch" + (opt.hex ? "" : " is-empty") + (opt.value === selectedAvatarColor ? " selected" : "");
      if (opt.hex) sw.style.background = opt.hex;
      sw.setAttribute("aria-label", opt.value || "Default");
      sw.addEventListener("click", function () {
        selectedAvatarColor = opt.value;
        renderSwatches();
      });
      swatchRow.appendChild(sw);
    });
  }
  renderSwatches();

  // `profiles.team_number` is NOT NULL, but team fields no longer have
  // their own edit form (team membership drives them via
  // autoSyncProfileFromTeam below) -- fall back to the current team's
  // values so this upsert never violates that constraint for a member
  // whose profiles row doesn't exist yet.
  function buildCustomizePayload() {
    var payload = {
      id: currentUser.id,
      display_name: document.getElementById("customize-display-name").value.trim() || null,
      avatar_color: selectedAvatarColor || null,
      signature: document.getElementById("customize-signature").value.trim() || null,
      reminder_emails_opt_out: !document.getElementById("customize-reminders-checkbox").checked,
      updated_at: new Date().toISOString(),
    };
    if (window.FRCTeam && window.FRCTeam.state.team) {
      payload.team_number = window.FRCTeam.state.team.team_number;
      payload.team_name = window.FRCTeam.state.team.team_name || null;
      payload.district = window.FRCTeam.state.team.district || null;
    }
    return payload;
  }

  document.getElementById("customize-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var customizeInfo = document.getElementById("customize-info");
    showError(customizeInfo, "");
    var { error } = await sb.from("profiles").upsert(buildCustomizePayload());
    if (error) return showError(customizeInfo, error.message);
    customizeInfo.textContent = "Saved.";
    customizeInfo.style.display = "block";
    updateSettingsIdentity();
  });

  // The reminders checkbox lives in its own Notifications tab, away from
  // the rest of the profile form's Save button -- a toggle reads as
  // immediate, so it saves itself on change rather than waiting for an
  // unrelated button elsewhere to be clicked.
  document.getElementById("customize-reminders-checkbox").addEventListener("change", async function () {
    if (!currentUser) return;
    await sb.from("profiles").upsert(buildCustomizePayload());
  });

  function updateSettingsIdentity() {
    var nameEl = document.getElementById("settings-name");
    var avatarEl = document.getElementById("settings-avatar");
    if (!currentUser) return;
    var displayName = document.getElementById("customize-display-name").value.trim();
    var meta = currentUser.user_metadata || {};
    var name = displayName || meta.full_name || meta.name || (currentUser.email || "").split("@")[0] || "Your account";
    nameEl.textContent = name;
    avatarEl.textContent = name.charAt(0).toUpperCase();
    var hex = selectedAvatarColor && window.FRC_AVATAR_COLOR_HEX && window.FRC_AVATAR_COLOR_HEX[selectedAvatarColor];
    avatarEl.style.background = hex || "";
  }

  async function loadProfile() {
    var { data: profile } = await sb.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (profile) {
      document.getElementById("customize-display-name").value = profile.display_name || "";
      document.getElementById("customize-signature").value = profile.signature || "";
      document.getElementById("customize-reminders-checkbox").checked = !profile.reminder_emails_opt_out;
      selectedAvatarColor = profile.avatar_color || "";
      renderSwatches();
    }
    updateSettingsIdentity();
  }

  // ---- Settings sidebar: switch between Profile / Team / Notifications /
  // Privacy & data panels ----
  var settingsNav = document.getElementById("settings-nav");
  if (settingsNav) {
    settingsNav.addEventListener("click", function (e) {
      var btn = e.target.closest(".settings-nav-btn");
      if (!btn) return;
      var panelName = btn.getAttribute("data-panel");
      settingsNav.querySelectorAll(".settings-nav-btn").forEach(function (b) {
        var active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      document.querySelectorAll(".settings-panel").forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-panel") !== panelName;
      });
    });
  }

  // ---- Onboarding: mentor/student prompt, then create/join ----
  //
  // Forces a role choice the first time someone signs in with no team yet
  // (the onboarding modal's role pane has no close button -- see
  // openOnboardingRolePane below), then prompts them straight into the
  // create/join modal. The actual role is only binding once they create
  // or join a team (team_members.role); this choice just decides what
  // "Create a team" submits as the creator's own role and saves them
  // hunting for a role dropdown buried in that form. Stored per-browser/
  // per-user since it's purely a UI convenience, not something any RPC
  // reads.
  var chosenRole = null;

  function roleStorageKey() { return "frcgrants_role_" + (currentUser ? currentUser.id : "anon"); }
  function loadChosenRole() {
    try { chosenRole = localStorage.getItem(roleStorageKey()); } catch (e) { chosenRole = null; }
  }
  function setChosenRole(role) {
    chosenRole = role;
    try { localStorage.setItem(roleStorageKey(), role); } catch (e) { /* ignore */ }
    document.getElementById("create-team-role-label").textContent = role === "student" ? "Student" : "Mentor";
    document.getElementById("no-team-cards").hidden = false;
    // Students can only join an existing team with a code -- creating a
    // team is mentor-only (enforced server-side in create_team() too).
    openTeamModal(role === "student" ? "join" : "create");
  }

  document.getElementById("role-choice-mentor").addEventListener("click", function () { setChosenRole("mentor"); });
  document.getElementById("role-choice-student").addEventListener("click", function () { setChosenRole("student"); });
  document.getElementById("create-team-role-change").addEventListener("click", function () {
    chosenRole = null;
    try { localStorage.removeItem(roleStorageKey()); } catch (e) { /* ignore */ }
    renderOnboarding();
  });

  function renderOnboarding() {
    loadChosenRole();
    if (!chosenRole) {
      openOnboardingRolePane();
      document.getElementById("no-team-cards").hidden = true;
      return;
    }
    document.getElementById("create-team-role-label").textContent = chosenRole === "student" ? "Student" : "Mentor";
    document.getElementById("no-team-cards").hidden = false;
  }

  function showAuthed() {
    document.getElementById("auth-section").hidden = true;
    document.getElementById("dashboard-section").hidden = false;
    document.getElementById("app").classList.add("is-dashboard");
    document.getElementById("signed-in-email").textContent = currentUser.email || "";
    loadProfile();
  }

  function showSignedOut() {
    document.getElementById("auth-section").hidden = false;
    document.getElementById("dashboard-section").hidden = true;
    document.getElementById("app").classList.remove("is-dashboard");
    setAuthMode("signin");
  }

  sb.auth.onAuthStateChange(function (_event, session) {
    currentUser = session ? session.user : null;
    if (currentUser) showAuthed();
    else showSignedOut();
  });

  sb.auth.getSession().then(function (res) {
    currentUser = res.data.session ? res.data.session.user : null;
    if (currentUser) showAuthed();
    else showSignedOut();
  });

  // ---- Teams: onboarding (create/join) + the team panel ----
  //
  // window.FRCTeam (js/team.js) owns the actual membership state and the
  // Supabase RPC calls; this section is purely the account.html UI layer
  // on top of it, re-rendered every time FRCTeam reports a change.
  var Team = window.FRCTeam;

  var CAPTAIN_LABELS = {
    team_captain: "Team Captain",
    technical_captain: "Technical Captain",
    nontechnical_captain: "Non-Technical Captain",
    design_captain: "Design Captain",
    mechanical_captain: "Mechanical Captain",
    electrical_captain: "Electrical Captain",
    programming_captain: "Programming Captain",
    business_captain: "Business/Outreach Captain",
  };
  var SUBTEAM_LABELS = { design: "Design", mechanical: "Mechanical", electrical: "Electrical", programming: "Programming", business: "Business/Outreach", "cross-team": "Cross-team" };

  // ---- Onboarding modal: forced role pane, then classroom-style
  // create/join tabs (the latter dismissible -- see module comment above
  // renderOnboarding) ----
  var teamModalOverlay = document.getElementById("team-modal-overlay");
  var teamModalClose = document.getElementById("team-modal-close");
  var onboardingRolePane = document.getElementById("onboarding-role-pane");
  var teamModalTabsPane = document.getElementById("team-modal-tabs-pane");
  var teamModalTabCreate = document.getElementById("team-modal-tab-create");
  var teamModalTabJoin = document.getElementById("team-modal-tab-join");
  var teamModalCreatePane = document.getElementById("team-modal-create-pane");
  var teamModalJoinPane = document.getElementById("team-modal-join-pane");

  function setTeamModalTab(tab) {
    var studentOnly = chosenRole === "student";
    var isCreate = !studentOnly && tab !== "join";
    teamModalTabCreate.hidden = studentOnly;
    teamModalTabCreate.classList.toggle("active", isCreate);
    teamModalTabJoin.classList.toggle("active", !isCreate);
    teamModalCreatePane.hidden = !isCreate;
    teamModalJoinPane.hidden = isCreate;
  }
  // Unskippable: no close button, and the backdrop-click handler below
  // leaves it alone while this pane is showing.
  function openOnboardingRolePane() {
    teamModalOverlay.hidden = false;
    onboardingRolePane.hidden = false;
    teamModalTabsPane.hidden = true;
    teamModalClose.hidden = true;
  }
  function openTeamModal(tab) {
    teamModalOverlay.hidden = false;
    onboardingRolePane.hidden = true;
    teamModalTabsPane.hidden = false;
    teamModalClose.hidden = false;
    setTeamModalTab(tab);
  }
  function closeTeamModal() { teamModalOverlay.hidden = true; }

  document.getElementById("open-team-modal-btn").addEventListener("click", function () {
    openTeamModal(chosenRole === "student" ? "join" : "create");
  });
  teamModalClose.addEventListener("click", closeTeamModal);
  teamModalTabCreate.addEventListener("click", function () { if (chosenRole !== "student") setTeamModalTab("create"); });
  teamModalTabJoin.addEventListener("click", function () { setTeamModalTab("join"); });
  teamModalOverlay.addEventListener("click", function (e) {
    if (e.target !== teamModalOverlay) return;
    if (!onboardingRolePane.hidden) return; // forced step, no dismiss
    closeTeamModal();
  });

  if (Team) {
    var createTeamForm = document.getElementById("create-team-form");
    var joinTeamForm = document.getElementById("join-team-form");
    var createTeamDistrict = document.getElementById("create-team-district");
    (window.FRC_DISTRICTS || []).forEach(function (d) {
      var opt = document.createElement("option");
      opt.value = d.value;
      opt.textContent = d.label;
      createTeamDistrict.appendChild(opt);
    });

    var joinParam = "";
    try { joinParam = new URLSearchParams(window.location.search).get("join") || ""; } catch (e) { /* ignore */ }
    if (joinParam) document.getElementById("join-team-code").value = joinParam.toUpperCase();

    // Best-effort: keep this user's own `profiles` row (forum identity) in
    // sync with their team, without ever touching another member's row
    // (RLS only allows updating your own anyway). Only fills display_name
    // if they haven't already set one, so it never clobbers a personal
    // customization.
    function autoSyncProfileFromTeam() {
      var team = Team.state.team;
      var user = Team.state.user;
      if (!team || !user) return;
      sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle().then(function (res) {
        var existingName = res && res.data && res.data.display_name;
        var meta = user.user_metadata || {};
        var payload = {
          id: user.id,
          team_number: team.team_number,
          team_name: team.team_name || null,
          district: team.district || null,
          updated_at: new Date().toISOString(),
        };
        if (!existingName) payload.display_name = meta.full_name || meta.name || (user.email || "").split("@")[0];
        sb.from("profiles").upsert(payload);
      });
    }

    function showTeamInfo(msg) { showError(document.getElementById("team-action-info"), msg); }
    function showTeamError(msg) { showError(document.getElementById("team-action-error"), msg); }
    function showCreateTeamError(msg) { showError(document.getElementById("create-team-error"), msg); }
    function showJoinTeamError(msg) { showError(document.getElementById("join-team-error"), msg); }

    createTeamForm.addEventListener("submit", function (e) {
      e.preventDefault();
      showCreateTeamError("");
      var number = document.getElementById("create-team-number").value.trim();
      var name = document.getElementById("create-team-name").value.trim();
      var district = createTeamDistrict.value;
      // Only mentors can create a team (students join an existing one with
      // a code) -- enforced again server-side in create_team().
      Team.createTeam(number, name, district, "mentor").then(function () {
        createTeamForm.reset();
        closeTeamModal();
        renderTeamSection();
      }).catch(function (err) { showCreateTeamError(err.message); });
    });

    joinTeamForm.addEventListener("submit", function (e) {
      e.preventDefault();
      showJoinTeamError("");
      var code = document.getElementById("join-team-code").value.trim();
      Team.joinTeam(code).then(function () {
        joinTeamForm.reset();
        closeTeamModal();
        renderTeamSection();
      }).catch(function (err) { showJoinTeamError(err.message); });
    });

    document.getElementById("leave-team-btn").addEventListener("click", function () {
      if (!confirm("Leave this team? You'll need a new join code to come back.")) return;
      showTeamError("");
      Team.leaveTeam().then(function () { renderTeamSection(); }).catch(function (err) { showTeamError(err.message); });
    });

    // Self-service role switch -- same mentor/student choice as onboarding,
    // but after the fact. Warned heavily rather than blocked outright:
    // the only hard stop is the server-side "don't strand the team"
    // guard in switch_my_role() (surfaced here as a plain error) for a
    // sole mentor/admin stepping down.
    document.getElementById("switch-role-btn").addEventListener("click", function () {
      var toMentor = !Team.isMentor();
      var msg = toMentor
        ? "Switch to a mentor role? This immediately grants full team-management permissions: editing the roster, team settings, and grants. Only do this if you're actually an adult mentor for this team -- this isn't meant to be toggled back and forth."
        : "Switch to a student role? You'll immediately lose mentor permissions, including team management. Only do this if your role on the team has genuinely changed -- this isn't meant to be toggled back and forth.";
      if (!confirm(msg)) return;
      showTeamError("");
      Team.switchRole(toMentor ? "mentor" : "student")
        .then(function () { renderTeamSection(); })
        .catch(function (err) { showTeamError(err.message); });
    });

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
    }

    // null until the owner deploys supabase/functions/calendar-feed (see
    // its README) and reruns schema.sql -- calendar_feed_token won't
    // exist on the team row before that, so this just stays hidden.
    function renderCalendarFeed() {
      var section = document.getElementById("calendar-feed-section");
      var feedUrl = Team.calendarFeedUrl();
      section.hidden = !feedUrl;
      if (!feedUrl) return;
      document.getElementById("calendar-feed-url").textContent = feedUrl;
      document.getElementById("copy-feed-link-btn").onclick = function () {
        copyText(feedUrl);
        showTeamInfo("Calendar feed link copied.");
      };
    }

    function renderResetBanner() {
      var banner = document.getElementById("team-reset-banner");
      var team = Team.state.team;
      var today = new Date();
      var due = today.getFullYear() > team.current_season_year
        || (today.getFullYear() === team.current_season_year && today.getMonth() >= 5); // past ~June 1
      if (!due) { banner.hidden = true; return; }
      banner.hidden = false;
      banner.textContent = Team.isAdmin()
        ? "Looks like this season has wrapped up — start a new one to archive completed grants and progress for next year (below)."
        : "Looks like this season has wrapped up — ask a team admin to start the new season when they're ready.";
    }

    // Read-only roster view -- editing (subteam/captain roles, promote,
    // grant admin, remove) lives on team.html (js/team-manage.js), which
    // mentors reach via the "Manage team" link rendered below.
    function renderRoster() {
      var host = document.getElementById("team-roster");
      host.innerHTML = '<p class="small">Loading roster…</p>';
      Team.loadRoster().then(function (rows) {
        host.innerHTML = "";
        var table = document.createElement("div");
        table.className = "roster-table";

        rows
          .slice()
          .sort(function (a, b) { return (a.role === b.role) ? 0 : (a.role === "mentor" ? -1 : 1); })
          .forEach(function (r) {
            var isSelf = Team.state.user && r.user_id === Team.state.user.id;
            var name = (r.profile && r.profile.display_name) || "Member";
            var card = document.createElement("div");
            card.className = "roster-row-card";
            card.innerHTML =
              '<div class="roster-row-top"><div>' +
              '<span class="roster-row-name">' + name + (isSelf ? " (you)" : "") + "</span> " +
              '<span class="role-badge' + (r.role === "mentor" ? " role-mentor" : "") + '">' + (r.role === "mentor" ? "Mentor" : "Student") + "</span>" +
              (r.role === "mentor" && r.is_admin ? ' <span class="captain-badge">Admin</span>' : "") +
              (r.subteam && r.subteam !== "cross-team" ? ' <span class="role-badge">' + (SUBTEAM_LABELS[r.subteam] || r.subteam) + "</span>" : "") +
              (r.captain_roles || []).map(function (c) { return ' <span class="captain-badge">' + (CAPTAIN_LABELS[c] || c) + "</span>"; }).join("") +
              "</div></div>";
            table.appendChild(card);
          });

        host.appendChild(table);
      });
    }

    function renderTeamSection() {
      var team = Team.state.team;
      document.getElementById("has-team-card").hidden = !team;
      if (!team) {
        renderOnboarding();
        return;
      }
      closeTeamModal();
      document.getElementById("no-team-cards").hidden = true;

      autoSyncProfileFromTeam();

      var header = document.getElementById("team-header");
      header.innerHTML =
        '<div class="team-header-row"><span class="team-header-name">' +
        (team.team_name ? team.team_name + " — Team " + team.team_number : "Team " + team.team_number) +
        '</span><span class="role-badge' + (Team.isMentor() ? " role-mentor" : "") + '">' + (Team.isMentor() ? "Mentor" : "Student") +
        (Team.isAdmin() ? " · Admin" : "") + "</span></div>" +
        (team.district ? '<div class="team-header-sub">' + team.district + "</div>" : "");

      document.getElementById("manage-team-link").hidden = !Team.isMentor();
      document.getElementById("switch-role-btn").textContent = Team.isMentor() ? "Switch to student role" : "Switch to mentor role";

      renderResetBanner();
      renderCalendarFeed();
      renderRoster();
    }

    Team.onChange(renderTeamSection);
    Team.ready.then(function () {
      renderTeamSection();
      if (joinParam && !Team.state.team) openTeamModal("join");
    });
  }
})();
