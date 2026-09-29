(function () {
  "use strict";

  var Core = window.SeasonCore;
  var daysBetween = Core.daysBetween;
  var formatDate = Core.formatDate;
  var saveProgress = Core.saveProgress;
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var CUSTOM_KEY = "frcgrants_season_custom_events_v1";
  var OA_KEY = "frcgrants_season_oa_enabled_v1"; // legacy boolean-only key, migrated below
  var OA_SETTINGS_KEY = "frcgrants_season_oa_settings_v1";
  var DEFAULT_OA_SETTINGS = { enabled: false, videoDaysPerWeek: 1, blogDay: "" };
  var OA_WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  var ROSTER_KEY = "frcgrants_season_team_sizes_v1";
  var DEFAULT_TEAM_SIZES = { mechanical: 6, electrical: 3, programming: 4, design: 4, business: 5 };
  var MECH_KEY = "frcgrants_season_mechanisms_v1";
  var MEMBERS_KEY = "frcgrants_season_members_v1";
  var ASSIGN_KEY = "frcgrants_season_assignments_v1";
  var CUSTOM_TASKS_KEY = "frcgrants_season_custom_tasks_v1";

  var TEAM_LABELS = {
    design: "Design",
    mechanical: "Mechanical",
    electrical: "Electrical",
    programming: "Programming",
    business: "Business/Outreach",
    "cross-team": "Cross-team",
    custom: "Your custom events",
  };

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

  function loadCustomEvents() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveCustomEvents(list) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function loadOASettings() {
    try {
      var stored = JSON.parse(localStorage.getItem(OA_SETTINGS_KEY) || "null");
      if (stored) return Object.assign({}, DEFAULT_OA_SETTINGS, stored);
    } catch (e) { /* fall through to legacy check */ }
    // Migrate the old boolean-only setting the first time this loads.
    var legacyEnabled = false;
    try { legacyEnabled = localStorage.getItem(OA_KEY) === "1"; } catch (e) { /* ignore */ }
    return Object.assign({}, DEFAULT_OA_SETTINGS, { enabled: legacyEnabled });
  }
  function saveOASettings(settings) {
    try { localStorage.setItem(OA_SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }
  function loadTeamSizes() {
    try {
      var stored = JSON.parse(localStorage.getItem(ROSTER_KEY) || "{}");
      return Object.assign({}, DEFAULT_TEAM_SIZES, stored);
    } catch (e) {
      return Object.assign({}, DEFAULT_TEAM_SIZES);
    }
  }
  function saveTeamSizes(sizes) {
    try { localStorage.setItem(ROSTER_KEY, JSON.stringify(sizes)); } catch (e) { /* ignore */ }
  }
  function loadMechanisms() {
    try { return JSON.parse(localStorage.getItem(MECH_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveMechanisms(list) {
    try { localStorage.setItem(MECH_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function loadMembers() {
    try { return JSON.parse(localStorage.getItem(MEMBERS_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveMembers(list) {
    try { localStorage.setItem(MEMBERS_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function loadAssignments() {
    try { return JSON.parse(localStorage.getItem(ASSIGN_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveAssignments(a) {
    try { localStorage.setItem(ASSIGN_KEY, JSON.stringify(a)); } catch (e) { /* ignore */ }
  }
  function loadCustomTasks() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_TASKS_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveCustomTasks(list) {
    try { localStorage.setItem(CUSTOM_TASKS_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  // ---- Cloud sync (Supabase) ----
  //
  // Purely additive on top of the localStorage layer above: signed-out
  // (or Supabase not configured) behaves exactly as before. When signed
  // in, every render() also schedules a debounced upload of the whole
  // state to the season_data table, and on load, an existing cloud row
  // wins over whatever's in this browser's localStorage (so a second
  // device picks up your data). If no cloud row exists yet, this
  // browser's local data seeds it.
  var cloudUserId = null;
  var cloudSaveTimer = null;

  function cloudSnapshot() {
    return {
      progress: progress,
      customEvents: customEvents,
      oaSettings: oaSettings,
      teamSizes: teamSizes,
      mechanisms: mechanisms,
      members: members,
      assignments: assignments,
      customTasks: customTasks,
    };
  }

  function applyCloudSnapshot(data) {
    if (!data) return;
    if (data.progress) { progress = data.progress; saveProgress(progress); }
    if (data.customEvents) { customEvents = data.customEvents; saveCustomEvents(customEvents); }
    if (data.oaSettings) { oaSettings = Object.assign({}, DEFAULT_OA_SETTINGS, data.oaSettings); saveOASettings(oaSettings); }
    if (data.teamSizes) { teamSizes = Object.assign({}, DEFAULT_TEAM_SIZES, data.teamSizes); saveTeamSizes(teamSizes); }
    if (data.mechanisms) { mechanisms = data.mechanisms; saveMechanisms(mechanisms); }
    if (data.members) { members = data.members; saveMembers(members); }
    if (data.assignments) { assignments = data.assignments; saveAssignments(assignments); }
    if (data.customTasks) { customTasks = data.customTasks; saveCustomTasks(customTasks); }
  }

  function scheduleCloudSave() {
    if (!cloudUserId || !window.__frcHubSupabase) return;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(function () {
      window.__frcHubSupabase
        .from("season_data")
        .upsert({ user_id: cloudUserId, data: cloudSnapshot(), updated_at: new Date().toISOString() })
        .then(function (res) {
          if (res.error) console.warn("Season Tracker cloud save failed:", res.error.message);
        });
    }, 1200);
  }

  function updateSyncStatus() {
    var el = document.getElementById("sync-status");
    if (!el) return;
    el.textContent = cloudUserId
      ? "Synced to your account."
      : "Saved in this browser only — sign in to sync across devices.";
  }

  function initCloudSync() {
    var sb = window.__frcHubSupabase;
    if (!sb) return;

    function handleSession(session) {
      if (!session || !session.user) {
        cloudUserId = null;
        updateSyncStatus();
        return;
      }
      cloudUserId = session.user.id;
      updateSyncStatus();
      sb.from("season_data").select("data").eq("user_id", cloudUserId).maybeSingle().then(function (res) {
        if (res.error) {
          console.warn("Season Tracker cloud load failed:", res.error.message);
          return;
        }
        if (res.data && res.data.data) {
          applyCloudSnapshot(res.data.data);
          render();
        } else {
          scheduleCloudSave();
        }
      });
    }

    sb.auth.onAuthStateChange(function (_event, session) { handleSession(session); });
    sb.auth.getSession().then(function (res) { handleSession(res.data.session); });
  }

  var viewMode = "checklist"; // or "calendar"

  var initialSub = "";
  try { initialSub = new URLSearchParams(window.location.search).get("sub") || ""; } catch (e) { /* ignore */ }
  var checklistSub = initialSub === "grants" ? "grants" : "technical"; // or "grants"

  var today = Core.startOfDay(new Date());
  var anchor = Core.resolveAnchor(today);
  var milestones = Core.getMilestonesWithDates();
  var progress = Core.loadProgress();
  var calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  var customEvents = loadCustomEvents();
  var oaSettings = loadOASettings();
  var teamSizes = loadTeamSizes();
  var mechanisms = loadMechanisms();
  var members = loadMembers();
  var assignments = loadAssignments();
  var customTasks = loadCustomTasks();

  // ---- Grant deadlines (from data/grants.json) ----
  var grantDeadlines = [];
  var GRANT_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

  function parseGrantDate(str) {
    if (!str) return null;
    var m = String(str).toLowerCase().match(/([a-z]+)\s*(\d+)?/);
    if (!m) return null;
    var mi = -1;
    for (var i = 0; i < GRANT_MONTHS.length; i++) {
      if (GRANT_MONTHS[i].indexOf(m[1].slice(0, 3)) === 0) { mi = i; break; }
    }
    if (mi < 0) return null;
    var day = parseInt(m[2] || "1", 10) || 1;
    // Sept-Dec deadlines fall in preseason, before Kickoff -- anchor them to
    // the year before Kickoff; Jan-Aug deadlines anchor to Kickoff's year.
    var year = mi >= 8 ? anchor.getFullYear() - 1 : anchor.getFullYear();
    return new Date(year, mi, day);
  }

  function loadGrantDeadlines() {
    fetch("data/grants.json")
      .then(function (r) { return r.json(); })
      .then(function (grants) {
        grantDeadlines = grants
          .filter(function (g) { return g.closeDate; })
          .map(function (g) {
            return {
              id: "grant-" + g.id,
              name: g.name,
              link: g.link,
              date: parseGrantDate(g.closeDate),
              closeDateText: g.closeDate,
              status: g.status,
              notes: g.notes,
            };
          })
          .filter(function (g) { return g.date; })
          .sort(function (a, b) { return a.date - b.date; });
        render();
      })
      .catch(function (err) { console.error("Could not load grant deadlines:", err); });
  }

  // ---- Calendar category filters (grants vs. technical assignments) ----
  var CAL_FILTER_KEY = "frcgrants_season_cal_filters_v1";
  function loadCalFilters() {
    try {
      var stored = JSON.parse(localStorage.getItem(CAL_FILTER_KEY) || "{}");
      return { grants: stored.grants !== false, technical: stored.technical !== false };
    } catch (e) {
      return { grants: true, technical: true };
    }
  }
  function saveCalFilters(f) {
    try { localStorage.setItem(CAL_FILTER_KEY, JSON.stringify(f)); } catch (e) { /* ignore */ }
  }
  var calFilters = loadCalFilters();

  function isDone(m) { return !!progress[m.id]; }
  function subtaskKey(m, idx) { return m.id + "::sub" + idx; }
  function isSubtaskDone(m, idx) { return !!progress[subtaskKey(m, idx)]; }

  function toggleMilestone(m) {
    if (progress[m.id]) {
      delete progress[m.id];
    } else {
      if (m.subtasks && m.subtasks.length) {
        var allDone = m.subtasks.every(function (_, i) { return isSubtaskDone(m, i); });
        if (!allDone && !confirm("Are you sure you want to complete this task? The subtasks are not completed.")) {
          render(); // the checkbox's native state already flipped -- redraw it back to unchecked
          return;
        }
      }
      progress[m.id] = today.toISOString();
    }
    saveProgress(progress);
    render();
  }

  function toggleSubtask(m, idx) {
    var key = subtaskKey(m, idx);
    if (progress[key]) delete progress[key];
    else progress[key] = today.toISOString();

    // Auto-complete the parent once every subtask is checked -- but never
    // auto-uncheck it, in case a team confirmed it done despite one
    // subtask not applying to them.
    if (m.subtasks && m.subtasks.length && !progress[m.id]) {
      var allDone = m.subtasks.every(function (_, i) { return isSubtaskDone(m, i); });
      if (allDone) progress[m.id] = today.toISOString();
    }
    saveProgress(progress);
    render();
  }

  function toggleGeneric(id) {
    if (progress[id]) delete progress[id];
    else progress[id] = today.toISOString();
    saveProgress(progress);
    render();
  }

  function removeCustomEvent(id) {
    customEvents = customEvents.filter(function (ce) { return ce.id !== id; });
    saveCustomEvents(customEvents);
    delete progress["custom-" + id];
    saveProgress(progress);
    render();
  }

  function removeMechanism(idx) {
    mechanisms.splice(idx, 1);
    saveMechanisms(mechanisms);
    render();
  }

  function memberById(id) {
    return members.filter(function (mm) { return mm.id === id; })[0] || null;
  }

  // Assignments now hold a *list* of tokens per item, so a task can go to
  // several people and/or a whole subteam at once. A token is either a
  // member id, or "team:<team>" for "assign the whole subteam". Old saved
  // data was a single member-id string -- assignmentTokens() upgrades
  // that transparently the first time it's read.
  var TEAM_TOKEN_PREFIX = "team:";

  function assignmentTokens(itemId) {
    var v = assignments[itemId];
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }

  function assignmentTokenLabel(token) {
    if (token.indexOf(TEAM_TOKEN_PREFIX) === 0) {
      var team = token.slice(TEAM_TOKEN_PREFIX.length);
      return TEAM_LABELS[team] || team;
    }
    var m = memberById(token);
    return m ? m.name : null;
  }

  function assignmentSummary(itemId) {
    var labels = assignmentTokens(itemId).map(assignmentTokenLabel).filter(Boolean);
    return labels.length ? labels.join(", ") : "";
  }

  // `light` skips the full render() (used while a checkbox popover is
  // open, so picking several people in a row doesn't close it -- the
  // caller updates just its own button text instead).
  function toggleAssignmentToken(itemId, token, on, light) {
    var tokens = assignmentTokens(itemId).slice();
    var idx = tokens.indexOf(token);
    if (on && idx === -1) tokens.push(token);
    else if (!on && idx !== -1) tokens.splice(idx, 1);
    if (tokens.length) assignments[itemId] = tokens;
    else delete assignments[itemId];
    saveAssignments(assignments);
    if (light) scheduleCloudSave();
    else render();
  }

  function removeMember(idx) {
    var mm = members[idx];
    members.splice(idx, 1);
    saveMembers(members);
    if (mm) {
      Object.keys(assignments).forEach(function (k) {
        var tokens = assignmentTokens(k).filter(function (t) { return t !== mm.id; });
        if (tokens.length) assignments[k] = tokens;
        else delete assignments[k];
      });
      saveAssignments(assignments);
    }
    render();
  }

  function addCustomTask(label, team, dueDate) {
    var task = {
      id: "custom-task-" + Date.now() + Math.floor(Math.random() * 1000),
      label: label,
      team: team || "cross-team",
      dueDate: dueDate || "", // optional "YYYY-MM-DD" -- e.g. a Google Classroom assignment's due date
    };
    customTasks.push(task);
    saveCustomTasks(customTasks);
    render();
  }

  function removeCustomTask(id) {
    customTasks = customTasks.filter(function (t) { return t.id !== id; });
    saveCustomTasks(customTasks);
    delete progress[id];
    delete assignments[id];
    saveProgress(progress);
    saveAssignments(assignments);
    render();
  }

  function removeAllCustomTasks() {
    if (!customTasks.length) return;
    if (!confirm("Delete all " + customTasks.length + " custom task" + (customTasks.length === 1 ? "" : "s") + "? This can't be undone.")) return;
    customTasks.forEach(function (t) {
      delete progress[t.id];
      delete assignments[t.id];
    });
    customTasks = [];
    saveCustomTasks(customTasks);
    saveProgress(progress);
    saveAssignments(assignments);
    render();
  }

  // "Assign to" control: a button showing a summary ("Alex Kim, Jordan
  // Lee", "Mechanical", "Unassigned"...) that opens a checkbox popover --
  // pick any number of individual members and/or whole subteams. Reused
  // inline on checklist rows and in the calendar item modal. Toggling a
  // checkbox saves and refreshes just this control (not a full render()),
  // so the popover stays open while picking several people.
  function buildAssignControl(itemId, onChange) {
    var wrap = el("div", { class: "assign-wrap" });
    wrap.addEventListener("click", function (e) { e.stopPropagation(); });

    var btn = el("button", { type: "button", class: "assign-select" }, [assignmentSummary(itemId) || "Unassigned"]);
    var popover = el("div", { class: "assign-popover", hidden: "" });

    function assignRow(token, label, checked) {
      var rowId = "assign-" + Math.random().toString(36).slice(2);
      var chk = el("input", { type: "checkbox", id: rowId });
      chk.checked = checked;
      chk.addEventListener("change", function () {
        toggleAssignmentToken(itemId, token, chk.checked, true);
        btn.textContent = assignmentSummary(itemId) || "Unassigned";
        if (onChange) onChange();
      });
      return el("label", { class: "assign-popover-row", for: rowId }, [chk, label]);
    }

    function fillPopover() {
      popover.innerHTML = "";
      var tokens = assignmentTokens(itemId);

      if (members.length) {
        popover.appendChild(el("div", { class: "assign-popover-label" }, ["Members"]));
        members.forEach(function (mm) {
          popover.appendChild(assignRow(mm.id, mm.name, tokens.indexOf(mm.id) !== -1));
        });
      } else {
        popover.appendChild(el("p", { class: "assign-popover-hint" }, ["Add team members in Team Settings to assign individuals."]));
      }

      popover.appendChild(el("div", { class: "assign-popover-label" }, ["Whole subteam"]));
      ROSTER_TEAMS.forEach(function (team) {
        var token = TEAM_TOKEN_PREFIX + team;
        popover.appendChild(assignRow(token, TEAM_LABELS[team] || team, tokens.indexOf(token) !== -1));
      });
    }

    btn.addEventListener("click", function () {
      popover.hidden = !popover.hidden;
      if (!popover.hidden) fillPopover();
    });
    popover.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", function () { popover.hidden = true; });

    wrap.appendChild(btn);
    wrap.appendChild(popover);
    return wrap;
  }

  function render() {
    document.getElementById("kickoff-date").textContent = formatDate(anchor);
    renderPace();
    renderProgressBar();
    document.getElementById("checklist-subnav").hidden = viewMode !== "checklist";
    document.getElementById("cal-filter-row").hidden = viewMode !== "calendar";
    document.getElementById("subnav-technical").classList.toggle("active", checklistSub === "technical");
    document.getElementById("subnav-grants").classList.toggle("active", checklistSub === "grants");
    renderPhases();
    renderGrantChecklist();
    renderCalendar();
    renderSettings();
    if (msPanelItem) renderMsPanel();
    scheduleCloudSave();
  }

  function renderPace() {
    var card = document.getElementById("pace-card");
    card.innerHTML = "";

    var completed = milestones.filter(isDone);
    if (completed.length === 0) {
      card.appendChild(el("div", { class: "pace-neutral" }, [
        el("div", { class: "pace-eyebrow" }, ["Pace"]),
        el("div", { class: "pace-headline" }, ["Check off your first milestone to get started"]),
        el("p", {}, ["We'll compare it to when it was recommended and tell you if you're ahead or behind."]),
      ]));
      return;
    }

    var furthest = completed.reduce(function (a, b) { return b.offset > a.offset ? b : a; });
    var pace = daysBetween(today, furthest.date); // positive = date is in the future = ahead

    var tone, headline, sub;
    if (pace > 0) {
      tone = "ahead";
      headline = pace + (pace === 1 ? " day ahead of schedule" : " days ahead of schedule");
      sub = "You've already finished “" + furthest.label + "”, which wasn't due until " + formatDate(furthest.date) + ".";
    } else if (pace < 0) {
      tone = "behind";
      var behind = Math.abs(pace);
      headline = behind + (behind === 1 ? " day behind schedule" : " days behind schedule");
      sub = "Your furthest completed milestone, “" + furthest.label + "”, was recommended for " + formatDate(furthest.date) + ".";
    } else {
      tone = "even";
      headline = "Right on schedule";
      sub = "“" + furthest.label + "” was due today.";
    }

    card.appendChild(el("div", { class: "pace-box pace-" + tone }, [
      el("div", { class: "pace-eyebrow" }, ["Pace"]),
      el("div", { class: "pace-headline" }, [headline]),
      el("p", {}, [sub]),
    ]));
  }

  function renderProgressBar() {
    var done = milestones.filter(isDone).length;
    document.getElementById("progress-label").textContent = done + " of " + milestones.length + " milestones complete";
    var pct = milestones.length ? Math.round((done / milestones.length) * 100) : 0;
    document.getElementById("progress-fill").style.width = pct + "%";
  }

  function statusOf(done, date) {
    var overdue = !done && daysBetween(today, date) < 0;
    return {
      done: done,
      overdue: overdue,
      label: done ? "Done" : overdue ? "Overdue" : "Upcoming",
      cls: done ? "ms-done" : overdue ? "ms-overdue" : "ms-upcoming",
    };
  }

  function renderPhases() {
    var container = document.getElementById("phase-list");
    container.hidden = !(viewMode === "checklist" && checklistSub === "technical");
    if (container.hidden) return;

    var order = ["Preseason", "Build Season", "Competition Season", "Postseason"];
    container.innerHTML = "";

    order.forEach(function (phase) {
      var items = milestones.filter(function (m) { return m.phase === phase; });
      if (!items.length) return;

      var doneCount = items.filter(isDone).length;
      var section = el("section", { class: "phase-section" }, [
        el("div", { class: "phase-head" }, [
          el("h2", {}, [phase]),
          el("span", { class: "phase-count" }, [doneCount + " / " + items.length]),
        ]),
      ]);

      var list = el("div", { class: "milestone-list" });
      items.forEach(function (m) {
        var status = statusOf(isDone(m), m.date);

        var checkbox = el("input", { type: "checkbox", id: "chk-" + m.id, "aria-label": m.label });
        checkbox.checked = status.done;
        checkbox.addEventListener("change", function () { toggleMilestone(m); });

        function openDetails() { openMsPanel(m); }

        var msTeam = m.team || "cross-team";
        var assignSummary = assignmentSummary(m.id);

        var detailsLabel = "Details";
        if (m.subtasks && m.subtasks.length) {
          var subDoneCount = m.subtasks.filter(function (_, i) { return isSubtaskDone(m, i); }).length;
          detailsLabel = "Details (" + subDoneCount + "/" + m.subtasks.length + ")";
        }
        var detailsBtn = el("button", { type: "button", class: "ms-details-btn" }, [detailsLabel]);
        detailsBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openDetails();
        });

        var metaLeftChildren = [
          el("span", { class: "team-badge" }, [
            el("span", { class: "team-dot team-" + msTeam }),
            TEAM_LABELS[msTeam] || msTeam,
          ]),
          el("span", { class: "ms-date" }, [formatDate(m.date)]),
        ];
        if (assignSummary) metaLeftChildren.push(el("span", { class: "ms-assigned" }, ["· " + assignSummary]));

        var body = el("div", { class: "ms-body", tabindex: "0", role: "button" }, [
          el("div", { class: "ms-top" }, [
            el("div", { class: "ms-title-group" }, [
              el("span", { class: "ms-label" }, [m.label]),
            ]),
            el("span", { class: "pill " + status.cls }, [status.label]),
          ]),
          el("div", { class: "ms-meta-row" }, [
            el("div", { class: "ms-meta-left" }, metaLeftChildren),
            detailsBtn,
          ]),
        ]);
        body.addEventListener("click", openDetails);
        body.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDetails();
          }
        });

        var row = el("div", { class: "milestone-row team-edge team-edge-" + (m.team || "cross-team") }, [checkbox, body]);
        list.appendChild(row);
      });

      section.appendChild(list);
      container.appendChild(section);
    });

    // ---- Custom tasks: anything the team added themselves, beyond the
    // curated milestones above -- including a quick way to hand-carry a
    // Google Classroom assignment over here (see the note above the add
    // form). Give one a due date and it also shows up on the calendar. ----
    var customDone = customTasks.filter(function (t) { return !!progress[t.id]; }).length;
    var customSection = el("section", { class: "phase-section" }, [
      el("div", { class: "phase-head" }, [
        el("h2", {}, ["Custom Tasks"]),
        el("div", { class: "phase-head-right" }, [
          el("span", { class: "phase-count" }, [customDone + " / " + customTasks.length]),
          customTasks.length
            ? (function () {
                var btn = el("button", { type: "button", class: "reset-btn" }, ["Delete all"]);
                btn.addEventListener("click", removeAllCustomTasks);
                return btn;
              })()
            : null,
        ]),
      ]),
    ]);

    if (customTasks.length) {
      var customList = el("div", { class: "milestone-list" });
      customTasks.forEach(function (t) {
        var done = !!progress[t.id];
        var chk = el("input", { type: "checkbox", "aria-label": t.label });
        chk.checked = done;
        chk.addEventListener("change", function () { toggleGeneric(t.id); });

        var removeBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Remove"]);
        removeBtn.addEventListener("click", function () { removeCustomTask(t.id); });

        var metaLeftChildren = [buildAssignControl(t.id)];
        if (t.dueDate) {
          metaLeftChildren.unshift(el("span", { class: "ms-date" }, ["Due " + formatDate(new Date(t.dueDate + "T00:00:00"))]));
        }

        var body = el("div", { class: "ms-body" }, [
          el("div", { class: "ms-top" }, [
            el("div", { class: "ms-title-group" }, [
              el("span", { class: done ? "ms-label ms-subtask-done" : "ms-label" }, [t.label]),
              el("span", { class: "team-badge" }, [
                el("span", { class: "team-dot team-" + t.team }),
                TEAM_LABELS[t.team] || t.team,
              ]),
            ]),
          ]),
          el("div", { class: "ms-meta-row" }, [
            el("div", { class: "ms-meta-left" }, metaLeftChildren),
            removeBtn,
          ]),
        ]);

        customList.appendChild(el("div", { class: "milestone-row team-edge team-edge-" + t.team }, [chk, body]));
      });
      customSection.appendChild(customList);
    } else {
      customSection.appendChild(el("p", { class: "finder-hint" }, ["No custom tasks yet — add one below."]));
    }

    customSection.appendChild(el("p", { class: "finder-hint", style: "margin-top:14px;" }, [
      "Quick way to hand off a Google Classroom assignment: paste the title in, add its due date, and it'll show up here and on the calendar — then use \"Assign to\" to say who on the team is actually doing it.",
    ]));

    var addForm = el("form", { class: "custom-task-form" });
    var labelInput = el("input", { type: "text", placeholder: "e.g. Order new bumpers, or paste a Classroom assignment title", maxlength: "80", required: "" });
    var dueDateInput = el("input", { type: "date", "aria-label": "Due date (optional)" });
    var teamSelect = el("select", {}, [
      el("option", { value: "cross-team" }, ["Cross-team"]),
      el("option", { value: "mechanical" }, ["Mechanical"]),
      el("option", { value: "electrical" }, ["Electrical"]),
      el("option", { value: "programming" }, ["Programming"]),
      el("option", { value: "design" }, ["Design/Strategy"]),
      el("option", { value: "business" }, ["Business/Outreach"]),
    ]);
    var addBtn = el("button", { type: "submit", class: "submit-btn-sm" }, ["Add task"]);
    addForm.appendChild(labelInput);
    addForm.appendChild(dueDateInput);
    addForm.appendChild(teamSelect);
    addForm.appendChild(addBtn);
    addForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var val = labelInput.value.trim();
      if (!val) return;
      addCustomTask(val, teamSelect.value, dueDateInput.value);
    });
    customSection.appendChild(addForm);

    // ---- Open Alliance updates: only shown once the team has opted in
    // via Team Settings. Same items that show on the calendar, so
    // checking one off here or there stays in sync. ----
    if (oaSettings.enabled) {
      var oaItems = buildOAItems();
      var oaDone = oaItems.filter(function (o) { return !!progress[o.id]; }).length;
      var oaSection = el("section", { class: "phase-section" }, [
        el("div", { class: "phase-head" }, [
          el("h2", {}, ["Open Alliance Updates"]),
          el("span", { class: "phase-count" }, [oaDone + " / " + oaItems.length]),
        ]),
      ]);
      var oaList = el("div", { class: "milestone-list" });
      oaItems.forEach(function (o) {
        var isVideo = o.kind === "video";
        var date = Core.addDays(anchor, o.offset);
        var chk = el("input", { type: "checkbox", "aria-label": isVideo ? "Post progress video" : "Update build blog" });
        chk.checked = !!progress[o.id];
        chk.addEventListener("change", function () { toggleGeneric(o.id); });
        var body = el("div", { class: "ms-body" }, [
          el("div", { class: "ms-top" }, [
            el("span", { class: "ms-label" }, [isVideo ? "📹 Post progress video" : "📝 Update build blog"]),
            el("span", { class: "ms-date" }, [formatDate(date)]),
          ]),
        ]);
        oaList.appendChild(el("div", { class: "milestone-row team-edge team-edge-business" }, [chk, body]));
      });
      oaSection.appendChild(oaList);
      container.appendChild(oaSection);
    }

    container.appendChild(customSection);
  }

  function renderGrantChecklist() {
    var container = document.getElementById("grant-checklist-view");
    container.hidden = !(viewMode === "checklist" && checklistSub === "grants");
    if (container.hidden) return;

    container.innerHTML = "";

    if (!grantDeadlines.length) {
      container.appendChild(el("p", { class: "finder-hint" }, ["Loading grant deadlines…"]));
      return;
    }

    container.appendChild(el("p", { class: "finder-hint" }, [
      "Every grant with a published close date, soonest first. Dates repeat annually unless the grantor says otherwise — always confirm on the grantor's own site.",
    ]));

    var table = el("div", { class: "dates-table" });
    grantDeadlines.forEach(function (g) {
      var p = g.status === "open" ? { cls: "pill-open", label: "Open" }
        : g.status === "closed" ? { cls: "pill-closed", label: "Closed" }
        : { cls: "pill-unsure", label: "Unsure" };
      var nameLink = el("a", { class: "dname", href: g.link || "#", target: "_blank", rel: "noopener", style: "color:inherit;" }, [g.name]);
      table.appendChild(el("div", { class: "dates-row" }, [
        el("span", { class: "dcode" }, [g.closeDateText]),
        el("span", {}, [
          nameLink,
          el("span", { class: "dsub" }, [g.notes || "See grantor site for criteria"]),
        ]),
        el("span", { class: "pill " + p.cls }, [p.label]),
      ]));
    });
    container.appendChild(table);
  }

  // Open Alliance reminders, generated from oaSettings instead of a fixed
  // weekly cadence: `videoDaysPerWeek` progress-video reminders spread
  // evenly across each week of build season, plus one build-blog reminder
  // per week on the chosen weekday (if the team keeps one at all).
  var OA_SEASON_START = 1;
  var OA_SEASON_END = 49;

  function buildOAItems() {
    var oaItems = [];
    if (!oaSettings.enabled) return oaItems;

    var perWeek = Math.max(1, Math.min(7, oaSettings.videoDaysPerWeek || 1));
    for (var weekStart = OA_SEASON_START; weekStart <= OA_SEASON_END; weekStart += 7) {
      for (var i = 0; i < perWeek; i++) {
        var dayOffset = Math.round(((i + 1) * 7) / (perWeek + 1));
        var day = weekStart + Math.min(6, Math.max(0, dayOffset - 1));
        if (day > OA_SEASON_END) continue;
        oaItems.push({ id: "oa-video-" + day + "-" + i, offset: day, kind: "video" });
      }
    }

    if (oaSettings.blogDay) {
      var targetDow = OA_WEEKDAYS.indexOf(oaSettings.blogDay);
      for (var d = OA_SEASON_START; d <= OA_SEASON_END; d++) {
        if (Core.addDays(anchor, d).getDay() === targetDow) {
          oaItems.push({ id: "oa-blog-" + d, offset: d, kind: "blog" });
        }
      }
    }

    return oaItems;
  }

  // ---- Unified calendar item list: milestones + subtasks + fine-grained
  // daily/weekly goals + Open Alliance reminders + team custom events. ----
  function buildCalendarItems() {
    var items = [];

    items.push({
      id: "kickoff",
      date: anchor, team: "cross-team", kind: "kickoff", big: true,
      short: "🚀 KICKOFF", title: "Kickoff — the season officially begins",
      detail: "FIRST releases this year's game today. Read the manual as a full team, run an early strategy discussion, and get moving on Day 1 tasks.",
      isDone: function () { return today >= anchor; },
      toggle: function () {},
    });

    milestones.forEach(function (m) {
      items.push({
        id: m.id,
        date: m.date, team: m.team || "cross-team", kind: "milestone",
        short: m.short || m.label, title: m.label,
        detail: m.detail, expanded: m.expanded,
        isDone: function () { return isDone(m); },
        toggle: function () { toggleMilestone(m); },
      });
      (m.subtasks || []).forEach(function (sub, idx) {
        items.push({
          id: subtaskKey(m, idx),
          date: m.date, team: sub.team || m.team || "cross-team", kind: "subtask",
          short: sub.label, title: sub.label,
          detail: "Part of the “" + m.label + "” milestone. " + (m.detail || ""),
          isDone: function () { return isSubtaskDone(m, idx); },
          toggle: function () { toggleSubtask(m, idx); },
        });
      });
    });

    var fineGoals = (window.SEASON_FINE_GOALS || []);
    if (window.buildMechanismGoals) {
      fineGoals = fineGoals.concat(window.buildMechanismGoals(mechanisms));
    }
    if (window.buildCompetitionSeasonGoals) {
      fineGoals = fineGoals.concat(window.buildCompetitionSeasonGoals(teamSizes, TEAM_LABELS));
    }

    fineGoals.forEach(function (g) {
      var gDate = Core.addDays(anchor, g.offset);
      items.push({
        id: g.id,
        date: gDate, team: g.team, kind: g.granularity,
        short: g.short, title: g.label,
        detail: g.detail,
        isDone: function () { return !!progress[g.id]; },
        toggle: function () { toggleGeneric(g.id); },
      });
    });

    buildOAItems().forEach(function (o) {
      var oaDate = Core.addDays(anchor, o.offset);
      var isVideo = o.kind === "video";
      items.push({
        id: o.id,
        date: oaDate, team: "business", kind: "oa",
        short: isVideo ? "📹 Post OA Update" : "📝 Update Build Blog",
        title: isVideo ? "Open Alliance: post this week's progress update video" : "Open Alliance: update the build blog",
        detail: isVideo
          ? "Open Alliance teams publicly post a short progress-update video on the cadence your team set in Team Settings."
          : "Open Alliance teams keep a build blog updated on the day your team picked in Team Settings.",
        isDone: function () { return !!progress[o.id]; },
        toggle: function () { toggleGeneric(o.id); },
      });
    });

    customEvents.forEach(function (ce) {
      var ceId = "custom-" + ce.id;
      items.push({
        id: ceId,
        date: new Date(ce.date + "T00:00:00"), team: "custom", kind: "custom",
        short: ce.label, title: ce.label,
        detail: "A custom date your team added to the calendar.",
        isDone: function () { return !!progress[ceId]; },
        toggle: function () { toggleGeneric(ceId); },
      });
    });

    customTasks.forEach(function (t) {
      if (!t.dueDate) return;
      items.push({
        id: t.id,
        date: new Date(t.dueDate + "T00:00:00"), team: t.team || "cross-team", kind: "custom-task",
        short: t.label, title: t.label,
        detail: "A custom task your team added — e.g. a Google Classroom assignment carried over here.",
        isDone: function () { return !!progress[t.id]; },
        toggle: function () { toggleGeneric(t.id); },
      });
    });

    grantDeadlines.forEach(function (g) {
      items.push({
        id: g.id,
        date: g.date, team: "business", kind: "grant", category: "grant",
        short: "💰 " + g.name, title: g.name + " — grant deadline",
        detail: (g.notes ? g.notes + " " : "") + "Status: " + (g.status || "unknown") + ". Always confirm on the grantor's own site.",
        isDone: function () { return !!progress[g.id]; },
        toggle: function () { toggleGeneric(g.id); },
      });
    });

    return items;
  }

  function renderCalendar() {
    var container = document.getElementById("calendar-view");
    var legend = document.getElementById("cal-legend");
    container.hidden = viewMode !== "calendar";
    legend.hidden = viewMode !== "calendar";
    if (viewMode !== "calendar") return;

    container.innerHTML = "";

    var monthLabel = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    var prevBtn = el("button", { type: "button", class: "cal-nav", "aria-label": "Previous month" }, ["←"]);
    var nextBtn = el("button", { type: "button", class: "cal-nav", "aria-label": "Next month" }, ["→"]);
    prevBtn.addEventListener("click", function () {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    nextBtn.addEventListener("click", function () {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
      renderCalendar();
    });

    var todayBtn = el("button", { type: "button", class: "cal-today-btn" }, ["Today"]);
    todayBtn.addEventListener("click", function () {
      calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      renderCalendar();
    });

    container.appendChild(el("div", { class: "cal-header" }, [
      prevBtn,
      el("div", { class: "cal-month-label" }, [monthLabel]),
      nextBtn,
      todayBtn,
    ]));

    var grid = el("div", { class: "cal-grid" });
    DOW.forEach(function (d) { grid.appendChild(el("div", { class: "cal-dow" }, [d])); });

    var firstOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    var startDow = firstOfMonth.getDay();
    var daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();

    var items = buildCalendarItems();
    var byDay = {};
    items.forEach(function (item) {
      var isGrant = item.category === "grant";
      if (isGrant ? !calFilters.grants : !calFilters.technical) return;
      if (item.date.getFullYear() === calendarMonth.getFullYear() && item.date.getMonth() === calendarMonth.getMonth()) {
        var d = item.date.getDate();
        (byDay[d] = byDay[d] || []).push(item);
      }
    });

    for (var i = 0; i < startDow; i++) grid.appendChild(el("div", { class: "cal-cell cal-empty" }));

    for (var day = 1; day <= daysInMonth; day++) {
      var cellDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
      var isToday = daysBetween(today, cellDate) === 0;
      var cell = el("div", { class: "cal-cell" + (isToday ? " cal-today" : "") }, [
        el("div", { class: "cal-daynum" }, [String(day)]),
      ]);

      (byDay[day] || []).forEach(function (item) {
        if (item.big) {
          var bigChip = el("button", {
            type: "button",
            class: "cal-chip cal-chip-big",
            title: item.title,
          }, [item.short]);
          bigChip.addEventListener("click", function () { openItemModal(item); });
          cell.appendChild(bigChip);
          return;
        }

        var assignSummary = assignmentSummary(item.id);
        var chipText = item.short + (assignSummary ? " · " + assignSummary.split(",")[0].split(" ")[0] + (assignSummary.indexOf(",") !== -1 ? " +" + (assignSummary.split(",").length - 1) : "") : "");
        var chipTitle = item.title + (assignSummary ? " — assigned to " + assignSummary : "");

        var done = item.isDone();
        var status = statusOf(done, item.date);
        var chip = el("button", {
          type: "button",
          class: "cal-chip " + status.cls + " team-edge team-edge-" + item.team,
          title: chipTitle,
        }, [chipText]);
        chip.addEventListener("click", function () { openItemModal(item); });
        cell.appendChild(chip);
      });

      grid.appendChild(cell);
    }

    container.appendChild(grid);
    renderLegend();
  }

  function renderLegend() {
    var legend = document.getElementById("cal-legend");
    legend.innerHTML = "";
    ["design", "mechanical", "electrical", "programming", "business", "cross-team", "custom"].forEach(function (team) {
      legend.appendChild(el("span", { class: "legend-item" }, [
        el("span", { class: "team-dot team-" + team }),
        TEAM_LABELS[team],
      ]));
    });
  }

  // ---- Calendar item detail popup ----
  var modalOverlay = document.getElementById("cal-modal-overlay");
  var modalItem = null;

  // Builds a Google Calendar "quick add" link for a single item -- opens
  // Google's pre-filled event form in a new tab, no file download needed.
  // (Apple/Outlook users still need the .ics export, since there's no
  // equivalent one-click URL scheme for those.)
  function googleCalendarUrl(item) {
    var start = icsDate(item.date);
    var end = icsDate(new Date(item.date.getTime() + 24 * 60 * 60 * 1000));
    var assignSummary = assignmentSummary(item.id);
    var details = item.detail || "";
    if (item.expanded) details += (details ? "\n\n" : "") + item.expanded;
    if (assignSummary) details += (details ? "\n\n" : "") + "Assigned to: " + assignSummary;

    var params = [
      "action=TEMPLATE",
      "text=" + encodeURIComponent(item.title),
      "dates=" + start + "/" + end,
      "details=" + encodeURIComponent(details),
    ];
    return "https://calendar.google.com/calendar/render?" + params.join("&");
  }

  function openItemModal(item) {
    modalItem = item;

    var team = item.team || "cross-team";
    document.getElementById("cal-modal-date").textContent = formatDate(item.date);
    document.getElementById("cal-modal-title").textContent = item.title;

    var teamRow = document.getElementById("cal-modal-team");
    teamRow.innerHTML = "";
    teamRow.appendChild(el("span", { class: "team-badge" }, [
      el("span", { class: "team-dot team-" + team }),
      TEAM_LABELS[team] || team,
    ]));

    var body = document.getElementById("cal-modal-body");
    body.innerHTML = "";
    if (item.detail) body.appendChild(el("p", { class: "ms-detail" }, [item.detail]));
    if (item.expanded) body.appendChild(el("p", { class: "ms-expanded" }, [item.expanded]));

    document.getElementById("cal-modal-gcal").href = googleCalendarUrl(item);

    var toggleBtn = document.getElementById("cal-modal-toggle");
    var assignRow = document.getElementById("cal-modal-assign-row");
    if (item.big) {
      toggleBtn.hidden = true;
      assignRow.hidden = true;
    } else {
      toggleBtn.hidden = false;
      assignRow.hidden = false;
      refreshModalToggle();
      var assignControlHost = document.getElementById("cal-modal-assign-control");
      assignControlHost.innerHTML = "";
      assignControlHost.appendChild(buildAssignControl(item.id, function () {
        document.getElementById("cal-modal-gcal").href = googleCalendarUrl(item);
      }));
    }

    modalOverlay.hidden = false;
  }

  function refreshModalToggle() {
    if (!modalItem || modalItem.big) return;
    var done = modalItem.isDone();
    var toggleBtn = document.getElementById("cal-modal-toggle");
    toggleBtn.textContent = done ? "Mark not done" : "Mark done";
    toggleBtn.className = "submit-btn-sm" + (done ? " submit-btn-ghost" : "");
  }

  function closeItemModal() {
    modalOverlay.hidden = true;
    modalItem = null;
  }

  document.getElementById("cal-modal-close").addEventListener("click", closeItemModal);
  modalOverlay.addEventListener("click", function (e) {
    if (e.target === modalOverlay) closeItemModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modalOverlay.hidden) closeItemModal();
  });
  document.getElementById("cal-modal-toggle").addEventListener("click", function () {
    if (!modalItem) return;
    modalItem.toggle();
    render();
    refreshModalToggle();
  });

  // ---- Milestone detail side panel -- replaces the old inline
  // "More detail" expansion. Sub-tasks stay collapsed behind their own
  // toggle inside the panel, so assigning them out doesn't have to
  // compete with the milestone's own detail text for space. ----
  var msPanelOverlay = document.getElementById("ms-panel-overlay");
  var msPanelItem = null;
  var msPanelSubtasksOpen = false;

  function openMsPanel(m) {
    msPanelItem = m;
    msPanelSubtasksOpen = true;
    renderMsPanel();
    msPanelOverlay.hidden = false;
  }

  function closeMsPanel() {
    msPanelOverlay.hidden = true;
    msPanelItem = null;
  }

  function renderMsPanel() {
    var m = msPanelItem;
    if (!m) return;
    var status = statusOf(isDone(m), m.date);
    var msTeam = m.team || "cross-team";

    document.getElementById("ms-panel-date").textContent = "Recommended: " + formatDate(m.date);
    document.getElementById("ms-panel-title").textContent = m.label;

    var teamRow = document.getElementById("ms-panel-team");
    teamRow.innerHTML = "";
    teamRow.appendChild(el("span", { class: "team-badge" }, [
      el("span", { class: "team-dot team-" + msTeam }),
      TEAM_LABELS[msTeam] || msTeam,
    ]));
    teamRow.appendChild(el("span", { class: "pill " + status.cls }, [status.label]));

    var body = document.getElementById("ms-panel-body");
    body.innerHTML = "";
    if (m.detail) body.appendChild(el("p", { class: "ms-detail" }, [m.detail]));
    if (m.expanded) body.appendChild(el("p", { class: "ms-expanded" }, [m.expanded]));

    var assignHost = document.getElementById("ms-panel-assign-control");
    assignHost.innerHTML = "";
    assignHost.appendChild(buildAssignControl(m.id));

    var subSection = document.getElementById("ms-panel-subtasks-section");
    var subToggle = document.getElementById("ms-panel-subtasks-toggle");
    var subList = document.getElementById("ms-panel-subtasks-list");
    if (m.subtasks && m.subtasks.length) {
      subSection.hidden = false;
      var doneCount = m.subtasks.filter(function (_, i) { return isSubtaskDone(m, i); }).length;
      subToggle.textContent = (msPanelSubtasksOpen ? "Hide sub-tasks" : "See specific sub-tasks") + " (" + doneCount + "/" + m.subtasks.length + ")";
      subList.hidden = !msPanelSubtasksOpen;
      subList.innerHTML = "";
      if (msPanelSubtasksOpen) {
        m.subtasks.forEach(function (sub, idx) {
          var subDone = isSubtaskDone(m, idx);
          var subId = "panel-chk-" + m.id + "-sub" + idx;
          var subTeam = sub.team || m.team || "cross-team";
          var subChk = el("input", { type: "checkbox", id: subId });
          subChk.checked = subDone;
          subChk.addEventListener("change", function () { toggleSubtask(m, idx); });

          subList.appendChild(el("label", { class: "ms-subtask-row", for: subId }, [
            subChk,
            el("span", { class: "team-dot team-" + subTeam }),
            el("span", { class: "team-tag" }, [TEAM_LABELS[subTeam] || subTeam]),
            el("span", { class: subDone ? "ms-subtask-text ms-subtask-done" : "ms-subtask-text" }, [sub.label]),
            buildAssignControl(subtaskKey(m, idx)),
          ]));
        });
      }
    } else {
      subSection.hidden = true;
    }

    var toggleBtn = document.getElementById("ms-panel-toggle");
    toggleBtn.textContent = status.done ? "Mark not done" : "Mark done";
    toggleBtn.className = "submit-btn-sm" + (status.done ? " submit-btn-ghost" : "");
  }

  document.getElementById("ms-panel-close").addEventListener("click", closeMsPanel);
  msPanelOverlay.addEventListener("click", function (e) {
    if (e.target === msPanelOverlay) closeMsPanel();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !msPanelOverlay.hidden) closeMsPanel();
  });
  document.getElementById("ms-panel-subtasks-toggle").addEventListener("click", function () {
    msPanelSubtasksOpen = !msPanelSubtasksOpen;
    renderMsPanel();
  });
  document.getElementById("ms-panel-toggle").addEventListener("click", function () {
    if (!msPanelItem) return;
    toggleMilestone(msPanelItem);
  });

  var ROSTER_TEAMS = ["mechanical", "electrical", "programming", "design", "business"];

  function renderSettings() {
    document.getElementById("oa-checkbox").checked = oaSettings.enabled;
    document.getElementById("oa-details").hidden = !oaSettings.enabled;
    var oaVideoDaysInput = document.getElementById("oa-video-days");
    if (document.activeElement !== oaVideoDaysInput) oaVideoDaysInput.value = oaSettings.videoDaysPerWeek;
    document.getElementById("oa-blog-day").value = oaSettings.blogDay;

    ROSTER_TEAMS.forEach(function (team) {
      var input = document.getElementById("roster-" + team);
      if (input && document.activeElement !== input) input.value = teamSizes[team];
    });

    var mechList = document.getElementById("mechanism-list");
    mechList.innerHTML = "";
    mechanisms.forEach(function (m, idx) {
      var chip = el("span", { class: "mechanism-chip" }, [m]);
      var removeBtn = el("button", { type: "button", class: "mechanism-remove", "aria-label": "Remove " + m }, ["×"]);
      removeBtn.addEventListener("click", function () { removeMechanism(idx); });
      chip.appendChild(removeBtn);
      mechList.appendChild(chip);
    });

    var memberListEl = document.getElementById("member-list");
    memberListEl.innerHTML = "";
    members.forEach(function (mm, idx) {
      var chip = el("span", { class: "member-chip" }, [
        el("span", { class: "team-dot team-" + mm.team }),
        mm.name,
      ]);
      var removeBtn = el("button", { type: "button", class: "member-remove", "aria-label": "Remove " + mm.name }, ["×"]);
      removeBtn.addEventListener("click", function () { removeMember(idx); });
      chip.appendChild(removeBtn);
      memberListEl.appendChild(chip);
    });

    var list = document.getElementById("custom-event-list");
    list.innerHTML = "";
    if (!customEvents.length) return;

    customEvents
      .slice()
      .sort(function (a, b) { return a.date.localeCompare(b.date); })
      .forEach(function (ce) {
        var row = el("div", { class: "custom-event-item" }, [
          el("span", {}, [ce.label + " — " + formatDate(new Date(ce.date + "T00:00:00"))]),
        ]);
        var removeBtn = el("button", { type: "button", class: "custom-event-remove", "aria-label": "Remove" }, ["×"]);
        removeBtn.addEventListener("click", function () { removeCustomEvent(ce.id); });
        row.appendChild(removeBtn);
        list.appendChild(row);
      });
  }

  document.getElementById("season-reset").addEventListener("click", function () {
    if (!confirm("Clear all season progress? This also clears your synced copy if you're signed in.")) return;
    progress = {};
    saveProgress(progress);
    render();
  });

  document.getElementById("view-tab-checklist").addEventListener("click", function () {
    viewMode = "checklist";
    document.getElementById("view-tab-checklist").classList.add("active");
    document.getElementById("view-tab-calendar").classList.remove("active");
    render();
  });
  document.getElementById("view-tab-calendar").addEventListener("click", function () {
    viewMode = "calendar";
    document.getElementById("view-tab-calendar").classList.add("active");
    document.getElementById("view-tab-checklist").classList.remove("active");
    render();
  });

  document.getElementById("goto-kickoff").addEventListener("click", function () {
    viewMode = "calendar";
    document.getElementById("view-tab-calendar").classList.add("active");
    document.getElementById("view-tab-checklist").classList.remove("active");
    calendarMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    render();
  });

  document.getElementById("settings-toggle").addEventListener("click", function () {
    var panel = document.getElementById("team-settings");
    panel.hidden = !panel.hidden;
  });

  document.getElementById("oa-checkbox").addEventListener("change", function (e) {
    oaSettings.enabled = e.target.checked;
    saveOASettings(oaSettings);
    render();
  });

  document.getElementById("oa-video-days").addEventListener("change", function (e) {
    var n = parseInt(e.target.value, 10);
    oaSettings.videoDaysPerWeek = isNaN(n) ? 1 : Math.max(1, Math.min(7, n));
    saveOASettings(oaSettings);
    render();
  });

  document.getElementById("oa-blog-day").addEventListener("change", function (e) {
    oaSettings.blogDay = e.target.value;
    saveOASettings(oaSettings);
    render();
  });

  ROSTER_TEAMS.forEach(function (team) {
    var input = document.getElementById("roster-" + team);
    if (!input) return;
    input.addEventListener("change", function (e) {
      var n = parseInt(e.target.value, 10);
      teamSizes[team] = isNaN(n) || n < 0 ? 0 : n;
      saveTeamSizes(teamSizes);
      render();
    });
  });

  document.getElementById("custom-event-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var labelInput = document.getElementById("custom-event-label");
    var dateInput = document.getElementById("custom-event-date");
    if (!labelInput.value.trim() || !dateInput.value) return;

    customEvents.push({
      id: "ce" + Date.now() + Math.floor(Math.random() * 1000),
      label: labelInput.value.trim(),
      date: dateInput.value,
    });
    saveCustomEvents(customEvents);
    labelInput.value = "";
    dateInput.value = "";
    render();
  });

  document.getElementById("quick-add-reveal").addEventListener("click", function () {
    document.getElementById("custom-event-label").value = "Robot Reveal";
    document.getElementById("custom-event-date").focus();
  });

  document.getElementById("mechanism-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = document.getElementById("mechanism-label");
    var val = input.value.trim();
    if (!val) return;
    if (mechanisms.some(function (m) { return m.toLowerCase() === val.toLowerCase(); })) {
      input.value = "";
      return;
    }
    mechanisms.push(val);
    saveMechanisms(mechanisms);
    input.value = "";
    render();
  });

  document.getElementById("member-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var nameInput = document.getElementById("member-name");
    var teamSelect = document.getElementById("member-team");
    var name = nameInput.value.trim();
    if (!name) return;

    members.push({
      id: "mem" + Date.now() + Math.floor(Math.random() * 1000),
      name: name,
      team: teamSelect.value,
    });
    saveMembers(members);
    nameInput.value = "";
    render();
  });

  // ---- Calendar export (.ics) ----
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function icsDate(d) { return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()); }
  function icsEscape(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }

  function buildICS() {
    var items = buildCalendarItems();
    var now = new Date();
    var stamp = icsDate(now) + "T" + pad2(now.getUTCHours()) + pad2(now.getUTCMinutes()) + pad2(now.getUTCSeconds()) + "Z";
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FRC Hub//Season Tracker//EN", "CALSCALE:GREGORIAN"];

    items.forEach(function (item) {
      var start = icsDate(item.date);
      var end = icsDate(new Date(item.date.getTime() + 24 * 60 * 60 * 1000));
      var assignSummary = assignmentSummary(item.id);
      var desc = item.detail || "";
      if (assignSummary) desc += (desc ? "\n\n" : "") + "Assigned to: " + assignSummary;

      lines.push(
        "BEGIN:VEVENT",
        "UID:" + item.id + "@frcgrants-season-tracker",
        "DTSTAMP:" + stamp,
        "DTSTART;VALUE=DATE:" + start,
        "DTEND;VALUE=DATE:" + end,
        "SUMMARY:" + icsEscape(item.title),
        "DESCRIPTION:" + icsEscape(desc),
        "END:VEVENT"
      );
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  document.getElementById("ics-export-btn").addEventListener("click", function () {
    var blob = new Blob([buildICS()], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "frc-season-tracker.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById("subnav-technical").addEventListener("click", function () {
    checklistSub = "technical";
    render();
  });
  document.getElementById("subnav-grants").addEventListener("click", function () {
    checklistSub = "grants";
    render();
  });

  document.getElementById("cal-filter-technical").addEventListener("change", function (e) {
    calFilters.technical = e.target.checked;
    saveCalFilters(calFilters);
    renderCalendar();
  });
  document.getElementById("cal-filter-grants").addEventListener("change", function (e) {
    calFilters.grants = e.target.checked;
    saveCalFilters(calFilters);
    renderCalendar();
  });
  document.getElementById("cal-filter-technical").checked = calFilters.technical;
  document.getElementById("cal-filter-grants").checked = calFilters.grants;

  render();
  initCloudSync();
  loadGrantDeadlines();
})();
