const KEY_CAT = "pdl.station.catalog";
const GENERIC = /^(trxz by [pj]|trxs by p|tracks by djpai|trx by p)?$/i;

function parseSoundcloudLinks(text) {
  const found = [];
  const re = /https?:\/\/soundcloud\.com\/[a-z0-9-_]+\/[a-z0-9-_]+/gi;
  String(text || "").split(/\s+/).forEach((tok) => {
    const m = String(tok).trim().match(re);
    if (!m) return;
    const url = m[0].replace(/[.,;)]+$/, "");
    const parts = url.split("/").filter(Boolean);
    const slug = parts[parts.length - 1];
    const skip = { tracks: 1, sets: 1, likes: 1, comments: 1, followers: 1, following: 1, "popular-tracks": 1, reposts: 1 };
    if (!slug || skip[slug]) return;
    if (found.indexOf(url) === -1) found.push(url);
  });
  return found;
}

function enrichHook(title, desc) {
  const raw = String(desc || "").replace(/https?:\/\/\S+/g, "").trim();
  const first = raw.split(/\n/)[0].trim();
  if (first && first.length > 8 && !GENERIC.test(first)) {
    return first.length > 140 ? first.slice(0, 137) + "…" : first;
  }
  const t = String(title || "this tape");
  const low = t.toLowerCase();
  if (/light/.test(low)) return t + " — leave the blinds open.";
  if (/dust|sand|sahara/.test(low)) return t + " — grit on the needle.";
  if (/night|groove|lock|sync/.test(low)) return t + " — the room finds the grid.";
  if (/road|headlight|bridge|cross/.test(low)) return t + " — windows down. don't ask where.";
  if (/ghost|glitch|protocol|binary|circuit|firewall/.test(low)) return t + " — still in the machine.";
  if (/know|silent|exit/.test(low)) return t + " — say it once. let the tape keep it.";
  return t + " — leave the deck on.";
}

function guessGenre(title, desc) {
  const hay = (title + " " + desc).toLowerCase();
  if (/trap|glitch|protocol|binary|circuit|cyber/.test(hay)) return "Cyber Trap";
  if (/country|road|headlight|bridge|dirt/.test(hay)) return "Country Rock";
  if (/techno/.test(hay)) return "Techno";
  if (/ballad|quiet|air/.test(hay)) return "Adult-contemporary ballad";
  if (/psy|collapse|803/.test(hay)) return "Psy Rock";
  return "untagged";
}

async function oembedTrack(url) {
  const q = "https://soundcloud.com/oembed?format=json&url=" + encodeURIComponent(url);
  const res = await fetch(q);
  if (!res.ok) throw new Error("oembed " + res.status);
  const data = await res.json();
  const html = data.html || "";
  const idm = html.match(/tracks%2F(\d+)|tracks\/(\d+)/);
  const trackId = idm ? (idm[1] || idm[2]) : "";
  const title = String(data.title || "").replace(/\s+by\s+PDRAGONLABS\s*$/i, "").trim();
  const desc = String(data.description || "").trim();
  const slug = url.replace(/\/$/, "").split("/").pop();
  const hook = enrichHook(title || slug, desc);
  return {
    id: slug,
    title: title || slug.replace(/-/g, " "),
    artist: data.author_name || "PDRAGONLABS",
    genre: guessGenre(title, desc),
    soundcloud: url,
    trackId: trackId,
    artwork: data.thumbnail_url || "",
    hook: hook,
    note: hook
  };
}

function loadHouse(house) {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY_CAT));
    if (stored && Array.isArray(stored.tracks)) return stored;
  } catch (_) {}
  return house;
}

async function ingestText(text, statusEl) {
  const urls = parseSoundcloudLinks(text);
  if (!urls.length) {
    if (statusEl) statusEl.textContent = "no soundcloud track links found";
    return 0;
  }
  if (statusEl) statusEl.textContent = "pulling " + urls.length + "…";
  const house = await fetch("./catalog.json").then((r) => r.json());
  const catalog = JSON.parse(JSON.stringify(loadHouse(house)));
  const have = {};
  catalog.tracks.forEach((t) => {
    have[t.id] = true;
    have[t.soundcloud] = true;
  });
  let added = 0;
  const failed = [];
  for (const url of urls) {
    if (have[url]) continue;
    const slug = url.replace(/\/$/, "").split("/").pop();
    if (have[slug]) continue;
    try {
      const rec = await oembedTrack(url);
      catalog.tracks.unshift(rec);
      have[rec.id] = true;
      have[rec.soundcloud] = true;
      added += 1;
      if (statusEl) statusEl.textContent = "added " + rec.title;
    } catch (err) {
      failed.push(slug);
    }
  }
  if (added) {
    localStorage.setItem(KEY_CAT, JSON.stringify(catalog));
  }
  if (statusEl) {
    statusEl.textContent = added
      ? ("appended " + added + (failed.length ? " · " + failed.length + " blocked by cors" : "") + " · export json to keep it")
      : (failed.length ? "soundcloud blocked the browser. paste the same list in Actions → Sync crate." : "already in the crate");
  }
  if (added) location.reload();
  return added;
}

function bootIngest() {
  const area = document.getElementById("ingest-links");
  const btn = document.getElementById("ingest-run");
  const fileBtn = document.getElementById("ingest-file-btn");
  const file = document.getElementById("ingest-file");
  const status = document.getElementById("ingest-state");
  if (!area || !btn) return;
  btn.addEventListener("click", () => ingestText(area.value, status));
  if (fileBtn && file) {
    fileBtn.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      file.value = "";
      if (!f) return;
      const text = await f.text();
      area.value = text;
      ingestText(text, status);
    });
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootIngest);
else bootIngest();
