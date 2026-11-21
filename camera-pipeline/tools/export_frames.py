"""Converts the rendered PNG frames into the WebP files the website plays.

  python camera-pipeline/tools/export_frames.py <master-dir> [--out public/camera/frames]

Writes two sets: desktop (the 1152 px master, for retina stages) and mobile (640 px, for phones). Frames keep the pure
black background of the render, so they sit on the site's black without a visible edge.
"""

import argparse
import os
from pathlib import Path

from PIL import Image

FRAME_COUNT = 120
VARIANTS = {
    "desktop": {"size": None, "quality": 84},
    "mobile": {"size": 640, "quality": 82},
}


def export(master_dir: Path, out_dir: Path) -> None:
    for variant, settings in VARIANTS.items():
        target = out_dir / variant
        target.mkdir(parents=True, exist_ok=True)
        total = 0
        for index in range(FRAME_COUNT):
            source = master_dir / f"frame-{index:03d}.png"
            if not source.exists():
                raise SystemExit(f"missing master frame: {source}")
            image = Image.open(source).convert("RGB")
            if settings["size"] and image.width != settings["size"]:
                image = image.resize((settings["size"], settings["size"]), Image.Resampling.LANCZOS)
            destination = target / f"frame-{index:03d}.webp"
            image.save(destination, "WEBP", quality=settings["quality"], method=6)
            total += os.path.getsize(destination)
        print(f"{variant}: {FRAME_COUNT} frames, {image.width}px, {total / 1024 / 1024:.2f} MB total, "
              f"{total / FRAME_COUNT / 1024:.0f} KB average")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("master_dir", type=Path)
    parser.add_argument("--out", type=Path, default=Path("public/camera/frames"))
    args = parser.parse_args()
    export(args.master_dir, args.out)


if __name__ == "__main__":
    main()
