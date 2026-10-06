(function () {
  "use strict";

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

  var state = "";
  var activeType = "";
  var search = "";
  var sort = "az";
  var items = [];

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

  function mapSearchUrl(name, stateName) {
    var q = encodeURIComponent(name + " near " + stateName);
    return "https://www.google.com/maps/search/?api=1&query=" + q;
  }

  function renderTypeFilters() {
    var row = document.getElementById("type-filter-row");
    row.innerHTML = "";
    var types = Array.from(new Set(items.map(function (i) { return i.type; }).filter(Boolean))).sort();

    var allChip = el("button", { type: "button", class: "chip" + (!activeType ? " active" : "") }, ["All types"]);
    allChip.addEventListener("click", function () { activeType = ""; renderTypeFilters(); render(); });
    row.appendChild(allChip);

    types.forEach(function (t) {
      var chip = el("button", { type: "button", class: "chip" + (activeType === t ? " active" : "") }, [t]);
      chip.addEventListener("click", function () { activeType = t; renderTypeFilters(); render(); });
      row.appendChild(chip);
    });
  }

  function matches(item) {
    if (activeType && item.type !== activeType) return false;
    if (!search) return true;
    var hay = (item.name + " " + (item.notes || "") + " " + (item.type || "")).toLowerCase();
    return hay.indexOf(search) !== -1;
  }

  function sortItems(list) {
    var copy = list.slice();
    if (sort === "payout") {
      copy.sort(function (a, b) { return (b.payout || -1) - (a.payout || -1) || a.name.localeCompare(b.name); });
    } else if (sort === "type") {
      copy.sort(function (a, b) { return (a.type || "").localeCompare(b.type || "") || a.name.localeCompare(b.name); });
    } else {
      copy.sort(function (a, b) { return a.name.localeCompare(b.name); });
    }
    return copy;
  }

  function render() {
    var grid = document.getElementById("fundraising-grid");
    grid.innerHTML = "";
    var shown = sortItems(items.filter(matches));

    document.getElementById("fundraising-count").textContent =
      shown.length === items.length ? "Showing all " + items.length + " ideas" : "Showing " + shown.length + " of " + items.length + " ideas";

    if (shown.length === 0) {
      grid.appendChild(el("div", { class: "empty-state" }, [
        el("div", { class: "es-title" }, ["No fundraising ideas match those filters"]),
        el("p", {}, ["Try a different type or search term."]),
      ]));
      return;
    }

    shown.forEach(function (item) {
      var children = [
        el("span", { class: "badge" }, [item.type || "Fundraiser"]),
        el("a", { class: "title-link", href: item.link || "#", target: "_blank", rel: "noopener" }, [item.name]),
        item.payout ? el("div", { class: "gc-amount" }, [item.payout + "% back"]) : null,
        item.notes ? el("p", {}, [item.notes]) : null,
      ];
      if (state) {
        children.push(el("a", {
          class: "card-locate-link",
          href: mapSearchUrl(item.name, state),
          target: "_blank",
          rel: "noopener",
        }, ["Find near " + state + " →"]));
      }
      grid.appendChild(el("div", { class: "simple-card" }, children));
    });
  }

  var locateSelect = document.getElementById("locate-select");
  US_STATES.forEach(function (s) {
    locateSelect.appendChild(el("option", { value: s }, [s]));
  });
  locateSelect.addEventListener("change", function (e) {
    state = e.target.value;
    render();
  });

  document.getElementById("fundraising-search").addEventListener("input", function (e) {
    search = e.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById("fundraising-sort").addEventListener("change", function (e) {
    sort = e.target.value;
    render();
  });

  fetch("data/fundraising.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      items = data;
      renderTypeFilters();
      render();
    })
    .catch(function (err) { console.error(err); });
})();
