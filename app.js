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

function matches(track, q) {
  if (!q) return true;
  const hay = [track.title, track.subtitle, track.note, track.hook, track.id].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

async function boot() {
  const catalog = await fetch("./catalog.json").then((r) => r.json());
  const tracks = catalog.tracks;
  const iframe = document.getElementById("deck");
  const grid = document.getElementById("grid");
  const q = document.getElementById("q");
  document.getElementById("tagline").textContent = catalog.tagline;
  document.getElementById("canonical").href = catalog.canonical;
  document.getElementById("satellite").href = catalog.satellite;

  let index = 0;
  const fromHash = tracks.findIndex((t) => "#" + t.id === location.hash);
  if (fromHash >= 0) index = fromHash;

  function paint(i, autoplay) {
    index = (i + tracks.length) % tracks.length;
    const track = tracks[index];
    iframe.src = widgetUrl(track.trackId, autoplay);
    document.getElementById("now-title").textContent = track.title;
    document.getElementById("now-hook").textContent = track.hook || "";
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

  function renderList() {
    const query = q.value.trim();
    const shown = tracks.filter((t) => matches(t, query));
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
        '<p class="sub">' + (track.subtitle || "") + "</p>" +
        '<p class="note">' + (track.note || "") + "</p>" +
        '<div class="meta">' + track.artist + dur + "</div></div>";
      btn.addEventListener("click", () => paint(i, true));
      grid.appendChild(btn);
    });
    const current = tracks[index];
    document.querySelectorAll(".card").forEach((el) => {
      el.classList.toggle("active", current && el.dataset.id === current.id);
    });
  }

  document.getElementById("prev").addEventListener("click", () => paint(index - 1, true));
  document.getElementById("next").addEventListener("click", () => paint(index + 1, true));
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
    if (e.key === "ArrowRight" || e.key === "j") paint(index + 1, true);
    if (e.key === "ArrowLeft" || e.key === "k") paint(index - 1, true);
    if (e.key === "/") { e.preventDefault(); q.focus(); }
  });

  renderList();
  paint(index, false);
}

boot().catch((err) => {
  document.getElementById("now-title").textContent = "catalog failed to load";
  console.error(err);
});
