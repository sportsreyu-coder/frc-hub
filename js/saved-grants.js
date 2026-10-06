// Shared "saved grants" bookmark state, used by grants.html's app.js (the
// star button + Saved filter + pipeline controls) and index.html's
// dashboard.js (the "saved grants closing soon" widget) so there's one
// source of truth instead of several copies of the same logic.
//
// Signed-out (or signed-in-without-a-team) users: localStorage only, keyed
// per-browser. Signed-in users on a team: the public.saved_grants table
// (team_id, grant_id, stage, owner, notes, ...) is the source of truth --
// that's also what gives G3's grant pipeline (stage/owner/notes) somewhere
// to live, which a plain array of ids never could. A signed-in user who
// isn't on a team yet falls back to localStorage only; there's no
// per-user cloud sync target for that case today.
(function () {
  "use strict";

  var KEY = "frcgrants_saved_grants";
  var ids = loadLocal();
  var pipeline = {}; // grant_id -> full saved_grants row, team mode only
  var listeners = [];
  var ready = Promise.resolve();

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) { /* ignore */ }
  }
  function notify() {
    listeners.forEach(function (fn) { fn(ids); });
  }

  // Merges anything starred locally (e.g. offline, or before joining a
  // team) into the team's saved_grants rows, so nothing starred earlier
  // is lost once a team is on the scene. Called once on load and after
  // every sign-in/team change.
  function syncWithTeam() {
    if (!window.FRCTeam || !window.FRCTeam.state.team) return Promise.resolve();
    return window.FRCTeam.loadSavedGrants().then(function (rows) {
      pipeline = {};
      rows.forEach(function (r) { pipeline[r.grant_id] = r; });
      var cloudIds = rows.map(function (r) { return r.grant_id; });
      var toAdd = ids.filter(function (id) { return cloudIds.indexOf(id) === -1; });
      ids = cloudIds.concat(toAdd);
      saveLocal();
      notify();
      if (toAdd.length) {
        return Promise.all(toAdd.map(function (id) { return window.FRCTeam.saveGrantToPipeline(id); })).then(syncWithTeam);
      }
    }).catch(function (err) { console.error(err); });
  }

  if (window.FRCTeam) {
    ready = window.FRCTeam.ready.then(syncWithTeam);
    window.FRCTeam.onChange(function () { syncWithTeam(); });
  }

  window.SavedGrants = {
    ready: ready,
    isSaved: function (id) { return ids.indexOf(id) !== -1; },
    getIds: function () { return ids.slice(); },
    // Re-pulls pipeline rows from the team's saved_grants table -- call
    // after editing a row's stage/owner/notes directly (not through
    // toggle()) so getPipelineEntry() reflects the change.
    refresh: function () { return syncWithTeam(); },
    // Full pipeline row (stage/owner/notes/...) when on a team and this
    // grant is saved; null otherwise (solo/no-team mode has no stage
    // tracking, just the plain saved/not-saved list).
    getPipelineEntry: function (id) { return pipeline[id] || null; },
    toggle: function (id) {
      var i = ids.indexOf(id);
      var willSave = i === -1;
      if (willSave) ids.push(id); else ids.splice(i, 1);
      saveLocal();
      notify();
      if (window.FRCTeam && window.FRCTeam.state.team) {
        var p = willSave ? window.FRCTeam.saveGrantToPipeline(id) : window.FRCTeam.unsaveGrantFromPipeline(id);
        p.then(syncWithTeam).catch(function (err) { console.error(err); });
      }
    },
    onChange: function (fn) { listeners.push(fn); },
  };
})();
