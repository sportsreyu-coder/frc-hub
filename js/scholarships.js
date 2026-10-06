(function () {
  "use strict";

  var CATEGORY_LABELS = {
    "frc-specific": "FIRST/FRC-specific",
    "stem-general": "General STEM",
  };

  var activeCategory = "";
  var search = "";
  var scholarships = [];

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

  function render() {
    var grid = document.getElementById("scholarships-grid");
    grid.innerHTML = "";

    var shown = scholarships.filter(function (s) {
      if (activeCategory && s.category !== activeCategory) return false;
      if (!search) return true;
      var hay = (s.name + " " + s.provider + " " + (s.notes || "")).toLowerCase();
      return hay.indexOf(search) !== -1;
    });

    document.getElementById("scholarships-count").textContent =
      shown.length + (shown.length === 1 ? " scholarship" : " scholarships") +
      (activeCategory ? " — " + CATEGORY_LABELS[activeCategory] : "");

    if (shown.length === 0) {
      grid.appendChild(el("div", { class: "empty-state" }, [
        el("div", { class: "es-title" }, ["No scholarships match those filters"]),
        el("p", {}, ["Try a different category or search term."]),
      ]));
      return;
    }

    shown.forEach(function (s) {
      var verifiedText = window.GrantStatus ? window.GrantStatus.verifiedLabel(s.lastVerified) : null;
      var card = el("div", { class: "simple-card" }, [
        el("span", { class: "badge" }, [CATEGORY_LABELS[s.category] || s.category]),
        el("a", { class: "title-link", href: s.link, target: "_blank", rel: "noopener" }, [s.name]),
        el("p", { class: "scholarship-provider" }, [s.provider]),
        el("p", { class: "scholarship-meta" }, ["💰 " + s.amount]),
        el("p", { class: "scholarship-meta" }, ["📅 " + s.deadline]),
        s.notes ? el("p", {}, [s.notes]) : null,
        el("div", { class: "gc-verified" + (verifiedText ? "" : " gc-needs-verification") }, [verifiedText || "Needs verification"]),
      ]);
      grid.appendChild(card);
    });
  }

  document.querySelectorAll(".scholarship-filter-chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var value = chip.getAttribute("data-category");
      activeCategory = activeCategory === value ? "" : value;
      document.querySelectorAll(".scholarship-filter-chip").forEach(function (c) {
        c.classList.toggle("active", c.getAttribute("data-category") === activeCategory);
      });
      render();
    });
  });

  document.getElementById("scholarships-search").addEventListener("input", function (e) {
    search = e.target.value.trim().toLowerCase();
    render();
  });

  fetch("data/scholarships.json")
    .then(function (r) { return r.json(); })
    .then(function (items) {
      scholarships = items;
      render();
    })
    .catch(function (err) {
      console.error(err);
      document.getElementById("scholarships-grid").innerHTML =
        '<div class="empty-state"><div class="es-title">Couldn\'t load scholarship data</div><p>Check that data/scholarships.json is reachable.</p></div>';
    });
})();
