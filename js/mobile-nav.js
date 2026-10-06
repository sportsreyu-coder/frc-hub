// Makes the hamburger button at <= 720px actually open the main nav
// (F3) -- it previously had no listener at all, so the five main pages
// were unreachable on a phone except through the footer.
(function () {
  "use strict";

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("main-nav");
  if (!toggle || !nav) return;

  function close() {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }
  function open() {
    nav.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
  }

  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "main-nav");
  toggle.addEventListener("click", function (e) {
    e.stopPropagation();
    if (nav.classList.contains("open")) close(); else open();
  });

  nav.addEventListener("click", function (e) { e.stopPropagation(); });
  document.addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

  // A link tap should close the menu too (it's about to navigate, but
  // closing first avoids a flash of the open menu on the next page if
  // the browser restores scroll/DOM state from bfcache).
  nav.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", close);
  });
})();
