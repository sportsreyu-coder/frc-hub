// Shared renderer for the resources/*.html category landing pages. Each
// page sets window.RESOURCES_CATEGORY_TYPE (a `type` value from
// data/resources.json) before loading this script, and provides
// #category-resource-grid / #category-count containers.
(function () {
  "use strict";

  var type = window.RESOURCES_CATEGORY_TYPE;

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

  fetch("../data/resources.json")
    .then(function (r) { return r.json(); })
    .then(function (items) {
      var matched = items.filter(function (i) { return i.type === type; });
      var grid = document.getElementById("category-resource-grid");
      var count = document.getElementById("category-count");

      count.textContent = matched.length === 0
        ? "Nothing in this category yet — check back soon."
        : "Showing " + matched.length + " resource" + (matched.length === 1 ? "" : "s") + ".";

      if (matched.length === 0) {
        grid.appendChild(el("div", { class: "empty-state" }, [
          el("div", { class: "es-title" }, ["Nothing here yet"]),
          el("p", {}, ["Check the full resources list for everything we track."]),
        ]));
        return;
      }

      matched.forEach(function (item) {
        var titleBits = item.name + (item.year ? " (" + item.year + ")" : "");
        grid.appendChild(el("div", { class: "simple-card" }, [
          el("span", { class: "badge" }, [item.type || "Resource"]),
          el("a", { class: "title-link", href: item.link || "#", target: "_blank", rel: "noopener" }, [titleBits]),
          item.notes ? el("p", {}, [item.notes]) : null,
        ]));
      });
    })
    .catch(function (err) {
      console.error(err);
      document.getElementById("category-resource-grid").innerHTML =
        '<div class="empty-state"><div class="es-title">Couldn\'t load resources</div><p>Check that data/resources.json is reachable.</p></div>';
    });
})();
