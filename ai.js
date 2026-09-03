const KEY_AI = "pdl.station.ai";

const DEFAULT_PERSONAS = {
  room: {
    name: "803 room",
    prompt: "You are the room around Collapse (803): analog dusk, tape saturation, a clock that already gave out. Speak short. Stay with the track JSON (title, hook, lyrics, chords, production). Do not invent a different song."
  },
  engineer: {
    name: "tape engineer",
    prompt: "You are the engineer on this session. Talk mix, spring, slide guitar, drums behind the beat, stereo that won't sit still. Practical. No marketing."
  },
  writer: {
    name: "lyric writer",
    prompt: "You write the next line in the same voice as the lyrics on this tape. Keep the meter loose. No explanation unless asked."
  },
  librarian: {
    name: "crate librarian",
    prompt: "You only know what is in the catalog JSON. Cite title, genre, note, hook. If a field is empty, say so."
  }
};

const PRESETS = {
  device: { provider: "device", baseUrl: "", model: "on-device" },
  jan: { provider: "jan", baseUrl: "http://127.0.0.1:1337/v1", model: "" },
  xai: { provider: "xai", baseUrl: "https://api.x.ai/v1", model: "grok-3" },
  custom: { provider: "custom", baseUrl: "", model: "" }
};

function defaultAI() {
  return {
    provider: "device",
    baseUrl: "",
    apiKey: "",
    model: "on-device",
    persona: "room",
    personas: DEFAULT_PERSONAS
  };
}
function loadAI() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_AI) || "null");
    const base = defaultAI();
    if (!raw || typeof raw !== "object") return base;
    return Object.assign(base, raw, {
      personas: Object.assign({}, DEFAULT_PERSONAS, raw.personas || {})
    });
  } catch (_) {
    return defaultAI();
  }
}
function saveAI(cfg) { localStorage.setItem(KEY_AI, JSON.stringify(cfg)); }
function chatUrl(cfg) {
  return (cfg.baseUrl || "").replace(/\/$/, "") + "/chat/completions";
}
async function pingEndpoint(cfg) {
  if (cfg.provider === "device" || !cfg.baseUrl) return { ok: true, detail: "on-device brain — no network" };
  const res = await fetch(chatUrl(cfg), {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, cfg.apiKey ? { Authorization: "Bearer " + cfg.apiKey } : {}),
    body: JSON.stringify({ model: cfg.model || "", messages: [{ role: "user", content: "ping" }], max_tokens: 8 })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + " " + text.slice(0, 180));
  return { ok: true, detail: text.slice(0, 160) };
}
async function completeRemote(cfg, messages) {
  const res = await fetch(chatUrl(cfg), {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, cfg.apiKey ? { Authorization: "Bearer " + cfg.apiKey } : {}),
    body: JSON.stringify({ model: cfg.model || "", messages: messages, temperature: 0.8 })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || ("http " + res.status));
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("empty model reply");
  return content;
}
function stubTrack() {
  if (window.__stationNow && window.__stationNow.track) return window.__stationNow;
  return {
    track: {
      id: (location.hash || "").slice(1),
      title: (document.getElementById("now-title") || {}).textContent || "",
      genre: (document.getElementById("now-genre") || {}).textContent || "",
      hook: (document.getElementById("now-hook") || {}).textContent || "",
      lyrics: (document.getElementById("lyric-edit") || {}).value || ""
    },
    overlay: {}
  };
}
function trackContext(track, overlay) {
  if (!track) return "no track";
  const lyrics = (overlay && overlay[track.id]) || track.lyrics || "";
  return ["title: " + track.title, "genre: " + (track.genre || ""), "hook: " + (track.hook || ""), "note: " + (track.note || ""), "chords: " + (track.chords || ""), "production: " + (track.production || ""), "lyrics:\n" + lyrics].join("\n");
}

