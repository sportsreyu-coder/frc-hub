(function () {
  "use strict";

  var state = {
    search: "",
    statusOpen: false,
    savedOnly: false,
    boosts: new Set(),
    c3: null, // "have" | "school" | "neither" | null
    stateFilter: "", // "" | "__nationwide__" | a US state name
    sort: "deadline",
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

  var STAR_POINTS = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>';
  var STAR_SVG_OUTLINE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + STAR_POINTS + '</svg>';
  var STAR_SVG_FILLED = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + STAR_POINTS + '</svg>';

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

  function savedMatches(g) {
    return !state.savedOnly || (window.SavedGrants && window.SavedGrants.isSaved(g.id));
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

  function datesLine(g) {
    var openD = GrantStatus.parseDate(g.openDate);
    var closeD = GrantStatus.parseDate(g.closeDate);
    if (!openD && !closeD) return "Dates not published, check the grantor site";
    var bits = [];
    if (openD) bits.push("Opens " + GrantStatus.formatDeadline(openD));
    if (closeD) bits.push("Closes " + GrantStatus.formatDeadline(closeD));
    return bits.join(" · ");
  }

  function grantCard(g) {
    var p = pillClass(g);
    var visibleTags = TAG_ORDER.filter(function (t) { return g.tags.indexOf(t) !== -1; });
    var boosted = matchedBoosts(g);
    var badge = boosted.length
      ? el("span", { class: "great-fit-badge" }, ["Great fit — " + boosted.map(function (b) { return BOOST_LABELS[b] || b; }).join(", ")])
      : null;

    var completedPill = completedGrants["grant-" + g.id]
      ? el("span", { class: "pill pill-open" }, ["✓ Your team completed this"])
      : null;

    var verifiedText = GrantStatus.verifiedLabel(g.lastVerified);
    var saved = window.SavedGrants && window.SavedGrants.isSaved(g.id);
    var saveBtn = el("button", {
      type: "button",
      class: "gc-save-btn" + (saved ? " is-saved" : ""),
      "aria-pressed": String(!!saved),
      "aria-label": saved ? "Unsave " + g.name : "Save " + g.name,
      title: saved ? "Saved" : "Save this grant",
    });
    saveBtn.innerHTML = saved ? STAR_SVG_FILLED : STAR_SVG_OUTLINE;
    saveBtn.addEventListener("click", function (e) {
      e.preventDefault();
      window.SavedGrants.toggle(g.id);
      render();
    });

    return el("article", { class: "grant-card" + (boosted.length ? " is-boosted" : "") }, [
      badge,
      saveBtn,
      el("div", { class: "gc-top" }, [
        el("h3", { class: "gc-name" }, [g.name]),
        el("span", { class: "pill " + p.cls }, [p.label]),
      ]),
      completedPill,
      el("div", { class: "gc-dates" }, [datesLine(g)]),
      g.notes ? el("p", { class: "gc-notes" }, [g.notes]) : null,
      g.amount ? el("div", { class: "gc-amount" }, [g.amount]) : null,
      visibleTags.length ? el("div", { class: "gc-tags" }, visibleTags.map(function (t) {
        return el("span", { class: "tag" }, [TAG_LABELS[t] || t]);
      })) : null,
      el("div", { class: "gc-bottom" }, [
        g.employeeConnection === "yes" ? el("span", { class: "gc-meta" }, ["Employee/mentor tie noted"]) : null,
        el("a", { class: "gc-link", href: g.link || "#", target: "_blank", rel: "noopener" }, [g.link ? "View & apply →" : "No link yet"]),
      ]),
      el("div", { class: "gc-verified" + (verifiedText ? "" : " gc-needs-verification") }, [verifiedText || "Needs verification"]),
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
    if (state.savedOnly) n++;
    if (state.c3) n++;
    if (state.stateFilter) n++;
    n += state.boosts.size;
    return n;
  }

  function updateFiltersToggleLabel() {
    var n = activeFilterCount();
    document.getElementById("filters-toggle-label").textContent = n > 0 ? "Filters (" + n + " active)" : "Filters";
  }

  var C3_LABELS = {
    have: "We have a 501(c)(3)",
    school: "School-affiliated, no 501(c)(3)",
    neither: "Neither",
  };

  function clearAllFilters() {
    state.search = "";
    state.statusOpen = false;
    state.savedOnly = false;
    state.boosts.clear();
    state.c3 = null;
    state.stateFilter = "";
    state.limit = PAGE_SIZE;
    document.getElementById("search-input").value = "";
    document.getElementById("state-select").value = "";
    document.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
  }

  function syncFilterButtons() {
    document.querySelectorAll('[data-filter="status"]').forEach(function (b) { b.classList.toggle("active", state.statusOpen); });
    document.querySelectorAll('[data-filter="saved"]').forEach(function (b) { b.classList.toggle("active", state.savedOnly); });
    document.querySelectorAll('[data-filter="c3"]').forEach(function (b) {
      b.classList.toggle("active", state.c3 === b.getAttribute("data-value"));
    });
    document.querySelectorAll('[data-filter="boost"]').forEach(function (b) {
      b.classList.toggle("active", state.boosts.has(b.getAttribute("data-value")));
    });
  }

  function renderActiveChips() {
    var row = document.getElementById("active-filter-chips");
    row.innerHTML = "";
    var chips = [];

    if (state.search) {
      chips.push({ label: "Search: “" + state.search + "”", remove: function () { state.search = ""; document.getElementById("search-input").value = ""; } });
    }
    if (state.statusOpen) {
      chips.push({ label: "Currently open", remove: function () { state.statusOpen = false; } });
    }
    if (state.savedOnly) {
      chips.push({ label: "★ Saved only", remove: function () { state.savedOnly = false; } });
    }
    if (state.c3) {
      chips.push({ label: C3_LABELS[state.c3] || state.c3, remove: function () { state.c3 = null; } });
    }
    if (state.stateFilter) {
      var label = state.stateFilter === "__nationwide__" ? "Nationwide grants only" : state.stateFilter;
      chips.push({ label: label, remove: function () { state.stateFilter = ""; document.getElementById("state-select").value = ""; } });
    }
    state.boosts.forEach(function (b) {
      chips.push({ label: BOOST_LABELS[b] || b, remove: function () { state.boosts.delete(b); } });
    });

    if (chips.length === 0) {
      row.hidden = true;
      return;
    }
    row.hidden = false;
    chips.forEach(function (c) {
      var btn = el("button", { type: "button", class: "active-filter-chip" }, [
        c.label,
        el("span", { class: "afc-remove", "aria-hidden": "true" }, ["×"]),
      ]);
      btn.setAttribute("aria-label", "Remove filter: " + c.label);
      btn.addEventListener("click", function () {
        c.remove();
        state.limit = PAGE_SIZE;
        syncFilterButtons();
        render();
        syncUrl();
      });
      row.appendChild(btn);
    });
  }

  // F5: mirror filter/search/sort state into the URL (replaceState, not
  // pushState -- these change on every keystroke/click, so pushing would
  // flood Back with useless steps) so a copied or reloaded URL restores
  // the same view. Read back once on load, below.
  function syncUrl() {
    var params = new URLSearchParams();
    if (state.search) params.set("q", state.search);
    if (state.statusOpen) params.set("status", "open");
    if (state.savedOnly) params.set("saved", "1");
    if (state.c3) params.set("c3", state.c3);
    if (state.stateFilter) params.set("state", state.stateFilter);
    if (state.boosts.size) params.set("boost", Array.from(state.boosts).join(","));
    if (state.sort !== "deadline") params.set("sort", state.sort);
    var qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }

  function applyUrlToState() {
    var params = new URLSearchParams(location.search);
    if (params.has("q")) { state.search = params.get("q").toLowerCase(); document.getElementById("search-input").value = params.get("q"); }
    if (params.get("status") === "open") {
      state.statusOpen = true;
      document.querySelectorAll('[data-filter="status"]').forEach(function (b) { b.classList.add("active"); });
    }
    if (params.get("saved") === "1") {
      state.savedOnly = true;
      document.querySelectorAll('[data-filter="saved"]').forEach(function (b) { b.classList.add("active"); });
    }
    if (params.has("c3")) {
      state.c3 = params.get("c3");
      document.querySelectorAll('[data-filter="c3"]').forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-value") === state.c3); });
    }
    if (params.has("state")) {
      state.stateFilter = params.get("state");
      document.getElementById("state-select").value = state.stateFilter;
    }
    if (params.has("boost")) {
      params.get("boost").split(",").forEach(function (b) { if (b) state.boosts.add(b); });
      document.querySelectorAll('[data-filter="boost"]').forEach(function (b) { b.classList.toggle("active", state.boosts.has(b.getAttribute("data-value"))); });
    }
    if (params.has("sort")) {
      state.sort = params.get("sort");
      document.getElementById("sort-select").value = state.sort;
    }
    if (activeFilterCount()) document.getElementById("filter-panel").hidden = false;
  }

  function render() {
    updateFiltersToggleLabel();
    renderActiveChips();
    var searchMatched = grants.filter(textMatches).filter(savedMatches);
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
      var clearBtn = el("button", { type: "button", class: "reset-btn" }, ["Clear filters"]);
      clearBtn.addEventListener("click", function () {
        clearAllFilters();
        syncFilterButtons();
        render();
        syncUrl();
      });
      grid.appendChild(el("div", { class: "empty-state" }, [
        el("div", { class: "es-title" }, ["No grants match these filters"]),
        el("p", {}, ["Try clearing a filter or broadening your search."]),
        clearBtn,
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
        syncUrl();
      });
    });

    document.querySelectorAll('[data-filter="saved"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.savedOnly = !state.savedOnly;
        state.limit = PAGE_SIZE;
        btn.classList.toggle("active", state.savedOnly);
        render();
        syncUrl();
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
      syncUrl();
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
        syncUrl();
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
        syncUrl();
      });
    });

    document.getElementById("search-input").addEventListener("input", function (e) {
      state.search = e.target.value.trim().toLowerCase();
      state.limit = PAGE_SIZE;
      render();
      syncUrl();
    });

    document.getElementById("sort-select").addEventListener("change", function (e) {
      state.sort = e.target.value;
      render();
      syncUrl();
    });

    document.getElementById("show-more-btn").addEventListener("click", function () {
      state.limit += PAGE_SIZE;
      render();
    });

    document.getElementById("reset-filters").addEventListener("click", function () {
      clearAllFilters();
      render();
      syncUrl();
    });
  }

  fetchJSON("data/grants.json")
    .then(function (g) {
      grants = g;
      renderStats();
      renderFeatured();
      setupFinder();
      applyUrlToState();
      render();
      if (window.SavedGrants) window.SavedGrants.onChange(render);
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
