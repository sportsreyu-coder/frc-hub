(function () {
  "use strict";

  var state = {
    search: "",
    statusOpen: false,
    boosts: new Set(),
    c3: null, // "have" | "school" | "neither" | null
    stateFilter: "", // "" | "__nationwide__" | a US state name
    sort: "status",
    limit: 24,
  };

  var US_STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
    "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
    "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
    "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina",
    "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
    "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
    "District of Columbia",
  ];

  var BOOST_LABELS = {
    "rookie-friendly": "Great fit for a rookie/2nd-year team",
    "corporate-employee": "Mentor/employee connection helps here",
    "demographics": "Diversity & outreach focus",
    "sustainability": "Sustainability project focus",
  };

  var PAGE_SIZE = 24;
  var grants = [];
  var completedGrants = {}; // populated from the signed-in user's team, if any (see loadCompletedGrants below)

  var TAG_LABELS = {
    "corporate-employee": "Employee/mentor connection helps",
    "rookie-friendly": "Rookie-friendly",
    "demographics": "Diversity & outreach focus",
    "sustainability": "Sustainability focus",
    "501c3-required": "501(c)(3) required",
    "school-or-501c3": "School or 501(c)(3) OK",
    "no-501c3-required": "No 501(c)(3) required",
    "no-geo-restrictions": "No location restrictions",
    "geo-restricted": "Location restricted",
  };

  var TAG_ORDER = [
    "no-geo-restrictions", "geo-restricted", "corporate-employee", "rookie-friendly",
    "demographics", "sustainability", "501c3-required", "school-or-501c3", "no-501c3-required",
  ];

  var GrantStatus = window.GrantStatus;

  // Sorts by actual close date (grants without a parseable one sort last).
  function closeTimestamp(g) {
    var d = GrantStatus.parseDate(g.closeDate);
    return d ? d.getTime() : Infinity;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (k === "class") node.className = v;
        else node.setAttribute(k, v);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function pillClass(g) {
    return GrantStatus.describe(g);
  }

  function fetchJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error("Failed to load " + path);
      return r.json();
    });
  }

  function renderStats() {
    var total = grants.length;
    var open = grants.filter(function (g) { return GrantStatus.isCurrentlyOpen(g); }).length;
    var rolling = grants.filter(function (g) { return GrantStatus.getGrantStatus(g) === "rolling"; }).length;
    var unknown = grants.filter(function (g) { return GrantStatus.getGrantStatus(g) === "unknown"; }).length;
    var geo = grants.filter(function (g) { return g.tags.indexOf("no-geo-restrictions") !== -1; }).length;
    var no501 = grants.filter(function (g) { return g.tags.indexOf("no-501c3-required") !== -1; }).length;
    document.getElementById("stat-total").textContent = total || "—";
    document.getElementById("stat-open").textContent = open || "—";
    document.getElementById("stat-geo").textContent = geo || "—";
    document.getElementById("stat-no501").textContent = no501 || "—";
    var note = document.getElementById("stat-undated-note");
    if (note) {
      note.textContent = rolling + " with no fixed deadline (rolling) · " + unknown + " with dates not yet published";
    }
  }

  function renderFeatured() {
    var openWithDates = grants
      .filter(function (g) { return GrantStatus.isCurrentlyOpen(g) && g.closeDate; })
      .sort(function (a, b) { return closeTimestamp(a) - closeTimestamp(b); });
    var feat = openWithDates[0] || grants[0];
    var card = document.getElementById("featured-card");
    card.innerHTML = "";
    if (!feat) return;

    var reqLabel = feat.tags.indexOf("no-501c3-required") !== -1 ? "No 501(c)(3) required"
      : feat.tags.indexOf("501c3-required") !== -1 ? "501(c)(3) required"
      : "Check eligibility on the grantor's site";

    card.appendChild(el("div", { class: "eyebrow" }, ["Priority — closing soonest"]));
    var top = el("div", { class: "featured-top" }, [
      el("div", {}, [
        el("div", { class: "fname" }, [feat.name]),
        el("p", {}, [feat.notes || "Open for applications — check the grantor's site for full criteria."]),
      ]),
      el("div", { class: "featured-deadline" }, [
        el("div", { class: "fdate" }, [feat.closeDate || "TBD"]),
        el("div", { class: "flabel" }, ["deadline"]),
      ]),
    ]);
    card.appendChild(top);
    card.appendChild(el("div", { class: "featured-rule" }));
    card.appendChild(el("div", { class: "featured-bottom" }, [
      el("span", {}, [reqLabel]),
      el("a", { class: "featured-link", href: feat.link || "#", target: "_blank", rel: "noopener" }, ["View & apply →"]),
    ]));

    var datesTable = document.getElementById("dates-table");
    datesTable.innerHTML = "";
    if (openWithDates.length < 3) {
      datesTable.appendChild(el("p", { class: "finder-hint" }, [
        "No upcoming deadlines published right now — check back soon.",
      ]));
      return;
    }
    openWithDates.slice(0, 3).forEach(function (g) {
      var p = pillClass(g);
      var sub = g.notes || (g.tags.indexOf("no-geo-restrictions") !== -1 ? "No location restrictions" : "See grantor site for criteria");
      datesTable.appendChild(el("div", { class: "dates-row" }, [
        el("span", { class: "dcode" }, [GrantStatus.formatDeadline(GrantStatus.parseDate(g.closeDate))]),
        el("span", {}, [
          el("span", { class: "dname" }, [g.name]),
          el("span", { class: "dsub" }, [sub]),
        ]),
        el("span", { class: "pill " + p.cls }, [p.label]),
      ]));
    });
  }

  function textMatches(g) {
    if (!state.search) return true;
    var hay = (g.name + " " + g.notes).toLowerCase();
    return hay.indexOf(state.search) !== -1;
  }

  // Only status, 501(c)(3) requirement, and geographic restriction can make
  // a grant genuinely unavailable to a team -- those are the only things
  // allowed to remove a grant from the list. Team-profile attributes
  // (rookie status, a mentor connection, etc.) never disqualify a team
  // from anything else, so they only re-sort and badge matches below.
  // Returns null when the grant is available, or a short human reason why
  // it was excluded -- that reason is what powers the "excluded, see why"
  // panel instead of just letting grants disappear silently.
  function exclusionReason(g) {
    if (state.statusOpen && !GrantStatus.isCurrentlyOpen(g)) return "Not currently open";

    if (state.c3 === "school" && g.require501c3 === "required") return "Requires a 501(c)(3)";
    if (state.c3 === "neither") {
      if (g.require501c3 === "required") return "Requires a 501(c)(3)";
      if (g.require501c3 === "school-or-501c3") return "Requires a 501(c)(3) or school affiliation";
    }

    if (state.stateFilter === "__nationwide__" && g.tags.indexOf("no-geo-restrictions") === -1) {
      return "Has a location restriction";
    }
    if (state.stateFilter && state.stateFilter !== "__nationwide__") {
      var noRestriction = g.tags.indexOf("no-geo-restrictions") !== -1;
      var mentionsState = g.notes && g.notes.toLowerCase().indexOf(state.stateFilter.toLowerCase()) !== -1;
      if (!noRestriction && !mentionsState) return "Doesn't mention " + state.stateFilter + " in its notes";
    }
    return null;
  }

  function isBoosted(g) {
    if (state.boosts.size === 0) return false;
    var matched = false;
    state.boosts.forEach(function (b) { if (g.tags.indexOf(b) !== -1) matched = true; });
    return matched;
  }

  function matchedBoosts(g) {
    var out = [];
    state.boosts.forEach(function (b) { if (g.tags.indexOf(b) !== -1) out.push(b); });
    return out;
  }

  function sortGrants(list) {
    var copy = list.slice();
    var cmp;
    if (state.sort === "az") {
      cmp = function (a, b) { return a.name.localeCompare(b.name); };
    } else if (state.sort === "deadline") {
      cmp = function (a, b) { return closeTimestamp(a) - closeTimestamp(b) || a.name.localeCompare(b.name); };
    } else {
      var rank = { open: 0, "closing-soon": 0, rolling: 1, upcoming: 1, unknown: 1, closed: 2 };
      cmp = function (a, b) { return (rank[GrantStatus.getGrantStatus(a)] - rank[GrantStatus.getGrantStatus(b)]) || a.name.localeCompare(b.name); };
    }
    if (state.boosts.size > 0) {
      copy.sort(function (a, b) {
        var ba = isBoosted(a), bb = isBoosted(b);
        if (ba !== bb) return ba ? -1 : 1;
        return cmp(a, b);
      });
    } else {
      copy.sort(cmp);
    }
    return copy;
  }

  function grantCard(g) {
    var dateBits = [];
    if (g.openDate) dateBits.push("Opens " + g.openDate);
    if (g.closeDate) dateBits.push("Closes " + g.closeDate);
    var p = pillClass(g);
    var visibleTags = TAG_ORDER.filter(function (t) { return g.tags.indexOf(t) !== -1; });
    var boosted = matchedBoosts(g);
    var badge = boosted.length
      ? el("span", { class: "great-fit-badge" }, ["Great fit — " + boosted.map(function (b) { return BOOST_LABELS[b] || b; }).join(", ")])
      : null;

    var completedPill = completedGrants["grant-" + g.id]
      ? el("span", { class: "pill pill-open" }, ["✓ Your team completed this"])
      : null;

    return el("article", { class: "grant-card" + (boosted.length ? " is-boosted" : "") }, [
      badge,
      el("div", { class: "gc-top" }, [
        el("h3", { class: "gc-name" }, [g.name]),
        el("span", { class: "pill " + p.cls }, [p.label]),
      ]),
      completedPill,
      el("div", { class: "gc-dates" }, [dateBits.length ? dateBits.join(" · ") : "Dates not published"]),
      el("p", { class: "gc-notes" }, [g.notes || "No additional notes provided."]),
      el("div", { class: "gc-tags" }, visibleTags.map(function (t) {
        return el("span", { class: "tag" }, [TAG_LABELS[t] || t]);
      })),
      el("div", { class: "gc-bottom" }, [
        el("span", { class: "gc-meta" }, [g.employeeConnection === "yes" ? "Employee/mentor tie noted" : " "]),
        el("a", { class: "gc-link", href: g.link || "#", target: "_blank", rel: "noopener" }, [g.link ? "View & apply →" : "No link yet"]),
      ]),
    ]);
  }

  function resultsText(sorted) {
    if (!grants.length) return "Loading grant data…";

    var total = grants.length;
    var base;
    if (sorted.length === total) {
      base = "Showing all " + total + " grants";
    } else if (sorted.length === 0) {
      base = "None of the " + total + " grants fit those requirements";
    } else {
      base = "Showing " + sorted.length + " of " + total + " grants you're eligible for";
    }

    if (state.boosts.size > 0 && sorted.length > 0) {
      var boostedCount = sorted.filter(isBoosted).length;
      if (boostedCount > 0) {
        base += " — " + boostedCount + (boostedCount === 1 ? " is" : " are") + " a great fit for you";
      } else {
        base += " — none stand out as an especially strong fit, but you can still apply to any of them";
      }
    }
    return base;
  }

  function activeFilterCount() {
    var n = 0;
    if (state.statusOpen) n++;
    if (state.c3) n++;
    if (state.stateFilter) n++;
    n += state.boosts.size;
    return n;
  }

  function updateFiltersToggleLabel() {
    var n = activeFilterCount();
    document.getElementById("filters-toggle-label").textContent = n > 0 ? "Filters (" + n + " active)" : "Filters";
  }

  function render() {
    updateFiltersToggleLabel();
    var searchMatched = grants.filter(textMatches);
    var shown = [];
    var excluded = [];
    searchMatched.forEach(function (g) {
      var reason = exclusionReason(g);
      if (reason) excluded.push({ grant: g, reason: reason });
      else shown.push(g);
    });
    var sorted = sortGrants(shown);
    var grid = document.getElementById("grant-grid");
    grid.innerHTML = "";

    document.getElementById("results-count").textContent = resultsText(sorted);

    if (sorted.length === 0 && grants.length > 0) {
      grid.appendChild(el("div", { class: "empty-state" }, [
        el("div", { class: "es-title" }, ["No grants match those filters"]),
        el("p", {}, ["Try clearing a filter or broadening your search."]),
      ]));
    } else {
      sorted.slice(0, state.limit).forEach(function (g) { grid.appendChild(grantCard(g)); });
    }

    var moreRow = document.getElementById("show-more-row");
    var moreBtn = document.getElementById("show-more-btn");
    var remaining = sorted.length - state.limit;
    if (remaining > 0) {
      moreRow.hidden = false;
      moreBtn.textContent = "Show " + Math.min(PAGE_SIZE, remaining) + " more";
    } else {
      moreRow.hidden = true;
    }

    renderExcluded(excluded);
  }

  function renderExcluded(excluded) {
    var panel = document.getElementById("excluded-panel");
    var toggle = document.getElementById("excluded-toggle");
    var list = document.getElementById("excluded-list");

    if (excluded.length === 0) {
      panel.hidden = true;
      list.hidden = true;
      list.innerHTML = "";
      return;
    }

    panel.hidden = false;
    var expanded = !list.hidden;
    toggle.textContent = (expanded ? "Hide" : "Show") + " " + excluded.length +
      (excluded.length === 1 ? " excluded grant" : " excluded grants") + " and why →";

    list.innerHTML = "";
    excluded
      .slice()
      .sort(function (a, b) { return a.grant.name.localeCompare(b.grant.name); })
      .forEach(function (item) {
        list.appendChild(el("div", { class: "excluded-row" }, [
          el("a", { class: "ex-name", href: item.grant.link || "#", target: "_blank", rel: "noopener" }, [item.grant.name]),
          el("span", { class: "ex-reason" }, [item.reason]),
        ]));
      });

    toggle.onclick = function () {
      list.hidden = !list.hidden;
      toggle.textContent = (!list.hidden ? "Hide" : "Show") + " " + excluded.length +
        (excluded.length === 1 ? " excluded grant" : " excluded grants") + " and why →";
    };
  }

  function setupFinder() {
    var filterPanel = document.getElementById("filter-panel");
    var filtersToggleBtn = document.getElementById("filters-toggle-btn");
    filtersToggleBtn.addEventListener("click", function () {
      var expanded = filtersToggleBtn.getAttribute("aria-expanded") === "true";
      filterPanel.hidden = expanded;
      filtersToggleBtn.setAttribute("aria-expanded", String(!expanded));
    });

    document.querySelectorAll('[data-filter="status"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.statusOpen = !state.statusOpen;
        state.limit = PAGE_SIZE;
        btn.classList.toggle("active", state.statusOpen);
        render();
      });
    });

    var stateSelect = document.getElementById("state-select");
    US_STATES.forEach(function (s) {
      stateSelect.appendChild(el("option", { value: s }, [s]));
    });
    stateSelect.addEventListener("change", function (e) {
      state.stateFilter = e.target.value;
      state.limit = PAGE_SIZE;
      render();
    });

    document.querySelectorAll('[data-filter="boost"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var val = btn.getAttribute("data-value");
        if (state.boosts.has(val)) {
          state.boosts.delete(val);
          btn.classList.remove("active");
        } else {
          state.boosts.add(val);
          btn.classList.add("active");
        }
        render();
      });
    });

    document.querySelectorAll('[data-filter="c3"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var val = btn.getAttribute("data-value");
        var already = state.c3 === val;
        document.querySelectorAll('[data-filter="c3"]').forEach(function (b) { b.classList.remove("active"); });
        state.c3 = already ? null : val;
        if (!already) btn.classList.add("active");
        state.limit = PAGE_SIZE;
        render();
      });
    });

    document.getElementById("search-input").addEventListener("input", function (e) {
      state.search = e.target.value.trim().toLowerCase();
      state.limit = PAGE_SIZE;
      render();
    });

    document.getElementById("sort-select").addEventListener("change", function (e) {
      state.sort = e.target.value;
      render();
    });

    document.getElementById("show-more-btn").addEventListener("click", function () {
      state.limit += PAGE_SIZE;
      render();
    });

    document.getElementById("reset-filters").addEventListener("click", function () {
      state.search = "";
      state.statusOpen = false;
      state.boosts.clear();
      state.c3 = null;
      state.stateFilter = "";
      state.limit = PAGE_SIZE;
      document.getElementById("search-input").value = "";
      document.getElementById("state-select").value = "";
      document.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
      render();
    });
  }

  fetchJSON("data/grants.json")
    .then(function (g) {
      grants = g;
      renderStats();
      renderFeatured();
      setupFinder();
      render();
    })
    .catch(function (err) {
      console.error(err);
      document.getElementById("grant-grid").innerHTML =
        '<div class="empty-state"><div class="es-title">Couldn\'t load grant data</div><p>Check that data/grants.json is reachable.</p></div>';
    });

  // Read-only "your team completed this" badge, sourced from the same
  // shared team_data blob Season Tracker's grant checklist writes to
  // (see js/season.js's toggleCompletedGrant) -- the actual mark-complete
  // control lives only there, so there's one write path, not two.
  if (window.FRCTeam) {
    window.FRCTeam.onChange(loadCompletedGrants);
    window.FRCTeam.ready.then(loadCompletedGrants);
  }
  function loadCompletedGrants() {
    if (!window.FRCTeam.state.team) { completedGrants = {}; render(); return; }
    window.FRCTeam.loadTeamData().then(function (data) {
      completedGrants = (data && data.completedGrants) || {};
      render();
    });
  }
})();
