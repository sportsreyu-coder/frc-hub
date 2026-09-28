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

  function render() {
    var grid = document.getElementById("fundraising-grid");
    grid.innerHTML = "";
    var shown = activeType ? items.filter(function (i) { return i.type === activeType; }) : items;
    shown.forEach(function (item) {
      var children = [
        el("span", { class: "badge" }, [item.type || "Fundraiser"]),
        el("a", { class: "title-link", href: item.link || "#", target: "_blank", rel: "noopener" }, [item.name]),
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

  fetch("data/fundraising.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      items = data;
      renderTypeFilters();
      render();
    })
    .catch(function (err) { console.error(err); });
})();