function fillForm(cfg) {
  document.getElementById("ai-provider").value = cfg.provider || "device";
  document.getElementById("ai-url").value = cfg.baseUrl || "";
  document.getElementById("ai-key").value = cfg.apiKey || "";
  document.getElementById("ai-model").value = cfg.model || "";
  const sel = document.getElementById("ai-persona");
  sel.innerHTML = "";
  Object.keys(cfg.personas).forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = cfg.personas[id].name || id;
    sel.appendChild(opt);
  });
  sel.value = cfg.persona || "room";
}
function readForm(cfg) {
  const next = Object.assign({}, cfg);
  next.provider = document.getElementById("ai-provider").value;
  next.baseUrl = document.getElementById("ai-url").value.trim();
  next.apiKey = document.getElementById("ai-key").value.trim();
  next.model = document.getElementById("ai-model").value.trim();
  next.persona = document.getElementById("ai-persona").value;
  return next;
}
function setStatus(msg) {
  const el = document.getElementById("ai-status");
  if (el) el.textContent = msg;
  const st = document.getElementById("brain-state");
  if (st) st.textContent = msg;
}

function bootAI() {
  const pop = document.getElementById("ai-pop");
  if (!pop) return;
  let cfg = loadAI();
  fillForm(cfg);
  setStatus(cfg.provider === "device" ? "on-device" : cfg.provider + " · " + (cfg.model || "no model"));

  function open() { pop.hidden = false; fillForm(loadAI()); }
  function close() { pop.hidden = true; }
  ["ai-open", "ai-open-2"].forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.addEventListener("click", open);
  });
  document.getElementById("ai-close").addEventListener("click", close);
  pop.addEventListener("click", (e) => { if (e.target === pop) close(); });

  document.getElementById("ai-provider").addEventListener("change", () => {
    const p = PRESETS[document.getElementById("ai-provider").value] || PRESETS.device;
    document.getElementById("ai-url").value = p.baseUrl;
    if (p.model) document.getElementById("ai-model").value = p.model;
  });

  document.getElementById("ai-save").addEventListener("click", () => {
    cfg = readForm(cfg);
    saveAI(cfg);
    setStatus("saved · " + cfg.provider + (cfg.apiKey ? " · key in browser" : ""));
  });

  document.getElementById("ai-test").addEventListener("click", async () => {
    cfg = readForm(cfg);
    setStatus("testing…");
    try {
      const r = await pingEndpoint(cfg);
      setStatus("ok · " + r.detail);
    } catch (err) {
      setStatus("fail · " + err.message + " (CORS or mixed-content if this is Pages + local Jan)");
    }
  });

  document.getElementById("ai-export").addEventListener("click", () => {
    cfg = readForm(cfg);
    const pack = Object.assign({}, cfg);
    const blob = new Blob([JSON.stringify({ stationAI: pack, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pdragonlabs-ai-config.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.getElementById("ai-import").addEventListener("click", () => document.getElementById("ai-import-file").click());
  document.getElementById("ai-import-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const pack = raw.stationAI || raw;
      cfg = Object.assign(defaultAI(), pack, { personas: Object.assign({}, DEFAULT_PERSONAS, pack.personas || {}) });
      saveAI(cfg);
      fillForm(cfg);
      setStatus("config imported");
    } catch (err) {
      setStatus("import failed");
    }
  });

  document.getElementById("ai-ask").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("ai-line");
    const q = input.value.trim();
    if (!q) return;
    cfg = readForm(cfg);
    const log = document.getElementById("ai-log");
    log.innerHTML += "<p><strong>you</strong> " + q + "</p>";
    input.value = "";
    const now = stubTrack();
    const persona = cfg.personas[cfg.persona] || DEFAULT_PERSONAS.room;
    try {
      let answer;
      if (cfg.provider === "device" || !cfg.baseUrl) {
        answer = window.Brain ? Brain.ask(now.track, now.overlay || {}, q) : "on-device brain missing";
      } else {
        answer = await completeRemote(cfg, [
          { role: "system", content: persona.prompt + "\n\nTAPE\n" + trackContext(now.track, now.overlay) },
          { role: "user", content: q }
        ]);
      }
      log.innerHTML += "<p class=\"empty\">" + String(answer).replace(/\n/g, "<br>") + "</p>";
    } catch (err) {
      log.innerHTML += "<p class=\"empty\">" + err.message + "</p>";
    }
    log.scrollTop = log.scrollHeight;
  });
}

document.addEventListener("DOMContentLoaded", bootAI);
if (document.readyState !== "loading") bootAI();
