const PLAYER = "https://w.soundcloud.com/player/";
const KEY_CAT = "pdl.station.catalog";
const KEY_CHAT = "pdl.station.chat";
const KEY_WHO = "pdl.station.who";
const KEY_LYRICS = "pdl.station.lyrics";

function widgetUrl(trackId, autoplay) {
  const params = new URLSearchParams({
    url: "https://api.soundcloud.com/tracks/" + trackId,
    color: "c23b2a",
    auto_play: autoplay ? "true" : "false",
    hide_related: "true",
    show_comments: "false",
    show_user: "true",
    show_reposts: "false",
    show_teaser: "false",
    visual: "false"
  });
  return PLAYER + "?" + params.toString();
}
function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function download(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function normalizeCatalog(raw) {
  const cat = raw.catalog && raw.tracks ? raw : (raw.catalog || raw);
  if (!cat || !Array.isArray(cat.tracks)) throw new Error("need a tracks array");
  return cat;
}
function matches(track, q, genre) {
  if (genre && track.genre !== genre) return false;
  if (!q) return true;
  const hay = [track.title, track.subtitle, track.note, track.hook, track.id, track.genre, track.lyrics].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}
function pickCatalog(house) {
  const stored = loadJSON(KEY_CAT, null);
  if (stored && Array.isArray(stored.tracks) && stored.tracks.length > (house.tracks || []).length) return { catalog: stored, local: true };
  return { catalog: house, local: false };
}
function versesFor(track, overlay) {
  if (!track) return "";
  return (overlay[track.id] || track.lyrics || "").trim();
}

async function boot() {
  const house = await fetch("./catalog.json").then((r) => r.json());
  const iframe = document.getElementById("deck");
  const grid = document.getElementById("grid");
  const promoEl = document.getElementById("promo");
  const q = document.getElementById("q");
  const genresEl = document.getElementById("genres");
  const logEl = document.getElementById("log");
  const whoEl = document.getElementById("who");
  const chips = document.getElementById("chips");
  whoEl.value = localStorage.getItem(KEY_WHO) || "";

  let picked = pickCatalog(house);
  let catalog = picked.catalog;
  let local = picked.local;
  let chats = loadJSON(KEY_CHAT, {});
  let overlay = loadJSON(KEY_LYRICS, {});
  let tracks = catalog.tracks;
  let genre = "";
  let index = 0;

  document.getElementById("canonical").href = catalog.canonical || house.canonical;
  document.getElementById("satellite").href = catalog.satellite || house.satellite;

  function setState() {
    document.getElementById("tagline").textContent = catalog.tagline || house.tagline;
    document.getElementById("booth-state").textContent = local ? "local crate loaded" : "house catalog · " + tracks.length;
  }
  function visible() { return tracks.filter((t) => matches(t, q.value.trim(), genre)); }

  function fireAsk(text) {
    const input = document.getElementById("ai-line");
    const form = document.getElementById("ai-ask");
    if (!input || !form) return;
    input.value = text;
    form.requestSubmit();
  }

  if (chips && window.Brain) {
    chips.innerHTML = "";
    Brain.chips.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = c.label;
      btn.addEventListener("click", () => fireAsk(c.label));
      chips.appendChild(btn);
    });
  }

  function renderLyrics() {
    const track = tracks[index];
    if (!track) return;
    const text = versesFor(track, overlay);
    document.getElementById("lyric-title").textContent = track.title;
    document.getElementById("lyric-view").textContent = text || "no verses on this tape yet";
    document.getElementById("lyric-edit").value = text;
    document.getElementById("lyric-state").textContent = overlay[track.id]
      ? "private · this browser"
      : (track.lyrics ? "from json" : "empty");
  }
  function renderChat() {
    const track = tracks[index];
    if (!track) return;
    document.getElementById("chat-track").textContent = track.title;
    const lines = chats[track.id] || [];
    logEl.innerHTML = lines.length
      ? lines.map((m) => "<p><strong>" + m.who + "</strong> " + m.text + "</p>").join("")
      : "<p class=\"empty\">no lines on this tape yet</p>";
    logEl.scrollTop = logEl.scrollHeight;
  }
  function renderPromo() {
    if (!promoEl) return;
    const ids = catalog.featured || house.featured || [];
    promoEl.innerHTML = "";
    ids.forEach((id) => {
      const track = tracks.find((t) => t.id === id);
      if (!track) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "promo-card";
      btn.innerHTML =
        '<img src="' + (track.artwork || "") + '" alt="">' +
        '<div><div class="promo-kicker">attractor</div><h2>' + track.title + "</h2>" +
        '<p class="hook">' + (track.hook || track.note || "") + "</p>" +
        '<p class="note">' + (track.note || "") + "</p></div>";
      btn.addEventListener("click", () => paint(tracks.indexOf(track), true));
      promoEl.appendChild(btn);
    });
  }

  function paint(i, autoplay) {
    if (!tracks.length) return;
    index = (i + tracks.length) % tracks.length;
    const track = tracks[index];
    window.__stationNow = { track: track, overlay: overlay };
    iframe.src = widgetUrl(track.trackId, autoplay);
    document.getElementById("now-title").textContent = track.title;
    document.getElementById("now-hook").textContent = track.hook || "";
    document.getElementById("now-genre").textContent = track.genre || "untagged";
    document.getElementById("poster-art").src = track.artwork || "";
    document.getElementById("poster-title").textContent = track.title;
    document.getElementById("poster-hook").textContent = track.hook || track.note || "";
    document.getElementById("atmos").style.backgroundImage = track.artwork ? "url('" + track.artwork + "')" : "none";
    document.getElementById("open-sc").href = track.soundcloud || "#";
    document.getElementById("pos").textContent = (index + 1) + " / " + tracks.length;
    history.replaceState(null, "", "#" + track.id);
    const deep = window.Brain && Brain.is803(track);
    document.body.classList.toggle("deep-803", !!deep);
    const badge = document.getElementById("deep-badge");
    if (badge) badge.hidden = !deep;
    document.querySelectorAll(".card").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === track.id);
    });
    renderChat();
    renderLyrics();
  }

  function renderGenres() {
    const genres = Array.from(new Set(tracks.map((t) => t.genre).filter(Boolean))).sort();
    genresEl.innerHTML = "";
    [""].concat(genres).forEach((g) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "genre" + (g === genre ? " on" : "");
      const n = g ? tracks.filter((t) => t.genre === g).length : tracks.length;
      btn.textContent = (g || "All stations") + " · " + n;
      btn.addEventListener("click", () => {
        genre = g;
        renderGenres();
        renderList();
        const vis = visible();
        if (vis.length && !vis.includes(tracks[index])) paint(tracks.indexOf(vis[0]), false);
      });
      genresEl.appendChild(btn);
    });
  }
  function renderList() {
    const shown = visible();
    grid.innerHTML = "";
    document.getElementById("count").textContent = shown.length + " of " + tracks.length;
    shown.forEach((track) => {
      const i = tracks.indexOf(track);
      const btn = document.createElement("button");
      btn.className = "card";
      btn.dataset.id = track.id;
      const dur = track.duration ? " · " + track.duration : "";
      const hasL = versesFor(track, overlay) ? " · verses" : "";
      btn.innerHTML =
        '<img src="' + (track.artwork || "") + '" alt="">' +
        '<div class="copy"><h2>' + track.title + "</h2>" +
        '<p class="sub">' + (track.genre || track.subtitle || "") + "</p>" +
        '<p class="note">' + (track.note || "") + "</p>" +
        '<div class="meta">' + (track.artist || "") + dur + hasL + "</div></div>";
      btn.addEventListener("click", () => paint(i, true));
      grid.appendChild(btn);
    });
    if (tracks[index]) {
      document.querySelectorAll(".card").forEach((el) => {
        el.classList.toggle("active", el.dataset.id === tracks[index].id);
      });
    }
  }
  function refresh(keepId) {
    tracks = catalog.tracks || [];
    setState();
    renderPromo();
    renderGenres();
    renderList();
    const i = keepId ? tracks.findIndex((t) => t.id === keepId) : tracks.findIndex((t) => "#" + t.id === location.hash);
    paint(i >= 0 ? i : 0, false);
  }
  function step(dir) {
    const vis = visible();
    if (!vis.length) return;
    const here = vis.indexOf(tracks[index]);
    const next = vis[(here < 0 ? 0 : here + dir + vis.length) % vis.length];
    paint(tracks.indexOf(next), true);
  }

  document.getElementById("prev").addEventListener("click", () => step(-1));
  document.getElementById("next").addEventListener("click", () => step(1));
  q.addEventListener("input", renderList);
  whoEl.addEventListener("change", () => localStorage.setItem(KEY_WHO, whoEl.value.trim()));
  document.getElementById("save-lyrics").addEventListener("click", () => {
    const track = tracks[index];
    if (!track) return;
    const text = document.getElementById("lyric-edit").value.replace(/\s+$/,"");
    if (text) overlay[track.id] = text;
    else delete overlay[track.id];
    track.lyrics = text;
    saveJSON(KEY_LYRICS, overlay);
    if (local) saveJSON(KEY_CAT, catalog);
    window.__stationNow = { track: track, overlay: overlay };
    renderLyrics();
    renderList();
  });
  document.getElementById("say").addEventListener("submit", (e) => {
    e.preventDefault();
    const track = tracks[index];
    const text = document.getElementById("line").value.trim();
    if (!track || !text) return;
    const who = whoEl.value.trim() || "anon";
    chats[track.id] = chats[track.id] || [];
    chats[track.id].push({ who: who, text: text, at: Date.now() });
    saveJSON(KEY_CHAT, chats);
    document.getElementById("line").value = "";
    renderChat();
  });
  document.getElementById("export-cat").addEventListener("click", () => {
    const packed = JSON.parse(JSON.stringify(catalog));
    packed.tracks = packed.tracks.map((t) => {
      const copy = Object.assign({}, t);
      const v = versesFor(t, overlay);
      if (v) copy.lyrics = v;
      return copy;
    });
    download("pdragonlabs-station.json", {
      station: packed.station || "PDRAGONLABS Station",
      exportedAt: new Date().toISOString(),
      catalog: packed,
      chats: chats
    });
  });
  document.getElementById("import-btn").addEventListener("click", () => document.getElementById("import-file").click());
  document.getElementById("import-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      catalog = normalizeCatalog(raw);
      if (raw.chats && typeof raw.chats === "object") chats = raw.chats;
      catalog.tracks.forEach((t) => { if (t.lyrics) overlay[t.id] = t.lyrics; });
      saveJSON(KEY_CAT, catalog);
      saveJSON(KEY_CHAT, chats);
      saveJSON(KEY_LYRICS, overlay);
      local = true;
      refresh();
    } catch (err) {
      document.getElementById("booth-state").textContent = "import failed — need tracks[]";
    }
  });
  document.getElementById("reset-cat").addEventListener("click", () => {
    localStorage.removeItem(KEY_CAT);
    catalog = house;
    local = false;
    refresh();
  });
  document.getElementById("share").addEventListener("click", async () => {
    const track = tracks[index];
    const url = location.origin + location.pathname + "#" + track.id;
    try {
      if (navigator.share) await navigator.share({ title: track.title + " — PDRAGONLABS", url });
      else {
        await navigator.clipboard.writeText(url);
        document.getElementById("share").textContent = "copied";
        setTimeout(() => { document.getElementById("share").textContent = "share"; }, 1400);
      }
    } catch (_) {}
  });
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      if (e.key === "Escape") { e.target.blur(); if (e.target === q) { q.value = ""; renderList(); } }
      return;
    }
    if (e.key === "ArrowRight" || e.key === "j") step(1);
    if (e.key === "ArrowLeft" || e.key === "k") step(-1);
    if (e.key === "/") { e.preventDefault(); q.focus(); }
  });
  refresh();
}

boot().catch((err) => {
  document.getElementById("now-title").textContent = "catalog failed to load";
  console.error(err);
});
