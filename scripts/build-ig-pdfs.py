#!/usr/bin/env python3
"""Assemble each Instagram carousel's PNG slides into a multi-page PDF.
Each page is the full-bleed 1080x1350 slide, so importing the PDF into Canva
yields an editable carousel with one slide per page.

Usage: python3 scripts/build-ig-pdfs.py
Output: out/instagram/<carousel-id>.pdf
"""
from pathlib import Path
from PIL import Image

BASE = Path("out/instagram")
# auto-discover every carousel folder that has rendered slides
CAROUSELS = sorted(d.name for d in BASE.iterdir() if d.is_dir() and any(d.glob("slide-*.png")))

for c in CAROUSELS:
    d = BASE / c
    pngs = sorted(d.glob("slide-*.png"))
    if not pngs:
        print(f"!  no slides for {c}")
        continue
    imgs = [Image.open(p).convert("RGB") for p in pngs]
    out = BASE / f"{c}.pdf"
    imgs[0].save(out, "PDF", save_all=True, append_images=imgs[1:], resolution=72.0)
    w, h = imgs[0].size
    print(f"✓  {out}  —  {len(imgs)} pages @ {w}x{h}px")
