#!/usr/bin/env python3
import html
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "PDragonLabs-station/1.0"}
GENERIC = re.compile(r"^(trxz by [pj]|trxs by p|tracks by djpai|trx by p)?$", re.I)


def get(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "ignore")


def oembed(url):
    q = "https://soundcloud.com/oembed?format=json&url=" + urllib.parse.quote(url, safe="")
    return json.loads(get(q))


def enrich_hook(title, desc):
    raw = re.sub(r"https?://\S+", "", desc or "").strip()
    first = raw.split("\n")[0].strip()
    if first and len(first) > 8 and not GENERIC.match(first):
        return first[:137] + "…" if len(first) > 140 else first
    t = title or "this tape"
    low = t.lower()
    if re.search(r"light", low):
        return t + " — leave the blinds open."
    if re.search(r"dust|sand|sahara", low):
        return t + " — grit on the needle."
    if re.search(r"night|groove|lock|sync", low):
        return t + " — the room finds the grid."
    if re.search(r"road|headlight|bridge|cross", low):
        return t + " — windows down. don't ask where."
    if re.search(r"ghost|glitch|protocol|binary|circuit|firewall", low):
        return t + " — still in the machine."
    if re.search(r"know|silent|exit", low):
        return t + " — say it once. let the tape keep it."
    return t + " — leave the deck on."


def guess_genre(title, desc):
    hay = (title + " " + (desc or "")).lower()
    if re.search(r"trap|glitch|protocol|binary|circuit|cyber", hay):
        return "Cyber Trap"
    if re.search(r"country|road|headlight|bridge|dirt", hay):
        return "Country Rock"
    if "techno" in hay:
        return "Techno"
    if re.search(r"ballad|quiet|air", hay):
        return "Adult-contemporary ballad"
    if re.search(r"psy|collapse|803", hay):
        return "Psy Rock"
    return "untagged"


def card_html(rec):
    tid = rec["id"]
    title = html.escape(rec.get("title") or tid)
    hook = html.escape(rec.get("hook") or rec.get("title") or "")
    art = html.escape(rec.get("artwork") or "https://pdragonlabs.github.io/station/banner-1200x630.png")
    sc = html.escape(rec.get("soundcloud") or "")
    return (
        "<!DOCTYPE html><html lang=\"en\"><head>"
        "<meta charset=\"utf-8\"/>"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>"
        f"<title>{title} \u2014 PDRAGONLABS</title>"
        f"<meta name=\"description\" content=\"{hook}\"/>"
        f"<meta property=\"og:title\" content=\"{title} \u2014 PDRAGONLABS\"/>"
        f"<meta property=\"og:image\" content=\"{art}\"/>"
        "<meta name=\"twitter:card\" content=\"summary_large_image\"/>"
        f"<meta name=\"twitter:image\" content=\"{art}\"/>"
        "<style>body{min-height:100vh;display:grid;place-items:center;margin:0;background:#140b12;color:#f3e6d4}"
        ".card{width:min(420px,92vw);border:1px solid #d4b08a;overflow:hidden}"
        ".card img{width:100%;aspect-ratio:1;object-fit:cover;display:block}"
        ".copy{padding:16px}.actions{display:flex;gap:8px;flex-wrap:wrap}"
        ".actions a{border:1px solid #d4b08a;color:#f3e6d4;text-decoration:none;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.08em}</style>"
        "</head><body><article class=\"card\">"
        f"<img src=\"{art}\" alt=\"{title}\"/>"
        f"<div class=\"copy\"><h1>{title}</h1><p class=\"hook\">{hook}</p>"
        "<div class=\"actions\">"
        f"<a href=\"../#{tid}\">open in station</a>"
        f"<a href=\"{sc}\">soundcloud</a>"
        "</div></div></article></body></html>\n"
    )


def write_card(rec):
    tid = rec.get("id")
    if not tid:
        return
    Path("t").mkdir(exist_ok=True)
    Path("t/%s.html" % tid).write_text(card_html(rec))


def main():
    user = (os.environ.get("SC_USER") or "pai-dj").strip()
    extra = os.environ.get("EXTRA") or ""
    slugs = []
    urls_by_slug = {}
    try:
        page = get("https://soundcloud.com/%s/tracks" % user)
        pat = r"https://soundcloud.com/%s/([a-z0-9-]+)" % re.escape(user)
        skip = {"tracks", "popular-tracks", "reposts", "sets", "comments", "followers", "following"}
        for m in re.finditer(pat, page):
            s = m.group(1)
            if s not in skip and s not in slugs:
                slugs.append(s)
                urls_by_slug[s] = "https://soundcloud.com/%s/%s" % (user, s)
    except Exception as exc:
        print("profile fetch failed", exc)

    for line in extra.splitlines():
        line = line.strip()
        if "soundcloud.com/" not in line:
            continue
        m = re.search(r"https?://soundcloud\.com/[a-z0-9-_]+/[a-z0-9-_]+", line, re.I)
        if not m:
            continue
        url = m.group(0).rstrip(".,;)")
        s = url.rstrip("/").split("/")[-1]
        if s and s not in slugs:
            slugs.append(s)
            urls_by_slug[s] = url

    print("found", len(slugs), slugs[:12])

    cat = json.loads(Path("catalog.json").read_text())
    have = {t.get("id") for t in cat["tracks"]} | {t.get("soundcloud") for t in cat["tracks"]}
    incoming = []
    for slug in slugs:
        url = urls_by_slug.get(slug) or ("https://soundcloud.com/%s/%s" % (user, slug))
        if slug in have or url in have:
            continue
        try:
            data = oembed(url)
        except Exception as exc:
            print("oembed fail", slug, exc)
            continue
        body = data.get("html") or ""
        m = re.search(r"tracks%2F(\d+)|tracks/(\d+)", body)
        tid = (m.group(1) or m.group(2)) if m else ""
        title = re.sub(r"\s+by\s+PDRAGONLABS\s*$", "", data.get("title") or slug, flags=re.I).strip()
        desc = (data.get("description") or "").strip()
        hook = enrich_hook(title, desc)
        incoming.append({
            "id": slug,
            "title": title,
            "artist": data.get("author_name") or "PDRAGONLABS",
            "genre": guess_genre(title, desc),
            "soundcloud": url,
            "trackId": tid,
            "artwork": data.get("thumbnail_url") or "",
            "hook": hook,
            "note": hook,
        })

    added = []
    for rec in reversed(incoming):
        cat["tracks"].insert(0, rec)
        added.append(rec["id"])

    Path("catalog.json").write_text(json.dumps(cat, indent=2, ensure_ascii=False) + "\n")
    Path("t").mkdir(exist_ok=True)
    for rec in incoming:
        write_card(rec)
    for rec in cat["tracks"]:
        path = Path("t/%s.html" % rec.get("id", ""))
        if rec.get("id") and rec.get("artwork") and not path.exists():
            write_card(rec)
    print("added", added)


if __name__ == "__main__":
    main()
