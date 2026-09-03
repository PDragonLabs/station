const KEY_AI = "pdl.station.ai";

const DEFAULT_PERSONAS = {
  room: {
    name: "803 room",
    prompt: "You are the room around Collapse (803): analog dusk, tape saturation, a clock that already gave out. Speak short. Stay with the track JSON. When asked for the next line, output ONE lyric line only. No title, no brackets, no explanation."
  },
  engineer: {
    name: "tape engineer",
    prompt: "You are the engineer on this session. Talk mix, spring, slide guitar, drums behind the beat, stereo that won't sit still. Practical. No marketing."
  },
  writer: {
    name: "lyric writer",
    prompt: "You write the next line in the same voice as the lyrics on this tape. When asked for a line, output ONE line only. No preface."
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
function headers(cfg) {
  return Object.assign({ "Content-Type": "application/json" }, cfg.apiKey ? { Authorization: "Bearer " + cfg.apiKey } : {});
}
function pickText(data) {
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) return "";
  return (msg.content || msg.reasoning_content || "").trim();
}
function lastLyricLine(text) {
  const lines = String(text || "").split(/\n/).map((l) => l.trim()).filter((l) => l && !/^\[/.test(l));
  return lines.length ? lines[lines.length - 1] : "";
}
function dropOntoSheet(chunk) {
  const box = document.getElementById("lyric-edit");
  const line = (chunk || "").trim();
  if (!box || !line) return false;
  box.value = (box.value.replace(/\s+$/, "") + "\n" + line).replace(/^\n/, "");
  const save = document.getElementById("save-lyrics");
  if (save) save.click();
  return true;
}
async function pingEndpoint(cfg) {
  if (cfg.provider === "device" || !cfg.baseUrl) return { ok: true, detail: "on-device brain — no network" };
  const res = await fetch(chatUrl(cfg), {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({
      model: cfg.model || "",
      messages: [{ role: "user", content: "Reply with the single word pong." }],
      max_tokens: 64
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + " " + text.slice(0, 180));
  return { ok: true, detail: text.slice(0, 180) };
}
async function completeRemote(cfg, messages) {
  const res = await fetch(chatUrl(cfg), {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({
      model: cfg.model || "",
      messages: messages,
      temperature: 0.8,
      max_tokens: 512
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || ("http " + res.status));
  const content = pickText(data);
  if (!content) throw new Error("empty model reply — raise max tokens or pick a chat model");
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
  cfg.personas = Object.assign({}, DEFAULT_PERSONAS, cfg.personas || {});
  Object.keys(DEFAULT_PERSONAS).forEach((id) => {
    cfg.personas[id] = DEFAULT_PERSONAS[id];
  });
  let lastReply = "";
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
    cfg.personas = DEFAULT_PERSONAS;
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
      setStatus("fail · " + err.message);
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

  const dropLine = document.getElementById("drop-line");
  if (dropLine) {
    dropLine.addEventListener("click", () => {
      const ok = dropOntoSheet(lastLyricLine(lastReply));
      setStatus(ok ? "dropped last line" : "no reply to drop yet");
    });
  }
  const dropStanza = document.getElementById("drop-stanza");
  if (dropStanza) {
    dropStanza.addEventListener("click", () => {
      const ok = dropOntoSheet(lastReply);
      setStatus(ok ? "dropped whole reply" : "no reply to drop yet");
    });
  }

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
      lastReply = String(answer);
      log.innerHTML += "<p class=\"empty\">" + lastReply.replace(/\n/g, "<br>") + "</p>";
    } catch (err) {
      log.innerHTML += "<p class=\"empty\">" + err.message + "</p>";
    }
    log.scrollTop = log.scrollHeight;
  });
}

document.addEventListener("DOMContentLoaded", bootAI);
if (document.readyState !== "loading") bootAI();
