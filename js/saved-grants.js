// Shared "saved grants" bookmark state, used by grants.html's app.js (the
// star button + Saved filter) and index.html's dashboard.js (the "saved
// grants closing soon" widget) so there's one source of truth instead of
// two copies of the same localStorage/cloud-sync logic.
//
// Signed-out (or signed-in-without-a-team) users: localStorage only, keyed
// per-browser. Signed-in users on a team: merged into the same shared
// team_data blob Season Tracker already syncs (js/team.js loadTeamData/
// saveTeamData), under a `savedGrants` array, right alongside
// `completedGrants` -- so the whole team sees the same saved list, not
// just the one person who starred it. A signed-in user who isn't on a
// team yet falls back to localStorage only; there's no per-user cloud
// sync target for that case today (season_data is season-tracker-shaped,
// not a general per-user blob), so the "sync to your account" part of
// this only applies once you're on a team.
(function () {
  "use strict";

  var KEY = "frcgrants_saved_grants";
  var ids = loadLocal();
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

  // Merges the local list into the team's cloud copy (union, so nothing
  // starred offline is lost) and writes the merged result back both
  // places. Called once on load and after every sign-in/team change.
  function syncWithTeam() {
    if (!window.FRCTeam || !window.FRCTeam.state.team) return Promise.resolve();
    return window.FRCTeam.loadTeamData().then(function (data) {
      var cloud = (data && data.savedGrants) || [];
      var merged = cloud.slice();
      ids.forEach(function (id) { if (merged.indexOf(id) === -1) merged.push(id); });
      var changed = merged.length !== cloud.length || merged.some(function (id, i) { return id !== cloud[i]; });
      ids = merged;
      saveLocal();
      notify();
      if (changed) {
        var next = Object.assign({}, data || {}, { savedGrants: merged });
        return window.FRCTeam.saveTeamData(next);
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
    toggle: function (id) {
      var i = ids.indexOf(id);
      if (i === -1) ids.push(id); else ids.splice(i, 1);
      saveLocal();
      notify();
      if (window.FRCTeam && window.FRCTeam.state.team) {
        window.FRCTeam.loadTeamData().then(function (data) {
          return window.FRCTeam.saveTeamData(Object.assign({}, data || {}, { savedGrants: ids.slice() }));
        }).catch(function (err) { console.error(err); });
      }
    },
    onChange: function (fn) { listeners.push(fn); },
  };
})();
