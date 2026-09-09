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
      else if (/techno|love/.test(low)) genre = "Techno";
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
    const body = {
      model: cfg.model || "",
      temperature: 0.6,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content: "You tag PDRAGONLABS tapes. Reply with JSON only: {\"hook\":\"one cinematic line under 90 chars\",\"genre\":\"short genre tag\",\"note\":\"one dry sentence\"}. No markdown."
        },
        {
          role: "user",
          content: "title: " + (track.title || "") + "\ngenre: " + (track.genre || "") + "\nhook: " + (track.hook || "") + "\nnote: " + (track.note || "") + "\nlyrics:\n" + (track.lyrics || "")
        }
      ]
    };
    const headers = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers.Authorization = "Bearer " + cfg.apiKey;
    const url = String(cfg.baseUrl || "").replace(/\/$/, "") + "/chat/completions";
    try {
      const res = await fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error && data.error.message) || ("http " + res.status));
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      const text = ((msg && (msg.content || msg.reasoning_content)) || "").trim();
      const json = text.match(/\{[\s\S]*\}/);
      if (!json) return this.localTag(track);
      const parsed = JSON.parse(json[0]);
      const fallback = this.localTag(track);
      return {
        hook: parsed.hook || fallback.hook,
        note: parsed.note || parsed.hook || fallback.note,
        genre: parsed.genre || fallback.genre
      };
    } catch (_) {
      return this.localTag(track);
    }
  }
};
