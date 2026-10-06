(function () {
  "use strict";

  var Core = window.SeasonCore;

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

  // ---- Season Tracker widget ----

  function renderSeasonWidget() {
    var body = document.getElementById("dash-season-body");
    body.innerHTML = "";

    var today = Core.startOfDay(new Date());
    var milestones = Core.getMilestonesWithDates();
    var progress = Core.loadProgress();
    var catchUpIds = [];
    try { catchUpIds = JSON.parse(localStorage.getItem("frcgrants_season_catchup_v1") || "[]"); } catch (e) { catchUpIds = []; }

    function isDone(m) { return !!progress[m.id]; }

    var completed = milestones.filter(isDone);

    if (completed.length === 0) {
      body.appendChild(el("div", { class: "dash-headline" }, ["Get started"]));
      body.appendChild(el("p", { class: "dash-sub" }, ["Check off your first milestone to see your pace."]));
    } else {
      var furthest = completed.reduce(function (a, b) { return b.offset > a.offset ? b : a; });
      var pace = Core.daysBetween(today, furthest.date);
      var headline;
      if (pace > 0) headline = pace + (pace === 1 ? " day ahead" : " days ahead");
      else if (pace < 0) headline = Math.abs(pace) + (Math.abs(pace) === 1 ? " day behind" : " days behind");
      else headline = "Right on schedule";
      body.appendChild(el("div", { class: "dash-headline" }, [headline]));
      body.appendChild(el("p", { class: "dash-sub" }, [completed.length + " of " + milestones.length + " milestones done"]));
    }

    var upcoming = milestones
      .filter(function (m) { return !isDone(m); })
      .sort(function (a, b) { return a.date - b.date; })
      .slice(0, 3);

    if (upcoming.length) {
      var list = el("div", { class: "dash-mini-list" });
      upcoming.forEach(function (m) {
        var overdue = Core.daysBetween(today, m.date) < 0;
        var catchUp = overdue && catchUpIds.indexOf(m.id) !== -1;
        list.appendChild(el("div", { class: "dash-mini-row" }, [
          el("span", { class: "dash-mini-label" }, [m.label]),
          el("span", { class: "dash-mini-date" + (catchUp ? " dash-catchup" : overdue ? " dash-overdue" : "") }, [catchUp ? "Catch up" : overdue ? "Overdue" : Core.formatDate(m.date)]),
        ]));
      });
      body.appendChild(list);
    }
  }

  // ---- Grants closing soon widget ----

  function renderGrantsWidget() {
    var body = document.getElementById("dash-grants-body");
    fetch("data/grants.json")
      .then(function (r) { return r.json(); })
      .then(function (grants) {
        var soon = grants
          .filter(function (g) { return window.GrantStatus.isCurrentlyOpen(g) && g.closeDate; })
          .sort(function (a, b) {
            return window.GrantStatus.parseDate(a.closeDate) - window.GrantStatus.parseDate(b.closeDate);
          })
          .slice(0, 5);

        body.innerHTML = "";
        if (soon.length < 3) {
          body.appendChild(el("p", { class: "dash-sub" }, ["No upcoming deadlines published right now."]));
          return;
        }

        var list = el("div", { class: "dash-mini-list" });
        soon.forEach(function (g) {
          list.appendChild(el("div", { class: "dash-mini-row" }, [
            el("span", { class: "dash-mini-label" }, [g.name]),
            el("span", { class: "dash-mini-date" }, [window.GrantStatus.formatDeadline(window.GrantStatus.parseDate(g.closeDate))]),
          ]));
        });
        body.appendChild(list);
      })
      .catch(function () {
        body.innerHTML = "";
        body.appendChild(el("p", { class: "dash-sub" }, ["Couldn't load grant data."]));
      });
  }

  renderSeasonWidget();
  renderGrantsWidget();
})();
