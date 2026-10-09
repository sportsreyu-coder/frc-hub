// Dashboard nav dropdown. Hover opens it on desktop via CSS alone; this
// script only covers what CSS :hover can't: tapping the caret to toggle
// it open without navigating (for touch/trackpad users with no real
// hover), closing on outside click, and Escape-to-close for keyboard users.
(function () {
  "use strict";

  var group = document.getElementById("nav-dashboard-group");
  var trigger = document.getElementById("nav-dashboard-trigger");
  if (!group || !trigger) return;
  var caret = trigger.querySelector(".nav-caret");

  function close() {
    group.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }

  if (caret) {
    caret.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
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
})();
