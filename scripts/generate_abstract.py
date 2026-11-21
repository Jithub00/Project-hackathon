#!/usr/bin/env python3
"""Original abstract cinematic images for the Photo Shoot demo.

Run from the project root with -I:

  python -I scripts/generate_abstract.py <samples_dir>

Writes abstract-01.jpg ... abstract-08.jpg (six 1600x1000, two 1600x2000) and
merges their credit records into <samples_dir>/credits.json. Everything is drawn
procedurally with Pillow: no photographs, text, people or logos. Palette: black
background, cherry red #E12325 accents, white light streaks, bokeh, film grain
and a gentle vignette.
"""

import json
import math
import os
import random
import site
import sys

# `python -I` leaves out the per-user site-packages, which is where Pillow is
# installed on this machine. Append (never prepend) that directory so the
# standard library and global packages still take precedence.
_USER_SITE = site.getusersitepackages()
if os.path.isdir(_USER_SITE) and _USER_SITE not in sys.path:
    sys.path.append(_USER_SITE)

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter  # noqa: E402

RED = (225, 35, 37)  # #E12325
WHITE = (255, 255, 255)
SS = 2  # draw at 2x and downsample for smooth edges
JPEG_QUALITY = 85
AUTHOR = "Photo Shoot demo build script"
LICENSE = "Original work (generated for this project)"


class Canvas:
    def __init__(self, w, h, seed):
        self.w, self.h = w, h
        self.img = Image.new("RGB", (w * SS, h * SS), (0, 0, 0))
        self.rng = random.Random(seed)

    def _blank(self):
        return Image.new("RGB", self.img.size, (0, 0, 0))

    def _p(self, x, y):
        return (x * SS, y * SS)

    def fade_h(self, fade):
        """Mask: 0 at the left and right edges, 255 across the middle."""
        W, H = self.img.size
        f = fade * SS
        strip = Image.new("L", (W, 1))
        strip.putdata([int(255 * min(1.0, x / f, (W - 1 - x) / f)) for x in range(W)])
        m = strip.resize((W, H))
        return Image.merge("RGB", (m, m, m))

    def fade_v(self, fade):
        """Mask: 0 at the top and bottom edges, 255 across the middle."""
        W, H = self.img.size
        f = fade * SS
        strip = Image.new("L", (1, H))
        strip.putdata([int(255 * min(1.0, y / f, (H - 1 - y) / f)) for y in range(H)])
        m = strip.resize((W, H))
        return Image.merge("RGB", (m, m, m))

    def _commit(self, layer, glow=0.0, gain=1.0, mask=None):
        out = layer
        if glow > 0:
            halo = layer.filter(ImageFilter.GaussianBlur(glow * SS))
            if gain != 1.0:
                halo = ImageEnhance.Brightness(halo).enhance(gain)
            out = ImageChops.screen(out, halo)
        if mask is not None:
            out = ImageChops.multiply(out, mask)
        self.img = ImageChops.screen(self.img, out)

    def line(self, pts, color, width=1.0, glow=0.0, gain=1.0, mask=None):
        layer = self._blank()
        ImageDraw.Draw(layer).line([self._p(x, y) for x, y in pts], fill=color,
                                   width=max(1, round(width * SS)), joint="curve")
        self._commit(layer, glow, gain, mask)

    def arc(self, cx, cy, r, start, end, color, width=1.0, glow=0.0, gain=1.0, mask=None):
        layer = self._blank()
        x0, y0 = self._p(cx - r, cy - r)
        x1, y1 = self._p(cx + r, cy + r)
        ImageDraw.Draw(layer).arc([x0, y0, x1, y1], start, end, fill=color,
                                  width=max(1, round(width * SS)))
        self._commit(layer, glow, gain, mask)

    def rect(self, x0, y0, x1, y1, color, glow=0.0, gain=1.0, mask=None):
        layer = self._blank()
        a, b = self._p(x0, y0)
        c, d = self._p(x1, y1)
        ImageDraw.Draw(layer).rectangle([a, b, c - 1, d - 1], fill=color)
        self._commit(layer, glow, gain, mask)

    def disc(self, cx, cy, r, color, blur=0.0, gain=1.0, mask=None):
        layer = self._blank()
        x, y = self._p(cx, cy)
        rr = r * SS
        ImageDraw.Draw(layer).ellipse([x - rr, y - rr, x + rr, y + rr], fill=color)
        if blur > 0:
            layer = layer.filter(ImageFilter.GaussianBlur(blur * SS))
        if gain != 1.0:
            layer = ImageEnhance.Brightness(layer).enhance(gain)
        self._commit(layer, 0.0, 1.0, mask)

    def bokeh(self, n, box, rmin, rmax, reds=0.2, alpha=(0.1, 0.5), mask=None):
        layer = self._blank()
        draw = ImageDraw.Draw(layer)
        x0, y0, x1, y1 = box
        for _ in range(n):
            r = self.rng.uniform(rmin, rmax) * SS
            x, y = self._p(self.rng.uniform(x0, x1), self.rng.uniform(y0, y1))
            base = RED if self.rng.random() < reds else WHITE
            a = self.rng.uniform(*alpha)
            draw.ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(c * a) for c in base))
            rim = tuple(min(255, int(c * a * 1.7)) for c in base)
            draw.ellipse([x - r, y - r, x + r, y + r], outline=rim, width=max(1, round(1.2 * SS)))
        layer = layer.filter(ImageFilter.GaussianBlur(1.0 * SS))
        self._commit(layer, 0.0, 1.0, mask)

    def finish(self, path, vignette=0.4, grain=0.14):
        img = self.img.resize((self.w, self.h), Image.Resampling.LANCZOS)
        radial = Image.radial_gradient("L").resize((self.w, self.h), Image.Resampling.BILINEAR)
        shade = radial.point(lambda v: int(round(255 * (1 - vignette * (v / 255.0) ** 2))))
        img = ImageChops.multiply(img, Image.merge("RGB", (shade, shade, shade)))
        noise = Image.effect_noise((self.w, self.h), 24).point(
            lambda v: int(round(128 + (v - 128) * grain)))
        img = ImageChops.add(img, Image.merge("RGB", (noise, noise, noise)), scale=1.0, offset=-128)
        img.save(path, "JPEG", quality=JPEG_QUALITY, optimize=True)


