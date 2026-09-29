(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var boardSlug = params.get("board");
  var threadId = params.get("thread");

  var configOk = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase);
  if (!configOk) document.getElementById("config-warning").hidden = false;
  var sb = configOk ? (window.__frcHubSupabase || window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)) : null;

  var currentUser = null;
  var currentProfile = null;

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

  function fmtDate(d) {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function authorLabel(profile) {
    if (!profile) return "Unknown team";
    return "Team " + profile.team_number + (profile.team_name ? " — " + profile.team_name : "");
  }

  function authorColorDot(profile) {
    var hex = profile && profile.avatar_color && window.FRC_AVATAR_COLOR_HEX && window.FRC_AVATAR_COLOR_HEX[profile.avatar_color];
    return hex ? el("span", { class: "author-color-dot", style: "background:" + hex }) : null;
  }

  function signatureNode(profile) {
    if (!profile || !profile.signature) return null;
    return el("div", { class: "post-signature" }, [profile.signature]);
  }

  function showView(id) {
    ["forum-directory", "forum-thread-list", "forum-thread-detail"].forEach(function (vid) {
      document.getElementById(vid).hidden = vid !== id;
    });
  }

  function boardCard(board) {
    return el("a", { class: "simple-card", href: "forum.html?board=" + encodeURIComponent(board.slug) }, [
      el("span", { class: "title-link" }, [board.name]),
      el("p", {}, [board.description]),
    ]);
  }

  // ---- Board directory ----
  function renderDirectory() {
    showView("forum-directory");

    var yourDistrictEl = document.getElementById("your-district-section");
    yourDistrictEl.innerHTML = "";
    var myBoard = currentProfile && currentProfile.district
      ? window.FORUM_BOARDS[window.forumDistrictBoardSlug(currentProfile.district)]
      : null;
    if (myBoard) {
      yourDistrictEl.appendChild(el("div", { class: "forum-section" }, [
        el("div", { class: "eyebrow" }, ["Your district"]),
        el("div", { class: "simple-grid" }, [boardCard(myBoard)]),
      ]));
    } else if (currentUser) {
      yourDistrictEl.appendChild(el("p", { class: "finder-hint" }, [
        "Set your team's district on your ",
        el("a", { href: "account.html" }, ["account page"]),
        " to see it highlighted here.",
      ]));
    }

    var districtGrid = document.getElementById("district-board-grid");
    districtGrid.innerHTML = "";
    Object.keys(window.FORUM_BOARDS).forEach(function (slug) {
      var b = window.FORUM_BOARDS[slug];
      if (b.category === "district") districtGrid.appendChild(boardCard(b));
    });

    var matchGrid = document.getElementById("matchmaking-board-grid");
    matchGrid.innerHTML = "";
    window.FORUM_MATCHMAKING_BOARDS.forEach(function (b) {
      matchGrid.appendChild(boardCard(window.FORUM_BOARDS[b.slug]));
    });
  }

  // ---- Sign-in / profile gate shared by the new-thread and reply forms ----
  function renderPostGate(gateId, formId) {
    var gate = document.getElementById(gateId);
    var form = document.getElementById(formId);
    gate.innerHTML = "";
    if (!sb) {
      form.hidden = true;
      gate.appendChild(el("p", { class: "finder-hint" }, ["Forum isn't configured yet."]));
    } else if (!currentUser) {
      form.hidden = true;
      gate.appendChild(el("p", { class: "finder-hint" }, [el("a", { href: "account.html" }, ["Sign in"]), " to post."]));
    } else if (!currentProfile) {
      form.hidden = true;
      gate.appendChild(el("p", { class: "finder-hint" }, [
        "Set your team number on your ", el("a", { href: "account.html" }, ["account page"]), " before posting.",
      ]));
    } else {
      form.hidden = false;
    }
  }

  // ---- Thread list for one board ----
  function renderThreadList(board) {
    showView("forum-thread-list");
    var boardInfo = window.FORUM_BOARDS[board] || { name: board, description: "" };

    var head = document.getElementById("board-head");
    head.innerHTML = "";
    head.appendChild(el("h1", {}, [boardInfo.name]));
    head.appendChild(el("p", {}, [boardInfo.description]));

    renderPostGate("new-thread-gate", "new-thread-form");

    var listEl = document.getElementById("thread-list");
    listEl.innerHTML = "";
    if (!sb) return;

    listEl.appendChild(el("p", { class: "finder-hint" }, ["Loading threads…"]));

    sb.from("forum_posts")
      .select("*, profiles(team_number, team_name, avatar_color), forum_replies(count)")
      .eq("board", board)
      .order("created_at", { ascending: false })
      .then(function (res) {
        listEl.innerHTML = "";
        if (res.error) {
          listEl.appendChild(el("p", { class: "finder-hint" }, ["Couldn't load threads: " + res.error.message]));
          return;
        }
        var posts = res.data || [];
        if (!posts.length) {
          listEl.appendChild(el("p", { class: "finder-hint" }, ["No threads yet — be the first to post."]));
          return;
        }
        posts.forEach(function (p) {
          var replyCount = (p.forum_replies && p.forum_replies[0] && p.forum_replies[0].count) || 0;
          listEl.appendChild(el("a", {
            class: "thread-row",
            href: "forum.html?board=" + encodeURIComponent(board) + "&thread=" + p.id,
          }, [
            el("div", { class: "thread-row-main" }, [
              el("span", { class: "thread-title" }, [p.title]),
              el("span", { class: "thread-meta" }, [authorColorDot(p.profiles), authorLabel(p.profiles) + " · " + fmtDate(p.created_at)]),
            ]),
            el("span", { class: "thread-reply-count" }, [replyCount + (replyCount === 1 ? " reply" : " replies")]),
          ]));
        });
      });
  }

  document.getElementById("new-thread-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!sb || !currentUser || !currentProfile || !boardSlug) return;
    var title = document.getElementById("new-thread-title").value.trim();
    var body = document.getElementById("new-thread-body").value.trim();
    if (!title || !body) return;
    sb.from("forum_posts")
      .insert({ board: boardSlug, title: title, body: body, author_id: currentUser.id })
      .select()
      .single()
      .then(function (res) {
        if (res.error) { alert("Couldn't post: " + res.error.message); return; }
        location.href = "forum.html?board=" + encodeURIComponent(boardSlug) + "&thread=" + res.data.id;
      });
  });

  // ---- Single thread ----
  function renderThreadDetail(board, id) {
    showView("forum-thread-detail");
    document.getElementById("back-to-board").href = "forum.html?board=" + encodeURIComponent(board);

    var postEl = document.getElementById("thread-post");
    postEl.innerHTML = "";
    postEl.appendChild(el("p", { class: "finder-hint" }, ["Loading…"]));
    document.getElementById("reply-list").innerHTML = "";

    renderPostGate("reply-gate", "reply-form");
    if (!sb) return;

    sb.from("forum_posts").select("*, profiles(team_number, team_name, avatar_color, signature)").eq("id", id).maybeSingle().then(function (res) {
      postEl.innerHTML = "";
      if (res.error || !res.data) {
        postEl.appendChild(el("p", { class: "finder-hint" }, ["Thread not found."]));
        return;
      }
      var p = res.data;
      var isOwner = currentUser && currentUser.id === p.author_id;
      var bodyChildren = [
        el("div", { class: "post-meta" }, [authorColorDot(p.profiles), authorLabel(p.profiles) + " · " + fmtDate(p.created_at)]),
        el("h1", { class: "post-title" }, [p.title]),
        el("p", { class: "post-body" }, [p.body]),
        signatureNode(p.profiles),
      ];
      if (isOwner) {
        var delBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Delete thread"]);
        delBtn.addEventListener("click", function () {
          if (!confirm("Delete this thread and all its replies?")) return;
          sb.from("forum_posts").delete().eq("id", id).then(function () {
            location.href = "forum.html?board=" + encodeURIComponent(board);
          });
        });
        bodyChildren.push(el("div", { class: "post-actions" }, [delBtn]));
      }
      postEl.appendChild(el("div", { class: "post-card" }, bodyChildren));
      loadReplies(id);
    });
  }

  function loadReplies(postId) {
    var replyListEl = document.getElementById("reply-list");
    replyListEl.innerHTML = "";
    replyListEl.appendChild(el("p", { class: "finder-hint" }, ["Loading replies…"]));

    sb.from("forum_replies")
      .select("*, profiles(team_number, team_name, avatar_color, signature)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .then(function (res) {
        replyListEl.innerHTML = "";
        if (res.error) {
          replyListEl.appendChild(el("p", { class: "finder-hint" }, ["Couldn't load replies."]));
          return;
        }
        var replies = res.data || [];
        if (!replies.length) {
          replyListEl.appendChild(el("p", { class: "finder-hint" }, ["No replies yet."]));
          return;
        }
        replies.forEach(function (r) {
          var isOwner = currentUser && currentUser.id === r.author_id;
          var body = [
            el("div", { class: "post-meta" }, [authorColorDot(r.profiles), authorLabel(r.profiles) + " · " + fmtDate(r.created_at)]),
            el("p", { class: "post-body" }, [r.body]),
            signatureNode(r.profiles),
          ];
          if (isOwner) {
            var delBtn = el("button", { type: "button", class: "ms-expand-toggle" }, ["Delete"]);
            delBtn.addEventListener("click", function () {
              if (!confirm("Delete this reply?")) return;
              sb.from("forum_replies").delete().eq("id", r.id).then(function () { loadReplies(postId); });
            });
            body.push(delBtn);
          }
          replyListEl.appendChild(el("div", { class: "reply-card" }, body));
        });
      });
  }

  document.getElementById("reply-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!sb || !currentUser || !currentProfile || !threadId) return;
    var bodyInput = document.getElementById("reply-body");
    var body = bodyInput.value.trim();
    if (!body) return;
    sb.from("forum_replies").insert({ post_id: threadId, author_id: currentUser.id, body: body }).then(function (res) {
      if (res.error) { alert("Couldn't post reply: " + res.error.message); return; }
      bodyInput.value = "";
      loadReplies(threadId);
    });
  });

  // ---- Route to the right view based on the URL ----
  function route() {
    if (boardSlug && threadId) renderThreadDetail(boardSlug, threadId);
    else if (boardSlug) renderThreadList(boardSlug);
    else renderDirectory();
  }

  function init() {
    if (!sb) { route(); return; }
    sb.auth.getSession().then(function (res) {
      currentUser = res.data.session ? res.data.session.user : null;
      if (!currentUser) { route(); return; }
      sb.from("profiles").select("*").eq("id", currentUser.id).maybeSingle().then(function (r) {
        currentProfile = r.data || null;
        route();
      });
    });
  }

  init();
})();
