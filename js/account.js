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

  document.getElementById("signout-btn").addEventListener("click", async function () {
    await sb.auth.signOut();
  });

  var districtSelect = document.getElementById("profile-district");
  (window.FRC_DISTRICTS || []).forEach(function (d) {
    var opt = document.createElement("option");
    opt.value = d.value;
    opt.textContent = d.label;
    districtSelect.appendChild(opt);
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

  // Both forms below write to the same `profiles` row, so each submit
  // sends the full set of fields (read live from both forms' inputs)
  // rather than a partial upsert -- otherwise saving one form's fields
  // could look fine while silently depending on the other form having
  // already run once to populate the row.
  function buildProfilePayload() {
    return {
      id: currentUser.id,
      team_number: document.getElementById("profile-team-number").value.trim(),
      team_name: document.getElementById("profile-team-name").value.trim() || null,
      district: districtSelect.value || null,
      display_name: document.getElementById("customize-display-name").value.trim() || null,
      avatar_color: selectedAvatarColor || null,
      signature: document.getElementById("customize-signature").value.trim() || null,
      updated_at: new Date().toISOString(),
    };
  }

  document.getElementById("profile-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var profileInfo = document.getElementById("profile-info");
    showError(profileInfo, "");
    var { error } = await sb.from("profiles").upsert(buildProfilePayload());
    if (error) return showError(profileInfo, error.message);
    profileInfo.textContent = "Saved.";
    profileInfo.style.display = "block";
  });

  document.getElementById("customize-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var customizeInfo = document.getElementById("customize-info");
    showError(customizeInfo, "");
    var { error } = await sb.from("profiles").upsert(buildProfilePayload());
    if (error) return showError(customizeInfo, error.message);
    customizeInfo.textContent = "Saved.";
    customizeInfo.style.display = "block";
  });

  async function loadProfile() {
    var { data: profile } = await sb.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (profile) {
      document.getElementById("profile-team-number").value = profile.team_number || "";
      document.getElementById("profile-team-name").value = profile.team_name || "";
      districtSelect.value = profile.district || "";
      document.getElementById("customize-display-name").value = profile.display_name || "";
      document.getElementById("customize-signature").value = profile.signature || "";
      selectedAvatarColor = profile.avatar_color || "";
      renderSwatches();
    }
  }

  function showAuthed() {
    document.getElementById("auth-section").hidden = true;
    document.getElementById("dashboard-section").hidden = false;
    document.getElementById("signed-in-email").textContent = currentUser.email || "";
    loadProfile();
  }

  function showSignedOut() {
    document.getElementById("auth-section").hidden = false;
    document.getElementById("dashboard-section").hidden = true;
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
  var CAPTAIN_ROLE_ORDER = Object.keys(CAPTAIN_LABELS);
  var SUBTEAM_LABELS = { design: "Design", mechanical: "Mechanical", electrical: "Electrical", programming: "Programming", business: "Business/Outreach", "cross-team": "Cross-team" };

  if (!Team) {
    // js/team.js failed to load (e.g. Supabase not configured) -- degrade
    // to the pre-teams experience rather than throwing on every call below.
    document.getElementById("team-profile-card").hidden = false;
  } else {
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
      var role = document.getElementById("create-team-role").value;
      Team.createTeam(number, name, district, role).then(function (team) {
        createTeamForm.reset();
        renderTeamSection();
        // Only mentors can see join codes afterward (team-codes-section is
        // mentor-only), so a student creator needs both codes now -- it's
        // their only chance to get the mentor code to an actual mentor.
        if (role === "student" && team) {
          showTeamInfo(
            "Team created! Save these now -- as a student you won't see them again here. " +
            "Mentor join code: " + team.join_code_mentor + ". Student join code: " + team.join_code_student + "."
          );
        }
      }).catch(function (err) { showCreateTeamError(err.message); });
    });

    joinTeamForm.addEventListener("submit", function (e) {
      e.preventDefault();
      showJoinTeamError("");
      var code = document.getElementById("join-team-code").value.trim();
      Team.joinTeam(code).then(function () {
        joinTeamForm.reset();
        renderTeamSection();
      }).catch(function (err) { showJoinTeamError(err.message); });
    });

    document.getElementById("leave-team-btn").addEventListener("click", function () {
      if (!confirm("Leave this team? You'll need a new join code to come back.")) return;
      showTeamError("");
      Team.leaveTeam().then(function () { renderTeamSection(); }).catch(function (err) { showTeamError(err.message); });
    });

    document.getElementById("team-start-season-btn").addEventListener("click", function () {
      if (!confirm("Start a new season? This archives and clears your team's completed grants, checklist/calendar progress, and task assignments. Roster, mechanisms, and settings carry over.")) return;
      showTeamError("");
      Team.startNewSeason().then(function () {
        showTeamInfo("New season started.");
        renderTeamSection();
      }).catch(function (err) { showTeamError(err.message); });
    });

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
    }

    function renderCodes() {
      var section = document.getElementById("team-codes-section");
      section.hidden = !Team.isMentor();
      if (!Team.isMentor()) return;
      var team = Team.state.team;
      var host = document.getElementById("team-codes");
      host.innerHTML = "";

      function codeBox(label, code, which) {
        var box = document.createElement("div");
        box.className = "team-code-box";
        var joinUrl = window.location.origin + window.location.pathname + "?join=" + code;
        box.innerHTML =
          '<div class="eyebrow">' + label + '</div>' +
          '<div class="team-code-value">' + code + '</div>' +
          '<div class="team-code-actions">' +
          '<button type="button" data-action="copy-code">Copy code</button>' +
          '<button type="button" data-action="copy-link">Copy link</button>' +
          '<button type="button" data-action="regen">Regenerate</button>' +
          "</div>";
        box.querySelector('[data-action="copy-code"]').addEventListener("click", function () { copyText(code); showTeamInfo("Code copied."); });
        box.querySelector('[data-action="copy-link"]').addEventListener("click", function () { copyText(joinUrl); showTeamInfo("Link copied."); });
        box.querySelector('[data-action="regen"]').addEventListener("click", function () {
          if (!confirm("Regenerate this code? The old one will stop working immediately.")) return;
          Team.regenerateCode(which).then(function () { renderTeamSection(); }).catch(function (err) { showTeamError(err.message); });
        });
        return box;
      }

      var grid = document.createElement("div");
      grid.className = "team-codes-grid";
      grid.appendChild(codeBox("Student join code", team.join_code_student, "student"));
      grid.appendChild(codeBox("Mentor (co-mentor) join code", team.join_code_mentor, "mentor"));
      host.appendChild(grid);
    }

    function renderResetBanner() {
      var banner = document.getElementById("team-reset-banner");
      var team = Team.state.team;
      var today = new Date();
      var due = today.getFullYear() > team.current_season_year
        || (today.getFullYear() === team.current_season_year && today.getMonth() >= 5); // past ~June 1
      if (!due) { banner.hidden = true; return; }
      banner.hidden = false;
      banner.textContent = Team.isMentor()
        ? "Looks like this season has wrapped up — start a new one to archive completed grants and progress for next year (below)."
        : "Looks like this season has wrapped up — ask a mentor to start the new season when they're ready.";
    }

    function captainCheckboxes(selected, disabled) {
      var wrap = document.createElement("div");
      wrap.className = "captain-checks";
      CAPTAIN_ROLE_ORDER.forEach(function (role) {
        var id = "cap-" + role + "-" + Math.random().toString(36).slice(2);
        var label = document.createElement("label");
        var chk = document.createElement("input");
        chk.type = "checkbox";
        chk.id = id;
        chk.value = role;
        chk.checked = selected.indexOf(role) !== -1;
        chk.disabled = !!disabled;
        label.appendChild(chk);
        label.appendChild(document.createTextNode(CAPTAIN_LABELS[role]));
        wrap.appendChild(label);
      });
      return wrap;
    }

    function renderRoster() {
      var host = document.getElementById("team-roster");
      host.innerHTML = '<p class="small">Loading roster…</p>';
      Team.loadRoster().then(function (rows) {
        host.innerHTML = "";
        var table = document.createElement("div");
        table.className = "roster-table";
        var canEdit = Team.canEditRoster();

        rows
          .slice()
          .sort(function (a, b) { return (a.role === b.role) ? 0 : (a.role === "mentor" ? -1 : 1); })
          .forEach(function (r) {
            var isSelf = Team.state.user && r.user_id === Team.state.user.id;
            var name = (r.profile && r.profile.display_name) || "Member";
            var card = document.createElement("div");
            card.className = "roster-row-card";

            var top = document.createElement("div");
            top.className = "roster-row-top";
            var left = document.createElement("div");
            left.innerHTML =
              '<span class="roster-row-name">' + name + (isSelf ? " (you)" : "") + "</span> " +
              '<span class="role-badge' + (r.role === "mentor" ? " role-mentor" : "") + '">' + (r.role === "mentor" ? "Mentor" : "Student") + "</span>" +
              (r.subteam && r.subteam !== "cross-team" ? ' <span class="role-badge">' + (SUBTEAM_LABELS[r.subteam] || r.subteam) + "</span>" : "") +
              (r.captain_roles || []).map(function (c) { return ' <span class="captain-badge">' + (CAPTAIN_LABELS[c] || c) + "</span>"; }).join("");
            top.appendChild(left);
            card.appendChild(top);

            // A team_captain can edit student rows but never a mentor's;
            // a mentor can edit anyone. Nobody edits their own row here
            // (use "Leave team" / the mentor-promote button for that).
            var rowEditable = canEdit && !isSelf && (Team.isMentor() || r.role === "student");
            if (rowEditable) {
              var editRow = document.createElement("div");
              editRow.className = "roster-row-edit";
              var subteamSelect = document.createElement("select");
              Object.keys(SUBTEAM_LABELS).forEach(function (key) {
                var opt = document.createElement("option");
                opt.value = key;
                opt.textContent = SUBTEAM_LABELS[key];
                if (key === r.subteam) opt.selected = true;
                subteamSelect.appendChild(opt);
              });
              if (r.role !== "student") subteamSelect.disabled = true;
              editRow.appendChild(subteamSelect);
              var checks = captainCheckboxes(r.captain_roles || [], false);
              editRow.appendChild(checks);

              var saveBtn = document.createElement("button");
              saveBtn.type = "button";
              saveBtn.className = "submit-btn-sm";
              saveBtn.textContent = "Save";
              saveBtn.addEventListener("click", function () {
                var roles = Array.prototype.slice.call(checks.querySelectorAll("input:checked")).map(function (c) { return c.value; });
                Team.setMemberRoles(r.user_id, subteamSelect.value, roles).then(function () {
                  showTeamInfo("Updated " + name + ".");
                  renderRoster();
                }).catch(function (err) { showTeamError(err.message); });
              });
              card.appendChild(editRow);

              var actions = document.createElement("div");
              actions.className = "roster-row-actions";
              actions.appendChild(saveBtn);
              if (Team.isMentor() && r.role === "student") {
                var promoteBtn = document.createElement("button");
                promoteBtn.type = "button";
                promoteBtn.className = "submit-btn-sm submit-btn-ghost";
                promoteBtn.textContent = "Promote to mentor";
                promoteBtn.addEventListener("click", function () {
                  if (!confirm("Promote " + name + " to mentor? This gives them full admin permissions.")) return;
                  Team.promoteToMentor(r.user_id).then(function () { renderRoster(); }).catch(function (err) { showTeamError(err.message); });
                });
                actions.appendChild(promoteBtn);
              }
              var removeBtn = document.createElement("button");
              removeBtn.type = "button";
              removeBtn.className = "submit-btn-sm submit-btn-ghost";
              removeBtn.textContent = "Remove";
              removeBtn.addEventListener("click", function () {
                if (!confirm("Remove " + name + " from the team?")) return;
                Team.removeMember(r.user_id).then(function () { renderRoster(); }).catch(function (err) { showTeamError(err.message); });
              });
              actions.appendChild(removeBtn);
              card.appendChild(actions);
            }

            table.appendChild(card);
          });

        host.appendChild(table);
      });
    }

    function renderTeamSection() {
      var team = Team.state.team;
      document.getElementById("no-team-cards").hidden = !!team;
      document.getElementById("has-team-card").hidden = !team;
      document.getElementById("team-profile-card").hidden = !!team;
      if (!team) return;

      autoSyncProfileFromTeam();

      var header = document.getElementById("team-header");
      header.innerHTML =
        '<div class="team-header-row"><span class="team-header-name">' +
        (team.team_name ? team.team_name + " — Team " + team.team_number : "Team " + team.team_number) +
        '</span><span class="role-badge' + (Team.isMentor() ? " role-mentor" : "") + '">' + (Team.isMentor() ? "Mentor" : "Student") + "</span></div>" +
        (team.district ? '<div class="team-header-sub">' + team.district + "</div>" : "");

      renderResetBanner();
      renderCodes();
      renderRoster();
      document.getElementById("team-admin-actions").hidden = !Team.isMentor();
    }

    Team.onChange(renderTeamSection);
    Team.ready.then(renderTeamSection);
  }
})();