def comp_01(cv):
    """Diagonal white light streak with a red bokeh cluster on the right."""
    cv.line([(0, 642), (1600, 618)], (210, 210, 210), width=1)
    cv.line([(-80, 1060), (1680, 120)], WHITE, width=3, glow=26, gain=0.8, mask=cv.fade_h(420))
    cv.line([(-80, 1000), (1680, 60)], (190, 190, 190), width=1, glow=10, gain=0.5, mask=cv.fade_h(420))
    cv.disc(1290, 360, 120, RED, blur=120, gain=0.35)
    cv.disc(1290, 360, 12, RED, blur=0.8)
    cv.bokeh(9, (1180, 260, 1420, 470), 10, 46, reds=0.7, alpha=(0.5, 0.95))
    cv.bokeh(18, (0, 0, 1600, 1000), 4, 22, reds=0.15, alpha=(0.08, 0.35))


def comp_02(cv):
    """Fine horizontal lines fading toward the edges, with a small red sun."""
    ys = [336, 356, 372, 384, 462, 498, 512, 548, 566, 574, 648, 664, 676, 712]
    for i, y in enumerate(ys):
        level = int(255 * (0.35 + 0.55 * ((i * 37) % 10) / 10.0))
        cv.line([(0, y), (1600, y)], (level, level, level), width=1, mask=cv.fade_h(520))
    cv.disc(1150, 470, 90, RED, blur=70, gain=0.6)
    cv.disc(1150, 470, 34, RED, blur=0.6)
    cv.line([(0, 470), (1600, 470)], RED, width=2, glow=10, gain=0.6, mask=cv.fade_h(700))
    cv.bokeh(12, (0, 0, 1600, 1000), 3, 14, reds=0.1, alpha=(0.05, 0.25))


def comp_03(cv):
    """Vertical light columns on black, with one red column."""
    columns = [(240, 1.0, 26, 0.7), (470, 2.0, 14, 0.45), (690, 1.0, 34, 0.55),
               (1010, 3.0, 22, 0.8), (1170, 1.0, 12, 0.5), (1420, 2.0, 40, 0.35)]
    for x, width, glow, gain in columns:
        drift = cv.rng.uniform(-70, 70)
        cv.line([(x, -40), (x + drift, 2040)], WHITE, width=width, glow=glow, gain=gain,
                mask=cv.fade_v(560))
    cv.line([(1240, 700), (1240, 1500)], RED, width=2, glow=16, gain=0.9, mask=cv.fade_v(260))
    cv.disc(1240, 1100, 150, RED, blur=150, gain=0.25)
    cv.bokeh(26, (0, 0, 1600, 760), 4, 30, reds=0.25, alpha=(0.1, 0.55))


def comp_04(cv):
    """Field of soft bokeh discs, denser toward the centre, red cluster right of centre."""
    cv.bokeh(70, (0, 0, 1600, 1000), 5, 40, reds=0.2, alpha=(0.06, 0.4))
    cv.bokeh(24, (480, 230, 1120, 770), 16, 90, reds=0.2, alpha=(0.08, 0.35))
    cv.bokeh(8, (900, 360, 1300, 640), 22, 60, reds=0.9, alpha=(0.4, 0.85))


