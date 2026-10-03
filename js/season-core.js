// Shared date math for the Season Tracker, used by both season.html and
// the dashboard widget so the two never disagree about "today's" pace.
window.SeasonCore = (function () {
  "use strict";

  var MS_PER_DAY = 24 * 60 * 60 * 1000;
  var STORAGE_KEY = "frcgrants_season_progress_v1";
  var MILESTONE_OVERRIDES_KEY = "frcgrants_season_milestone_overrides_v1";
  var HIDDEN_MILESTONES_KEY = "frcgrants_season_hidden_milestones_v1";
  var COMP_WEEK_KEY = "frcgrants_season_comp_week_v1";
  var DEFAULT_COMP_WEEK = 1;

  // The whole Build Season schedule (season-data.js's SEASON_MILESTONES,
  // SEASON_FINE_GOALS, etc.) is authored for a team whose first event lands
  // exactly 49 days (7 weeks) after Kickoff -- "competition week 1". A
  // mentor can push that first-event week later in Team Settings, and the
  // schedule flexes to fill the extra runway: everything from Kickoff
  // through the end of CAD (day BUILD_SEASON_TAIL_START) stretches
  // proportionally, so a longer runway buys more prototyping/CAD/
  // programming time, while fabrication, assembly, wiring, and the final
  // driver-practice sprint (the "tail") keep the same fixed duration right
  // up against the new event date -- building a robot doesn't get easier
  // just because you have more weeks to do it in. Competition Season and
  // Postseason milestones, which are all authored as "N days after the
  // first event", shift by the same amount the event itself shifts.
  var BUILD_SEASON_BASE_DAY = 49; // baseline first-event offset (competition week 1)
  var BUILD_SEASON_TAIL_START = 23; // baseline bs-cad offset: design's done, building takes over

  function loadCompWeek() {
    try {
      var v = JSON.parse(localStorage.getItem(COMP_WEEK_KEY) || "null");
      return (typeof v === "number" && v > 0) ? v : DEFAULT_COMP_WEEK;
    } catch (e) {
      return DEFAULT_COMP_WEEK;
    }
  }
  function saveCompWeek(n) {
    var v = Math.max(1, Math.round(n) || DEFAULT_COMP_WEEK);
    try { localStorage.setItem(COMP_WEEK_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
    return v;
  }

  function resolveCompDay(compWeek) {
    return BUILD_SEASON_BASE_DAY + (Math.max(1, compWeek) - 1) * 7;
  }

  // Maps a baseline (competition-week-1) day number to where it falls once
  // the first event is pushed out to `compDay`. Days at/before Kickoff
  // (preseason, which doesn't depend on the competition date) pass through
  // unchanged; days through BUILD_SEASON_TAIL_START scale to fill the
  // stretched front of the season; everything after that shifts by a
  // constant so the "finish the robot" tail keeps its original length.
  function remapBuildDay(day, compDay) {
    if (day <= 0) return day;
    var tailLen = BUILD_SEASON_BASE_DAY - BUILD_SEASON_TAIL_START;
    var frontLen = compDay - tailLen;
    if (day <= BUILD_SEASON_TAIL_START) {
      return Math.round(day * frontLen / BUILD_SEASON_TAIL_START);
    }
    return frontLen + (day - BUILD_SEASON_TAIL_START);
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function firstSaturdayOfJanuary(year) {
    var d = new Date(year, 0, 1);
    var day = d.getDay(); // 0 = Sunday .. 6 = Saturday
    var delta = (6 - day + 7) % 7;
    return startOfDay(new Date(year, 0, 1 + delta));
  }

  function addDays(date, days) {
    return new Date(date.getTime() + days * MS_PER_DAY);
  }

  function daysBetween(a, b) {
    return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
  }

  // If we're within the ~18-week preseason window before the next
  // Kickoff, anchor to that upcoming one (offsets read as "days to go").
  // Otherwise anchor to the most recent past Kickoff (build season onward).
  function resolveAnchor(today) {
    var year = today.getFullYear();
    var kickoffThisYear = firstSaturdayOfJanuary(year);
    var nextKickoff = today <= kickoffThisYear ? kickoffThisYear : firstSaturdayOfJanuary(year + 1);
    var prevKickoff = firstSaturdayOfJanuary(nextKickoff.getFullYear() - 1);

    var daysToNext = daysBetween(today, nextKickoff);
    if (daysToNext <= 126) return nextKickoff;
    return prevKickoff;
  }

  function formatDate(d) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveProgress(p) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (e) { /* ignore -- private browsing etc. */ }
  }

  // Teams can rename/reassign a curated milestone, or hide one that doesn't
  // apply to them, from the Season Tracker's checklist. Both are stored
  // here (rather than in season.js) so every consumer of
  // getMilestonesWithDates() -- the tracker page and the dashboard widget
  // alike -- reflects the same edits without having to duplicate the logic.
  function loadMilestoneOverrides() {
    try { return JSON.parse(localStorage.getItem(MILESTONE_OVERRIDES_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveMilestoneOverrides(o) {
    try { localStorage.setItem(MILESTONE_OVERRIDES_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ }
  }
  function loadHiddenMilestones() {
    try { return JSON.parse(localStorage.getItem(HIDDEN_MILESTONES_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveHiddenMilestones(list) {
    try { localStorage.setItem(HIDDEN_MILESTONES_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  function getMilestonesWithDates() {
    var today = startOfDay(new Date());
    var anchor = resolveAnchor(today);
    var compDay = resolveCompDay(loadCompWeek());
    var overrides = loadMilestoneOverrides();
    var hidden = loadHiddenMilestones();
    return (window.SEASON_MILESTONES || [])
      .filter(function (m) { return hidden.indexOf(m.id) === -1; })
      .map(function (m) {
        var offset = remapBuildDay(m.offset, compDay);
        var merged = Object.assign({}, m, { offset: offset, date: addDays(anchor, offset) });
        var ov = overrides[m.id];
        if (ov) {
          if (ov.label) merged.label = ov.label;
          if (ov.team) merged.team = ov.team;
        }
        return merged;
      });
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    startOfDay: startOfDay,
    firstSaturdayOfJanuary: firstSaturdayOfJanuary,
    addDays: addDays,
    daysBetween: daysBetween,
    resolveAnchor: resolveAnchor,
    formatDate: formatDate,
    loadProgress: loadProgress,
    saveProgress: saveProgress,
    getMilestonesWithDates: getMilestonesWithDates,
    loadMilestoneOverrides: loadMilestoneOverrides,
    saveMilestoneOverrides: saveMilestoneOverrides,
    loadHiddenMilestones: loadHiddenMilestones,
    saveHiddenMilestones: saveHiddenMilestones,
    DEFAULT_COMP_WEEK: DEFAULT_COMP_WEEK,
    loadCompWeek: loadCompWeek,
    saveCompWeek: saveCompWeek,
    resolveCompDay: resolveCompDay,
    remapBuildDay: remapBuildDay,
  };
})();
