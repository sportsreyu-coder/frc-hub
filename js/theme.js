(function () {
  "use strict";

  var KEY = "frcgrants_theme";

  function apply(theme) {
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");

    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    var sun = btn.querySelector(".icon-sun");
    var moon = btn.querySelector(".icon-moon");
    // Plain `.hidden = ...` doesn't reliably reflect to the attribute on
    // SVGElement in every browser, so set/remove the attribute directly.
    if (sun) { if (theme === "dark") sun.setAttribute("hidden", ""); else sun.removeAttribute("hidden"); }
    if (moon) { if (theme !== "dark") moon.setAttribute("hidden", ""); else moon.removeAttribute("hidden"); }
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  }

  function current() {
    try {
      return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
    } catch (e) {
      return "light";
    }
  }

  function setTheme(theme) {
    try { localStorage.setItem(KEY, theme); } catch (e) { /* ignore */ }
    apply(theme);
  }

  document.addEventListener("DOMContentLoaded", function () {
    apply(current());
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.addEventListener("click", function () {
        setTheme(current() === "dark" ? "light" : "dark");
      });
    }
  });
})();
