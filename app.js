const PLAYER = "https://w.soundcloud.com/player/";

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

function matches(track, q, genre) {
  if (genre && track.genre !== genre) return false;
  if (!q) return true;
  const hay = [track.title, track.subtitle, track.note, track.hook, track.id, track.genre].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

async function boot() {
  const catalog = await fetch("./catalog.json").then((r) => r.json());
  const tracks = catalog.tracks;
  const iframe = document.getElementById("deck");
  const grid = document.getElementById("grid");
  const q = document.getElementById("q");
  const genresEl = document.getElementById("genres");
  document.getElementById("tagline").textContent = catalog.tagline;
  document.getElementById("canonical").href = catalog.canonical;
  document.getElementById("satellite").href = catalog.satellite;

  const genres = Array.from(new Set(tracks.map((t) => t.genre).filter(Boolean))).sort();
  let genre = "";
  let index = 0;
  const fromHash = tracks.findIndex((t) => "#" + t.id === location.hash);
  if (fromHash >= 0) index = fromHash;

  function visible() {
    return tracks.filter((t) => matches(t, q.value.trim(), genre));
  }

  function paint(i, autoplay) {
    index = (i + tracks.length) % tracks.length;
    const track = tracks[index];
    iframe.src = widgetUrl(track.trackId, autoplay);
    document.getElementById("now-title").textContent = track.title;
    document.getElementById("now-hook").textContent = track.hook || "";
    document.getElementById("now-genre").textContent = track.genre || "untagged";
    document.getElementById("poster-art").src = track.artwork;
    document.getElementById("poster-title").textContent = track.title;
    document.getElementById("poster-hook").textContent = track.hook || track.note || "";
    document.getElementById("atmos").style.backgroundImage = "url('" + track.artwork + "')";
    document.getElementById("open-sc").href = track.soundcloud;
    document.getElementById("pos").textContent = (index + 1) + " / " + tracks.length;
    history.replaceState(null, "", "#" + track.id);
    document.querySelectorAll(".card").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === track.id);
    });
    const active = document.querySelector(".card.active");
    if (active) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function renderGenres() {
    genresEl.innerHTML = "";
    const all = [""].concat(genres);
    all.forEach((g) => {
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
        if (vis.length && !vis.includes(tracks[index])) {
          paint(tracks.indexOf(vis[0]), false);
        }
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
      btn.innerHTML =
        '<img src="' + track.artwork + '" alt="">' +
        '<div class="copy"><h2>' + track.title + "</h2>" +
        '<p class="sub">' + (track.genre || track.subtitle || "") + "</p>" +
        '<p class="note">' + (track.note || "") + "</p>" +
        '<div class="meta">' + track.artist + dur + "</div></div>";
      btn.addEventListener("click", () => paint(i, true));
      grid.appendChild(btn);
    });
    document.querySelectorAll(".card").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === tracks[index].id);
    });
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
    if (e.target === q) {
      if (e.key === "Escape") { q.value = ""; renderList(); q.blur(); }
      return;
    }
    if (e.key === "ArrowRight" || e.key === "j") step(1);
    if (e.key === "ArrowLeft" || e.key === "k") step(-1);
    if (e.key === "/") { e.preventDefault(); q.focus(); }
  });

  renderGenres();
  renderList();
  paint(index, false);
}

boot().catch((err) => {
  document.getElementById("now-title").textContent = "catalog failed to load";
  console.error(err);
});
