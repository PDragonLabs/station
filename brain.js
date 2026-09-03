const Brain = {
  chips: [
    { id: "about", label: "what's this?" },
    { id: "mix", label: "the mix" },
    { id: "verse", label: "read a verse" },
    { id: "chords", label: "chords" },
    { id: "next", label: "write the next line" }
  ],

  verses(track, overlay) {
    const raw = ((overlay && overlay[track.id]) || track.lyrics || "").trim();
    if (!raw) return [];
    return raw.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  },

  is803(track) {
    return !!(track && (track.id === "803" || track.id === "one-step-from-collapse-803" || /collapse/i.test(track.title || "")));
  },

  ask(track, overlay, question) {
    const q = (question || "").toLowerCase();
    const verses = this.verses(track, overlay);
    const hook = track.hook || "";
    const note = track.note || "";
    const chords = track.chords || "";
    const prod = track.production || "";
    const deep = this.is803(track);

    if (/mix|prod|guitar|drum|bass|reverb|tape|organ/.test(q)) {
      if (prod) return prod;
      if (deep) {
        return "Fragile psychedelic rock. Tape-warbled slide guitar. Droning fuzz bass. Loose live drums a hair behind the beat. Analog organ pads, spring reverb, worn-out tape saturation. Abrupt drops. Feedback squeals. Unstable stereo — one step from collapse.";
      }
      return "The page only has what you put in the JSON. Add a production string and I can talk mix.";
    }

    if (/chord|progress|key|capo/.test(q)) {
      if (chords) return chords;
      if (deep) return "Em — G — D — A  (verse)\nC — G — D — Em  (chorus)\nLet the G ring long. Don't quantize the slide.";
      return "No chord sheet in this JSON yet. Paste one under chords and save.";
    }

    if (/verse|lyric|read|words|chorus/.test(q)) {
      if (verses.length) return verses[0];
      return "No verses on this tape. Paste them in the lyrics sheet — they stay in this browser until you export.";
    }

    if (/next line|write|another|continue/.test(q)) {
      if (deep) {
        return "the clock still owes us a minute\nleave the fan on, don't pick a winner\nif the stereo splits, let both rooms dinner";
      }
      if (hook) return "take the hook and lean: \u201c" + hook + "\u201d\nsay it quieter the second time.";
      return "Give me a hook in the JSON and I'll lean a line off it.";
    }

    if (/about|what|mean|story|vibe/.test(q) || !q) {
      const bits = [track.title, track.genre, note, hook].filter(Boolean);
      if (deep) {
        return "Collapse (803). The room after the clock gives out. Psy rock held together with spring and bad decisions. " + (hook || "We're one step from collapse.");
      }
      return bits.join(" — ") || "Put a hook and a note on the track. That's how I know the room.";
    }

    if (verses.length && q.length > 2) {
      const hit = verses.find((v) => v.toLowerCase().includes(q.slice(0, 12)));
      if (hit) return hit;
    }
    return hook || note || "The brain only knows what's on this tape. Add lyrics, chords, or production to the JSON.";
  }
};
