#!/usr/bin/env python3
"""Sample photos for the Photo Shoot demo, sourced only from Wikimedia Commons.

Run from the project root with -I:

  python -I scripts/fetch_samples.py search <staging_dir> "<query>" ["<query>" ...]
      Searches Commons (File namespace) and keeps only CC0, public domain, CC BY
      and CC BY-SA files whose long edge is at least 1600px. Writes 400px
      previews and one labelled contact sheet per query under
      <staging_dir>/review so candidates can be chosen visually.

  python -I scripts/fetch_samples.py build <staging_dir> <samples_dir>
      Downloads every PLAN entry at its target width, converts it to JPEG
      (quality 85) in <samples_dir>, and merges the credit records into
      <samples_dir>/credits.json.
"""

import html
import json
import os
import re
import shutil
import site
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# `python -I` leaves out the per-user site-packages, which is where Pillow is
# installed on this machine. Append (never prepend) that directory so the
# standard library and global packages still take precedence.
_USER_SITE = site.getusersitepackages()
if os.path.isdir(_USER_SITE) and _USER_SITE not in sys.path:
    sys.path.append(_USER_SITE)

from PIL import Image, ImageDraw, ImageFont, ImageOps  # noqa: E402

API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "PhotoShootDemoBuilder/1.0 (sample imagery build; generic client)"
API_DELAY = 1.0   # seconds between API calls
FILE_DELAY = 0.3  # seconds between file downloads
MIN_LONG_EDGE = 1600
JPEG_QUALITY = 85
ALLOWED_MIME = {"image/jpeg", "image/png", "image/tiff"}
PHOTO_FILE_RE = re.compile(r"^(la-\d{2}[\w-]*|hero-los-angeles)\.jpg$")

BLOCK_RE = re.compile(
    r"\bnc\b|non-?commercial|\bnd\b|no-?deriv|fair[- ]use|non-?free"
    r"|all rights reserved|unknown|copyrighted"
)
CC0_RE = re.compile(r"\bcc0\b|cc-zero|publicdomain/zero")
PD_RE = re.compile(r"public[ -]domain|\bpd\b|\bpd-")
CCBY_RE = re.compile(r"\bcc[ -]by\b|creative commons attribution")
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")

FILE_EXTENSIONS = ("jpg", "JPG", "jpeg", "JPEG", "png", "PNG", "tif", "tiff", "TIF")

# Chosen photos, picked from the reviewed search sheets. Each entry:
#   name       output file name in the samples folder
#   base       Commons file name without the "File:" prefix and extension
#   subject    architecture | skyline | landscape | object | abstract
#   width      thumbnail width to request (1600 for la-*, 2400 for hero)
#   min_width  optional: the original must be at least this wide
PLAN = [
    {"name": "la-01-downtown-la-at-night.jpg", "base": "Downtown Los Angeles at Night", "subject": "skyline", "width": 1600},
    {"name": "la-02-freeway-skyline-night.jpg", "base": "Nightime skyline view of Los Angeles, California, looking north over the U.S. 101 (Hollywood) Freeway LCCN2013631697", "subject": "skyline", "width": 1600},
    {"name": "la-03-echo-park-lake-skyline.jpg", "base": "20190616154621!Echo Park Lake with Downtown Los Angeles Skyline", "subject": "skyline", "width": 1600},
    {"name": "la-04-city-hall-belgian-colours.jpg", "base": "Los Angeles City Hall illuminate in Belgian colours", "subject": "skyline", "width": 1600},
    {"name": "la-05-griffith-observatory-dusk.jpg", "base": "Observatory dusk", "subject": "architecture", "width": 1600},
    {"name": "la-06-griffith-observatory-twilight.jpg", "base": "Griffith Observatory 2008 (Griffith park)", "subject": "architecture", "width": 1600},
    {"name": "la-07-disney-concert-hall-steel.jpg", "base": "Walt Disney Concert Hall exterior 02", "subject": "architecture", "width": 1600},
    {"name": "la-08-capitol-records-sunset.jpg", "base": "Capitol Records sunset", "subject": "architecture", "width": 1600},
    {"name": "la-09-getty-center-sunset.jpg", "base": "Los Angeles - Getty Center - Sunset GR", "subject": "architecture", "width": 1600},
    {"name": "la-10-getty-center-skyline-haze.jpg", "base": "Los Angeles from the Getty Center (5465084241)", "subject": "skyline", "width": 1600},
    {"name": "la-11-watts-towers.jpg", "base": "Watts Towers in Los Angeles 02", "subject": "architecture", "width": 1600},
    {"name": "la-12-angels-flight.jpg", "base": "Los Angeles (California, USA), South Olive Street, Angel's Flight -- 2012 -- 4797", "subject": "object", "width": 1600},
    {"name": "la-13-hollywood-sign-overlook.jpg", "base": "View from behind Hollywood Sign overlooking LA", "subject": "landscape", "width": 1600},
    {"name": "la-14-santa-monica-pier-sunset.jpg", "base": "Santa Monica Pier in Los Angeles", "subject": "landscape", "width": 1600},
    {"name": "la-15-palm-trees-sunset.jpg", "base": "Venice Beach palm trees at sunset (Unsplash)", "subject": "landscape", "width": 1600},
    {"name": "la-16-union-station.jpg", "base": "Los Angeles (California, USA), Union Station -- 2012 -- 4938", "subject": "architecture", "width": 1600},
    {"name": "hero-los-angeles.jpg", "base": "Observatory dusk", "subject": "architecture", "width": 2400, "min_width": 2400},
]


