// Assignments page: "what do I personally have to do" -- a focused view
// on top of two existing concepts plus one new one.
//
// 1. Daily assignments (new): a team's mentors/captains set up a small
//    list of recurring to-dos (e.g. "log today's build hours"). Every
//    applicable member gets a fresh checkbox for it each calendar day.
//    Stored as `dailyTemplates` in team_data (captains' definitions) with
//    completions recorded per-person-per-day in the existing `progress`
//    map under a "daily:<templateId>:<date>:<userId>" key -- it has to be
//    per-person (unlike every other progress key on this site, which is
//    one shared flag for whoever gets to it first) since "assigned to
//    everyone" would otherwise let one person's checkbox mark it done for
//    the whole team.
// 2. Season Tracker milestones and custom tasks that are already assigned
//    to you there (js/season.js) -- surfaced here without the full
//    calendar UI around them.
//
// Reuses js/season-core.js (Core) for milestone dates/progress and
// js/team.js (Team) for membership + the team_data store. Deliberately
// does not import js/season.js itself (2000+ lines of calendar-building
// this page doesn't need) -- instead it duplicates the handful of
// localStorage keys/shapes season.js also reads, the same way
// season-core.js and season.js already each define their own copies of
// MILESTONE_OVERRIDES_KEY/HIDDEN_MILESTONES_KEY.
(function () {
  "use strict";

  var Core = window.SeasonCore;
  var Team = window.FRCTeam;
  if (!Core || !Team) return;

  var ASSIGN_KEY = "frcgrants_season_assignments_v1";
  var CUSTOM_TASKS_KEY = "frcgrants_season_custom_tasks_v1";
  var TEAM_TOKEN_PREFIX = "team:";

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

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function dailyProgressKey(templateId, userId) {
    return "daily:" + templateId + ":" + todayISO() + ":" + userId;
  }

  function loadLocalAssignments() {
    try { return JSON.parse(localStorage.getItem(ASSIGN_KEY) || "{}"); } catch (e) { return {}; }
  }
  function loadLocalCustomTasks() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_TASKS_KEY) || "[]"); } catch (e) { return []; }
  }

  function assignmentTokens(assignments, id) {
    var v = assignments[id];
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }

  // Broader than Season Tracker's own "Mine" filter (which only matches
  // your exact user id): this page also surfaces whole-subteam
  // assignments for your subteam, since "assigned to Mechanical" is
  // exactly the kind of thing a Mechanical student needs to see here.
  function isAssignedToMe(tokens, myId, mySubteam) {
    if (!tokens.length) return false;
    if (myId && tokens.indexOf(myId) !== -1) return true;
    if (mySubteam && tokens.indexOf(TEAM_TOKEN_PREFIX + mySubteam) !== -1) return true;
    return false;
  }

  // ---- Team_data read/write. Every write re-reads first and patches
  // just the field(s) it cares about -- team_data's `data` column is one
  // JSONB blob shared with Season Tracker/Budget/etc., and saveTeamData
  // replaces it wholesale, so writing anything less than the full
  // current snapshot would silently wipe out everyone else's fields. ----

  function patchTeamData(mutator) {
    return Team.loadTeamData().then(function (current) {
      var data = Object.assign({}, current || {});
      mutator(data);
      return Team.saveTeamData(data);
    });
  }

  function toggleProgressKey(key, on) {
    if (Team.state.team) {
      return patchTeamData(function (data) {
        var progress = Object.assign({}, data.progress || {});
        if (on) progress[key] = true; else delete progress[key];
        data.progress = progress;
      });
    }
    var progress = Core.loadProgress();
    if (on) progress[key] = true; else delete progress[key];
    Core.saveProgress(progress);
    return Promise.resolve();
  }

  // ---- "Your tasks": milestones + custom tasks already assigned to you
  // in Season Tracker, not yet done. ----

  // Open and finished Season Tracker items for one person. `direct` limits
  // matching to tasks with that exact user id (used for mentors, who aren't
  // part of any subteam's workload).
  function collectTasks(data, uid, subteam, direct) {
    var team = !!Team.state.team;
    var progress = team ? (data && data.progress) || {} : Core.loadProgress();
    var assignments = team ? (data && data.assignments) || {} : loadLocalAssignments();
    var customTasks = team ? (data && data.customTasks) || [] : loadLocalCustomTasks();
    var today = Core.startOfDay(new Date());
    var open = [], done = [];
    function consider(id, label, date) {
      if (!isAssignedToMe(assignmentTokens(assignments, id), uid, direct ? null : subteam)) return;
      var item = { id: id, label: label, date: date, overdue: !!date && Core.daysBetween(today, date) < 0 };
      (progress[id] ? done : open).push(item);
    }
    Core.getMilestonesWithDates().forEach(function (m) { consider(m.id, m.label, m.date); });
    customTasks.forEach(function (t) { consider(t.id, t.label, t.dueDate ? new Date(t.dueDate + "T00:00:00") : null); });
    open.sort(function (a, b) {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date - b.date;
    });
    return { open: open, done: done };
  }

  function renderTasksSection(myId, mySubteam, direct) {
    var list = document.getElementById("my-tasks-list");
    var empty = document.getElementById("my-tasks-empty");
    list.innerHTML = "";

    var teamDataPromise = Team.state.team ? Team.loadTeamData() : Promise.resolve(null);
    teamDataPromise.then(function (data) {
      var items = collectTasks(data, myId, mySubteam, direct).open;

      // Mentors only see this section when something is assigned to them.
      document.getElementById("tasks-section").hidden = direct && items.length === 0;
      empty.hidden = items.length > 0;
      items.forEach(function (item) {
        var checkbox = el("input", { type: "checkbox" });
        checkbox.addEventListener("change", function () {
          toggleProgressKey(item.id, true).then(function () { renderTasksSection(myId, mySubteam, direct); });
        });
        var meta = [];
        if (item.date) meta.push(el("span", { class: "ms-date" + (item.overdue ? " is-overdue" : "") }, [item.overdue ? "Overdue" : Core.formatDate(item.date)]));
        list.appendChild(el("label", { class: "milestone-row" }, [
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

  // ---- "Today": daily assignments assigned to me or my subteam. ----

  function appliesToMe(tpl, myId, mySubteam, direct) {
    if (!tpl.active) return false;
    if (direct) return !!myId && tpl.assignTo === myId;
    if (tpl.assignTo === "everyone") return true;
    if (myId && tpl.assignTo === myId) return true;
    if (mySubteam && tpl.assignTo === mySubteam) return true;
    return false;
  }

  function renderDailySection(myId, mySubteam, direct) {
    var list = document.getElementById("daily-list");
    var empty = document.getElementById("daily-empty");
    list.innerHTML = "";

    Team.loadTeamData().then(function (data) {
      var templates = (data && data.dailyTemplates) || [];
      var progress = (data && data.progress) || {};
      var mine = templates.filter(function (t) { return appliesToMe(t, myId, mySubteam, direct); });

      // Mentors only see this section when something is assigned to them.
      document.getElementById("daily-section").hidden = direct && mine.length === 0;
      empty.hidden = mine.length > 0;
      mine.forEach(function (tpl) {
        var key = dailyProgressKey(tpl.id, myId);
        var done = !!progress[key];
        var checkbox = el("input", { type: "checkbox" });
        checkbox.checked = done;
        checkbox.addEventListener("change", function () {
          toggleProgressKey(key, checkbox.checked).then(function () { renderDailySection(myId, mySubteam, direct); });
        });
        list.appendChild(el("label", { class: "milestone-row" }, [
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
    });
  }

  // ---- Mentor notes + robot progress (read-only here; mentors and
  // captains edit them on the Team page). ----

  function renderTeamExtras(myId, mySubteam) {
    var notesSection = document.getElementById("notes-section");
    var robotSection = document.getElementById("robot-section");
    notesSection.hidden = false;
    robotSection.hidden = false;

    Promise.all([Team.loadTeamData(), Team.loadRoster()]).then(function (res) {
      var data = res[0] || {};

      var notesList = document.getElementById("notes-list");
      notesList.innerHTML = "";
      var notes = (data.mentorNotes || []).filter(function (n) {
        return n.audience === "everyone" || n.audience === myId || (!!mySubteam && n.audience === mySubteam) || Team.isMentor();
      }).slice().reverse();
      document.getElementById("notes-empty").hidden = notes.length > 0;
      notes.forEach(function (n) {
        var meta = n.audience === "everyone" ? "Whole team" : (n.audience === myId ? "Just for you" : "Your subteam");
        if (n.createdAt) meta += " · " + Core.formatDate(new Date(n.createdAt));
        notesList.appendChild(el("div", { class: "thread-row" }, [
          el("div", { class: "thread-row-main" }, [
            el("span", { class: "thread-title" }, [n.text]),
            el("span", { class: "thread-meta" }, [meta]),
          ]),
        ]));
      });

      var robotList = document.getElementById("robot-list");
      robotList.innerHTML = "";
      var items = data.robotProgress || [];
      document.getElementById("robot-empty").hidden = items.length > 0;
      var total = 0;
      items.forEach(function (it) {
        var pct = Math.max(0, Math.min(100, Number(it.percent) || 0));
        total += pct;
        var fill = el("div", { class: "robot-bar-fill" });
        fill.style.width = pct + "%";
        robotList.appendChild(el("div", { class: "robot-row" }, [
          el("div", { class: "robot-row-top" }, [el("span", { class: "robot-label" }, [it.label]), el("span", { class: "robot-pct" }, [pct + "%"])]),
          el("div", { class: "robot-bar" }, [fill]),
        ]));
      });
      if (items.length) {
        var overall = Math.round(total / items.length);
        robotList.insertBefore(el("div", { class: "robot-overall" }, ["Overall: " + overall + "% complete"]), robotList.firstChild);
      }
    });
  }

  // ---- Mentor view: per-student review. ----

  var SUBTEAM_NAMES = { mechanical: "Mechanical", electrical: "Electrical", programming: "Programming", design: "Design", business: "Business" };

  function studentName(r) { return (r.profile && r.profile.display_name) || "Member"; }

  function postNoteFor(uid, text) {
    return patchTeamData(function (d) {
      var notes = (d.mentorNotes || []).slice();
      notes.push({ id: "note-" + Date.now() + "-" + Math.floor(Math.random() * 1000), text: text, audience: uid, createdAt: new Date().toISOString(), createdBy: Team.state.user.id });
      d.mentorNotes = notes;
    });
  }

  function renderReviewSection() {
    var section = document.getElementById("review-section");
    var list = document.getElementById("review-list");
    section.hidden = false;

    Promise.all([Team.loadTeamData(), Team.loadRoster()]).then(function (res) {
      var data = res[0] || {};
      var students = (res[1] || []).filter(function (r) { return r.role === "student"; });
      var templates = data.dailyTemplates || [];
      var progress = data.progress || {};
      var notes = data.mentorNotes || [];

      // Keep open cards open across re-renders.
      var openIds = {};
      Array.prototype.forEach.call(list.querySelectorAll("details[open]"), function (d) { openIds[d.getAttribute("data-uid")] = true; });
      list.innerHTML = "";
      document.getElementById("review-empty").hidden = students.length > 0;

      students.forEach(function (r) {
        var tasks = collectTasks(data, r.user_id, r.subteam, false);
        var daily = templates.filter(function (t) { return appliesToMe(t, r.user_id, r.subteam, false); });
        var dailyDone = daily.filter(function (t) { return progress[dailyProgressKey(t.id, r.user_id)]; }).length;
        var overdue = tasks.open.filter(function (t) { return t.overdue; }).length;
        var totalTasks = tasks.open.length + tasks.done.length;
        var pct = totalTasks ? Math.round(tasks.done.length / totalTasks * 100) : 0;
        var mine = notes.filter(function (n) { return n.audience === r.user_id; }).slice().reverse();

        var summary = el("summary", { class: "review-summary" }, [
          el("span", { class: "review-name" }, [studentName(r)]),
          r.subteam && r.subteam !== "cross-team" ? el("span", { class: "role-badge" }, [SUBTEAM_NAMES[r.subteam] || r.subteam]) : null,
          el("span", { class: "review-stats" }, [
            "Today " + dailyDone + "/" + daily.length + " · " + tasks.done.length + "/" + totalTasks + " tasks done" + (overdue ? " · " : ""),
            overdue ? el("span", { class: "is-overdue" }, [overdue + " overdue"]) : null,
          ]),
        ]);

        var bar = el("div", { class: "robot-bar" }, []);
        var fill = el("div", { class: "robot-bar-fill" });
        fill.style.width = pct + "%";
        bar.appendChild(fill);

        var openList = el("div", { class: "review-tasks" }, tasks.open.length ? tasks.open.map(function (t) {
          return el("div", { class: "review-task" }, [
            el("span", {}, [t.label]),
            t.date ? el("span", { class: "ms-date" + (t.overdue ? " is-overdue" : "") }, [t.overdue ? "Overdue" : Core.formatDate(t.date)]) : null,
          ]);
        }) : [el("p", { class: "finder-hint" }, ["Nothing outstanding."])]);

        var input = el("input", { type: "text", placeholder: "Log a note for " + studentName(r), maxlength: "500", required: "required" });
        var form = el("form", { class: "custom-task-form" }, [input, el("button", { type: "submit", class: "submit-btn-sm" }, ["Log note"])]);
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var text = input.value.trim();
          if (!text) return;
          postNoteFor(r.user_id, text).then(renderReviewSection);
        });

        var noteRows = mine.slice(0, 3).map(function (n) {
          return el("div", { class: "thread-row" }, [el("div", { class: "thread-row-main" }, [
            el("span", { class: "thread-title" }, [n.text]),
            el("span", { class: "thread-meta" }, [n.createdAt ? Core.formatDate(new Date(n.createdAt)) : ""]),
          ])]);
        });

        var card = el("details", { class: "review-card", "data-uid": r.user_id }, [
          summary, bar, openList, form,
          noteRows.length ? el("div", { class: "thread-list" }, noteRows) : null,
        ]);
        if (openIds[r.user_id]) card.setAttribute("open", "");
        list.appendChild(card);
      });
    });
  }

  // ---- Page bootstrap ----

  function render() {
    var myId = Team.state.user && Team.state.user.id;
    document.getElementById("assignments-signed-out").hidden = !!myId;
    document.getElementById("assignments-app").hidden = !myId;
    if (!myId) return;

    var mySubteam = Team.state.membership && Team.state.membership.subteam;
    var hasTeam = !!Team.state.team;

    // Mentors review students instead of carrying their own workload; only
    // items assigned to them directly still show up here.
    var isMentor = hasTeam && Team.isMentor();
    document.getElementById("review-section").hidden = !isMentor;
    document.getElementById("assignments-head-sub").textContent = isMentor
      ? "Review how each student is doing and log notes. Anything assigned directly to you still appears below."
      : "Today's daily assignments, plus any Season Tracker tasks and milestones assigned to you. (The Season Tracker is a sample plan your team can add to, edit, and remove from.)";
    if (isMentor) renderReviewSection();

    renderTasksSection(myId, mySubteam, isMentor);

    document.getElementById("notes-section").hidden = !hasTeam || isMentor;
    document.getElementById("robot-section").hidden = !hasTeam;
    if (hasTeam) renderTeamExtras(myId, mySubteam);

    document.getElementById("daily-section").hidden = !hasTeam;
    document.getElementById("daily-no-team").hidden = hasTeam;
    if (hasTeam) renderDailySection(myId, mySubteam, isMentor);

    var canManage = hasTeam && (Team.isMentor() || Team.captainScope().length > 0);
    document.getElementById("manage-hint").hidden = !canManage;
  }

  Team.ready.then(render);
  Team.onChange(render);
})();
