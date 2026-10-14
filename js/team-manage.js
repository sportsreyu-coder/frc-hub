// Mentor-only team management page (team.html): join codes, roster editing,
// and season/team settings. Pure UI layer over window.FRCTeam (js/team.js),
// which owns the actual membership state and Supabase RPC calls -- mirrors
// the roster/codes/admin-action logic that used to live on account.html
// before it moved here so students get a simpler, read-only team card there.
(function () {
  "use strict";

  var Team = window.FRCTeam;
  if (!Team) return;

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

  function showMsg(el, msg) {
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  }
  function showInfo(msg) { showMsg(document.getElementById("team-manage-info"), msg); }
  function showErr(msg) { showMsg(document.getElementById("team-manage-error"), msg); }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
  }

  function renderHeader() {
    var team = Team.state.team;
    var header = document.getElementById("team-manage-header");
    header.innerHTML =
      '<div class="team-header-row"><span class="team-header-name">' +
      (team.team_name ? team.team_name + " — Team " + team.team_number : "Team " + team.team_number) +
      '</span><span class="role-badge role-mentor">Mentor' + (Team.isAdmin() ? " · Admin" : "") + "</span></div>" +
      (team.district ? '<div class="team-header-sub">' + team.district + "</div>" : "");
  }

  function renderCodes() {
    var section = document.getElementById("team-codes-section");
    section.hidden = !Team.isAdmin();
    if (!Team.isAdmin()) return;
    var team = Team.state.team;
    var host = document.getElementById("team-codes");
    host.innerHTML = "";

    function codeBox(label, code, which) {
      var box = document.createElement("div");
      box.className = "team-code-box";
      var joinUrl = window.location.origin + "/account.html?join=" + code;
      box.innerHTML =
        '<div class="eyebrow">' + label + '</div>' +
        '<div class="team-code-value">' + code + '</div>' +
        '<div class="team-code-actions">' +
        '<button type="button" data-action="copy-code">Copy code</button>' +
        '<button type="button" data-action="copy-link">Copy link</button>' +
        '<button type="button" data-action="regen">Regenerate</button>' +
        "</div>";
      box.querySelector('[data-action="copy-code"]').addEventListener("click", function () { copyText(code); showInfo("Code copied."); });
      box.querySelector('[data-action="copy-link"]').addEventListener("click", function () { copyText(joinUrl); showInfo("Link copied."); });
      box.querySelector('[data-action="regen"]').addEventListener("click", function () {
        if (!confirm("Regenerate this code? The old one will stop working immediately.")) return;
        Team.regenerateCode(which).then(renderAll).catch(function (err) { showErr(err.message); });
      });
      return box;
    }

    var grid = document.createElement("div");
    grid.className = "team-codes-grid";
    grid.appendChild(codeBox("Student join code", team.join_code_student, "student"));
    grid.appendChild(codeBox("Mentor (co-mentor) join code", team.join_code_mentor, "mentor"));
    host.appendChild(grid);
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
            (r.role === "mentor" && r.is_admin ? ' <span class="captain-badge">Admin</span>' : "") +
            (r.subteam && r.subteam !== "cross-team" ? ' <span class="role-badge">' + (SUBTEAM_LABELS[r.subteam] || r.subteam) + "</span>" : "") +
            (r.captain_roles || []).map(function (c) { return ' <span class="captain-badge">' + (CAPTAIN_LABELS[c] || c) + "</span>"; }).join("");
          top.appendChild(left);
          card.appendChild(top);

          // A team_captain can edit student rows but never a mentor's.
          // Editing a mentor's row (promoting/removing/granting admin)
          // takes being an admin yourself, not just any mentor -- a
          // freshly-joined co-mentor can't touch other mentors. Nobody
          // edits their own row here (use "Leave team" on account.html).
          var targetIsMentor = r.role === "mentor";
          var rowEditable = !isSelf && (targetIsMentor ? Team.isAdmin() : true);
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
                showInfo("Updated " + name + ".");
                renderRoster();
              }).catch(function (err) { showErr(err.message); });
            });
            card.appendChild(editRow);

            var actions = document.createElement("div");
            actions.className = "roster-row-actions";
            actions.appendChild(saveBtn);
            if (r.role === "student") {
              var promoteBtn = document.createElement("button");
              promoteBtn.type = "button";
              promoteBtn.className = "submit-btn-sm submit-btn-ghost";
              promoteBtn.textContent = "Promote to mentor";
              promoteBtn.addEventListener("click", function () {
                if (!confirm("Promote " + name + " to mentor? They won't get admin rights -- grant those separately once they've joined.")) return;
                Team.promoteToMentor(r.user_id).then(renderRoster).catch(function (err) { showErr(err.message); });
              });
              actions.appendChild(promoteBtn);
            }
            if (Team.isAdmin() && targetIsMentor && !r.is_admin) {
              var grantAdminBtn = document.createElement("button");
              grantAdminBtn.type = "button";
              grantAdminBtn.className = "submit-btn-sm submit-btn-ghost";
              grantAdminBtn.textContent = "Make admin";
              grantAdminBtn.addEventListener("click", function () {
                if (!confirm("Give " + name + " admin rights? They'll be able to manage join codes, remove other mentors, and delete the team.")) return;
                Team.grantAdmin(r.user_id).then(renderRoster).catch(function (err) { showErr(err.message); });
              });
              actions.appendChild(grantAdminBtn);
            }
            var removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "submit-btn-sm submit-btn-ghost";
            removeBtn.textContent = "Remove";
            removeBtn.addEventListener("click", function () {
              if (!confirm("Remove " + name + " from the team?")) return;
              Team.removeMember(r.user_id).then(renderRoster).catch(function (err) { showErr(err.message); });
            });
            actions.appendChild(removeBtn);
            card.appendChild(actions);
          }

          table.appendChild(card);
        });

      host.appendChild(table);
    });
  }

  document.getElementById("team-start-season-btn").addEventListener("click", function () {
    if (!confirm("Start a new season? This archives and clears your team's completed grants, checklist/calendar progress, and task assignments. Roster, mechanisms, and settings carry over.")) return;
    showErr("");
    Team.startNewSeason().then(function () {
      showInfo("New season started.");
      renderAll();
    }).catch(function (err) { showErr(err.message); });
  });

  document.getElementById("team-delete-btn").addEventListener("click", function () {
    if (!confirm("Delete this team? This permanently removes the roster, join codes, and all season and budget data for everyone on it. This can't be undone.")) return;
    showErr("");
    Team.deleteTeam().then(function () {
      window.location.href = "account.html";
    }).catch(function (err) { showErr(err.message); });
  });

  function renderAll() {
    var signedIn = !!Team.state.user;
    document.getElementById("team-signed-out").hidden = signedIn;
    document.getElementById("team-manage-app").hidden = !signedIn;
    if (!signedIn) return;

    // Nothing to manage without a team, and roster/code editing is
    // mentor-only -- send everyone else back to the regular team card.
    if (!Team.state.team || !Team.isMentor()) {
      window.location.href = "account.html";
      return;
    }

    renderHeader();
    renderCodes();
    renderRoster();
    document.getElementById("team-admin-actions").hidden = !Team.isAdmin();
  }

  Team.ready.then(renderAll);
  Team.onChange(renderAll);
})();