def retry_after(exc, default):
    value = exc.headers.get("Retry-After", "") if exc.headers is not None else ""
    return min(int(value), 120) if value.isdigit() else default


def api_get(params):
    query = dict(params, format="json", formatversion="2", maxlag="5")
    url = API + "?" + urllib.parse.urlencode(query)
    for attempt in range(5):
        time.sleep(API_DELAY)
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 4:
                raise
            time.sleep(retry_after(exc, 5 * (attempt + 1)))
            continue
        except urllib.error.URLError:
            if attempt == 4:
                raise
            time.sleep(5 * (attempt + 1))
            continue
        error = data.get("error")
        if error:
            if error.get("code") == "maxlag" and attempt < 4:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"Commons API error: {error}")
        return data
    raise RuntimeError("Commons API did not respond")


def download(url, dest):
    for attempt in range(5):
        time.sleep(FILE_DELAY)
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=120) as resp, open(dest, "wb") as out:
                shutil.copyfileobj(resp, out)
            return
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 4:
                raise
            time.sleep(retry_after(exc, 5 * (attempt + 1)))
        except urllib.error.URLError:
            if attempt == 4:
                raise
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"download failed: {url}")


def clean_text(value):
    text = html.unescape(TAG_RE.sub("", str(value or "")))
    return SPACE_RE.sub(" ", text).strip()


def meta(extmetadata, key):
    entry = (extmetadata or {}).get(key)
    return clean_text(entry.get("value", "")) if isinstance(entry, dict) else ""


def license_of(extmetadata):
    """Return {"name", "url"} for an allowed license, otherwise None."""
    short = meta(extmetadata, "LicenseShortName")
    code = meta(extmetadata, "License").lower()
    terms = meta(extmetadata, "UsageTerms")
    url = meta(extmetadata, "LicenseUrl")
    blob = " | ".join((short, code, terms, url)).lower()
    if BLOCK_RE.search(blob):
        return None
    if CC0_RE.search(blob):
        fallback = "CC0"
    elif PD_RE.search(blob):
        fallback = "Public domain"
    elif CCBY_RE.search(blob):
        m = re.search(r"cc-by(-sa)?-(\d+(?:\.\d+)?)", code)
        fallback = "CC BY" + ("-SA" if m and m.group(1) else "") + (f" {m.group(2)}" if m else "")
    else:
        return None
    return {"name": short or fallback, "url": url or None}


def author_of(extmetadata):
    return meta(extmetadata, "Artist") or meta(extmetadata, "Credit") or "Unknown"


def clean_title(page_title):
    base = page_title.split(":", 1)[-1]
    return os.path.splitext(base)[0].replace("_", " ").strip()


def usable(info, min_long):
    """None if the file is acceptable, otherwise a short rejection reason."""
    if info.get("mime") not in ALLOWED_MIME:
        return "format"
    if max(info.get("width", 0), info.get("height", 0)) < min_long:
        return "too-small"
    if license_of(info.get("extmetadata")) is None:
        return "license"
    return None


def to_rgb_on_black(im):
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        base = Image.new("RGB", rgba.size, (0, 0, 0))
        base.paste(rgba, mask=rgba.getchannel("A"))
        return base
    return im.convert("RGB")


def load_font():
    try:
        return ImageFont.load_default(size=18)
    except TypeError:
        return ImageFont.load_default()


