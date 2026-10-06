(function () {
  "use strict";

  var search = "";
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
    var hay = (item.name + " " + (item.notes || "") + " " + (item.team || "")).toLowerCase();
    return hay.indexOf(search) !== -1;
  }

  function render() {
    var grid = document.getElementById("resources-grid");
    grid.innerHTML = "";
    var shown = items.filter(matches);

    document.getElementById("resources-count").textContent =
      shown.length === items.length ? "Showing all " + items.length + " resources" : "Showing " + shown.length + " of " + items.length + " resources";

    if (shown.length === 0) {
      grid.appendChild(el("div", { class: "empty-state" }, [
        el("div", { class: "es-title" }, ["No resources match those filters"]),
        el("p", {}, ["Try a different type or search term."]),
      ]));
      return;
    }

    shown.forEach(function (item) {
      var titleBits = item.name + (item.year ? " (" + item.year + ")" : "");
      grid.appendChild(el("div", { class: "simple-card" }, [
        el("span", { class: "badge" }, [item.type || "Resource"]),
        el("a", { class: "title-link", href: item.link || "#", target: "_blank", rel: "noopener" }, [titleBits]),
        item.notes ? el("p", {}, [item.notes]) : null,
      ]));
    });
  }

  document.getElementById("resources-search").addEventListener("input", function (e) {
    search = e.target.value.trim().toLowerCase();
    render();
  });

  fetch("data/resources.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      items = data;
      renderTypeFilters();
      render();
    })
    .catch(function (err) {
      console.error(err);
      document.getElementById("resources-grid").innerHTML =
        '<div class="empty-state"><div class="es-title">Couldn\'t load resources</div><p>Check that data/resources.json is reachable.</p></div>';
    });
})();
