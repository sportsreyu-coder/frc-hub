(function () {
  "use strict";

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    document.getElementById("config-warning").hidden = false;
    return;
  }

  var sb = window.__frcHubSupabase || window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  document.getElementById("app").hidden = false;

  var currentUser = null;

  function showError(el, msg) {
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  }

  var authInfo = document.getElementById("auth-info");
  function showInfo(msg) { showError(authInfo, msg); }

  document.getElementById("signout-btn").addEventListener("click", async function () {
    await sb.auth.signOut();
  });

  // G5: self-serve data export/deletion -- see delete_my_data() in
  // supabase/schema.sql for exactly what deletion covers (profile,
  // forum posts/replies, solo season_data) and what it deliberately
  // doesn't (team data, the auth account itself).
  document.getElementById("export-data-btn").addEventListener("click", async function () {
    if (!currentUser) return;
    var exportInfo = document.getElementById("export-info");
    showError(exportInfo, "Gathering your data…");
    var data = {
      account: { id: currentUser.id, email: currentUser.email, created_at: currentUser.created_at },
      profile: null,
      season_data: null,
      team: null,
    };
    try {
      var profileRes = await sb.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
      data.profile = profileRes.data || null;
      var seasonRes = await sb.from("season_data").select("data, updated_at").eq("user_id", currentUser.id).maybeSingle();
      data.season_data = seasonRes.data || null;
      if (window.FRCTeam && window.FRCTeam.state.team) {
        data.team = {
          team_number: window.FRCTeam.state.team.team_number,
          team_name: window.FRCTeam.state.team.team_name,
          role: window.FRCTeam.state.membership && window.FRCTeam.state.membership.role,
        };
      }
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "frc-hub-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showError(exportInfo, "Downloaded.");
    } catch (err) {
      showError(exportInfo, "Couldn't gather your data: " + err.message);
    }
  });

  document.getElementById("delete-account-btn").addEventListener("click", async function () {
    if (!currentUser) return;
    var errEl = document.getElementById("delete-account-error");
    if (window.FRCTeam && window.FRCTeam.state.team) {
      showError(errEl, "Leave your team first (see the Team tab), then come back to delete your account data.");
      return;
    }
    if (!confirm("Delete your FRC Hub profile, forum posts, and season progress? This can't be undone.")) return;
    try { await removeAvatarFiles(null); } catch (e) { /* best-effort; the profile row still goes */ }
    var res = await sb.rpc("delete_my_data");
    if (res.error) { showError(errEl, res.error.message); return; }
    await sb.auth.signOut();
    location.href = "index.html";
  });

  var selectedAvatarColor = "";
  var swatchRow = document.getElementById("color-swatch-row");

  function renderSwatches() {
    swatchRow.innerHTML = "";
    var options = [{ value: "", hex: null }].concat(window.FRC_AVATAR_COLORS || []);
    options.forEach(function (opt) {
      var sw = document.createElement("button");
      sw.type = "button";
      sw.className = "color-swatch" + (opt.hex ? "" : " is-empty") + (opt.value === selectedAvatarColor ? " selected" : "");
      if (opt.hex) sw.style.background = opt.hex;
      sw.setAttribute("aria-label", opt.value || "Default");
      sw.addEventListener("click", function () {
        selectedAvatarColor = opt.value;
        renderSwatches();
      });
      swatchRow.appendChild(sw);
    });
  }
  renderSwatches();

  // ---- Profile picture. Uploads go to the `avatars` Storage bucket
  // under `<user id>/` (see supabase/schema.sql). The URL is written to
  // profiles.avatar_url when the row exists and always to auth metadata
  // (`custom_avatar_url`) so users without a team -- who have no
  // profiles row yet -- still get it. Removing it falls back to the
  // Google photo, then the colored initial.
  var customAvatarUrl = "";
  var AVATAR_SIZE = 256;
  var avatarFileInput = document.getElementById("avatar-file-input");
  var avatarRemoveBtn = document.getElementById("avatar-remove-btn");
  var avatarUploadLabel = document.querySelector(".avatar-upload-btn");
  var avatarStatus = document.getElementById("avatar-upload-status");
  var avatarStatusDefault = avatarStatus.textContent;

  function setAvatarStatus(msg) { avatarStatus.textContent = msg || avatarStatusDefault; }
  function setAvatarBusy(busy) {
    avatarUploadLabel.classList.toggle("is-busy", busy);
    avatarFileInput.disabled = busy;
    avatarRemoveBtn.disabled = busy;
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("that file isn't a readable image")); };
      img.src = url;
    });
  }

  // ---- Cropper (Discord-style): the image sits behind a circular
  // cut-out; drag to pan, slider/wheel/+- to zoom. Everything is kept in
  // stage pixels: `scale` maps natural image px -> stage px, and
  // (offX, offY) is the image center's offset from the stage center.
  // The image may never be panned or zoomed so the circle shows past its
  // edge. The result is a square JPEG of what's inside the circle; CSS
  // rounds it everywhere it's shown.
  var CROP_RATIO = 0.8; // circle diameter / stage width -- matches .avatar-crop-mask
  var MAX_ZOOM = 4;
  var cropOverlay = document.getElementById("avatar-crop-overlay");
  var cropStage = document.getElementById("avatar-crop-stage");
  var cropImgEl = document.getElementById("avatar-crop-img");
  var cropZoom = document.getElementById("avatar-crop-zoom");
  var crop = null; // { img, zoom, offX, offY, resolve }

  function cropGeometry() {
    var stage = cropStage.clientWidth;
    var circle = stage * CROP_RATIO;
    var w = crop.img.naturalWidth, h = crop.img.naturalHeight;
    var scale = (circle / Math.min(w, h)) * crop.zoom;
    return { stage: stage, circle: circle, w: w, h: h, scale: scale };
  }

  function clampCrop() {
    var g = cropGeometry();
    var maxX = Math.max(0, (g.w * g.scale - g.circle) / 2);
    var maxY = Math.max(0, (g.h * g.scale - g.circle) / 2);
    crop.offX = Math.max(-maxX, Math.min(maxX, crop.offX));
    crop.offY = Math.max(-maxY, Math.min(maxY, crop.offY));
  }

  function renderCrop() {
    clampCrop();
    var g = cropGeometry();
    var dw = g.w * g.scale, dh = g.h * g.scale;
    cropImgEl.style.width = dw + "px";
    cropImgEl.style.height = dh + "px";
    cropImgEl.style.left = (g.stage - dw) / 2 + crop.offX + "px";
    cropImgEl.style.top = (g.stage - dh) / 2 + crop.offY + "px";
    cropZoom.value = crop.zoom;
  }

  // Zooms toward the stage center, keeping whatever is under it in place.
  function setCropZoom(z) {
    z = Math.max(1, Math.min(MAX_ZOOM, z));
    var ratio = z / crop.zoom;
    crop.offX *= ratio;
    crop.offY *= ratio;
    crop.zoom = z;
    renderCrop();
  }

  function closeCropper(result) {
    if (!crop) return;
    var done = crop.resolve;
    URL.revokeObjectURL(crop.img.src);
    crop = null;
    cropOverlay.hidden = true;
    cropImgEl.removeAttribute("src");
    done(result);
  }

  // Resolves with a JPEG blob, or null if cancelled.
  function openCropper(img) {
    return new Promise(function (resolve) {
      crop = { img: img, zoom: 1, offX: 0, offY: 0, resolve: resolve };
      cropImgEl.src = img.src;
      cropOverlay.hidden = false;
      renderCrop();
      cropStage.focus();
    });
  }

  function exportCrop() {
    var g = cropGeometry();
    var srcSide = g.circle / g.scale;
    var sx = g.w / 2 - (crop.offX + g.circle / 2) / g.scale;
    var sy = g.h / 2 - (crop.offY + g.circle / 2) / g.scale;
    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = AVATAR_SIZE;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // transparent PNGs would otherwise turn black
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(crop.img, sx, sy, srcSide, srcSide, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    // Re-encoding also drops EXIF metadata (phone photos often carry GPS).
    canvas.toBlob(function (blob) { closeCropper(blob); }, "image/jpeg", 0.88);
  }

  var drag = null;
  cropStage.addEventListener("pointerdown", function (e) {
    if (!crop) return;
    drag = { x: e.clientX, y: e.clientY, offX: crop.offX, offY: crop.offY };
    cropStage.setPointerCapture(e.pointerId);
    cropStage.classList.add("is-dragging");
  });
  cropStage.addEventListener("pointermove", function (e) {
    if (!drag || !crop) return;
    crop.offX = drag.offX + (e.clientX - drag.x);
    crop.offY = drag.offY + (e.clientY - drag.y);
    renderCrop();
  });
  function endDrag() { drag = null; cropStage.classList.remove("is-dragging"); }
  cropStage.addEventListener("pointerup", endDrag);
  cropStage.addEventListener("pointercancel", endDrag);
  cropStage.addEventListener("wheel", function (e) {
    if (!crop) return;
    e.preventDefault();
    setCropZoom(crop.zoom * Math.exp(-e.deltaY * 0.002));
  }, { passive: false });
  cropStage.addEventListener("keydown", function (e) {
    if (!crop) return;
    var step = e.shiftKey ? 20 : 5;
    var moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      crop.offX += moves[e.key][0];
      crop.offY += moves[e.key][1];
      renderCrop();
    } else if (e.key === "+" || e.key === "=") setCropZoom(crop.zoom + 0.1);
    else if (e.key === "-") setCropZoom(crop.zoom - 0.1);
    else return;
    e.preventDefault();
  });
  cropZoom.addEventListener("input", function () { if (crop) setCropZoom(parseFloat(cropZoom.value)); });
  document.getElementById("avatar-crop-reset").addEventListener("click", function () {
    if (!crop) return;
    crop.zoom = 1; crop.offX = 0; crop.offY = 0;
    renderCrop();
  });
  document.getElementById("avatar-crop-apply").addEventListener("click", function () { if (crop) exportCrop(); });
  document.getElementById("avatar-crop-cancel").addEventListener("click", function () { closeCropper(null); });
  document.getElementById("avatar-crop-close").addEventListener("click", function () { closeCropper(null); });
  cropOverlay.addEventListener("click", function (e) { if (e.target === cropOverlay) closeCropper(null); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && crop) closeCropper(null); });
  window.addEventListener("resize", function () { if (crop) renderCrop(); });

  async function removeAvatarFiles(keepName) {
    var listRes = await sb.storage.from("avatars").list(currentUser.id);
    var paths = (listRes.data || [])
      .filter(function (f) { return f.name !== keepName; })
      .map(function (f) { return currentUser.id + "/" + f.name; });
    if (paths.length) await sb.storage.from("avatars").remove(paths);
  }

  async function saveAvatarUrl(url) {
    var profRes = await sb.from("profiles").update({ avatar_url: url, updated_at: new Date().toISOString() }).eq("id", currentUser.id);
    if (profRes.error) throw profRes.error;
    // Last, so the header's USER_UPDATED re-render sees the new profile row too.
    var upd = await sb.auth.updateUser({ data: { custom_avatar_url: url } });
    if (upd.error) throw upd.error;
    if (upd.data && upd.data.user) currentUser = upd.data.user;
    customAvatarUrl = url || "";
    updateSettingsIdentity();
  }

  avatarFileInput.addEventListener("change", async function () {
    var file = avatarFileInput.files && avatarFileInput.files[0];
    avatarFileInput.value = "";
    if (!file || !currentUser) return;
    if (!/^image\//.test(file.type)) { setAvatarStatus("Please choose an image file."); return; }
    if (file.size > 15 * 1024 * 1024) { setAvatarStatus("That image is over 15 MB — please pick a smaller one."); return; }
    setAvatarBusy(true);
    try {
      var blob = await openCropper(await loadImage(file));
      if (!blob) { setAvatarStatus(""); setAvatarBusy(false); return; }
      setAvatarStatus("Uploading…");
      var name = "avatar-" + Date.now() + ".jpg";
      var up = await sb.storage.from("avatars").upload(currentUser.id + "/" + name, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (up.error) throw up.error;
      var publicUrl = sb.storage.from("avatars").getPublicUrl(currentUser.id + "/" + name).data.publicUrl;
      await saveAvatarUrl(publicUrl);
      removeAvatarFiles(name); // best-effort cleanup of the previous photo
      setAvatarStatus("Profile picture updated.");
    } catch (err) {
      setAvatarStatus("Couldn't upload: " + (err.message || err));
    }
    setAvatarBusy(false);
  });

  avatarRemoveBtn.addEventListener("click", async function () {
    if (!currentUser) return;
    setAvatarBusy(true);
    try {
      await saveAvatarUrl(null);
      await removeAvatarFiles(null);
      setAvatarStatus("Profile picture removed.");
    } catch (err) {
      setAvatarStatus("Couldn't remove it: " + (err.message || err));
    }
    setAvatarBusy(false);
  });

  // `profiles.team_number` is NOT NULL, but team fields no longer have
  // their own edit form (team membership drives them via
  // autoSyncProfileFromTeam below) -- fall back to the current team's
  // values so this upsert never violates that constraint for a member
  // whose profiles row doesn't exist yet.
  function buildCustomizePayload() {
    var payload = {
      id: currentUser.id,
      display_name: document.getElementById("customize-display-name").value.trim() || null,
      avatar_color: selectedAvatarColor || null,
      signature: document.getElementById("customize-signature").value.trim() || null,
      reminder_emails_opt_out: !document.getElementById("customize-reminders-checkbox").checked,
      updated_at: new Date().toISOString(),
    };
    if (window.FRCTeam && window.FRCTeam.state.team) {
      payload.team_number = window.FRCTeam.state.team.team_number;
      payload.team_name = window.FRCTeam.state.team.team_name || null;
      payload.district = window.FRCTeam.state.team.district || null;
    }
    return payload;
  }

  document.getElementById("customize-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var customizeInfo = document.getElementById("customize-info");
    showError(customizeInfo, "");
    var { error } = await sb.from("profiles").upsert(buildCustomizePayload());
    if (error) return showError(customizeInfo, error.message);
    customizeInfo.textContent = "Saved.";
    customizeInfo.style.display = "block";
    updateSettingsIdentity();
  });

  // The reminders checkbox lives in its own Notifications tab, away from
  // the rest of the profile form's Save button -- a toggle reads as
  // immediate, so it saves itself on change rather than waiting for an
  // unrelated button elsewhere to be clicked.
  document.getElementById("customize-reminders-checkbox").addEventListener("change", async function () {
    if (!currentUser) return;
    await sb.from("profiles").upsert(buildCustomizePayload());
  });

  function updateSettingsIdentity() {
    var nameEl = document.getElementById("settings-name");
    var avatarEl = document.getElementById("settings-avatar");
    if (!currentUser) return;
    var displayName = document.getElementById("customize-display-name").value.trim();
    var meta = currentUser.user_metadata || {};
    var name = displayName || meta.display_name || meta.full_name || meta.name || (currentUser.email || "").split("@")[0] || "Your account";
    nameEl.textContent = name;
    var hex = selectedAvatarColor && window.FRC_AVATAR_COLOR_HEX && window.FRC_AVATAR_COLOR_HEX[selectedAvatarColor];
    var photoUrl = customAvatarUrl || meta.avatar_url || meta.picture || "";
    [avatarEl, document.getElementById("avatar-upload-preview")].forEach(function (node) {
      node.textContent = "";
      if (photoUrl) {
        var img = document.createElement("img");
        img.src = photoUrl;
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        node.appendChild(img);
      } else {
        node.textContent = name.charAt(0).toUpperCase();
      }
      node.style.background = hex || "";
    });
    avatarRemoveBtn.hidden = !customAvatarUrl;
  }

  async function loadProfile() {
    var { data: profile } = await sb.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (profile) {
      document.getElementById("customize-display-name").value = profile.display_name || "";
      document.getElementById("customize-signature").value = profile.signature || "";
      document.getElementById("customize-reminders-checkbox").checked = !profile.reminder_emails_opt_out;
      selectedAvatarColor = profile.avatar_color || "";
      renderSwatches();
    }
    customAvatarUrl = (profile && profile.avatar_url) || (currentUser.user_metadata || {}).custom_avatar_url || "";
    updateSettingsIdentity();
  }

  // ---- Developer panel (testing only). Hidden until the avatar is
  // clicked 7 times within 4 seconds; the reset itself is enforced
  // server-side by dev_reset_my_account() against dev_allowlist, so
  // unhiding this for anyone else does nothing. ----
  (function () {
    var avatar = document.getElementById("settings-avatar");
    var navBtn = document.getElementById("developer-nav-btn");
    var resetBtn = document.getElementById("dev-reset-btn");
    var errEl = document.getElementById("dev-reset-error");
    if (!avatar || !navBtn || !resetBtn) return;
    var clicks = [];
    avatar.addEventListener("click", function () {
      var now = Date.now();
      clicks = clicks.filter(function (t) { return now - t < 4000; });
      clicks.push(now);
      if (clicks.length >= 7) navBtn.hidden = false;
    });
    resetBtn.addEventListener("click", function () {
      if (prompt('This resets your team membership and season data. Type RESET to continue.') !== "RESET") return;
      errEl.style.display = "none";
      sb.rpc("dev_reset_my_account").then(function (res) {
        if (res.error) { errEl.textContent = res.error.message; errEl.style.display = "block"; return; }
        try { localStorage.removeItem(roleStorageKey()); } catch (e) { /* ignore */ }
        window.location.reload();
      });
    });
  })();

  // ---- Settings sidebar: switch between Profile / Team / Notifications /
  // Privacy & data panels ----
  var settingsNav = document.getElementById("settings-nav");
  if (settingsNav) {
    settingsNav.addEventListener("click", function (e) {
      var btn = e.target.closest(".settings-nav-btn");
      if (!btn) return;
      var panelName = btn.getAttribute("data-panel");
      settingsNav.querySelectorAll(".settings-nav-btn").forEach(function (b) {
        var active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      document.querySelectorAll(".settings-panel").forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-panel") !== panelName;
      });
    });
  }

  // ---- Role preference ----
  //
  // First-run onboarding (sign-in, role, team, profile) is js/auth-modal.js.
  // The role is only binding once someone creates or joins a team
  // (team_members.role); here it just decides which tabs the create/join
  // modal shows. Stored per-browser/per-user (and in auth user_metadata by
  // the onboarding flow).
  var chosenRole = null;

  function roleStorageKey() { return "frcgrants_role_" + (currentUser ? currentUser.id : "anon"); }
  function loadChosenRole() {
    try { chosenRole = localStorage.getItem(roleStorageKey()); } catch (e) { chosenRole = null; }
    if (!chosenRole && currentUser && currentUser.user_metadata) chosenRole = currentUser.user_metadata.role_pref || null;
  }
  function paintRole() {
    document.getElementById("create-team-role-label").textContent = chosenRole === "student" ? "Student" : "Mentor";
    document.getElementById("create-team-role-change").textContent = chosenRole === "student" ? "Switch to mentor" : "Switch to student";
  }
  // Swap the preference (students can only join with a code; creating a
  // team is mentor-only, enforced server-side in create_team() too).
  document.getElementById("create-team-role-change").addEventListener("click", function () {
    chosenRole = chosenRole === "student" ? "mentor" : "student";
    try { localStorage.setItem(roleStorageKey(), chosenRole); } catch (e) { /* ignore */ }
    paintRole();
    openTeamModal(chosenRole === "student" ? "join" : "create");
  });

  function renderOnboarding() {
    loadChosenRole();
    paintRole();
    document.getElementById("no-team-cards").hidden = false;
  }

  function showAuthed() {
    document.getElementById("auth-section").hidden = true;
    document.getElementById("dashboard-section").hidden = false;
    document.getElementById("app").classList.add("is-dashboard");
    document.getElementById("signed-in-email").textContent = currentUser.email || "";
    loadProfile();
  }

  function showSignedOut() {
    document.getElementById("auth-section").hidden = false;
    document.getElementById("dashboard-section").hidden = true;
    document.getElementById("app").classList.remove("is-dashboard");
    if (window.FRCAuth && !window.__acctAutoOpened) { window.__acctAutoOpened = true; window.FRCAuth.open({ mode: "signin" }); }
  }

  sb.auth.onAuthStateChange(function (_event, session) {
    currentUser = session ? session.user : null;
    if (currentUser) showAuthed();
    else showSignedOut();
  });

  sb.auth.getSession().then(function (res) {
    currentUser = res.data.session ? res.data.session.user : null;
    if (currentUser) showAuthed();
    else showSignedOut();
  });

  // ---- Teams: onboarding (create/join) + the team panel ----
  //
  // window.FRCTeam (js/team.js) owns the actual membership state and the
  // Supabase RPC calls; this section is purely the account.html UI layer
  // on top of it, re-rendered every time FRCTeam reports a change.
  var Team = window.FRCTeam;

  var CAPTAIN_LABELS = {
    team_captain: "Team Captain",
    technical_captain: "Technical Captain",
    nontechnical_captain: "Non-Technical Captain",
    design_captain: "Design Captain",
    mechanical_captain: "Mechanical Captain",
    electrical_captain: "Electrical Captain",
    programming_captain: "Programming Captain",
    business_captain: "Business/Outreach Captain",
  };
  var SUBTEAM_LABELS = { design: "Design", mechanical: "Mechanical", electrical: "Electrical", programming: "Programming", business: "Business/Outreach", "cross-team": "Cross-team" };

  // ---- Create/join modal (classroom-style tabs) ----
  var teamModalOverlay = document.getElementById("team-modal-overlay");
  var teamModalClose = document.getElementById("team-modal-close");
  var teamModalTabsPane = document.getElementById("team-modal-tabs-pane");
  var teamModalTabCreate = document.getElementById("team-modal-tab-create");
  var teamModalTabJoin = document.getElementById("team-modal-tab-join");
  var teamModalCreatePane = document.getElementById("team-modal-create-pane");
  var teamModalJoinPane = document.getElementById("team-modal-join-pane");

  function setTeamModalTab(tab) {
    var studentOnly = chosenRole === "student";
    var isCreate = !studentOnly && tab !== "join";
    teamModalTabCreate.hidden = studentOnly;
    teamModalTabCreate.classList.toggle("active", isCreate);
    teamModalTabJoin.classList.toggle("active", !isCreate);
    teamModalCreatePane.hidden = !isCreate;
    teamModalJoinPane.hidden = isCreate;
  }
  function openTeamModal(tab) {
    teamModalOverlay.hidden = false;
    paintRole();
    setTeamModalTab(tab);
  }
  function closeTeamModal() { teamModalOverlay.hidden = true; }

  document.getElementById("open-team-modal-btn").addEventListener("click", function () {
    openTeamModal(chosenRole === "student" ? "join" : "create");
  });
  teamModalClose.addEventListener("click", closeTeamModal);
  teamModalTabCreate.addEventListener("click", function () { if (chosenRole !== "student") setTeamModalTab("create"); });
  teamModalTabJoin.addEventListener("click", function () { setTeamModalTab("join"); });
  teamModalOverlay.addEventListener("click", function (e) {
    if (e.target !== teamModalOverlay) return;
    closeTeamModal();
  });

  if (Team) {
    var createTeamForm = document.getElementById("create-team-form");
    var joinTeamForm = document.getElementById("join-team-form");
    var createTeamDistrict = document.getElementById("create-team-district");
    (window.FRC_DISTRICTS || []).forEach(function (d) {
      var opt = document.createElement("option");
      opt.value = d.value;
      opt.textContent = d.label;
      createTeamDistrict.appendChild(opt);
    });

    var joinParam = "";
    try { joinParam = new URLSearchParams(window.location.search).get("join") || ""; } catch (e) { /* ignore */ }
    if (joinParam) document.getElementById("join-team-code").value = joinParam.toUpperCase();

    // Best-effort: keep this user's own `profiles` row (forum identity) in
    // sync with their team, without ever touching another member's row
    // (RLS only allows updating your own anyway). Only fills display_name
    // if they haven't already set one, so it never clobbers a personal
    // customization.
    function autoSyncProfileFromTeam() {
      var team = Team.state.team;
      var user = Team.state.user;
      if (!team || !user) return;
      sb.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle().then(function (res) {
        var existingName = res && res.data && res.data.display_name;
        var meta = user.user_metadata || {};
        var payload = {
          id: user.id,
          team_number: team.team_number,
          team_name: team.team_name || null,
          district: team.district || null,
          updated_at: new Date().toISOString(),
        };
        if (!existingName) payload.display_name = meta.display_name || meta.full_name || meta.name || (user.email || "").split("@")[0];
        if (!existingName && meta.avatar_color) payload.avatar_color = meta.avatar_color;
        if (!(res && res.data && res.data.avatar_url) && meta.custom_avatar_url) payload.avatar_url = meta.custom_avatar_url;
        if (!existingName && typeof meta.reminders_opt_out === "boolean") payload.reminder_emails_opt_out = meta.reminders_opt_out;
        sb.from("profiles").upsert(payload);
      });
    }

    function showTeamInfo(msg) { showError(document.getElementById("team-action-info"), msg); }
    function showTeamError(msg) { showError(document.getElementById("team-action-error"), msg); }
    function showCreateTeamError(msg) { showError(document.getElementById("create-team-error"), msg); }
    function showJoinTeamError(msg) { showError(document.getElementById("join-team-error"), msg); }

    createTeamForm.addEventListener("submit", function (e) {
      e.preventDefault();
      showCreateTeamError("");
      var number = document.getElementById("create-team-number").value.trim();
      var name = document.getElementById("create-team-name").value.trim();
      var district = createTeamDistrict.value;
      // Only mentors can create a team (students join an existing one with
      // a code) -- enforced again server-side in create_team().
      Team.createTeam(number, name, district, "mentor").then(function () {
        createTeamForm.reset();
        window.location.href = "assignments.html";
      }).catch(function (err) { showCreateTeamError(err.message); });
    });

    joinTeamForm.addEventListener("submit", function (e) {
      e.preventDefault();
      showJoinTeamError("");
      var code = document.getElementById("join-team-code").value.trim();
      Team.joinTeam(code).then(function () {
        joinTeamForm.reset();
        window.location.href = "assignments.html";
      }).catch(function (err) { showJoinTeamError(err.message); });
    });

    document.getElementById("leave-team-btn").addEventListener("click", function () {
      if (!confirm("Leave this team? You'll need a new join code to come back.")) return;
      showTeamError("");
      Team.leaveTeam().then(function () { renderTeamSection(); }).catch(function (err) { showTeamError(err.message); });
    });

    // Self-service role switch -- same mentor/student choice as onboarding,
    // but after the fact. Warned heavily rather than blocked outright:
    // the only hard stop is the server-side "don't strand the team"
    // guard in switch_my_role() (surfaced here as a plain error) for a
    // sole mentor/admin stepping down.
    document.getElementById("switch-role-btn").addEventListener("click", function () {
      var toMentor = !Team.isMentor();
      var msg = toMentor
        ? "Switch to a mentor role? This immediately grants full team-management permissions: editing the roster, team settings, and grants. Only do this if you're actually an adult mentor for this team -- this isn't meant to be toggled back and forth."
        : "Switch to a student role? You'll immediately lose mentor permissions, including team management. Only do this if your role on the team has genuinely changed -- this isn't meant to be toggled back and forth.";
      if (!confirm(msg)) return;
      showTeamError("");
      Team.switchRole(toMentor ? "mentor" : "student")
        .then(function () { renderTeamSection(); })
        .catch(function (err) { showTeamError(err.message); });
    });

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
    }

    // null until the owner deploys supabase/functions/calendar-feed (see
    // its README) and reruns schema.sql -- calendar_feed_token won't
    // exist on the team row before that, so this just stays hidden.
    function renderCalendarFeed() {
      var section = document.getElementById("calendar-feed-section");
      var feedUrl = Team.calendarFeedUrl();
      section.hidden = !feedUrl;
      if (!feedUrl) return;
      document.getElementById("calendar-feed-url").textContent = feedUrl;
      document.getElementById("copy-feed-link-btn").onclick = function () {
        copyText(feedUrl);
        showTeamInfo("Calendar feed link copied.");
      };
    }

    function renderResetBanner() {
      var banner = document.getElementById("team-reset-banner");
      var team = Team.state.team;
      var today = new Date();
      var due = today.getFullYear() > team.current_season_year
        || (today.getFullYear() === team.current_season_year && today.getMonth() >= 5); // past ~June 1
      if (!due) { banner.hidden = true; return; }
      banner.hidden = false;
      banner.textContent = Team.isAdmin()
        ? "Looks like this season has wrapped up — start a new one to archive completed grants and progress for next year (below)."
        : "Looks like this season has wrapped up — ask a team admin to start the new season when they're ready.";
    }

    // Read-only roster view -- editing (subteam/captain roles, promote,
    // grant admin, remove) lives on team.html (js/team-manage.js), which
    // mentors reach via the "Manage team" link rendered below.
    function renderRoster() {
      var host = document.getElementById("team-roster");
      host.innerHTML = '<p class="small">Loading roster…</p>';
      Team.loadRoster().then(function (rows) {
        host.innerHTML = "";
        var table = document.createElement("div");
        table.className = "roster-table";

        rows
          .slice()
          .sort(function (a, b) { return (a.role === b.role) ? 0 : (a.role === "mentor" ? -1 : 1); })
          .forEach(function (r) {
            var isSelf = Team.state.user && r.user_id === Team.state.user.id;
            var name = (r.profile && r.profile.display_name) || "Member";
            var card = document.createElement("div");
            card.className = "roster-row-card";
            card.innerHTML =
              '<div class="roster-row-top"><div>' +
              '<span class="roster-row-name">' + name + (isSelf ? " (you)" : "") + "</span> " +
              '<span class="role-badge' + (r.role === "mentor" ? " role-mentor" : "") + '">' + (r.role === "mentor" ? "Mentor" : "Student") + "</span>" +
              (r.role === "mentor" && r.is_admin ? ' <span class="captain-badge">Admin</span>' : "") +
              (r.subteam && r.subteam !== "cross-team" ? ' <span class="role-badge">' + (SUBTEAM_LABELS[r.subteam] || r.subteam) + "</span>" : "") +
              (r.captain_roles || []).map(function (c) { return ' <span class="captain-badge">' + (CAPTAIN_LABELS[c] || c) + "</span>"; }).join("") +
              "</div></div>";
            table.appendChild(card);
          });

        host.appendChild(table);
      });
    }

    function renderTeamSection() {
      var team = Team.state.team;
      document.getElementById("has-team-card").hidden = !team;
      if (!team) {
        renderOnboarding();
        return;
      }
      closeTeamModal();
      document.getElementById("no-team-cards").hidden = true;

      autoSyncProfileFromTeam();

      var header = document.getElementById("team-header");
      header.innerHTML =
        '<div class="team-header-row"><span class="team-header-name">' +
        (team.team_name ? team.team_name + " — Team " + team.team_number : "Team " + team.team_number) +
        '</span><span class="role-badge' + (Team.isMentor() ? " role-mentor" : "") + '">' + (Team.isMentor() ? "Mentor" : "Student") +
        (Team.isAdmin() ? " · Admin" : "") + "</span></div>" +
        (team.district ? '<div class="team-header-sub">' + team.district + "</div>" : "");

      document.getElementById("switch-role-btn").textContent = Team.isMentor() ? "Switch to student role" : "Switch to mentor role";

      renderResetBanner();
      renderCalendarFeed();
      renderRoster();
    }

    Team.onChange(renderTeamSection);
    Team.ready.then(function () {
      renderTeamSection();
      if (joinParam && !Team.state.team) openTeamModal("join");
    });
  }
})();