def comp_05(cv):
    """Concentric partial rings around one point, with a single red ring."""
    cx, cy = 800, 500
    for i, r in enumerate([96, 150, 214, 290, 372, 470]):
        start = cv.rng.uniform(0, 120)
        span = cv.rng.uniform(110, 240)
        level = int(255 * (0.4 + 0.5 * (i % 3) / 2.0))
        cv.arc(cx, cy, r, start, start + span, (level, level, level), width=1.2, glow=4, gain=0.6)
    red_start = cv.rng.uniform(0, 150)
    cv.arc(cx, cy, 245, red_start, red_start + 150, RED, width=3, glow=14, gain=0.9)
    cv.line([(0, cy), (1600, cy)], (170, 170, 170), width=1, glow=6, gain=0.4, mask=cv.fade_h(600))
    cv.disc(cx, cy, 4, WHITE, blur=0.8)


def comp_06(cv):
    """Perspective floor grid converging on a red horizon glow."""
    vx, vy = 800, 900
    for i in range(-12, 13):
        cv.line([(vx, vy), (vx + i * 170, 2040)], (150, 150, 150), width=1, mask=cv.fade_v(700))
    for k in range(1, 26):
        y = vy + (k ** 1.6) * 5.0
        level = int(230 * (1 - k / 26.0))
        cv.line([(0, y), (1600, y)], (level, level, level), width=1, mask=cv.fade_h(420))
    cv.line([(0, vy), (1600, vy)], RED, width=2, glow=18, gain=0.9, mask=cv.fade_h(500))
    cv.disc(vx, vy, 150, RED, blur=150, gain=0.3)
    cv.disc(vx, vy, 22, RED, blur=0.8)
    cv.bokeh(10, (0, 1000, 1600, 2000), 3, 12, reds=0.2, alpha=(0.05, 0.25))


def comp_07(cv):
    """Curved long-exposure light trails, one thicker red trail."""
    trails = [
        (430, 60, 1.0, 0.0, 0.05, 1.0, 10, 0.6, (210, 210, 210)),
        (500, 90, 1.5, 1.2, -0.03, 2.0, 16, 0.7, WHITE),
        (560, 40, 2.0, 2.4, 0.01, 1.0, 8, 0.5, (190, 190, 190)),
        (620, 120, 1.2, 0.8, 0.0, 3.0, 22, 0.9, RED),
    ]
    for y0, amp, freq, phase, slope, width, glow, gain, color in trails:
        pts = []
        for i in range(161):
            x = -40 + i * (1680 / 160.0)
            y = y0 + amp * math.sin(2 * math.pi * freq * x / 1600.0 + phase) + slope * (x - 800)
            pts.append((x, y))
        cv.line(pts, color, width=width, glow=glow, gain=gain, mask=cv.fade_h(360))


def comp_08(cv):
    """Mostly black negative space with one red light bar on a white hairline."""
    cv.line([(0, 500), (1600, 500)], (150, 150, 150), width=1, glow=5, gain=0.4, mask=cv.fade_h(640))
    cv.line([(0, 534), (1600, 534)], (90, 90, 90), width=1, mask=cv.fade_h(640))
    cv.rect(520, 488, 1080, 512, RED, glow=40, gain=0.7)
    cv.rect(560, 494, 1040, 506, RED, glow=2)
    cv.bokeh(6, (0, 0, 1600, 1000), 3, 10, reds=0.5, alpha=(0.05, 0.2))


SPECS = [
    ("abstract-01.jpg", "Abstract 01 - diagonal light streak", 1600, 1000, comp_01),
    ("abstract-02.jpg", "Abstract 02 - horizon lines and red sun", 1600, 1000, comp_02),
    ("abstract-03.jpg", "Abstract 03 - vertical light columns", 1600, 2000, comp_03),
    ("abstract-04.jpg", "Abstract 04 - bokeh field", 1600, 1000, comp_04),
    ("abstract-05.jpg", "Abstract 05 - concentric arcs", 1600, 1000, comp_05),
    ("abstract-06.jpg", "Abstract 06 - perspective grid", 1600, 2000, comp_06),
    ("abstract-07.jpg", "Abstract 07 - long-exposure light trails", 1600, 1000, comp_07),
    ("abstract-08.jpg", "Abstract 08 - red light bar", 1600, 1000, comp_08),
]


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


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    out_dir = argv[1]
    os.makedirs(out_dir, exist_ok=True)
    entries = []
    for index, (name, title, w, h, compose) in enumerate(SPECS, 1):
        cv = Canvas(w, h, seed=100 + index)
        compose(cv)
        cv.finish(os.path.join(out_dir, name))
        entries.append({
            "file": name,
            "title": title,
            "subject": "abstract",
            "sourceUrl": None,
            "author": AUTHOR,
            "license": LICENSE,
            "licenseUrl": None,
        })
        print(f"  {name}: {w}x{h}")
    merge_credits(os.path.join(out_dir, "credits.json"), entries, out_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
