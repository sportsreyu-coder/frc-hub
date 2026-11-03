// Team page (team.html): a Google-Classroom-style home for a team. Open to
// every signed-in member, not just mentors -- students join a team here,
// see a Stream of posted assignments, and can request extra work picked up
// from the Season Tracker for a mentor/captain to approve. People (roster,
// join codes, danger zone) and Budget goals are the other two tabs.
//
// Pure UI layer over window.FRCTeam (js/team.js), which owns membership
// state and RPCs, and window.SeasonCore (js/season-core.js) for the Season
// Tracker milestones the "request extra work" picker draws from.
(function () {
  "use strict";

  var Team = window.FRCTeam;
  var Core = window.SeasonCore;
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
  var SUBTEAM_KEYS = Object.keys(SUBTEAM_LABELS);
  var TEAM_TOKEN_PREFIX = "team:";

  // A team starts from a basic framework instead of a blank page -- a
  // handful of recurring assignments and an itemized budget goal -- which
  // mentors/captains then resize (add/remove assignments, change a
  // goal's amount, or delete it) to fit their own team. Applied once per
  // team the first time anyone opens this page (see ensureSeeded below),
  // not only at creation, so teams that existed before this feature
  // shipped get it too; the `seeded` flag then keeps it from coming back
  // after someone deliberately clears everything out.
  var DEFAULT_DAILY_TEMPLATES = [
    "Log today's build hours",
    "Post a progress update in the team chat",
    "Tidy your work area before leaving",
  ];
  var DEFAULT_BUDGET_GOALS = [
    { label: "Registration & season fees", amount: 6000 },
    { label: "Robot parts & materials", amount: 3000 },
    { label: "Competition travel", amount: 2000 },
    { label: "Outreach & marketing", amount: 500 },
  ];
  var DEFAULT_ROBOT_SUBSYSTEMS = ["Drivetrain", "Intake", "Scoring mechanism", "Electrical & wiring", "Programming"];
  var DEFAULT_FUNDRAISING_GOAL = DEFAULT_BUDGET_GOALS.reduce(function (s, g) { return s + g.amount; }, 0);

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function showMsg(target, msg) {
    target.textContent = msg;
    target.style.display = msg ? "block" : "none";
  }
  function showInfo(msg) { showMsg(document.getElementById("team-info"), msg); }
  function showErr(msg) { showMsg(document.getElementById("team-error"), msg); }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
  }

  function money(n) { return "$" + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }

  // ---- Starter framework: applied once, the first time anyone on the
  // team opens this page (see the module comment above DEFAULT_* for why
  // it's gated on team_data rather than team creation). ----

  function ensureSeeded() {
    return Team.loadTeamData().then(function (data) {
      data = data || {};
      var needsBase = !data.seeded;
      var needsRobot = !data.robotProgress;
      if (!needsBase && !needsRobot) return;
      var now = new Date().toISOString();
      var uid = Team.state.user.id;
      return patchTeamData(function (d) {
        // Base framework only the first time (so deliberately clearing
        // it out sticks); the robot tracker is seeded separately so
        // teams that predate it get it too.
        if (needsBase) {
          if (!d.dailyTemplates || !d.dailyTemplates.length) {
            d.dailyTemplates = DEFAULT_DAILY_TEMPLATES.map(function (label, i) {
              return { id: "daily-seed-" + i, label: label, assignTo: "everyone", active: true, createdAt: now, createdBy: uid };
            });
          }
          if (!d.budgetGoals || !d.budgetGoals.length) {
            d.budgetGoals = DEFAULT_BUDGET_GOALS.map(function (g, i) {
              return { id: "goal-seed-" + i, label: g.label, amount: g.amount, raised: 0, createdAt: now, createdBy: uid };
            });
          }
          d.seeded = true;
        }
        if (needsRobot) {
          d.robotProgress = DEFAULT_ROBOT_SUBSYSTEMS.map(function (label, i) {
            return { id: "robot-seed-" + i, label: label, percent: 0, updatedAt: now };
          });
        }
      }).then(function () {
        if (needsBase && !Team.state.team.fundraising_goal) return Team.setFundraisingGoal(DEFAULT_FUNDRAISING_GOAL);
      });
    });
  }

  // ---- Join a team (no-team state) ----

  document.getElementById("team-join-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = document.getElementById("team-join-error");
    showMsg(errEl, "");
    var code = document.getElementById("team-join-code").value.trim();
    Team.joinTeam(code).then(function () {
      window.location.href = "assignments.html";
    }).catch(function (err) { showMsg(errEl, err.message); });
  });

  // ---- Header ----

  function renderHeader() {
    var team = Team.state.team;
    var header = document.getElementById("team-header");
    var roleLabel = Team.isMentor() ? "Mentor" : "Student";
    var badges = (Team.state.membership.captain_roles || [])
      .map(function (c) { return ' <span class="captain-badge">' + (CAPTAIN_LABELS[c] || c) + "</span>"; })
      .join("");
    header.innerHTML =
      '<div class="team-header-row"><span class="team-header-name">' +
      (team.team_name ? team.team_name + " — Team " + team.team_number : "Team " + team.team_number) +
      '</span><span class="role-badge' + (Team.isMentor() ? " role-mentor" : "") + '">' + roleLabel +
      (Team.isAdmin() ? " · Admin" : "") + "</span>" + badges + "</div>" +
      (team.district ? '<div class="team-header-sub">' + team.district + "</div>" : "");
  }

  // ---- People tab: join codes + roster (mentor/captain editing) ----

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
        Team.regenerateCode(which).then(renderCodes).catch(function (err) { showErr(err.message); });
      });
      return box;
    }

    var grid = document.createElement("div");
    grid.className = "team-codes-grid";
    grid.appendChild(codeBox("Student join code", team.join_code_student, "student"));
    grid.appendChild(codeBox("Mentor (co-mentor) join code", team.join_code_mentor, "mentor"));
    host.appendChild(grid);
  }

  function captainCheckboxes(selected) {
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
      label.appendChild(chk);
      label.appendChild(document.createTextNode(CAPTAIN_LABELS[role]));
      wrap.appendChild(label);
    });
    return wrap;
  }

  // ---- Invites: mentor creates a single-use link with roles pre-assigned ----

  var inviteFormWired = false;
  var inviteCaptainChecks = null;

  function inviteUrl(code) { return window.location.origin + "/account.html?join=" + code; }

  function renderInvites() {
    var section = document.getElementById("team-invites-section");
    section.hidden = !Team.isMentor();
    if (!Team.isMentor()) return;

    if (!inviteFormWired) {
      inviteFormWired = true;
      var subteamSelect = document.getElementById("team-invite-subteam");
      SUBTEAM_KEYS.forEach(function (key) {
        subteamSelect.appendChild(el("option", { value: key }, [SUBTEAM_LABELS[key]]));
      });
      subteamSelect.value = "cross-team";
      inviteCaptainChecks = captainCheckboxes([]);
      document.getElementById("team-invite-captains").appendChild(inviteCaptainChecks);
      document.getElementById("team-invite-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var roles = Array.prototype.slice.call(inviteCaptainChecks.querySelectorAll("input:checked")).map(function (c) { return c.value; });
        var labelInput = document.getElementById("team-invite-label");
        Team.createStudentInvite(labelInput.value, subteamSelect.value, roles).then(function (invite) {
          copyText(inviteUrl(invite.code));
          showInfo("Invite created and link copied.");
          labelInput.value = "";
          subteamSelect.value = "cross-team";
          Array.prototype.forEach.call(inviteCaptainChecks.querySelectorAll("input"), function (c) { c.checked = false; });
          renderInvites();
        }).catch(function (err) { showErr(err.message); });
      });
    }

    var host = document.getElementById("team-invites-list");
    Team.listStudentInvites().then(function (invites) {
      host.innerHTML = "";
      (invites || []).forEach(function (inv) {
        var roleBits = [];
        if (inv.subteam && inv.subteam !== "cross-team") roleBits.push(SUBTEAM_LABELS[inv.subteam] || inv.subteam);
        (inv.captain_roles || []).forEach(function (c) { roleBits.push(CAPTAIN_LABELS[c] || c); });
        var row = el("div", { class: "thread-row" }, [
          el("div", { class: "thread-row-main" }, [
            el("span", { class: "thread-title" }, [inv.label || "Student invite"]),
            el("span", { class: "thread-meta" }, [(roleBits.length ? roleBits.join(", ") : "No special roles") + " · expires " + new Date(inv.expires_at).toLocaleDateString()]),
          ]),
        ]);
        var copyBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Copy link"]);
        copyBtn.addEventListener("click", function () { copyText(inviteUrl(inv.code)); showInfo("Link copied."); });
        var revokeBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Revoke"]);
        revokeBtn.addEventListener("click", function () {
          if (!confirm("Revoke this invite? The link will stop working.")) return;
          Team.revokeStudentInvite(inv.id).then(renderInvites).catch(function (err) { showErr(err.message); });
        });
        row.appendChild(el("div", { class: "post-actions" }, [copyBtn, revokeBtn]));
        host.appendChild(row);
      });
    }).catch(function (err) { showErr(err.message); });
  }

  function renderRoster() {
    var host = document.getElementById("team-roster");
    host.innerHTML = '<p class="small">Loading roster…</p>';
    var viewerCanEdit = Team.canEditRoster();
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

          // Only mentors/team-captains ever see roster-editing controls at
          // all; within that, a team_captain can edit a student row but
          // never a mentor's -- that still takes being an admin yourself.
          var targetIsMentor = r.role === "mentor";
          var rowEditable = viewerCanEdit && !isSelf && (targetIsMentor ? Team.isAdmin() : true);
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
            var checks = captainCheckboxes(r.captain_roles || []);
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
      renderPeopleTab();
    }).catch(function (err) { showErr(err.message); });
  });

  document.getElementById("team-delete-btn").addEventListener("click", function () {
    if (!confirm("Delete this team? This permanently removes the roster, join codes, and all season and budget data for everyone on it. This can't be undone.")) return;
    showErr("");
    Team.deleteTeam().then(function () {
      window.location.href = "account.html";
    }).catch(function (err) { showErr(err.message); });
  });

  function renderPeopleTab() {
    renderCodes();
    renderInvites();
    document.getElementById("team-admin-actions").hidden = !Team.isAdmin();
    renderRoster();
  }

  // ---- Stream tab: shared team_data mutations ----
  //
  // Every write re-reads first and patches just the field(s) it cares
  // about -- team_data's `data` column is one JSONB blob shared with
  // Season Tracker/Budget/etc., and saveTeamData replaces it wholesale.

  function patchTeamData(mutator) {
    return Team.loadTeamData().then(function (current) {
      var data = Object.assign({}, current || {});
      mutator(data);
      return Team.saveTeamData(data);
    });
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function dailyProgressKey(templateId, userId) {
    return "daily:" + templateId + ":" + todayISO() + ":" + userId;
  }
  function appliesToMe(tpl, myId, mySubteam) {
    if (!tpl.active) return false;
    if (tpl.assignTo === "everyone") return true;
    if (myId && tpl.assignTo === myId) return true;
    if (mySubteam && tpl.assignTo === mySubteam) return true;
    return false;
  }
  // Broader than appliesToMe: also matches a whole-subteam assignment
  // token on a Season Tracker item (tokens come from assignmentTokens,
  // either a member id or "team:<subteam>" -- see js/season.js).
  function isAssignedToMe(tokens, myId, mySubteam) {
    if (!tokens.length) return false;
    if (myId && tokens.indexOf(myId) !== -1) return true;
    if (mySubteam && tokens.indexOf(TEAM_TOKEN_PREFIX + mySubteam) !== -1) return true;
    return false;
  }
  function toggleProgressKey(key, on) {
    return patchTeamData(function (data) {
      var progress = Object.assign({}, data.progress || {});
      if (on) progress[key] = true; else delete progress[key];
      data.progress = progress;
    });
  }

  function addTemplate(label, assignTo) {
    return patchTeamData(function (data) {
      var templates = (data.dailyTemplates || []).slice();
      templates.push({
        id: "daily-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        label: label, assignTo: assignTo, active: true,
        createdAt: new Date().toISOString(), createdBy: Team.state.user.id,
      });
      data.dailyTemplates = templates;
    });
  }
  function setTemplateActive(id, active) {
    return patchTeamData(function (data) {
      (data.dailyTemplates || []).forEach(function (t) { if (t.id === id) t.active = active; });
    });
  }
  function deleteTemplate(id) {
    return patchTeamData(function (data) {
      data.dailyTemplates = (data.dailyTemplates || []).filter(function (t) { return t.id !== id; });
    });
  }

  // ---- Stream composer (mentors + captains only) ----

  var roster = [];

  function assignToLabel(assignTo) {
    if (assignTo === "everyone") return "Everyone";
    if (SUBTEAM_LABELS[assignTo]) return SUBTEAM_LABELS[assignTo];
    var match = roster.filter(function (r) { return r.user_id === assignTo; })[0];
    return match ? ((match.profile && match.profile.display_name) || "Member") : "Former member";
  }

  function buildAssignToSelect() {
    var select = el("select", { required: "required" });
    var scope = Team.captainScope();
    if (Team.isMentor() || Team.isTeamCaptain()) {
      select.appendChild(el("option", { value: "everyone" }, ["Everyone (whole team)"]));
    }
    var subteamGroup = el("optgroup", { label: "A subteam" });
    SUBTEAM_KEYS.filter(function (k) { return scope.indexOf(k) !== -1; }).forEach(function (k) {
      subteamGroup.appendChild(el("option", { value: k }, [SUBTEAM_LABELS[k]]));
    });
    if (subteamGroup.children.length) select.appendChild(subteamGroup);

    var memberGroup = el("optgroup", { label: "One member" });
    roster
      .filter(function (r) { return Team.isMentor() || Team.isTeamCaptain() || scope.indexOf(r.subteam) !== -1; })
      .forEach(function (r) {
        memberGroup.appendChild(el("option", { value: r.user_id }, [(r.profile && r.profile.display_name) || "Member"]));
      });
    if (memberGroup.children.length) select.appendChild(memberGroup);
    return select;
  }

  var composeFormWired = false;
  function initComposeForm() {
    var host = document.getElementById("team-compose-assign-to");
    host.innerHTML = "";
    host.appendChild(buildAssignToSelect());
    if (composeFormWired) return;
    composeFormWired = true;
    document.getElementById("team-compose-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var labelInput = document.getElementById("team-compose-label");
      var select = document.getElementById("team-compose-assign-to").querySelector("select");
      var label = labelInput.value.trim();
      if (!label || !select || !select.value) return;
      addTemplate(label, select.value).then(function () {
        labelInput.value = "";
        reloadStream();
      });
    });
  }

  // ---- Stream feed ----

  function streamRow(tpl, myId, mySubteam, canManage, progress) {
    var appliesToViewer = appliesToMe(tpl, myId, mySubteam);
    var key = dailyProgressKey(tpl.id, myId);
    var done = appliesToViewer && !!progress[key];

    var body = el("div", { class: "ms-body" }, [
      el("div", { class: "ms-top" }, [
        el("div", { class: "ms-title-group" }, [
          el("span", { class: "ms-label" + (done ? " ms-subtask-done" : "") }, [tpl.label]),
          el("span", { class: "ms-assigned" }, [
            "Assigned to " + assignToLabel(tpl.assignTo) + (!tpl.active ? " · Paused" : "") +
            (Core && tpl.createdAt ? " · Posted " + Core.formatDate(new Date(tpl.createdAt)) : ""),
          ]),
        ]),
      ]),
    ]);

    if (canManage) {
      var toggleBtn = el("button", { type: "button", class: "ms-expand-toggle" }, [tpl.active ? "Pause" : "Resume"]);
      toggleBtn.addEventListener("click", function () { setTemplateActive(tpl.id, !tpl.active).then(reloadStream); });
      var deleteBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Delete"]);
      deleteBtn.addEventListener("click", function () {
        if (!confirm('Delete "' + tpl.label + '"? This can\'t be undone.')) return;
        deleteTemplate(tpl.id).then(reloadStream);
      });
      body.appendChild(el("div", { class: "post-actions" }, [toggleBtn, deleteBtn]));
    }

    var rowChildren = [];
    if (appliesToViewer && tpl.active) {
      var checkbox = el("input", { type: "checkbox" });
      checkbox.checked = done;
      checkbox.addEventListener("change", function () {
        toggleProgressKey(key, checkbox.checked).then(reloadStream);
      });
      rowChildren.push(checkbox);
    }
    rowChildren.push(body);
    return el(appliesToViewer && tpl.active ? "label" : "div", { class: "milestone-row" }, rowChildren);
  }

  function renderStreamList(myId, mySubteam, canManage, data) {
    var list = document.getElementById("team-stream-list");
    var empty = document.getElementById("team-stream-empty");
    list.innerHTML = "";
    var templates = ((data && data.dailyTemplates) || []).slice().reverse();
    empty.hidden = templates.length > 0;
    templates.forEach(function (tpl) {
      list.appendChild(streamRow(tpl, myId, mySubteam, canManage, (data && data.progress) || {}));
    });
  }

  // ---- Extra-work requests: approve/deny (mentors + captains) ----

  function assignmentTokens(map, id) {
    var v = map[id];
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }

  function approveRequest(req) {
    return patchTeamData(function (data) {
      var assignments = Object.assign({}, data.assignments || {});
      var tokens = assignmentTokens(assignments, req.taskId).slice();
      if (tokens.indexOf(req.requestedBy) === -1) tokens.push(req.requestedBy);
      assignments[req.taskId] = tokens;
      data.assignments = assignments;
      data.assignmentRequests = (data.assignmentRequests || []).filter(function (r) { return r.id !== req.id; });
    });
  }
  function denyRequest(req) {
    return patchTeamData(function (data) {
      data.assignmentRequests = (data.assignmentRequests || []).filter(function (r) { return r.id !== req.id; });
    });
  }

  function renderRequests(canManage, data, rosterById) {
    var card = document.getElementById("team-requests-card");
    var list = document.getElementById("team-requests-list");
    var requests = (data && data.assignmentRequests) || [];
    list.innerHTML = "";
    card.hidden = !canManage || !requests.length;
    if (!canManage) return;
    requests.forEach(function (req) {
      var requester = rosterById[req.requestedBy];
      var requesterName = (requester && requester.profile && requester.profile.display_name) || "A member";
      var row = el("div", { class: "thread-row" }, [
        el("div", { class: "thread-row-main" }, [
          el("span", { class: "thread-title" }, [requesterName + " wants: " + req.taskLabel]),
          el("span", { class: "thread-meta" }, [req.kind === "custom" ? "Custom task" : "Milestone"]),
        ]),
      ]);
      var approveBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Approve"]);
      approveBtn.addEventListener("click", function () { approveRequest(req).then(reloadStream); });
      var denyBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Deny"]);
      denyBtn.addEventListener("click", function () { denyRequest(req).then(reloadStream); });
      row.appendChild(el("div", { class: "post-actions" }, [approveBtn, denyBtn]));
      list.appendChild(row);
    });
  }

  function renderMyPendingRequests(myId, data) {
    var host = document.getElementById("team-request-pending");
    host.innerHTML = "";
    var mine = ((data && data.assignmentRequests) || []).filter(function (r) { return r.requestedBy === myId; });
    mine.forEach(function (req) {
      var row = el("div", { class: "thread-row" }, [
        el("div", { class: "thread-row-main" }, [
          el("span", { class: "thread-title" }, [req.taskLabel]),
          el("span", { class: "thread-meta" }, ["Pending approval"]),
        ]),
      ]);
      var cancelBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Cancel"]);
      cancelBtn.addEventListener("click", function () { denyRequest(req).then(reloadStream); });
      row.appendChild(el("div", { class: "post-actions" }, [cancelBtn]));
      host.appendChild(row);
    });
  }

  // ---- Request extra work: picker of unassigned Season Tracker items ----

  var requestCandidates = [];

  function candidateTasks(myId, mySubteam, data) {
    if (!Core) return [];
    var progress = (data && data.progress) || {};
    var assignments = (data && data.assignments) || {};
    var requests = (data && data.assignmentRequests) || [];
    var pendingMine = {};
    requests.forEach(function (r) { if (r.requestedBy === myId) pendingMine[r.taskId] = true; });

    function isMine(id) {
      var tokens = assignmentTokens(assignments, id);
      return tokens.indexOf(myId) !== -1 || (!!mySubteam && tokens.indexOf(TEAM_TOKEN_PREFIX + mySubteam) !== -1);
    }

    var items = [];
    Core.getMilestonesWithDates().forEach(function (m) {
      if (progress[m.id] || isMine(m.id) || pendingMine[m.id]) return;
      items.push({ id: m.id, label: m.label, kind: "milestone" });
    });
    ((data && data.customTasks) || []).forEach(function (t) {
      if (progress[t.id] || isMine(t.id) || pendingMine[t.id]) return;
      items.push({ id: t.id, label: t.label, kind: "custom" });
    });
    return items;
  }

  function buildRequestPicker(items) {
    var select = el("select", {});
    if (!items.length) {
      select.appendChild(el("option", { value: "" }, ["Nothing available"]));
      select.disabled = true;
    } else {
      items.forEach(function (it) {
        select.appendChild(el("option", { value: it.id }, [it.label]));
      });
    }
    return select;
  }

  document.getElementById("team-request-submit-btn").addEventListener("click", function () {
    var select = document.querySelector("#team-request-picker select");
    if (!select || !select.value) return;
    var item = requestCandidates.filter(function (c) { return c.id === select.value; })[0];
    if (!item) return;
    patchTeamData(function (data) {
      var requests = (data.assignmentRequests || []).slice();
      requests.push({
        id: "req-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        taskId: item.id,
        taskLabel: item.label,
        kind: item.kind,
        requestedBy: Team.state.user.id,
        requestedAt: new Date().toISOString(),
      });
      data.assignmentRequests = requests;
    }).then(reloadStream);
  });

  // ---- Stream tab bootstrap ----

  function reloadStream() {
    var myId = Team.state.user && Team.state.user.id;
    var mySubteam = Team.state.membership && Team.state.membership.subteam;
    var canManage = Team.isMentor() || Team.captainScope().length > 0;

    document.getElementById("team-compose-card").hidden = !canManage;
    if (canManage) initComposeForm();

    Promise.all([Team.loadRoster(), Team.loadTeamData()]).then(function (res) {
      roster = res[0];
      var data = res[1] || {};
      var rosterById = {};
      roster.forEach(function (r) { rosterById[r.user_id] = r; });

      renderRequests(canManage, data, rosterById);
      renderStreamList(myId, mySubteam, canManage, data);

      requestCandidates = candidateTasks(myId, mySubteam, data);
      var pickerHost = document.getElementById("team-request-picker");
      pickerHost.innerHTML = "";
      pickerHost.appendChild(buildRequestPicker(requestCandidates));
      document.getElementById("team-request-submit-btn").disabled = !requestCandidates.length;
      document.getElementById("team-request-empty").hidden = requestCandidates.length > 0;

      renderMyPendingRequests(myId, data);
    });
  }

  // ---- Budget goals tab ----

  function renderBudgetTab() {
    if (!Team.state.team) return;
    Team.loadBudgetEntries().then(function (entries) {
      var approved = entries.filter(function (e) { return e.status === "approved"; });
      var income = approved.filter(function (e) { return e.type === "income"; }).reduce(function (s, e) { return s + Number(e.amount); }, 0);
      var goal = Team.state.team.fundraising_goal;

      var snap = document.getElementById("team-budget-snapshot");
      snap.innerHTML = "";
      snap.appendChild(el("div", { class: "dash-headline" }, [money(income) + (goal ? " of " + money(goal) : "")]));
      snap.appendChild(el("p", { class: "dash-sub" }, [goal ? "raised toward your season goal" : "raised this season — no goal set yet"]));
      if (goal) {
        var pct = Math.min(100, Math.round((income / goal) * 100));
        snap.appendChild(el("div", { class: "progress-track", style: "margin-top:10px;" }, [
          el("div", { class: "progress-fill", style: "width:" + pct + "%" }),
        ]));
      }

      var editHost = document.getElementById("team-goal-edit");
      editHost.innerHTML = "";
      if (Team.canEditBudgetGoal()) {
        var goalInput = el("input", { type: "number", min: "0", step: "1", placeholder: "Set season goal ($)" });
        if (goal) goalInput.value = goal;
        var goalBtn = el("button", { type: "button", class: "submit-btn-sm" }, [goal ? "Update goal" : "Save goal"]);
        goalBtn.addEventListener("click", function () {
          var v = parseFloat(goalInput.value);
          if (isNaN(v) || v <= 0) return;
          Team.setFundraisingGoal(v).then(renderBudgetTab);
        });
        editHost.appendChild(el("div", { class: "goal-edit-row", style: "margin-top:14px;" }, [goalInput, goalBtn]));
      }

      renderGoalList(income);
    });
  }

  function renderGoalList(income) {
    var list = document.getElementById("team-goal-list");
    document.getElementById("team-goal-form").hidden = !Team.canEditBudgetGoal();
    Team.loadTeamData().then(function (data) {
      var goals = (data && data.budgetGoals) || [];
      list.innerHTML = "";
      if (!goals.length) {
        list.appendChild(el("p", { class: "finder-hint" }, ["No specific goals yet."]));
        return;
      }
      goals.forEach(function (g) {
        var raised = Number(g.raised) || 0;
        var reached = raised >= g.amount;
        var pct = Math.min(100, Math.round((raised / g.amount) * 100));
        var row = el("div", { class: "thread-row" }, [
          el("div", { class: "thread-row-main" }, [
            el("span", { class: "thread-title" }, [g.label]),
            el("span", { class: "thread-meta" }, [money(raised) + " raised of " + money(g.amount) + (reached ? " · Reached" : "")]),
            el("div", { class: "progress-track", style: "margin-top:6px;" }, [
              el("div", { class: "progress-fill", style: "width:" + pct + "%" }),
            ]),
          ]),
        ]);
        if (Team.canEditBudgetGoal()) {
          var inputStyle = "width:90px; padding:4px 8px; font-size:0.8rem;";
          var raisedInput = el("input", { type: "number", min: "0", step: "1", value: String(raised), title: "Raised so far ($)", "aria-label": "Raised for " + g.label, style: inputStyle });
          var amountInput = el("input", { type: "number", min: "1", step: "1", value: String(g.amount), title: "Target ($)", "aria-label": "Target for " + g.label, style: inputStyle });
          var updateBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Update"]);
          updateBtn.addEventListener("click", function () {
            var r = parseFloat(raisedInput.value);
            var v = parseFloat(amountInput.value);
            if (isNaN(r) || r < 0 || isNaN(v) || v <= 0) return;
            patchTeamData(function (d) { (d.budgetGoals || []).forEach(function (x) { if (x.id === g.id) { x.raised = r; x.amount = v; } }); }).then(renderBudgetTab);
          });
          var delBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Delete"]);
          delBtn.addEventListener("click", function () {
            patchTeamData(function (d) { d.budgetGoals = (d.budgetGoals || []).filter(function (x) { return x.id !== g.id; }); }).then(renderBudgetTab);
          });
          row.appendChild(el("div", { class: "post-actions" }, [raisedInput, el("span", { class: "thread-meta" }, ["of"]), amountInput, updateBtn, delBtn]));
        }
        list.appendChild(row);
      });
    });
  }

  document.getElementById("team-goal-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var labelInput = document.getElementById("team-goal-label");
    var amountInput = document.getElementById("team-goal-amount");
    var label = labelInput.value.trim();
    var amount = parseFloat(amountInput.value);
    if (!label || isNaN(amount) || amount <= 0) return;
    patchTeamData(function (data) {
      var goals = (data.budgetGoals || []).slice();
      goals.push({ id: "goal-" + Date.now() + "-" + Math.floor(Math.random() * 1000), label: label, amount: amount, raised: 0, createdAt: new Date().toISOString(), createdBy: Team.state.user.id });
      data.budgetGoals = goals;
    }).then(function () {
      labelInput.value = "";
      amountInput.value = "";
      renderBudgetTab();
    });
  });

  // ---- My Work tab: exactly what's assigned to the signed-in member --
  // today's daily checklist plus any Season Tracker milestone/custom task
  // with their name (or subteam) on it. The Stream shows everything
  // posted to the team; this is the personal cut of it. ----

  function renderMyWorkTab() {
    if (!Team.state.team) return;
    var myId = Team.state.user && Team.state.user.id;
    var mySubteam = Team.state.membership && Team.state.membership.subteam;

    Team.loadTeamData().then(function (data) {
      data = data || {};
      var progress = data.progress || {};
      var assignments = data.assignments || {};

      var dailyList = document.getElementById("team-mywork-daily-list");
      var dailyEmpty = document.getElementById("team-mywork-daily-empty");
      dailyList.innerHTML = "";
      var mineDaily = (data.dailyTemplates || []).filter(function (t) { return appliesToMe(t, myId, mySubteam); });
      dailyEmpty.hidden = mineDaily.length > 0;
      mineDaily.forEach(function (tpl) {
        var key = dailyProgressKey(tpl.id, myId);
        var done = !!progress[key];
        var checkbox = el("input", { type: "checkbox" });
        checkbox.checked = done;
        checkbox.addEventListener("change", function () {
          toggleProgressKey(key, checkbox.checked).then(renderMyWorkTab);
        });
        dailyList.appendChild(el("label", { class: "milestone-row" }, [
          checkbox,
          el("div", { class: "ms-body" }, [
            el("div", { class: "ms-top" }, [
              el("div", { class: "ms-title-group" }, [
                el("span", { class: "ms-label" + (done ? " ms-subtask-done" : "") }, [tpl.label]),
              ]),
            ]),
          ]),
        ]));
      });

      var tasksList = document.getElementById("team-mywork-tasks-list");
      var tasksEmpty = document.getElementById("team-mywork-tasks-empty");
      tasksList.innerHTML = "";
      var items = [];
      if (Core) {
        var today = Core.startOfDay(new Date());
        Core.getMilestonesWithDates().forEach(function (m) {
          if (progress[m.id]) return;
          if (!isAssignedToMe(assignmentTokens(assignments, m.id), myId, mySubteam)) return;
          items.push({ id: m.id, label: m.label, date: m.date, overdue: Core.daysBetween(today, m.date) < 0 });
        });
        (data.customTasks || []).forEach(function (t) {
          if (progress[t.id]) return;
          if (!isAssignedToMe(assignmentTokens(assignments, t.id), myId, mySubteam)) return;
          var date = t.dueDate ? new Date(t.dueDate + "T00:00:00") : null;
          items.push({ id: t.id, label: t.label, date: date, overdue: !!date && Core.daysBetween(today, date) < 0 });
        });
        items.sort(function (a, b) {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return a.date - b.date;
        });
      }
      tasksEmpty.hidden = items.length > 0;
      items.forEach(function (item) {
        var checkbox = el("input", { type: "checkbox" });
        checkbox.addEventListener("change", function () {
          toggleProgressKey(item.id, true).then(renderMyWorkTab);
        });
        var meta = [];
        if (item.date) meta.push(el("span", { class: "ms-date" + (item.overdue ? " is-overdue" : "") }, [item.overdue ? "Overdue" : Core.formatDate(item.date)]));
        tasksList.appendChild(el("label", { class: "milestone-row" }, [
          checkbox,
          el("div", { class: "ms-body" }, [
            el("div", { class: "ms-top" }, [
              el("div", { class: "ms-title-group" }, [el("span", { class: "ms-label" }, [item.label])]),
            ]),
            meta.length ? el("div", { class: "ms-meta-row" }, meta) : null,
          ]),
        ]));
      });
    });
  }

  // ---- Robot & notes tab: mentor notes (shown on each student's
  // Assignments page) and per-subsystem robot progress. ----

  function canEditRobot() { return Team.isMentor() || Team.captainScope().length > 0; }

  function noteVisibleTo(note, myId, mySubteam) {
    if (Team.isMentor()) return true;
    return note.audience === "everyone" || note.audience === myId || (!!mySubteam && note.audience === mySubteam);
  }

  var notesFormWired = false;
  function renderNotes(data) {
    var myId = Team.state.user.id;
    var mySubteam = Team.state.membership && Team.state.membership.subteam;
    var isMentor = Team.isMentor();
    document.getElementById("team-notes-compose-card").hidden = !isMentor;
    document.getElementById("team-notes-sub").textContent = isMentor ? "Everything you've posted. Delete a note to remove it for everyone." : "Notes from your mentors to you, your subteam, or the whole team.";

    if (isMentor) {
      var host = document.getElementById("team-notes-audience");
      host.innerHTML = "";
      var select = el("select", { required: "required" });
      select.appendChild(el("option", { value: "everyone" }, ["Everyone (whole team)"]));
      var sg = el("optgroup", { label: "A subteam" });
      SUBTEAM_KEYS.forEach(function (k) { sg.appendChild(el("option", { value: k }, [SUBTEAM_LABELS[k]])); });
      select.appendChild(sg);
      var mg = el("optgroup", { label: "One student" });
      roster.filter(function (r) { return r.user_id !== myId; }).forEach(function (r) {
        mg.appendChild(el("option", { value: r.user_id }, [(r.profile && r.profile.display_name) || "Member"]));
      });
      if (mg.children.length) select.appendChild(mg);
      host.appendChild(select);

      if (!notesFormWired) {
        notesFormWired = true;
        document.getElementById("team-notes-form").addEventListener("submit", function (e) {
          e.preventDefault();
          var input = document.getElementById("team-notes-text");
          var sel = document.querySelector("#team-notes-audience select");
          var text = input.value.trim();
          if (!text || !sel) return;
          patchTeamData(function (d) {
            var notes = (d.mentorNotes || []).slice();
            notes.push({ id: "note-" + Date.now() + "-" + Math.floor(Math.random() * 1000), text: text, audience: sel.value, createdAt: new Date().toISOString(), createdBy: Team.state.user.id });
            d.mentorNotes = notes;
          }).then(function () { input.value = ""; reloadRobotTab(); }).catch(function (err) { showErr(err.message); });
        });
      }
    }

    var list = document.getElementById("team-notes-list");
    list.innerHTML = "";
    var notes = ((data && data.mentorNotes) || []).filter(function (n) { return noteVisibleTo(n, myId, mySubteam); }).slice().reverse();
    document.getElementById("team-notes-empty").hidden = notes.length > 0;
    notes.forEach(function (n) {
      var row = el("div", { class: "thread-row" }, [
        el("div", { class: "thread-row-main" }, [
          el("span", { class: "thread-title" }, [n.text]),
          el("span", { class: "thread-meta" }, ["To " + assignToLabel(n.audience) + (Core && n.createdAt ? " · " + Core.formatDate(new Date(n.createdAt)) : "")]),
        ]),
      ]);
      if (isMentor) {
        var del = el("button", { type: "button", class: "ms-expand-toggle" }, ["Delete"]);
        del.addEventListener("click", function () {
          patchTeamData(function (d) { d.mentorNotes = (d.mentorNotes || []).filter(function (x) { return x.id !== n.id; }); }).then(reloadRobotTab);
        });
        row.appendChild(el("div", { class: "post-actions" }, [del]));
      }
      list.appendChild(row);
    });
  }

  var robotFormWired = false;
  function renderRobot(data) {
    var canEdit = canEditRobot();
    var items = (data && data.robotProgress) || [];
    var list = document.getElementById("team-robot-list");
    list.innerHTML = "";
    document.getElementById("team-robot-empty").hidden = items.length > 0;
    document.getElementById("team-robot-form").hidden = !canEdit;
    document.getElementById("team-robot-sub").textContent = canEdit ? "Drag a slider to update a subsystem. Everyone on the team sees this on their Assignments page." : "How far along each part of this season's robot is.";

    items.forEach(function (it) {
      var pct = Math.max(0, Math.min(100, Number(it.percent) || 0));
      var valueEl = el("span", { class: "robot-pct" }, [pct + "%"]);
      var bar = el("div", { class: "robot-bar" }, [el("div", { class: "robot-bar-fill" })]);
      bar.firstChild.style.width = pct + "%";
      var top = el("div", { class: "robot-row-top" }, [el("span", { class: "robot-label" }, [it.label]), valueEl]);
      var row = el("div", { class: "robot-row" }, [top, bar]);
      if (canEdit) {
        var slider = el("input", { type: "range", min: "0", max: "100", step: "5", "aria-label": it.label + " progress" });
        slider.value = pct;
        slider.addEventListener("input", function () { valueEl.textContent = slider.value + "%"; bar.firstChild.style.width = slider.value + "%"; });
        slider.addEventListener("change", function () {
          patchTeamData(function (d) {
            (d.robotProgress || []).forEach(function (x) { if (x.id === it.id) { x.percent = Number(slider.value); x.updatedAt = new Date().toISOString(); } });
          }).catch(function (err) { showErr(err.message); });
        });
        var del = el("button", { type: "button", class: "ms-expand-toggle" }, ["Remove"]);
        del.addEventListener("click", function () {
          if (!confirm('Remove "' + it.label + '" from the robot tracker?')) return;
          patchTeamData(function (d) { d.robotProgress = (d.robotProgress || []).filter(function (x) { return x.id !== it.id; }); }).then(reloadRobotTab);
        });
        row.appendChild(el("div", { class: "robot-row-edit" }, [slider, del]));
      }
      list.appendChild(row);
    });

    if (canEdit && !robotFormWired) {
      robotFormWired = true;
      document.getElementById("team-robot-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var input = document.getElementById("team-robot-label");
        var label = input.value.trim();
        if (!label) return;
        patchTeamData(function (d) {
          var arr = (d.robotProgress || []).slice();
          arr.push({ id: "robot-" + Date.now() + "-" + Math.floor(Math.random() * 1000), label: label, percent: 0, updatedAt: new Date().toISOString() });
          d.robotProgress = arr;
        }).then(function () { input.value = ""; reloadRobotTab(); }).catch(function (err) { showErr(err.message); });
      });
    }
  }

  function reloadRobotTab() {
    Promise.all([Team.loadRoster(), Team.loadTeamData()]).then(function (res) {
      roster = res[0];
      renderNotes(res[1] || {});
      renderRobot(res[1] || {});
    }).catch(function (err) { showErr(err.message); });
  }

  // ---- Tabs ----

  var teamTabs = document.getElementById("team-tabs");
  teamTabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".settings-nav-btn");
    if (!btn) return;
    var panelName = btn.getAttribute("data-panel");
    teamTabs.querySelectorAll(".settings-nav-btn").forEach(function (b) {
      var active = b === btn;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("#team-app .settings-panel").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-panel") !== panelName;
    });
  });

  // ---- Page bootstrap ----

  function renderAll() {
    var signedIn = !!Team.state.user;
    document.getElementById("team-signed-out").hidden = signedIn;
    if (!signedIn) {
      document.getElementById("team-no-team").hidden = true;
      document.getElementById("team-app").hidden = true;
      return;
    }

    if (!Team.state.team) {
      document.getElementById("team-no-team").hidden = false;
      document.getElementById("team-app").hidden = true;
      return;
    }

    document.getElementById("team-no-team").hidden = true;
    document.getElementById("team-app").hidden = false;

    renderHeader();
    showErr("");
    // Seeding is best-effort: if it fails (e.g. offline, or a schema
    // migration hasn't run yet) the rest of the page should still load.
    ensureSeeded().catch(function (err) { showErr("Couldn't set up team defaults: " + err.message); }).then(function () {
      [renderPeopleTab, reloadStream, renderMyWorkTab, renderBudgetTab, reloadRobotTab].forEach(function (fn) {
        try { fn(); } catch (err) { showErr(err.message); }
      });
    });
  }

  Team.ready.then(renderAll);
  Team.onChange(renderAll);
})();
