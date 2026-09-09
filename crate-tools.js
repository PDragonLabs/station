(function () {
  const KEY_CAT = "pdl.station.catalog";
  const KEY_LYRICS = "pdl.station.lyrics";
  const KEY_CHAT = "pdl.station.chat";
  const _fetch = window.fetch.bind(window);
  window.fetch = async function (url, opts) {
    const res = await _fetch(url, opts);
    if (String(url).indexOf("catalog.json") === -1) return res;
    try {
      const raw = await res.clone().json();
      const cat = raw && raw.tracks ? raw : (raw && raw.catalog) || raw;
      return new Response(JSON.stringify(cat), { headers: { "Content-Type": "application/json" } });
    } catch (_) {
      return res;
    }
  };

  window.CrateTools = {
    arrange: function (list, sortBy) {
      const out = list.slice();
      function dur(t) {
        const m = String(t.duration || "").match(/^(\d+):(\d+)/);
        return m ? (+m[1]) * 60 + (+m[2]) : 0;
      }
      function plays(t) {
        return Number(t.plays || t.playback_count || t.playCount || 0);
      }
      if (sortBy === "title") out.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
      if (sortBy === "genre") out.sort((a, b) => String(a.genre || "").localeCompare(String(b.genre || "")) || String(a.title || "").localeCompare(String(b.title || "")));
      if (sortBy === "duration") out.sort((a, b) => dur(b) - dur(a));
      if (sortBy === "plays") out.sort((a, b) => plays(b) - plays(a));
      return out;
    },
    localTag: function (track) {
      const t = track.title || "this tape";
      const low = t.toLowerCase();
      let hook = String(track.hook || "").trim();
      const generic = /^(trxz by [pj]|trxs by p|tracks by djpai|trx by p)?$/i;
      if (!hook || generic.test(hook)) {
        if (/light/.test(low)) hook = t + " \u2014 leave the blinds open.";
        else if (/dust|sand|sahara/.test(low)) hook = t + " \u2014 grit on the needle.";
        else if (/night|groove|lock|sync/.test(low)) hook = t + " \u2014 the room finds the grid.";
        else if (/road|headlight|bridge|cross|fork/.test(low)) hook = t + " \u2014 windows down. don't ask where.";
        else if (/ghost|glitch|protocol|binary|circuit|firewall|digital|data|echo/.test(low)) hook = t + " \u2014 still in the machine.";
        else if (/know|silent|exit/.test(low)) hook = t + " \u2014 say it once. let the tape keep it.";
        else if (/stack|splash|bucket|real ones/.test(low)) hook = t + " \u2014 keep the one that hits.";
        else hook = t + " \u2014 leave the deck on.";
      }
      let genre = String(track.genre || "untagged").trim() || "untagged";
      if (genre === "untagged") {
        if (/trap|glitch|protocol|binary|circuit|cyber|digital|data|echo|firewall/.test(low)) genre = "Cyber Trap";
        else if (/country|road|headlight|bridge|dirt|fork|rearview/.test(low)) genre = "Country Rock";
        else if (/quiet|air|ballad/.test(low)) genre = "Adult-contemporary ballad";
        else if (/803|collapse|psy/.test(low)) genre = "Psy Rock";
        else if (/techno/.test(low)) genre = "Techno";
        else if (/night|groove|lock|sync|stack|splash/.test(low)) genre = "Night Tape";
        else if (/light|know|silent|dust|sahara/.test(low)) genre = "Liminal";
        else genre = "Tape";
      }
      const note = (track.note && !generic.test(String(track.note).trim())) ? track.note : hook;
      return { hook: hook, note: note, genre: genre };
    },
    retag: async function (track) {
      let cfg = { provider: "device" };
      try { cfg = JSON.parse(localStorage.getItem("pdl.station.ai") || "{}") || cfg; } catch (_) {}
      if (!cfg.baseUrl || cfg.provider === "device") return this.localTag(track);
      try {
        const headers = { "Content-Type": "application/json" };
        if (cfg.apiKey) headers.Authorization = "Bearer " + cfg.apiKey;
        const res = await _fetch(String(cfg.baseUrl || "").replace(/\/$/, "") + "/chat/completions", {
          method: "POST",
          headers: headers,
          body: JSON.stringify({
            model: cfg.model || "",
            temperature: 0.6,
            max_tokens: 220,
            messages: [
              { role: "system", content: "You tag PDRAGONLABS tapes. Reply with JSON only: {\"hook\":\"one cinematic line under 90 chars\",\"genre\":\"short genre tag\",\"note\":\"one dry sentence\"}. No markdown." },
              { role: "user", content: "title: " + (track.title || "") + "\ngenre: " + (track.genre || "") + "\nhook: " + (track.hook || "") + "\nnote: " + (track.note || "") }
            ]
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error("http " + res.status);
        const msg = data.choices && data.choices[0] && data.choices[0].message;
        const text = ((msg && (msg.content || msg.reasoning_content)) || "").trim();
        const json = text.match(/\{[\s\S]*\}/);
        const fallback = this.localTag(track);
        if (!json) return fallback;
        const parsed = JSON.parse(json[0]);
        return { hook: parsed.hook || fallback.hook, note: parsed.note || fallback.note, genre: parsed.genre || fallback.genre };
      } catch (_) {
        return this.localTag(track);
      }
    }
  };

  function loadCat() {
    try { return JSON.parse(localStorage.getItem(KEY_CAT) || "null"); } catch (_) { return null; }
  }
  function saveCat(cat) { localStorage.setItem(KEY_CAT, JSON.stringify(cat)); }
  function lyricsMap() {
    try { return JSON.parse(localStorage.getItem(KEY_LYRICS) || "{}"); } catch (_) { return {}; }
  }

  function decorateCards() {
    document.querySelectorAll("#grid .card").forEach((card) => {
      if (card.querySelector(".card-tools")) return;
      const copy = card.querySelector(".copy");
      if (!copy) return;
      const id = card.dataset.id;
      const tools = document.createElement("div");
      tools.className = "card-tools";
      tools.innerHTML = '<button type="button" class="btn" data-edit="' + id + '">edit</button><button type="button" class="btn" data-tag="' + id + '">tag</button>';
      copy.appendChild(tools);
    });
  }

  function openEditor(id) {
    const pop = document.getElementById("edit-pop");
    if (!pop) return;
    const cat = loadCat();
    const t = ((cat && cat.tracks) || []).find((x) => x.id === id) || (window.__stationNow && window.__stationNow.track);
    if (!t) return;
    document.getElementById("ed-id").value = t.id;
    document.getElementById("ed-title").value = t.title || "";
    document.getElementById("ed-genre").value = t.genre || "";
    document.getElementById("ed-hook").value = t.hook || "";
    document.getElementById("ed-note").value = t.note || "";
    document.getElementById("ed-duration").value = t.duration || "";
    document.getElementById("ed-plays").value = t.plays || t.playback_count || "";
    const lyr = lyricsMap();
    document.getElementById("ed-lyrics").value = lyr[t.id] || t.lyrics || "";
    pop.hidden = false;
  }

  async function tagOne(id) {
    const st = document.getElementById("retag-state");
    let cat = loadCat();
    if (!cat || !cat.tracks) cat = await fetch("./catalog.json").then((r) => r.json());
    const track = cat.tracks.find((t) => t.id === id);
    if (!track) return;
    if (st) st.textContent = "retag " + track.title;
    const fields = await CrateTools.retag(track);
    track.hook = fields.hook;
    track.note = fields.note;
    track.genre = fields.genre;
    saveCat(cat);
    if (st) st.textContent = "tagged \u00b7 export json to keep";
    location.reload();
  }

  async function exportHouse() {
    let cat = loadCat();
    if (!cat || !cat.tracks) cat = await fetch("./catalog.json").then((r) => r.json());
    const packed = JSON.parse(JSON.stringify(cat));
    const map = lyricsMap();
    packed.tracks = packed.tracks.map((t) => {
      const copy = Object.assign({}, t);
      if (map[t.id]) copy.lyrics = map[t.id];
      return copy;
    });
    packed.exportedAt = new Date().toISOString();
    try { packed.chats = JSON.parse(localStorage.getItem(KEY_CHAT) || "{}"); } catch (_) {}
    const blob = new Blob([JSON.stringify(packed, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "catalog.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function rewireExport() {
    const exp = document.getElementById("export-cat");
    if (!exp) return;
    const neu = exp.cloneNode(true);
    exp.parentNode.replaceChild(neu, exp);
    neu.addEventListener("click", exportHouse);
  }

  function bootExtras() {
    const grid = document.getElementById("grid");
    if (grid) {
      new MutationObserver(decorateCards).observe(grid, { childList: true });
      decorateCards();
      grid.addEventListener("click", (ev) => {
        const edit = ev.target.closest("[data-edit]");
        const tag = ev.target.closest("[data-tag]");
        if (edit) { ev.preventDefault(); ev.stopPropagation(); openEditor(edit.getAttribute("data-edit")); }
        if (tag) { ev.preventDefault(); ev.stopPropagation(); tagOne(tag.getAttribute("data-tag")); }
      }, true);
    }
    const edClose = document.getElementById("edit-close");
    const edPop = document.getElementById("edit-pop");
    const edSave = document.getElementById("edit-save");
    if (edClose) edClose.addEventListener("click", () => { if (edPop) edPop.hidden = true; });
    if (edPop) edPop.addEventListener("click", (e) => { if (e.target === edPop) edPop.hidden = true; });
    if (edSave) edSave.addEventListener("click", async () => {
      const id = document.getElementById("ed-id").value;
      let cat = loadCat();
      if (!cat || !cat.tracks) cat = await fetch("./catalog.json").then((r) => r.json());
      const track = cat.tracks.find((t) => t.id === id);
      if (!track) return;
      track.title = document.getElementById("ed-title").value.trim() || track.title;
      track.genre = document.getElementById("ed-genre").value.trim() || "Tape";
      track.hook = document.getElementById("ed-hook").value.trim();
      track.note = document.getElementById("ed-note").value.trim();
      track.duration = document.getElementById("ed-duration").value.trim();
      const plays = document.getElementById("ed-plays").value.trim();
      if (plays) track.plays = Number(plays) || plays;
      const lyr = document.getElementById("ed-lyrics").value.replace(/\s+$/, "");
      const map = lyricsMap();
      if (lyr) { map[track.id] = lyr; track.lyrics = lyr; } else { delete map[track.id]; track.lyrics = ""; }
      localStorage.setItem(KEY_LYRICS, JSON.stringify(map));
      saveCat(cat);
      if (edPop) edPop.hidden = true;
      location.reload();
    });
    rewireExport();
    setTimeout(rewireExport, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootExtras);
  else bootExtras();
})();
