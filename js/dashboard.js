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

  function retryButton(onClick) {
    var btn = el("button", { type: "button", class: "reset-btn" }, ["Try again"]);
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  // ---- Season Tracker widget ----
  // Reads local season-tracker state synchronously (see season-core.js) --
  // there's no network request here to fail, so no retry state (D4) is
  // needed for this card; a corrupt localStorage value is already caught
  // below and just treated as "no progress yet."

  function seasonSummary() {
    var today = Core.startOfDay(new Date());
    var milestones = Core.getMilestonesWithDates();
    var progress = {};
    try { progress = Core.loadProgress() || {}; } catch (e) { progress = {}; }
    var catchUpIds = [];
    try { catchUpIds = JSON.parse(localStorage.getItem("frcgrants_season_catchup_v1") || "[]"); } catch (e) { catchUpIds = []; }

    function isDone(m) { return !!progress[m.id]; }
    var completed = milestones.filter(isDone);
    var upcoming = milestones.filter(function (m) { return !isDone(m); }).sort(function (a, b) { return a.date - b.date; });
    var overdue = upcoming.filter(function (m) {
      return Core.daysBetween(today, m.date) < 0 && catchUpIds.indexOf(m.id) === -1;
    });

    return { today: today, milestones: milestones, completed: completed, upcoming: upcoming, overdueCount: overdue.length };
  }

  function renderSeasonWidget(summary) {
    var body = document.getElementById("dash-season-body");
    body.innerHTML = "";

    if (summary.completed.length === 0) {
      body.appendChild(el("div", { class: "dash-headline" }, ["Get started"]));
      body.appendChild(el("p", { class: "dash-sub" }, ["Check off your first milestone to see your pace."]));
    } else {
      var furthest = summary.completed.reduce(function (a, b) { return b.offset > a.offset ? b : a; });
      var pace = Core.daysBetween(summary.today, furthest.date);
      var headline;
      if (pace > 0) headline = pace + (pace === 1 ? " day ahead" : " days ahead");
      else if (pace < 0) headline = Math.abs(pace) + (Math.abs(pace) === 1 ? " day behind" : " days behind");
      else headline = "Right on schedule";
      body.appendChild(el("div", { class: "dash-headline" }, [headline]));
      body.appendChild(el("p", { class: "dash-sub" }, [summary.completed.length + " of " + summary.milestones.length + " milestones done"]));
    }

    var upcoming = summary.upcoming.slice(0, 3);
    if (upcoming.length) {
      var list = el("div", { class: "dash-mini-list" });
      upcoming.forEach(function (m) {
        var overdue = Core.daysBetween(summary.today, m.date) < 0;
        list.appendChild(el("div", { class: "dash-mini-row" }, [
          el("span", { class: "dash-mini-label" }, [m.label]),
          el("span", { class: "dash-mini-date" + (overdue ? " dash-overdue" : "") }, [overdue ? "Overdue" : Core.formatDate(m.date)]),
        ]));
      });
      body.appendChild(list);
    }
  }

  // ---- Grants closing soon widget (D4: real error + retry state) ----

  function loadGrants() {
    return fetch("data/grants.json").then(function (r) {
      if (!r.ok) throw new Error("Failed to load grants");
      return r.json();
    });
  }

  function renderGrantsWidget() {
    var body = document.getElementById("dash-grants-body");
    body.innerHTML = "Loading…";
    loadGrants()
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
        body.appendChild(retryButton(renderGrantsWidget));
      });
  }

  // ---- Saved grants widget (B6/D3) ----

  function renderSavedWidget() {
    var body = document.getElementById("dash-saved-body");
    if (!window.SavedGrants) { body.innerHTML = ""; body.appendChild(el("p", { class: "dash-sub" }, ["Star a grant on the Find Grants page to see it here."])); return; }

    function paint() {
      var ids = window.SavedGrants.getIds();
      if (!ids.length) {
        body.innerHTML = "";
        body.appendChild(el("div", { class: "dash-headline" }, ["None yet"]));
        body.appendChild(el("p", { class: "dash-sub" }, ["Star a grant on the Find Grants page to track it here."]));
        return;
      }
      loadGrants()
        .then(function (grants) {
          var saved = grants.filter(function (g) { return ids.indexOf(g.id) !== -1; });
          var withDeadline = saved
            .filter(function (g) { return g.closeDate && (window.GrantStatus.getGrantStatus(g) === "open" || window.GrantStatus.getGrantStatus(g) === "closing-soon"); })
            .sort(function (a, b) { return window.GrantStatus.parseDate(a.closeDate) - window.GrantStatus.parseDate(b.closeDate); });

          body.innerHTML = "";
          body.appendChild(el("div", { class: "dash-headline" }, [String(saved.length)]));
          body.appendChild(el("p", { class: "dash-sub" }, [saved.length === 1 ? "grant saved" : "grants saved"]));

          if (withDeadline.length) {
            var list = el("div", { class: "dash-mini-list" });
            withDeadline.slice(0, 3).forEach(function (g) {
              list.appendChild(el("div", { class: "dash-mini-row" }, [
                el("span", { class: "dash-mini-label" }, [g.name]),
                el("span", { class: "dash-mini-date" }, [window.GrantStatus.formatDeadline(window.GrantStatus.parseDate(g.closeDate))]),
              ]));
            });
            body.appendChild(list);
          }
        })
        .catch(function () {
          body.innerHTML = "";
          body.appendChild(el("p", { class: "dash-sub" }, ["Couldn't load grant data."]));
          body.appendChild(retryButton(paint));
        });
    }

    window.SavedGrants.ready.then(paint);
    window.SavedGrants.onChange(paint);
  }

  // ---- Recent forum activity widget (D3) ----

  function renderForumWidget() {
    var body = document.getElementById("dash-forum-body");
    var sb = window.__frcHubSupabase;
    if (!sb) {
      body.innerHTML = "";
      body.appendChild(el("p", { class: "dash-sub" }, ["Forum activity needs the site's Supabase config."]));
      return;
    }

    function load() {
      body.innerHTML = "Loading…";
      sb.from("forum_posts")
        .select("title, board, created_at")
        .order("created_at", { ascending: false })
        .limit(3)
        .then(function (res) {
          body.innerHTML = "";
          if (res.error) {
            body.appendChild(el("p", { class: "dash-sub" }, ["Couldn't load forum activity."]));
            body.appendChild(retryButton(load));
            return;
          }
          var posts = res.data || [];
          if (!posts.length) {
            body.appendChild(el("div", { class: "dash-headline" }, ["Quiet so far"]));
            body.appendChild(el("p", { class: "dash-sub" }, ["Be the first to post on your district board."]));
            return;
          }
          var list = el("div", { class: "dash-mini-list" });
          posts.forEach(function (p) {
            var boardInfo = (window.FORUM_BOARDS && window.FORUM_BOARDS[p.board]) || { name: p.board };
            list.appendChild(el("div", { class: "dash-mini-row" }, [
              el("span", { class: "dash-mini-label" }, [p.title]),
              el("span", { class: "dash-mini-date" }, [boardInfo.name]),
            ]));
          });
          body.appendChild(list);
        });
    }
    load();
  }

  // ---- Personalized hero (D1): signed-out keeps the plain welcome;
  // signed-in gets next deadlines (tasks + saved grants), overdue count,
  // and saved-grants-closing-soon, instead of a static headline. ----

  function renderPersonalHero(user, summary) {
    document.getElementById("hero-signed-out").hidden = true;
    var hero = document.getElementById("hero-signed-in");
    hero.hidden = false;

    var name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || "";
    var firstName = name ? name.split(" ")[0] : "";
    document.getElementById("hero-personal-greeting").textContent = firstName ? "Welcome back, " + firstName + "." : "Welcome back.";

    var body = document.getElementById("hero-personal-body");
    body.innerHTML = "";

    var stats = el("div", { class: "hero-personal-stats" });
    stats.appendChild(el("span", { class: "hero-personal-stat" + (summary.overdueCount ? " is-overdue" : "") }, [
      el("strong", {}, [String(summary.overdueCount)]), " task" + (summary.overdueCount === 1 ? "" : "s") + " overdue",
    ]));
    stats.appendChild(el("span", { class: "hero-personal-stat" }, [
      el("strong", {}, [String(summary.completed.length) + "/" + summary.milestones.length]), " milestones done",
    ]));
    body.appendChild(stats);

    var nextTasks = summary.upcoming.slice(0, 3).map(function (m) {
      return { label: m.label, date: m.date, tag: "Task" };
    });

    body.appendChild(el("p", { class: "finder-hint", style: "margin:14px 0 0;" }, ["Next up"]));
    var list = el("div", { class: "hero-next-list" });
    var combined = nextTasks.slice(0, 3);
    if (!combined.length) {
      list.appendChild(el("p", { class: "dash-sub" }, ["Nothing due yet — check off a milestone on the Season Tracker to get started."]));
    } else {
      combined.forEach(function (item) {
        list.appendChild(el("div", { class: "hero-next-row" }, [
          el("span", { class: "hero-next-label" }, [el("span", { class: "hero-next-tag" }, [item.tag]), item.label]),
          el("span", { class: "hero-next-date" }, [Core.formatDate(item.date)]),
        ]));
      });
    }
    body.appendChild(list);

    // Saved grants closing soon, merged in once SavedGrants/grants.json resolve.
    if (window.SavedGrants) {
      window.SavedGrants.ready.then(function () {
        var ids = window.SavedGrants.getIds();
        if (!ids.length) return;
        loadGrants().then(function (grants) {
          var closing = grants
            .filter(function (g) { return ids.indexOf(g.id) !== -1 && g.closeDate && window.GrantStatus.getGrantStatus(g) === "closing-soon"; })
            .sort(function (a, b) { return window.GrantStatus.parseDate(a.closeDate) - window.GrantStatus.parseDate(b.closeDate); });
          if (!closing.length) return;
          body.appendChild(el("p", { class: "finder-hint", style: "margin:14px 0 0;" }, ["Saved grants closing soon"]));
          var savedList = el("div", { class: "hero-next-list" });
          closing.slice(0, 3).forEach(function (g) {
            savedList.appendChild(el("div", { class: "hero-next-row" }, [
              el("span", { class: "hero-next-label" }, [el("span", { class: "hero-next-tag" }, ["Grant"]), g.name]),
              el("span", { class: "hero-next-date" }, [window.GrantStatus.formatDeadline(window.GrantStatus.parseDate(g.closeDate))]),
            ]));
          });
          body.appendChild(savedList);
        }).catch(function () { /* hero degrades gracefully without this section */ });
      });
    }
  }

  var summary = seasonSummary();
  renderSeasonWidget(summary);
  renderGrantsWidget();
  renderSavedWidget();
  renderForumWidget();

  if (window.__frcHubSupabase) {
    window.__frcHubSupabase.auth.getSession().then(function (res) {
      var session = res.data.session;
      if (session && session.user) renderPersonalHero(session.user, summary);
    });
  }
})();