def make_sheet(items, out_path, cols=4, cell=360, caption=26):
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + caption)), (30, 30, 30))
    draw = ImageDraw.Draw(sheet)
    font = load_font()
    for i, (label, im) in enumerate(items):
        x0, y0 = (i % cols) * cell, (i // cols) * (cell + caption)
        fitted = ImageOps.contain(im, (cell - 8, cell - 8))
        sheet.paste(fitted, (x0 + (cell - fitted.width) // 2, y0 + (cell - fitted.height) // 2))
        draw.rectangle([x0, y0 + cell, x0 + cell - 1, y0 + cell + caption - 1], fill=(0, 0, 0))
        draw.text((x0 + 8, y0 + cell + 3), label, fill=(255, 255, 255), font=font)
    sheet.save(out_path, "JPEG", quality=85)


def cmd_search(staging, queries):
    review = os.path.join(staging, "review")
    os.makedirs(review, exist_ok=True)
    for qi, query in enumerate(queries, 1):
        data = api_get({
            "action": "query",
            "generator": "search",
            "gsrsearch": f"{query} filetype:bitmap",
            "gsrnamespace": "6",
            "gsrlimit": "40",
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": "400",
        })
        pages = sorted((data.get("query") or {}).get("pages", []), key=lambda p: p.get("index", 0))
        kept, rejected = [], {}
        for page in pages:
            infos = page.get("imageinfo") or []
            reason = usable(infos[0], MIN_LONG_EDGE) if infos else "no-info"
            if reason:
                rejected[reason] = rejected.get(reason, 0) + 1
            else:
                kept.append((page["title"], infos[0]))
        print(f"\n## [{qi:02d}] {query}: {len(pages)} hits, {len(kept)} usable, rejected {rejected}")
        items = []
        for k, (title, info) in enumerate(kept[:16], 1):
            label = f"{qi:02d}.{k:02d}"
            lic = license_of(info["extmetadata"])["name"]
            print(f"  {label}  {info['width']}x{info['height']}  {lic}  |  {clean_title(title)}")
            src = os.path.join(review, f"q{qi:02d}-{k:02d}.src")
            download(info["thumburl"], src)
            with Image.open(src) as im:
                items.append((label, to_rgb_on_black(ImageOps.exif_transpose(im))))
            os.remove(src)
        if items:
            make_sheet(items, os.path.join(review, f"sheet-{qi:02d}.jpg"))
    print(f"\nPreviews and sheets: {review}")


def find_file(base, width):
    """Resolve a Commons file from its base name, trying the usual extensions."""
    titles = "|".join(f"File:{base}.{ext}" for ext in FILE_EXTENSIONS)
    data = api_get({
        "action": "query",
        "titles": titles,
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": str(width),
    })
    for page in (data.get("query") or {}).get("pages") or []:
        if not page.get("missing") and page.get("imageinfo"):
            return page["title"], page["imageinfo"][0]
    return None, None


def build_one(spec, staging, out_dir):
    name, width = spec["name"], spec["width"]
    min_width = spec.get("min_width", 0)
    page_title, info = find_file(spec["base"], width)
    if info is None:
        raise SystemExit(f"{name}: no Commons file named {spec['base']!r}")
    reason = usable(info, MIN_LONG_EDGE)
    if reason:
        raise SystemExit(f"{name}: rejected ({reason})")
    if info["width"] < min_width:
        raise SystemExit(f"{name}: original is {info['width']}px wide, need {min_width}")
    lic = license_of(info["extmetadata"])
    src = os.path.join(staging, name + ".download")
    download(info["thumburl"], src)
    with Image.open(src) as im:
        rgb = to_rgb_on_black(ImageOps.exif_transpose(im))
    w, h = rgb.size
    if max(w, h) < MIN_LONG_EDGE or w < min_width:
        raise SystemExit(f"{name}: thumbnail is {w}x{h}, too small")
    dest = os.path.join(out_dir, name)
    rgb.save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True)
    print(f"  {name}: {w}x{h}, {os.path.getsize(dest) // 1024} KB, {lic['name']}")
    return {
        "file": name,
        "title": clean_title(page_title),
        "subject": spec["subject"],
        "sourceUrl": info["descriptionurl"],
        "author": author_of(info["extmetadata"]),
        "license": lic["name"],
        "licenseUrl": lic["url"],
    }


def merge_credits(path, new_entries, out_dir):
    existing = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            existing = json.load(fh)
    new_names = {e["file"] for e in new_entries}
    kept = [e for e in existing
            if e.get("file") not in new_names
            and os.path.isfile(os.path.join(out_dir, e.get("file", "")))]
    merged = sorted(kept + new_entries, key=lambda e: e["file"])
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(merged, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"credits.json: {len(merged)} entries")


def cmd_build(staging, out_dir):
    os.makedirs(staging, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    planned = {spec["name"] for spec in PLAN}
    for fname in os.listdir(out_dir):
        if PHOTO_FILE_RE.match(fname) and fname not in planned:
            os.remove(os.path.join(out_dir, fname))
    entries = [build_one(spec, staging, out_dir) for spec in PLAN]
    merge_credits(os.path.join(out_dir, "credits.json"), entries, out_dir)


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if len(argv) >= 4 and argv[1] == "search":
        cmd_search(argv[2], argv[3:])
    elif len(argv) == 4 and argv[1] == "build":
        cmd_build(argv[2], argv[3])
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
