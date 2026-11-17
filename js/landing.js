// Signed-out landing page on index.html.
//
// Visibility: an inline script in <head> guesses "signed in" from the
// Supabase session key in localStorage and sets <html data-auth="in"> before
// first paint, so signed-in users never see the landing flash. Here we
// confirm with the real session and correct the guess either way (e.g. an
// expired token), and switch to the dashboard when someone signs in from
// the auth modal (which doesn't reload the page).
(function () {
  "use strict";

  var root = document.documentElement;

  function setSignedIn(signedIn) {
    var was = root.getAttribute("data-auth") === "in";
    if (signedIn) root.setAttribute("data-auth", "in");
    else root.removeAttribute("data-auth");
    if (signedIn && !was) window.scrollTo(0, 0);
  }

  var sb = window.__frcHubSupabase;
  if (sb) {
    sb.auth.getSession().then(function (res) {
      setSignedIn(!!(res.data.session && res.data.session.user));
    }, function () { setSignedIn(false); });
    sb.auth.onAuthStateChange(function (_event, session) {
      setSignedIn(!!(session && session.user));
    });
  } else {
    setSignedIn(false);
  }

  // ---- Kickoff countdown (first Saturday of January, same rule as season-core.js) ----

  function firstSaturdayOfJanuary(year) {
    var d = new Date(year, 0, 1);
    while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    return d;
  }

  (function kickoff() {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var k = firstSaturdayOfJanuary(today.getFullYear());
    var compWeek1 = new Date(k.getTime());
    compWeek1.setDate(compWeek1.getDate() + 49);
    var num = document.getElementById("lp-stat-kickoff");
    var label = document.getElementById("lp-stat-kickoff-label");
    var title = document.getElementById("lp-closing-title");

    if (today > k && today < compWeek1) {
      // Mid build season: count down to week 1 instead.
      num.textContent = String(Math.round((compWeek1 - today) / 86400000));
      label.textContent = "days to week 1";
      title.textContent = "Build season is on. Stay ahead of it.";
      return;
    }
    if (today >= compWeek1) k = firstSaturdayOfJanuary(today.getFullYear() + 1);
    var days = Math.round((k - today) / 86400000);
    num.textContent = days === 0 ? "Today" : String(days);
    label.textContent = days === 0 ? "is Kickoff" : (days === 1 ? "day to Kickoff" : "days to Kickoff");
  })();

  // ---- Live data: grant previews, counts, funder marquee ----

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function roundDown(n) {
    return n >= 20 ? Math.floor(n / 5) * 5 + "+" : String(n);
  }

  fetch("data/scholarships.json").then(function (r) { return r.ok ? r.json() : []; }).then(function (s) {
    if (s.length) document.getElementById("lp-stat-scholarships").textContent = roundDown(s.length);
  }).catch(function () {});

  fetch("data/grants.json").then(function (r) {
    if (!r.ok) throw new Error("grants");
    return r.json();
  }).then(function (grants) {
    var GS = window.GrantStatus;
    document.getElementById("lp-stat-grants").textContent = roundDown(grants.length);

    // Hero preview card: next three open grants by deadline.
    var preview = document.getElementById("lp-grants-preview");
    var soon = GS ? grants
      .filter(function (g) { return GS.isCurrentlyOpen(g) && g.closeDate; })
      .sort(function (a, b) { return GS.parseDate(a.closeDate) - GS.parseDate(b.closeDate); })
      .slice(0, 4) : [];
    preview.innerHTML = "";
    if (!soon.length) {
      preview.appendChild(el("div", "dash-mini-row")).appendChild(el("span", "dash-mini-label", "No deadlines published right now."));
    }
    soon.forEach(function (g) {
      var row = el("div", "dash-mini-row");
      row.appendChild(el("span", "dash-mini-label", g.name));
      row.appendChild(el("span", "dash-mini-date", GS.formatDeadline(GS.parseDate(g.closeDate))));
      preview.appendChild(row);
    });

    // Funder marquee: names rendered twice so the loop is seamless.
    var names = grants.map(function (g) { return g.name; });
    var track = document.getElementById("lp-marquee-track");
    var shown = names.slice(0, 28);
    [0, 1].forEach(function () {
      shown.forEach(function (name) { track.appendChild(el("span", "lp-funder", name)); });
    });
    var more = names.length - shown.length;
    if (more > 0) {
      document.getElementById("lp-marquee-more").textContent =
        "…and " + more + " more grants, plus " + document.getElementById("lp-stat-scholarships").textContent.replace("+", "") + "+ scholarships.";
    }
  }).catch(function () {
    document.getElementById("lp-grants-preview").innerHTML = "";
  });
})();
