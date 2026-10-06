(function () {
  "use strict";

  var Team = window.FRCTeam;
  if (!Team) return;

  var CATEGORY_LABELS = {
    registration: "Registration", parts: "Parts", travel: "Travel",
    outreach: "Outreach", tools: "Tools", sponsorship: "Sponsorship", other: "Other",
  };
  var SPONSOR_STATUSES = ["prospect", "asked", "committed", "received", "thanked"];
  var STATUS_LABELS = { prospect: "Prospect", asked: "Asked", committed: "Committed", received: "Received", thanked: "Thanked" };

  var entries = [];
  var sponsors = [];

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

  function money(n) {
    return "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function downloadCSV(filename, rows) {
    var csv = rows.map(function (row) {
      return row.map(function (cell) {
        var s = String(cell == null ? "" : cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",");
    }).join("\r\n");
    var blob = new Blob([csv], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderGoalCard() {
    var card = document.getElementById("goal-card");
    card.innerHTML = "";
    var approved = entries.filter(function (e) { return e.status === "approved"; });
    var income = approved.filter(function (e) { return e.type === "income"; }).reduce(function (s, e) { return s + Number(e.amount); }, 0);
    var expense = approved.filter(function (e) { return e.type === "expense"; }).reduce(function (s, e) { return s + Number(e.amount); }, 0);
    var goal = Team.state.team.fundraising_goal;

    card.appendChild(el("div", { class: "pace-eyebrow" }, ["Funds raised"]));
    card.appendChild(el("div", { class: "pace-headline" }, [money(income)]));
    card.appendChild(el("p", {}, [money(expense) + " spent · " + money(income - expense) + " net"]));

    if (goal) {
      var pct = Math.min(100, Math.round((income / goal) * 100));
      card.appendChild(el("div", { class: "progress-track", style: "margin-top:10px;" }, [
        el("div", { class: "progress-fill", style: "width:" + pct + "%" }),
      ]));
      card.appendChild(el("p", { style: "margin-top:8px;" }, [money(income) + " of " + money(goal) + " goal (" + pct + "%)"]));
    } else {
      card.appendChild(el("p", { style: "margin-top:8px; color:var(--text-faint);" }, ["No season goal set yet."]));
    }

    if (Team.isMentor()) {
      var goalInput = el("input", { type: "number", min: "0", step: "1", placeholder: "Set season goal ($)", style: "max-width:200px; margin-top:10px;" });
      if (goal) goalInput.value = goal;
      var goalBtn = el("button", { type: "button", class: "submit-btn-sm", style: "margin-left:8px;" }, ["Save goal"]);
      goalBtn.addEventListener("click", function () {
        var v = parseFloat(goalInput.value);
        if (isNaN(v) || v <= 0) return;
        Team.setFundraisingGoal(v).then(render);
      });
      var row = el("div", {}, [goalInput, goalBtn]);
      card.appendChild(row);
    }
  }

  function renderCategoryTotals() {
    var host = document.getElementById("category-totals");
    host.innerHTML = "";
    var approved = entries.filter(function (e) { return e.status === "approved"; });
    var byCat = {};
    approved.forEach(function (e) {
      var key = e.category;
      var bucket = byCat[key] || (byCat[key] = { income: 0, expense: 0 });
      bucket[e.type] += Number(e.amount);
    });
    var cats = Object.keys(byCat);
    if (!cats.length) {
      host.appendChild(el("p", { class: "finder-hint" }, ["No approved entries yet."]));
      return;
    }
    cats.forEach(function (cat) {
      var b = byCat[cat];
      host.appendChild(el("div", { class: "simple-card" }, [
        el("span", { class: "title-link" }, [CATEGORY_LABELS[cat] || cat]),
        el("p", {}, [
          (b.income ? "+" + money(b.income) + " in" : ""),
          (b.income && b.expense ? " · " : ""),
          (b.expense ? "-" + money(b.expense) + " out" : ""),
        ]),
      ]));
    });
  }

  function renderEntries() {
    var list = document.getElementById("entry-list");
    list.innerHTML = "";
    var pendingNote = document.getElementById("pending-note");
    var pendingCount = entries.filter(function (e) { return e.status === "pending"; }).length;
    if (Team.isMentor() && pendingCount) {
      pendingNote.hidden = false;
      pendingNote.textContent = pendingCount + (pendingCount === 1 ? " entry needs" : " entries need") + " your approval before it counts toward totals.";
    } else {
      pendingNote.hidden = true;
    }

    if (!entries.length) {
      list.appendChild(el("p", { class: "finder-hint" }, ["No transactions yet."]));
      return;
    }

    entries.forEach(function (e) {
      var row = el("div", { class: "thread-row" }, [
        el("div", { class: "thread-row-main" }, [
          el("span", { class: "thread-title" }, [
            (e.type === "income" ? "+" : "-") + money(e.amount) + " — " + (CATEGORY_LABELS[e.category] || e.category),
          ]),
          el("span", { class: "thread-meta" }, [e.entry_date + (e.note ? " · " + e.note : "") + (e.status === "pending" ? " · Pending approval" : "")]),
        ]),
      ]);
      var actions = [];
      if (Team.isMentor()) {
        if (e.status === "pending") {
          var approveBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Approve"]);
          approveBtn.addEventListener("click", function () { Team.approveBudgetEntry(e.id).then(load); });
          actions.push(approveBtn);
        }
        var delBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Delete"]);
        delBtn.addEventListener("click", function () {
          if (!confirm("Delete this entry?")) return;
          Team.deleteBudgetEntry(e.id).then(load);
        });
        actions.push(delBtn);
      }
      if (actions.length) row.appendChild(el("div", { class: "post-actions" }, actions));
      list.appendChild(row);
    });
  }

  function renderSponsors() {
    document.getElementById("sponsor-form").hidden = !Team.isMentor();
    var host = document.getElementById("sponsor-list");
    host.innerHTML = "";
    if (!sponsors.length) {
      host.appendChild(el("p", { class: "finder-hint" }, ["No sponsors tracked yet."]));
      return;
    }

    SPONSOR_STATUSES.forEach(function (status) {
      var group = sponsors.filter(function (s) { return s.status === status; });
      if (!group.length) return;
      var section = el("div", { style: "margin-top:16px;" }, [
        el("div", { class: "eyebrow" }, [STATUS_LABELS[status] + " (" + group.length + ")"]),
      ]);
      var list = el("div", { class: "thread-list" });
      group.forEach(function (s) {
        var row = el("div", { class: "thread-row" }, [
          el("div", { class: "thread-row-main" }, [
            el("span", { class: "thread-title" }, [s.name]),
            el("span", { class: "thread-meta" }, [
              (s.ask_amount ? money(s.ask_amount) + " · " : "") + (s.contact || "") + (s.next_step_date ? " · Next: " + s.next_step_date : ""),
            ]),
          ]),
        ]);
        if (Team.isMentor()) {
          var actions = [];
          var idx = SPONSOR_STATUSES.indexOf(status);
          if (idx < SPONSOR_STATUSES.length - 1) {
            var advanceBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Move to " + STATUS_LABELS[SPONSOR_STATUSES[idx + 1]]]);
            advanceBtn.addEventListener("click", function () {
              Team.upsertSponsor({ id: s.id, status: SPONSOR_STATUSES[idx + 1] }).then(load);
            });
            actions.push(advanceBtn);
          }
          var delBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Delete"]);
          delBtn.addEventListener("click", function () {
            if (!confirm("Delete sponsor \"" + s.name + "\"?")) return;
            Team.deleteSponsor(s.id).then(load);
          });
          actions.push(delBtn);
          row.appendChild(el("div", { class: "post-actions" }, actions));
        }
        list.appendChild(row);
      });
      section.appendChild(list);
      host.appendChild(section);
    });
  }

  function render() {
    renderGoalCard();
    renderCategoryTotals();
    renderEntries();
    renderSponsors();
  }

  function load() {
    Promise.all([Team.loadBudgetEntries(), Team.loadSponsors()]).then(function (res) {
      entries = res[0];
      sponsors = res[1];
      render();
    }).catch(function (err) { console.error(err); });
  }

  document.getElementById("entry-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var date = document.getElementById("entry-date").value;
    var type = document.getElementById("entry-type").value;
    var category = document.getElementById("entry-category").value;
    var amount = parseFloat(document.getElementById("entry-amount").value);
    var note = document.getElementById("entry-note").value.trim();
    if (!date || isNaN(amount) || amount <= 0) return;
    Team.addBudgetEntry({ date: date, type: type, category: category, amount: amount, note: note }).then(function () {
      document.getElementById("entry-form").reset();
      load();
    }).catch(function (err) { alert("Couldn't add entry: " + err.message); });
  });

  document.getElementById("sponsor-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = document.getElementById("sponsor-name").value.trim();
    if (!name) return;
    var ask = document.getElementById("sponsor-ask").value;
    Team.upsertSponsor({
      name: name,
      contact: document.getElementById("sponsor-contact").value.trim() || null,
      ask_amount: ask ? parseFloat(ask) : null,
      status: document.getElementById("sponsor-status").value,
    }).then(function () {
      document.getElementById("sponsor-form").reset();
      load();
    }).catch(function (err) { alert("Couldn't add sponsor: " + err.message); });
  });

  document.getElementById("export-budget-csv").addEventListener("click", function () {
    var rows = [["Date", "Type", "Category", "Amount", "Status", "Note"]];
    entries.forEach(function (e) { rows.push([e.entry_date, e.type, e.category, e.amount, e.status, e.note || ""]); });
    downloadCSV("budget-transactions.csv", rows);
  });

  document.getElementById("export-sponsors-csv").addEventListener("click", function () {
    var rows = [["Name", "Contact", "Ask amount", "Status", "Next step date", "Renewal date"]];
    sponsors.forEach(function (s) { rows.push([s.name, s.contact || "", s.ask_amount || "", s.status, s.next_step_date || "", s.renewal_date || ""]); });
    downloadCSV("sponsors.csv", rows);
  });

  document.getElementById("entry-date").value = new Date().toISOString().slice(0, 10);

  Team.ready.then(function () {
    if (!Team.state.user) {
      document.getElementById("budget-signed-out").hidden = false;
      return;
    }
    if (!Team.state.team) {
      document.getElementById("budget-no-team").hidden = false;
      return;
    }
    document.getElementById("budget-app").hidden = false;
    load();
  });
  Team.onChange(function () {
    if (!Team.state.team) return;
    document.getElementById("budget-signed-out").hidden = true;
    document.getElementById("budget-no-team").hidden = true;
    document.getElementById("budget-app").hidden = false;
    load();
  });
})();
