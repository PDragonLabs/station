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
function saveAI(cfg) {
  localStorage.setItem(KEY_AI, JSON.stringify(cfg));
}

function chatUrl(cfg) {
  const root = (cfg.baseUrl || "").replace(/\/$/, "");
  return root + "/chat/completions";
}

async function pingEndpoint(cfg) {
  if (cfg.provider === "device" || !cfg.baseUrl) {
    return { ok: true, detail: "on-device brain — no network" };
  }
  const res = await fetch(chatUrl(cfg), {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      cfg.apiKey ? { Authorization: "Bearer " + cfg.apiKey } : {}
    ),
    body: JSON.stringify({
      model: cfg.model || "",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 8
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + " " + text.slice(0, 180));
  return { ok: true, detail: text.slice(0, 160) };
}

async function completeRemote(cfg, messages) {
  const res = await fetch(chatUrl(cfg), {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      cfg.apiKey ? { Authorization: "Bearer " + cfg.apiKey } : {}
    ),
    body: JSON.stringify({
      model: cfg.model || "",
      messages: messages,
      temperature: 0.8
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error && data.error.message ? data.error.message : ("http " + res.status));
  const choice = data.choices && data.choices[0];
  const content = choice && choice.message && choice.message.content;
  if (!content) throw new Error("empty model reply");
  return content;
}

function trackContext(track, overlay) {
  if (!track) return "no track";
  const lyrics = (overlay && overlay[track.id]) || track.lyrics || "";
  return [
    "title: " + track.title,
    "genre: " + (track.genre || ""),
    "hook: " + (track.hook || ""),
    "note: " + (track.note || ""),
    "chords: " + (track.chords || ""),
    "production: " + (track.production || ""),
    "lyrics:\n" + lyrics
  ].join("\n");
}
