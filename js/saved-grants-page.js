// Saved Grants subpage: the team's starred grants, each with a checkbox that
// logs it on the budget page as a potential grant. The amount is entered
// later on budget.html (see js/budget.js), once a grant is actually approved.
(function () {
  "use strict";

  var GrantStatus = window.GrantStatus;
  var Team = window.FRCTeam;
  var grants = [];

  var STAR_SVG_FILLED = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

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

  function onTeam() { return !!(Team && Team.state.team); }

  function datesLine(g) {
    var openD = GrantStatus.parseDate(g.openDate);
    var closeD = GrantStatus.parseDate(g.closeDate);
    if (!openD && !closeD) return "Dates not published, check the grantor site";
    var bits = [];
    if (openD) bits.push("Opens " + GrantStatus.formatDeadline(openD));
    if (closeD) bits.push("Closes " + GrantStatus.formatDeadline(closeD));
    return bits.join(" · ");
  }

  function budgetCheck(g) {
    var entry = window.SavedGrants.getPipelineEntry(g.id);
    var logged = !!(entry && entry.budget_entry_id);
    var id = "budget-check-" + g.id;
    var chk = el("input", { type: "checkbox", id: id });
    chk.checked = !!(entry && entry.on_budget);
    // Without a team there's no shared budget to log to; once it's been
    // approved, the budget entry is the record, so undo it from there.
    chk.disabled = !entry || logged;
    chk.addEventListener("change", function () {
      chk.disabled = true;
      Team.updatePipelineEntry(g.id, { on_budget: chk.checked })
        .catch(function (err) { alert("Couldn't update the budget: " + err.message); })
        .then(function () { return window.SavedGrants.refresh(); })
        .then(render);
    });

    var text = "Log on budget as a potential grant";
    if (logged) text = "Approved and logged on the budget";
    else if (chk.checked) text = "On the budget as a potential grant";
    return el("div", { class: "gc-budget" }, [
      el("label", { class: "grant-complete-check", for: id }, [chk, text]),
      chk.checked ? el("a", { class: "gc-budget-link", href: "budget.html" }, ["View budget →"]) : null,
    ]);
  }

  function grantCard(g) {
    var p = GrantStatus.describe(g);
    var saveBtn = el("button", {
      type: "button",
      class: "gc-save-btn is-saved",
      "aria-pressed": "true",
      "aria-label": "Unsave " + g.name,
      title: "Remove from Saved Grants",
    });
    saveBtn.innerHTML = STAR_SVG_FILLED;
    saveBtn.addEventListener("click", function () {
      if (!window.SavedGrants.confirmUnsave(g.id)) return;
      window.SavedGrants.toggle(g.id);
      render();
    });

    return el("article", { class: "grant-card" }, [
      saveBtn,
      el("div", { class: "gc-top" }, [
        el("h2", { class: "gc-name" }, [g.name]),
        el("span", { class: "pill " + p.cls }, [p.label]),
      ]),
      el("div", { class: "gc-dates" }, [datesLine(g)]),
      g.notes ? el("p", { class: "gc-notes" }, [g.notes]) : null,
      g.amount ? el("div", { class: "gc-amount" }, [g.amount]) : null,
      el("div", { class: "gc-bottom" }, [
        el("a", { class: "gc-link", href: g.link || "#", target: "_blank", rel: "noopener" }, [g.link ? "View & apply →" : "No link yet"]),
      ]),
      budgetCheck(g),
    ]);
  }

  function renderHint(hasSaved) {
    var hint = document.getElementById("saved-grants-hint");
    hint.innerHTML = "";
    hint.hidden = !hasSaved || onTeam();
    if (hint.hidden) return;
    if (Team && Team.state.user) {
      hint.appendChild(el("a", { href: "account.html" }, ["Create or join a team"]));
      hint.appendChild(document.createTextNode(" to log saved grants on a shared budget."));
    } else {
      hint.appendChild(el("a", { href: "account.html" }, ["Sign in and join a team"]));
      hint.appendChild(document.createTextNode(" to log saved grants on a shared budget. Until then, these are saved in this browser only."));
    }
  }

  function render() {
    var grid = document.getElementById("saved-grants-grid");
    var saved = grants.filter(function (g) { return window.SavedGrants.isSaved(g.id); });
    renderHint(saved.length > 0);
    grid.innerHTML = "";
    if (!saved.length) {
      grid.appendChild(el("div", { class: "empty-state" }, [
        el("div", { class: "es-title" }, ["No saved grants yet"]),
        el("p", {}, ["Star a grant on ", el("a", { href: "grants.html" }, ["Find Grants"]), " and it'll show up here."]),
      ]));
      return;
    }
    saved.forEach(function (g) { grid.appendChild(grantCard(g)); });
  }

  fetch("data/grants.json")
    .then(function (r) {
      if (!r.ok) throw new Error("Failed to load data/grants.json");
      return r.json();
    })
    .then(function (g) {
      grants = g;
      return window.SavedGrants.ready;
    })
    .then(function () {
      render();
      window.SavedGrants.onChange(render);
    })
    .catch(function (err) {
      console.error(err);
      document.getElementById("saved-grants-grid").innerHTML =
        '<div class="empty-state"><div class="es-title">Couldn\'t load grant data</div><p>Check that data/grants.json is reachable.</p></div>';
    });
})();
