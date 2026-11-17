// "Suggest criteria" for grants: any signed-in user can propose a criterion;
// it stays private (pending) until a site admin approves it in the review
// queue on grants.html. Approved criteria show on the grant card.
// Exposes window.GrantCriteria. Backed by public.grant_criteria_suggestions.
(function () {
  "use strict";

  var sb = window.__frcHubSupabase || null;
  var approved = {}; // grant_id -> [criteria rows]
  var isAdmin = false;
  var listeners = [];

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") n.className = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function notify() { listeners.forEach(function (f) { f(); }); }
  function getClient() { return sb || (sb = window.__frcHubSupabase); }

  function loadApproved() {
    var c = getClient();
    if (!c) return Promise.resolve();
    return c.from("grant_criteria_suggestions").select("id, grant_id, criteria")
      .eq("status", "approved").order("created_at").then(function (res) {
        if (res.error) return;
        approved = {};
        (res.data || []).forEach(function (r) { (approved[r.grant_id] = approved[r.grant_id] || []).push(r); });
        notify();
      });
  }

  function checkAdmin() {
    var c = getClient();
    if (!c) return Promise.resolve();
    return c.auth.getUser().then(function (r) {
      if (!r.data || !r.data.user) { isAdmin = false; return; }
      return c.rpc("is_site_admin").then(function (res) { isAdmin = !res.error && res.data === true; });
    }).catch(function () { isAdmin = false; });
  }

  function currentUser() {
    var c = getClient();
    if (!c) return Promise.resolve(null);
    return c.auth.getUser().then(function (r) { return r.data && r.data.user; }).catch(function () { return null; });
  }

  // ---- Suggest modal ----
  function openSuggest(grant) {
    currentUser().then(function (user) {
      var overlay = el("div", { class: "cal-modal-overlay", role: "dialog", "aria-modal": "true" });
      var modal = el("div", { class: "cal-modal sc-modal" });
      var close = el("button", { type: "button", class: "cal-modal-close", "aria-label": "Close" }, ["×"]);
      function dismiss() { overlay.remove(); document.removeEventListener("keydown", onKey); }
      function onKey(e) { if (e.key === "Escape") dismiss(); }
      close.addEventListener("click", dismiss);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) dismiss(); });
      document.addEventListener("keydown", onKey);
      modal.appendChild(close);
      modal.appendChild(el("h3", { class: "cal-modal-title" }, ["Suggest criteria"]));
      modal.appendChild(el("p", { class: "finder-hint" }, [grant.name + " — add an eligibility requirement or tip we're missing. It's reviewed before anyone else sees it."]));

      if (!user) {
        modal.appendChild(el("p", { class: "finder-hint" }, ["Please sign in first to suggest criteria."]));
        var a = el("a", { class: "sc-submit", href: "account.html" }, ["Sign in"]);
        modal.appendChild(el("div", { class: "sc-actions" }, [a]));
      } else {
        var ta = el("textarea", { class: "sc-textarea", rows: "4", maxlength: "500", placeholder: "e.g. Teams must be registered for the current season", "aria-label": "Criteria" });
        var src = el("input", { class: "sc-input", type: "url", placeholder: "Source link (optional)", "aria-label": "Source link" });
        var msg = el("p", { class: "finder-hint", role: "status" });
        var submit = el("button", { type: "button", class: "sc-submit" }, ["Submit for review"]);
        submit.addEventListener("click", function () {
          var text = ta.value.trim();
          if (text.length < 3) { msg.textContent = "Please enter at least a few words."; return; }
          submit.disabled = true;
          getClient().from("grant_criteria_suggestions")
            .insert({ grant_id: grant.id, criteria: text, source_url: src.value.trim() || null })
            .then(function (res) {
              if (res.error) { msg.textContent = "Couldn't submit: " + res.error.message; submit.disabled = false; return; }
              modal.innerHTML = "";
              modal.appendChild(close);
              modal.appendChild(el("h3", { class: "cal-modal-title" }, ["Thanks!"]));
              modal.appendChild(el("p", { class: "finder-hint" }, ["Your suggestion was sent for review. It will appear on the grant once approved."]));
            });
        });
        [ta, src, msg, el("div", { class: "sc-actions" }, [submit])].forEach(function (n) { modal.appendChild(n); });
        setTimeout(function () { ta.focus(); }, 0);
      }
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    });
  }

  // ---- Admin review queue ----
  function renderQueue(host, grantsById) {
    if (!host) return;
    if (!isAdmin) { host.hidden = true; host.innerHTML = ""; return; }
    host.hidden = false;
    host.innerHTML = "";
    host.appendChild(el("div", { class: "eyebrow" }, ["Criteria suggestions — pending review"]));
    var list = el("div", { class: "criteria-queue" }, [el("p", { class: "finder-hint" }, ["Loading…"])]);
    host.appendChild(list);
    getClient().from("grant_criteria_suggestions").select("*").eq("status", "pending")
      .order("created_at").then(function (res) {
        list.innerHTML = "";
        if (res.error) { list.appendChild(el("p", { class: "finder-hint" }, ["Couldn't load: " + res.error.message])); return; }
        if (!res.data.length) { list.appendChild(el("p", { class: "finder-hint" }, ["Nothing waiting for review."])); return; }
        res.data.forEach(function (r) {
          var g = grantsById[r.grant_id];
          var row = el("div", { class: "criteria-row" });
          row.appendChild(el("div", { class: "criteria-grant" }, [g ? g.name : r.grant_id]));
          row.appendChild(el("p", { class: "criteria-text" }, [r.criteria]));
          if (r.source_url && /^https?:\/\//i.test(r.source_url)) {
            row.appendChild(el("a", { href: r.source_url, target: "_blank", rel: "noopener noreferrer", class: "gc-link" }, ["Source →"]));
          }
          function review(status) {
            var q = status === "delete" ? getClient().from("grant_criteria_suggestions").delete().eq("id", r.id)
              : getClient().from("grant_criteria_suggestions").update({ status: status, reviewed_at: new Date().toISOString() }).eq("id", r.id);
            q.then(function (x) {
              if (x.error) { alert("Failed: " + x.error.message); return; }
              renderQueue(host, grantsById);
              loadApproved();
            });
          }
          var approve = el("button", { type: "button", class: "sc-approve" }, ["Approve"]);
          var reject = el("button", { type: "button", class: "sc-reject" }, ["Reject"]);
          approve.addEventListener("click", function () { review("approved"); });
          reject.addEventListener("click", function () { review("rejected"); });
          row.appendChild(el("div", { class: "criteria-actions" }, [approve, reject]));
          list.appendChild(row);
        });
      });
  }

  window.GrantCriteria = {
    ready: Promise.all([loadApproved(), checkAdmin()]),
    refresh: function () { return Promise.all([loadApproved(), checkAdmin()]); },
    approvedFor: function (id) { return approved[id] || []; },
    isAdmin: function () { return isAdmin; },
    openSuggest: openSuggest,
    renderQueue: renderQueue,
    onChange: function (f) { listeners.push(f); },
  };
})();
