// Shared renderer for the grants/*.html category landing pages. Each page
// sets window.GRANTS_CATEGORY before loading this script:
//   { filter: function(grant) -> bool, sort: "deadline" | "az" (optional) }
// and provides #category-grant-grid / #category-count containers.
(function () {
  "use strict";

  var cfg = window.GRANTS_CATEGORY || {};
  var GrantStatus = window.GrantStatus;

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

  function closeTimestamp(g) {
    var d = GrantStatus.parseDate(g.closeDate);
    return d ? d.getTime() : Infinity;
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

  function sortGrants(list) {
    var copy = list.slice();
    if (cfg.sort === "az") {
      copy.sort(function (a, b) { return a.name.localeCompare(b.name); });
    } else {
      copy.sort(function (a, b) { return closeTimestamp(a) - closeTimestamp(b) || a.name.localeCompare(b.name); });
    }
    return copy;
  }

  function grantCard(g) {
    var p = GrantStatus.describe(g);
    var visibleTags = (g.tags || []).filter(function (t) { return TAG_LABELS[t]; });
    var verifiedText = GrantStatus.verifiedLabel(g.lastVerified);

    return el("article", { class: "grant-card" }, [
      el("div", { class: "gc-top" }, [
        el("h2", { class: "gc-name" }, [g.name]),
        el("span", { class: "pill " + p.cls }, [p.label]),
      ]),
      el("div", { class: "gc-dates" }, [datesLine(g)]),
      g.notes ? el("p", { class: "gc-notes" }, [g.notes]) : null,
      g.amount ? el("div", { class: "gc-amount" }, [g.amount]) : null,
      visibleTags.length ? el("div", { class: "gc-tags" }, visibleTags.map(function (t) {
        return el("span", { class: "tag" }, [TAG_LABELS[t]]);
      })) : null,
      el("div", { class: "gc-bottom" }, [
        g.employeeConnection === "yes" ? el("span", { class: "gc-meta" }, ["Employee/mentor tie noted"]) : null,
        el("a", { class: "gc-link", href: g.link || "#", target: "_blank", rel: "noopener" }, [g.link ? "View & apply →" : "No link yet"]),
      ]),
      el("div", { class: "gc-verified" + (verifiedText ? "" : " gc-needs-verification") }, [verifiedText || "Needs verification"]),
    ]);
  }

  fetch("../data/grants.json")
    .then(function (r) { return r.json(); })
    .then(function (grants) {
      var matched = sortGrants(grants.filter(cfg.filter));
      var grid = document.getElementById("category-grant-grid");
      var count = document.getElementById("category-count");

      count.textContent = matched.length === 0
        ? "No grants currently match this category — check back soon."
        : "Showing " + matched.length + " grant" + (matched.length === 1 ? "" : "s") + ".";

      if (matched.length === 0) {
        grid.appendChild(el("div", { class: "empty-state" }, [
          el("div", { class: "es-title" }, ["Nothing here yet"]),
          el("p", {}, ["Check the full grants list for everything we track."]),
        ]));
        return;
      }

      matched.forEach(function (g) { grid.appendChild(grantCard(g)); });
    })
    .catch(function (err) {
      console.error(err);
      document.getElementById("category-grant-grid").innerHTML =
        '<div class="empty-state"><div class="es-title">Couldn\'t load grant data</div><p>Check that data/grants.json is reachable.</p></div>';
    });
})();
