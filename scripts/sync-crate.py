#!/usr/bin/env python3
import html
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "PDragonLabs-station/1.0"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "ignore")


def oembed(url):
    q = "https://soundcloud.com/oembed?format=json&url=" + urllib.parse.quote(url, safe="")
    return json.loads(get(q))


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
    try:
        page = get("https://soundcloud.com/%s/tracks" % user)
        pat = r"https://soundcloud.com/%s/([a-z0-9-]+)" % re.escape(user)
        skip = {"tracks", "popular-tracks", "reposts", "sets", "comments", "followers", "following"}
        for m in re.finditer(pat, page):
            s = m.group(1)
            if s not in skip and s not in slugs:
                slugs.append(s)
    except Exception as exc:
        print("profile fetch failed", exc)

    for line in extra.splitlines():
        line = line.strip()
        if "soundcloud.com/" in line:
            s = line.rstrip("/").split("/")[-1]
            if s and s not in slugs:
                slugs.append(s)

    print("found", len(slugs), slugs[:12])

    cat = json.loads(Path("catalog.json").read_text())
    have = {t.get("id") for t in cat["tracks"]} | {t.get("soundcloud") for t in cat["tracks"]}
    incoming = []
    for slug in slugs:
        url = "https://soundcloud.com/%s/%s" % (user, slug)
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
        hook = (data.get("description") or "").strip() or title
        incoming.append({
            "id": slug,
            "title": title,
            "artist": data.get("author_name") or "PDRAGONLABS",
            "genre": "untagged",
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
