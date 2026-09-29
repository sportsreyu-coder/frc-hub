(function () {
  "use strict";

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    document.getElementById("config-warning").hidden = false;
    return;
  }

  var sb = window.__frcHubSupabase || window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  document.getElementById("app").hidden = false;

  var currentUser = null;
  var authError = document.getElementById("auth-error");

  function showError(el, msg) {
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  }

  document.getElementById("google-signin-btn").addEventListener("click", async function () {
    showError(authError, "");
    var { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) showError(authError, error.message);
  });

  document.getElementById("signout-btn").addEventListener("click", async function () {
    await sb.auth.signOut();
  });

  var districtSelect = document.getElementById("profile-district");
  (window.FRC_DISTRICTS || []).forEach(function (d) {
    var opt = document.createElement("option");
    opt.value = d.value;
    opt.textContent = d.label;
    districtSelect.appendChild(opt);
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

  // Both forms below write to the same `profiles` row, so each submit
  // sends the full set of fields (read live from both forms' inputs)
  // rather than a partial upsert -- otherwise saving one form's fields
  // could look fine while silently depending on the other form having
  // already run once to populate the row.
  function buildProfilePayload() {
    return {
      id: currentUser.id,
      team_number: document.getElementById("profile-team-number").value.trim(),
      team_name: document.getElementById("profile-team-name").value.trim() || null,
      district: districtSelect.value || null,
      display_name: document.getElementById("customize-display-name").value.trim() || null,
      avatar_color: selectedAvatarColor || null,
      signature: document.getElementById("customize-signature").value.trim() || null,
      updated_at: new Date().toISOString(),
    };
  }

  document.getElementById("profile-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var profileInfo = document.getElementById("profile-info");
    showError(profileInfo, "");
    var { error } = await sb.from("profiles").upsert(buildProfilePayload());
    if (error) return showError(profileInfo, error.message);
    profileInfo.textContent = "Saved.";
    profileInfo.style.display = "block";
  });

  document.getElementById("customize-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var customizeInfo = document.getElementById("customize-info");
    showError(customizeInfo, "");
    var { error } = await sb.from("profiles").upsert(buildProfilePayload());
    if (error) return showError(customizeInfo, error.message);
    customizeInfo.textContent = "Saved.";
    customizeInfo.style.display = "block";
  });

  async function loadProfile() {
    var { data: profile } = await sb.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (profile) {
      document.getElementById("profile-team-number").value = profile.team_number || "";
      document.getElementById("profile-team-name").value = profile.team_name || "";
      districtSelect.value = profile.district || "";
      document.getElementById("customize-display-name").value = profile.display_name || "";
      document.getElementById("customize-signature").value = profile.signature || "";
      selectedAvatarColor = profile.avatar_color || "";
      renderSwatches();
    }
  }

  function showAuthed() {
    document.getElementById("auth-section").hidden = true;
    document.getElementById("dashboard-section").hidden = false;
    document.getElementById("signed-in-email").textContent = currentUser.email || "";
    loadProfile();
  }

  function showSignedOut() {
    document.getElementById("auth-section").hidden = false;
    document.getElementById("dashboard-section").hidden = true;
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
})();
