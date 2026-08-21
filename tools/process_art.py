#!/usr/bin/env python3
"""Chroma-key the magenta (#FF00FF) art masters into transparent game sprites.

Reads masters from art/, writes processed sprites to assets/img/.
Keying: distance-based key on magenta with despill, then autocrop + resize.
"""
import os
import sys
from PIL import Image

ART = os.path.join(os.path.dirname(__file__), "..", "art")
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "img")

# (master filename, output filename, max width)
JOBS = [
    ("andy-portrait.png", "andy-portrait.png", 512),
    ("adam-portrait.png", "adam-portrait.png", 512),
    ("lance-portrait.png", "lance-portrait.png", 512),
    ("elon-portrait.png", "elon-portrait.png", 512),
    ("andy-car.png", "andy-car.png", 1024),
    ("adam-car.png", "adam-car.png", 1024),
    ("lance-car.png", "lance-car.png", 1024),
    ("elon-car.png", "elon-car.png", 1024),
    ("andy-car-rear.png", "andy-car-rear.png", 768),
    ("adam-car-rear.png", "adam-car-rear.png", 768),
    ("lance-car-rear.png", "lance-car-rear.png", 768),
    ("elon-car-rear.png", "elon-car-rear.png", 768),
]


def key_magenta(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # Magenta-ness: high R and B, low G, R and B similar.
            if g < 200 and r > 120 and b > 120:
                mag = min(r, b) - g
                if mag > 110 and abs(r - b) < 110:
                    px[x, y] = (0, 0, 0, 0)
                    continue
                if mag > 60 and abs(r - b) < 110:
                    # Edge pixel: fade alpha and despill toward neutral.
                    alpha = max(0, 255 - int((mag - 60) * 255 / 60))
                    ng = g
                    nr = min(r, ng + 60)
                    nb = min(b, ng + 60)
                    px[x, y] = (nr, ng, nb, min(a, alpha))
    return img


def autocrop(img: Image.Image, margin: int = 4) -> Image.Image:
    bbox = img.getchannel("A").getbbox()
    if not bbox:
        return img
    left = max(0, bbox[0] - margin)
    top = max(0, bbox[1] - margin)
    right = min(img.width, bbox[2] + margin)
    bottom = min(img.height, bbox[3] + margin)
    return img.crop((left, top, right, bottom))


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    for src, dst, max_w in JOBS:
        path = os.path.join(ART, src)
        if not os.path.exists(path):
            print(f"MISSING: {path}")
            return 1
        img = key_magenta(Image.open(path))
        img = autocrop(img)
        if img.width > max_w:
            nh = round(img.height * max_w / img.width)
            img = img.resize((max_w, nh), Image.LANCZOS)
        out_path = os.path.join(OUT, dst)
        img.save(out_path, optimize=True)
        print(f"{dst}: {img.size}, {os.path.getsize(out_path) // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
