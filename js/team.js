// Shared team-membership state + permission helpers + thin RPC wrappers,
// used by account.js, season.js, and grants.html's app.js so none of them
// duplicate "what team am I on, and what am I allowed to do." Reuses
// window.__frcHubSupabase set up by auth-header.js -- load this script
// after that one.
//
// Exposes window.FRCTeam. `FRCTeam.state` is always current after
// `FRCTeam.ready` resolves or an `onChange` callback fires -- read it
// directly rather than caching a copy, since it's replaced wholesale on
// every auth/membership change.
(function () {
  "use strict";

  var sb = null;
  var state = { user: null, team: null, membership: null };
  var listeners = [];
  var readyResolve;
  var ready = new Promise(function (resolve) { readyResolve = resolve; });

  // What each captain role can assign to -- subteam keys match
  // js/season.js's TEAM_LABELS. team_captain gets every subteam (plus the
  // roster-edit permission handled separately via canEditRoster()).
  var CAPTAIN_SCOPES = {
    team_captain: ["design", "mechanical", "electrical", "programming", "business", "cross-team", "custom"],
    technical_captain: ["design", "mechanical", "electrical", "programming"],
    nontechnical_captain: ["business", "cross-team", "custom"],
    design_captain: ["design"],
    mechanical_captain: ["mechanical"],
    electrical_captain: ["electrical"],
    programming_captain: ["programming"],
    business_captain: ["business"],
  };

  function notify() {
    listeners.forEach(function (fn) { fn(state); });
  }

  function loadMembership() {
    if (!state.user) {
      state.team = null;
      state.membership = null;
      readyResolve();
      notify();
      return Promise.resolve();
    }
    return sb
      .from("team_members")
      .select("role, subteam, captain_roles, teams(*)")
      .eq("user_id", state.user.id)
      .maybeSingle()
      .then(function (res) {
        if (res.data) {
          state.membership = { role: res.data.role, subteam: res.data.subteam, captain_roles: res.data.captain_roles || [] };
          state.team = res.data.teams;
        } else {
          state.membership = null;
          state.team = null;
        }
        readyResolve();
        notify();
      });
  }

  function init() {
    sb = window.__frcHubSupabase;
    if (!sb) return;

    sb.auth.onAuthStateChange(function (_event, session) {
      state.user = session ? session.user : null;
      loadMembership();
    });
    sb.auth.getSession().then(function (res) {
      state.user = res.data.session ? res.data.session.user : null;
      loadMembership();
    });
  }

  function isMentor() { return !!state.membership && state.membership.role === "mentor"; }
  function captainRoles() { return state.membership ? state.membership.captain_roles || [] : []; }
  function isTeamCaptain() { return isMentor() || captainRoles().indexOf("team_captain") !== -1; }

  function captainScope() {
    if (isMentor()) return ["design", "mechanical", "electrical", "programming", "business", "cross-team", "custom"];
    var scope = [];
    captainRoles().forEach(function (r) {
      (CAPTAIN_SCOPES[r] || []).forEach(function (s) { if (scope.indexOf(s) === -1) scope.push(s); });
    });
    return scope;
  }

  function canAssign(subteam) {
    if (!state.team) return true; // solo/no-team mode -- unrestricted, same as today
    return isMentor() || captainScope().indexOf(subteam || "cross-team") !== -1;
  }

  function canEditTeamSettings() { return !state.team || isMentor() || isTeamCaptain(); }
  function canEditRoster() { return isMentor() || isTeamCaptain(); }

  function rpc(name, args) {
    return sb.rpc(name, args).then(function (res) {
      if (res.error) throw new Error(res.error.message);
      return res.data;
    });
  }

  // Every RPC that changes membership itself (create/join/leave/delete/
  // promote) re-loads membership afterward so state.team/state.membership
  // reflect it immediately, without the caller having to remember to.
  function refreshAfter(promise) {
    return promise.then(function (result) {
      return loadMembership().then(function () { return result; });
    });
  }

  window.FRCTeam = {
    ready: ready,
    state: state,
    onChange: function (fn) { listeners.push(fn); },

    isMentor: isMentor,
    isTeamCaptain: isTeamCaptain,
    captainScope: captainScope,
    canAssign: canAssign,
    canEditTeamSettings: canEditTeamSettings,
    canEditRoster: canEditRoster,

    createTeam: function (teamNumber, teamName, district) {
      return refreshAfter(rpc("create_team", { p_team_number: teamNumber, p_team_name: teamName, p_district: district }));
    },
    joinTeam: function (code) {
      return refreshAfter(rpc("join_team", { p_code: code }));
    },
    leaveTeam: function () {
      return refreshAfter(rpc("leave_team", {}));
    },
    deleteTeam: function () {
      return refreshAfter(rpc("delete_team", {}));
    },
    regenerateCode: function (which) {
      return rpc("regenerate_join_code", { p_team_id: state.team.id, p_which: which }).then(function (code) {
        return loadMembership().then(function () { return code; });
      });
    },
    updateTeamInfo: function (teamNumber, teamName, district) {
      return refreshAfter(rpc("update_team_info", { p_team_id: state.team.id, p_team_number: teamNumber, p_team_name: teamName, p_district: district }));
    },
    setMemberRoles: function (userId, subteam, captainRolesList) {
      return rpc("set_member_roles", { p_user_id: userId, p_subteam: subteam, p_captain_roles: captainRolesList });
    },
    removeMember: function (userId) {
      return rpc("remove_member", { p_user_id: userId });
    },
    promoteToMentor: function (userId) {
      return rpc("promote_to_mentor", { p_user_id: userId });
    },
    startNewSeason: function () {
      return rpc("start_new_season", { p_team_id: state.team.id });
    },

    // Two queries, merged client-side, rather than a PostgREST embed --
    // team_members.user_id and profiles.id both reference auth.users.id
    // independently, there's no direct FK between the two tables for
    // PostgREST to embed across, and a profiles row may not exist yet for
    // a brand-new member.
    loadRoster: function () {
      if (!state.team) return Promise.resolve([]);
      return sb
        .from("team_members")
        .select("user_id, role, subteam, captain_roles, joined_at")
        .eq("team_id", state.team.id)
        .then(function (res) {
          if (res.error) throw new Error(res.error.message);
          var rows = res.data || [];
          var ids = rows.map(function (r) { return r.user_id; });
          if (!ids.length) return rows;
          return sb
            .from("profiles")
            .select("id, display_name, avatar_color")
            .in("id", ids)
            .then(function (pres) {
              var byId = {};
              (pres.data || []).forEach(function (p) { byId[p.id] = p; });
              rows.forEach(function (r) { r.profile = byId[r.user_id] || null; });
              return rows;
            });
        });
    },
    loadTeamData: function () {
      if (!state.team) return Promise.resolve(null);
      return sb.from("team_data").select("data").eq("team_id", state.team.id).maybeSingle().then(function (res) {
        if (res.error) throw new Error(res.error.message);
        return res.data ? res.data.data : null;
      });
    },
    saveTeamData: function (data) {
      if (!state.team) return Promise.resolve();
      return sb.from("team_data").upsert({ team_id: state.team.id, data: data, updated_at: new Date().toISOString() }).then(function (res) {
        if (res.error) throw new Error(res.error.message);
      });
    },
  };

  init();
})();
