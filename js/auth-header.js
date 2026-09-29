// Shared, site-wide "am I signed in" header widget. Runs on every page:
// shows a Google avatar (or an initial-letter fallback) with a sign-out
// dropdown when signed in, and the plain "Sign in" link otherwise.
//
// Exposes window.__frcHubSupabase so other scripts on the same page
// (account.js, season.js's cloud sync) reuse this one client instead of
// each creating their own -- supabase-js warns/misbehaves with multiple
// GoTrueClient instances sharing the same storage key on one page.
(function () {
  "use strict";

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) return;

  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  window.__frcHubSupabase = sb;

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

  function initialFor(name) {
    var trimmed = (name || "?").trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
  }

  function renderSignedIn(user) {
    var slot = document.getElementById("account-slot");
    if (!slot) return;

    var meta = user.user_metadata || {};
    var avatarUrl = meta.avatar_url || meta.picture;
    var googleName = meta.full_name || meta.name || user.email || "";

    function build(profile) {
      profile = profile || {};
      var name = profile.display_name || googleName;
      var hex = profile.avatar_color && window.FRC_AVATAR_COLOR_HEX && window.FRC_AVATAR_COLOR_HEX[profile.avatar_color];

      var btn = el("button", { type: "button", class: "account-avatar-btn", "aria-label": "Account menu" },
        avatarUrl ? [el("img", { src: avatarUrl, alt: "", referrerpolicy: "no-referrer" })] : [initialFor(name)]
      );
      if (hex) {
        if (!avatarUrl) btn.style.background = hex;
        btn.style.boxShadow = "0 0 0 2px " + hex;
      }

      var dropdownChildren = [];
      if (profile.display_name) dropdownChildren.push(el("div", { class: "account-dropdown-name" }, [profile.display_name]));
      dropdownChildren.push(el("div", { class: "account-dropdown-email" }, [user.email || ""]));
      dropdownChildren.push(el("a", { class: "account-dropdown-action", href: "account.html" }, ["Profile settings"]));
      dropdownChildren.push(el("button", { type: "button", class: "account-dropdown-action account-dropdown-signout" }, ["Sign out"]));

      var dropdown = el("div", { class: "account-dropdown", hidden: "" }, dropdownChildren);
      dropdown.querySelector(".account-dropdown-signout").addEventListener("click", function () {
        sb.auth.signOut();
      });

      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        dropdown.hidden = !dropdown.hidden;
      });
      document.addEventListener("click", function () { dropdown.hidden = true; });
      dropdown.addEventListener("click", function (e) { e.stopPropagation(); });

      slot.innerHTML = "";
      slot.appendChild(el("div", { class: "account-avatar-wrap" }, [btn, dropdown]));
    }

    sb.from("profiles").select("display_name, avatar_color").eq("id", user.id).maybeSingle().then(function (res) {
      build(res && res.data);
    }, function () { build(null); });
  }

  function renderSignedOut() {
    var slot = document.getElementById("account-slot");
    if (!slot) return;
    slot.innerHTML = '<a href="account.html" class="nav-cta">Sign in</a>';
  }

  sb.auth.onAuthStateChange(function (_event, session) {
    if (session && session.user) renderSignedIn(session.user);
    else renderSignedOut();
  });

  sb.auth.getSession().then(function (res) {
    var session = res.data.session;
    if (session && session.user) renderSignedIn(session.user);
    else renderSignedOut();
  });
})();
