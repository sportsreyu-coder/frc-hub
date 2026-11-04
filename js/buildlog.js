// Build log: students self-report when they started and ended a task (and
// any breaks in between); mentors read the log and attach notes to entries
// ("incorrect", "unlogged break at 4:30", ...).
//
// Stored as `buildLog` in team_data, one array of entries shared by the whole
// team. Like Daily Assignments (js/assignments.js), every write re-reads
// team_data and patches only `buildLog`, since saveTeamData replaces the whole
// JSONB blob that Season Tracker/Budget/etc. also live in.
//
//   entry = { id, userId, task, start, end|null, breaks: [{ id, start, end|null }],
//             notes: [{ id, text, by, byName, createdAt }], createdAt }
//
// All timestamps are ISO strings. An entry with no `end` is the user's
// in-progress task; a break with no `end` is a break in progress.
(function () {
  "use strict";

  var Team = window.FRCTeam;
  if (!Team) return;

  var QUICK_NOTES = ["Incorrect", "Unlogged break", "Verified"];
  var MAX_SHOWN = 10;

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

  function newId(prefix) { return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000); }

  // ---- Time math ----

  function ms(iso) { return new Date(iso).getTime(); }

  function breakMs(entry, now) {
    var endCap = entry.end ? ms(entry.end) : now;
    return (entry.breaks || []).reduce(function (sum, b) {
      var e = b.end ? ms(b.end) : endCap;
      return sum + Math.max(0, Math.min(e, endCap) - ms(b.start));
    }, 0);
  }

  // Time actually worked: start-to-end (or now) minus breaks.
  function workedMs(entry, now) {
    var end = entry.end ? ms(entry.end) : now;
    return Math.max(0, end - ms(entry.start) - breakMs(entry, now));
  }

  function fmtDur(t) {
    var mins = Math.round(t / 60000);
    var h = Math.floor(mins / 60), m = mins % 60;
    if (!h) return m + "m";
    return h + "h " + (m < 10 ? "0" : "") + m + "m";
  }

  function fmtClock(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function fmtDay(iso) {
    return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }

  function openBreak(entry) {
    var bs = entry.breaks || [];
    for (var i = 0; i < bs.length; i++) if (!bs[i].end) return bs[i];
    return null;
  }

  function activeEntry(log, uid) {
    for (var i = 0; i < log.length; i++) if (log[i].userId === uid && !log[i].end) return log[i];
    return null;
  }

  function entriesFor(log, uid) {
    return log.filter(function (e) { return e.userId === uid; }).sort(function (a, b) { return ms(b.start) - ms(a.start); });
  }

  function weekWorkedMs(entries) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    var since = d.getTime(), now = Date.now();
    return entries.reduce(function (sum, e) { return ms(e.start) >= since ? sum + workedMs(e, now) : sum; }, 0);
  }

  // ---- Storage ----

  function loadLog() {
    return Team.loadTeamData().then(function (data) { return (data && data.buildLog) || []; });
  }

  // `mutator` receives a copy of the log array and edits it in place.
  function patchLog(mutator) {
    return Team.loadTeamData().then(function (current) {
      var data = Object.assign({}, current || {});
      var log = (data.buildLog || []).map(function (e) { return Object.assign({}, e); });
      mutator(log);
      data.buildLog = log;
      return Team.saveTeamData(data);
    });
  }

  function findEntry(log, id) {
    for (var i = 0; i < log.length; i++) if (log[i].id === id) return log[i];
    return null;
  }

  function nowISO() { return new Date().toISOString(); }

  var actions = {
    start: function (uid, task) {
      return patchLog(function (log) {
        if (activeEntry(log, uid)) return;
        log.push({ id: newId("bl"), userId: uid, task: task, start: nowISO(), end: null, breaks: [], notes: [], createdAt: nowISO() });
      });
    },
    addPast: function (uid, task, startISO, endISO) {
      return patchLog(function (log) {
        log.push({ id: newId("bl"), userId: uid, task: task, start: startISO, end: endISO, breaks: [], notes: [], createdAt: nowISO() });
      });
    },
    startBreak: function (id) {
      return patchLog(function (log) {
        var e = findEntry(log, id);
        if (!e || e.end || openBreak(e)) return;
        e.breaks = (e.breaks || []).concat([{ id: newId("br"), start: nowISO(), end: null }]);
      });
    },
    endBreak: function (id) {
      return patchLog(function (log) {
        var e = findEntry(log, id);
        if (!e) return;
        e.breaks = (e.breaks || []).map(function (b) { return b.end ? b : Object.assign({}, b, { end: nowISO() }); });
      });
    },
    end: function (id) {
      return patchLog(function (log) {
        var e = findEntry(log, id);
        if (!e || e.end) return;
        var t = nowISO();
        e.breaks = (e.breaks || []).map(function (b) { return b.end ? b : Object.assign({}, b, { end: t }); });
        e.end = t;
      });
    },
    remove: function (id) {
      return patchLog(function (log) {
        var i = log.indexOf(findEntry(log, id));
        if (i !== -1) log.splice(i, 1);
      });
    },
    addNote: function (id, text) {
      var me = Team.state.user;
      var name = (me.user_metadata && me.user_metadata.display_name) || "Mentor";
      return patchLog(function (log) {
        var e = findEntry(log, id);
        if (!e) return;
        e.notes = (e.notes || []).concat([{ id: newId("bn"), text: text, by: me.id, byName: name, createdAt: nowISO() }]);
      });
    },
  };

  // ---- Shared entry row ----

  function breakSummary(entry) {
    var bs = entry.breaks || [];
    if (!bs.length) return null;
    var total = breakMs(entry, Date.now());
    return bs.length + (bs.length === 1 ? " break" : " breaks") + " · " + fmtDur(total);
  }

  // mentorNote: when set (mentor view), adds the note form + quick chips.
  function entryRow(entry, opts) {
    opts = opts || {};
    var running = !entry.end;
    var meta = [fmtDay(entry.start) + " · " + fmtClock(entry.start) + " – " + (running ? "now" : fmtClock(entry.end))];
    var bsum = breakSummary(entry);
    if (bsum) meta.push(bsum);

    var breakLines = (entry.breaks || []).map(function (b) {
      return el("span", { class: "bl-break" }, ["Break " + fmtClock(b.start) + " – " + (b.end ? fmtClock(b.end) : "now")]);
    });

    var noteEls = (entry.notes || []).map(function (n) {
      return el("div", { class: "bl-note" }, [
        el("span", { class: "bl-note-text" }, [n.text]),
        el("span", { class: "thread-meta" }, [(n.byName || "Mentor") + " · " + fmtDay(n.createdAt)]),
      ]);
    });

    var children = [
      el("div", { class: "bl-row-top" }, [
        el("span", { class: "bl-task" }, [entry.task]),
        el("span", { class: "bl-dur" + (running ? " is-running" : "") }, [fmtDur(workedMs(entry, Date.now())) + (running ? " so far" : "")]),
      ]),
      el("div", { class: "thread-meta" }, [meta.join(" · ")]),
      breakLines.length ? el("div", { class: "bl-breaks" }, breakLines) : null,
    ].concat(noteEls);

    if (opts.onNote) {
      var input = el("input", { type: "text", placeholder: "Add a note on these hours", maxlength: "300", required: "required" });
      var form = el("form", { class: "custom-task-form bl-note-form" }, [input, el("button", { type: "submit", class: "submit-btn-sm" }, ["Add note"])]);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var text = input.value.trim();
        if (text) opts.onNote(entry.id, text);
      });
      var chips = el("div", { class: "bl-chips" }, QUICK_NOTES.map(function (label) {
        var chip = el("button", { type: "button", class: "bl-chip" }, [label]);
        chip.addEventListener("click", function () {
          input.value = label === "Unlogged break" ? "Unlogged break at " : label;
          input.focus();
        });
        return chip;
      }));
      children.push(chips, form);
    }

    if (opts.onDelete && !(entry.notes || []).length) {
      var del = el("button", { type: "button", class: "bl-link" }, ["Delete entry"]);
      del.addEventListener("click", function () {
        if (confirm("Delete this log entry?")) opts.onDelete(entry.id);
      });
      children.push(del);
    }

    return el("div", { class: "bl-row" + ((entry.notes || []).length ? " has-notes" : "") }, children);
  }

  // ---- Student section ----

  var timer = null;

  function localInputValue(d) {
    function p(n) { return n < 10 ? "0" + n : "" + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function renderStudent(uid) {
    var host = document.getElementById("buildlog-body");
    if (!host) return;

    loadLog().then(function (log) {
      if (timer) { clearInterval(timer); timer = null; }
      host.innerHTML = "";
      var rerender = function () { renderStudent(uid); };
      var active = activeEntry(log, uid);
      var mine = entriesFor(log, uid);

      if (active) {
        var br = openBreak(active);
        var elapsed = el("strong", { class: "bl-clock" }, [fmtDur(workedMs(active, Date.now()))]);
        var breakBtn = el("button", { type: "button", class: "submit-btn-sm bl-secondary" }, [br ? "End break" : "Take a break"]);
        breakBtn.addEventListener("click", function () {
          (br ? actions.endBreak(active.id) : actions.startBreak(active.id)).then(rerender);
        });
        var endBtn = el("button", { type: "button", class: "submit-btn-sm" }, ["End task"]);
        endBtn.addEventListener("click", function () { actions.end(active.id).then(rerender); });

        host.appendChild(el("div", { class: "bl-active" + (br ? " on-break" : "") }, [
          el("div", {}, [
            el("div", { class: "bl-task" }, [active.task]),
            el("div", { class: "thread-meta" }, [
              "Started " + fmtClock(active.start) + (br ? " · on break since " + fmtClock(br.start) : ""),
            ]),
          ]),
          el("div", { class: "bl-active-right" }, [elapsed, el("span", { class: "thread-meta" }, ["worked"])]),
          el("div", { class: "bl-active-actions" }, [breakBtn, endBtn]),
        ]));
        timer = setInterval(function () { elapsed.textContent = fmtDur(workedMs(active, Date.now())); }, 30000);
      } else {
        var task = el("input", { type: "text", placeholder: "What are you working on?", maxlength: "120", required: "required" });
        var form = el("form", { class: "custom-task-form" }, [task, el("button", { type: "submit", class: "submit-btn-sm" }, ["Start task"])]);
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var t = task.value.trim();
          if (t) actions.start(uid, t).then(rerender);
        });
        host.appendChild(form);

        var pastTask = el("input", { type: "text", placeholder: "Task", maxlength: "120", required: "required" });
        var from = el("input", { type: "datetime-local", required: "required", "aria-label": "Start time" });
        var to = el("input", { type: "datetime-local", required: "required", "aria-label": "End time" });
        var msg = el("p", { class: "finder-hint", hidden: "hidden" });
        var past = el("form", { class: "custom-task-form" }, [pastTask, from, to, el("button", { type: "submit", class: "submit-btn-sm" }, ["Add"])]);
        past.addEventListener("submit", function (e) {
          e.preventDefault();
          var s = new Date(from.value), en = new Date(to.value);
          var problem = isNaN(s) || isNaN(en) ? "Enter both a start and end time."
            : en <= s ? "End time must be after the start time."
            : en > new Date() ? "End time can't be in the future."
            : "";
          msg.hidden = !problem;
          msg.textContent = problem;
          if (problem) return;
          actions.addPast(uid, pastTask.value.trim(), s.toISOString(), en.toISOString()).then(rerender);
        });
        var details = el("details", { class: "bl-past" }, [el("summary", {}, ["Forgot to log? Add a past entry"]), past, msg]);
        to.max = localInputValue(new Date());
        host.appendChild(details);
      }

      var week = weekWorkedMs(mine);
      host.appendChild(el("div", { class: "bl-week" }, ["This week: " + fmtDur(week)]));

      var emptyMsg = document.getElementById("buildlog-empty");
      var finished = mine.filter(function (e) { return e.end; });
      emptyMsg.hidden = mine.length > 0;
      var listWrap = el("div", { class: "bl-list" }, finished.slice(0, MAX_SHOWN).map(function (e) {
        return entryRow(e, { onDelete: function (id) { actions.remove(id).then(rerender); } });
      }));
      host.appendChild(listWrap);
      if (finished.length > MAX_SHOWN) host.appendChild(el("p", { class: "finder-hint" }, ["Showing your latest " + MAX_SHOWN + " of " + finished.length + " entries."]));
    });
  }

  // ---- Mentor panel (embedded in each student's review card) ----

  // Returns { summary: string, node: Element } for one student.
  function mentorPanel(log, uid, refresh) {
    var entries = entriesFor(log, uid);
    var active = activeEntry(log, uid);
    var status = active ? (openBreak(active) ? "On break" : "Working now") : "";
    var summary = fmtDur(weekWorkedMs(entries)) + " this week";

    var body = entries.length
      ? entries.slice(0, MAX_SHOWN).map(function (e) {
        return entryRow(e, { onNote: function (id, text) { actions.addNote(id, text).then(refresh); } });
      })
      : [el("p", { class: "finder-hint" }, ["No build hours logged yet."])];

    return {
      summary: summary,
      status: status,
      node: el("div", { class: "bl-mentor" }, [el("div", { class: "eyebrow" }, ["Build log"])].concat(body)),
    };
  }

  window.BuildLog = {
    loadLog: loadLog,
    renderStudent: renderStudent,
    mentorPanel: mentorPanel,
  };
})();
