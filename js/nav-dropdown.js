// Nav dropdowns (Dashboard, Find grants). Hover opens them on desktop via
// CSS alone; this script only covers what CSS :hover can't: tapping the caret
// to toggle one open without navigating (for touch/trackpad users with no real
// hover), closing on outside click, and Escape-to-close for keyboard users.
(function () {
  "use strict";

  document.querySelectorAll(".nav-dropdown-group").forEach(function (group) {
    var trigger = group.querySelector(".nav-dropdown-trigger");
    if (!trigger) return;
    var caret = trigger.querySelector(".nav-caret");

    function close() {
      group.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    }

    if (caret) {
      caret.addEventListener("click", function (e) {
        e.preventDefault();
        var isOpen = group.classList.toggle("open");
        trigger.setAttribute("aria-expanded", String(isOpen));
      });
    }

    document.addEventListener("click", function (e) {
      if (!group.contains(e.target)) close();
    });

    group.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { close(); trigger.focus(); }
    });
  });
})();
