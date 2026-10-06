// Shared grant status computation -- the single source of truth for
// "is this grant actually open right now," used by grants.html, the
// dashboard widget, and the season tracker's Grant Deadlines tab so the
// three pages can't disagree with each other again.
//
// data/grants.json's openDate/closeDate are "Month Day, Year" strings
// (an explicit year was backfilled into every parseable one so status
// is stable regardless of which year the visitor's clock says it is).
// The hand-entered `status` field ("open"/"closed"/"unsure") is still
// the source of truth when there's no date to check it against, but a
// date that contradicts it wins -- that mismatch is exactly the bug
// this exists to fix (grants with a closeDate weeks in the past were
// still hand-tagged "open").
(function () {
  "use strict";

  var MONTHS = {
    january: 0, jan: 0, "janurary": 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8, sept: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11,
  };

  function parseDate(str) {
    if (!str) return null;
    var m = String(str).trim().toLowerCase().match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})$/);
    if (!m) return null;
    var month = MONTHS[m[1]];
    if (month === undefined) return null;
    var d = new Date(parseInt(m[3], 10), month, parseInt(m[2], 10));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function startOfDay(d) {
    var c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  }

  // Returns one of: "upcoming", "open", "closing-soon", "closed", "rolling", "unknown".
  function getGrantStatus(grant, today) {
    // Guards against `arr.filter(GrantStatus.isCurrentlyOpen)`-style calls,
    // where the array passes its index as this second argument.
    today = startOfDay(today instanceof Date ? today : new Date());
    var openD = parseDate(grant.openDate);
    var closeD = parseDate(grant.closeDate);
    var hand = grant.status;

    if (hand === "unsure") return "unknown";

    if (!openD && !closeD) {
      return hand === "open" ? "rolling" : "closed";
    }

    if (hand === "closed") {
      // A future open date is a plain fact, not a guess -- it can't be
      // open yet if its own stated start date hasn't happened.
      if (openD && openD > today) return "upcoming";
      return "closed";
    }

    // hand === "open"
    if (closeD) {
      var diffDays = Math.round((closeD - today) / 86400000);
      if (diffDays < 0) return "closed";
      if (diffDays <= 14) return "closing-soon";
      return "open";
    }
    if (openD && openD > today) return "upcoming";
    return "rolling";
  }

  function isCurrentlyOpen(grant, today) {
    var s = getGrantStatus(grant, today);
    return s === "open" || s === "closing-soon";
  }

  var MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // "Oct 17" when `date` falls in the same year as `today`, else "Oct 17, 2026".
  function formatDeadline(date, today) {
    today = today instanceof Date ? today : new Date();
    var out = MONTH_SHORT[date.getMonth()] + " " + date.getDate();
    if (date.getFullYear() !== today.getFullYear()) out += ", " + date.getFullYear();
    return out;
  }

  // Badge for a grant: { key, cls, label }. One pill class per status key
  // (see css/styles.css) and never color-only -- label always says why.
  function describe(grant, today) {
    today = startOfDay(today instanceof Date ? today : new Date());
    var key = getGrantStatus(grant, today);
    var openD = parseDate(grant.openDate);
    var closeD = parseDate(grant.closeDate);

    if (key === "closing-soon") {
      var days = Math.round((closeD - today) / 86400000);
      return { key: key, cls: "pill-closing-soon", label: days === 0 ? "Closes today" : "Closes in " + days + (days === 1 ? " day" : " days") };
    }
    if (key === "upcoming") {
      return { key: key, cls: "pill-upcoming", label: "Opens " + formatDeadline(openD, today) };
    }
    if (key === "open") return { key: key, cls: "pill-open", label: "Open" };
    if (key === "closed") return { key: key, cls: "pill-closed", label: "Closed" };
    if (key === "rolling") return { key: key, cls: "pill-rolling", label: "Rolling" };
    return { key: key, cls: "pill-unknown", label: "Dates not published" };
  }

  // "Verified Sep 2026" from an item's `lastVerified` ISO date (YYYY-MM-DD),
  // or null if it's missing, unparseable, or older than 12 months -- those
  // all render as "Needs verification" instead (see callers).
  function verifiedLabel(lastVerified, today) {
    if (!lastVerified) return null;
    var d = new Date(lastVerified);
    if (isNaN(d.getTime())) return null;
    today = today instanceof Date ? today : new Date();
    var months = (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
    if (months >= 12) return null;
    return "Verified " + MONTH_SHORT[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }

  window.GrantStatus = {
    getGrantStatus: getGrantStatus,
    parseDate: parseDate,
    isCurrentlyOpen: isCurrentlyOpen,
    formatDeadline: formatDeadline,
    describe: describe,
    verifiedLabel: verifiedLabel,
  };
})();
