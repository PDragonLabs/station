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

async function boot() {
  const catalog = await fetch("./catalog.json").then((r) => r.json());
  const iframe = document.getElementById("deck");
  const grid = document.getElementById("grid");
  document.getElementById("tagline").textContent = catalog.tagline;

  let current = catalog.tracks[0];

  function paint(track, autoplay) {
    current = track;
    iframe.src = widgetUrl(track.trackId, autoplay);
    document.getElementById("now-title").textContent = track.title;
    document.getElementById("now-hook").textContent = track.hook;
    document.getElementById("poster-art").src = track.artwork;
    document.getElementById("poster-title").textContent = track.title;
    document.getElementById("poster-hook").textContent = track.hook;
    document.getElementById("atmos").style.backgroundImage = "url('" + track.artwork + "')";
    document.getElementById("open-sc").href = track.soundcloud;
    document.querySelectorAll(".card").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === track.id);
    });
  }

  catalog.tracks.forEach((track) => {
    const btn = document.createElement("button");
    btn.className = "card";
    btn.dataset.id = track.id;
    btn.innerHTML =
      '<img src="' + track.artwork + '" alt="">' +
      '<div class="copy"><h2>' + track.title + "</h2>" +
      '<p class="sub">' + track.subtitle + "</p>" +
      '<p class="note">' + track.note + "</p>" +
      '<div class="meta">' + track.artist + " · " + track.duration + "</div></div>";
    btn.addEventListener("click", () => paint(track, true));
    grid.appendChild(btn);
  });

  document.getElementById("canonical").href = catalog.canonical;
  document.getElementById("satellite").href = catalog.satellite;
  document.getElementById("share").addEventListener("click", async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: current.title + " — PDRAGONLABS", url });
      else {
        await navigator.clipboard.writeText(url);
        document.getElementById("share").textContent = "copied";
        setTimeout(() => { document.getElementById("share").textContent = "share station"; }, 1400);
      }
    } catch (_) {}
  });

  paint(current, false);
}

boot().catch((err) => {
  document.getElementById("now-title").textContent = "catalog failed to load";
  console.error(err);
});
