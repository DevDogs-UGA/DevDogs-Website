"""Builds the Changelog's theme images into apps/platform/public/brand/newsletter/theme/.

Source art lives in the design-system workspace (default ~/scratchpad/devdogs/design-system; pass another path as
argv[1]): cosmic_dirs_bg.scene() for the space strip, the Arcade sprites in assets/sprite (made by
tools/fluent_sprite.py), the dithered card glows in assets/dirs, the flat Fluent emoji in assets/emoji/paper,
the Phosphor asterisk and the official GDG on Campus lockups. Run from anywhere:

    python3 packages/newsletter/tools/build-theme-assets.py [design-system-dir]

Outputs are committed; nothing here runs at render time. Needs numpy + Pillow and `node` (for rasterize.mjs).
"""
import subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent.parent / "apps/platform/public/brand/newsletter/theme"
DS = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "scratchpad/devdogs/design-system"
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(DS / "tools"))
from cosmic_dirs_bg import scene  # noqa: E402

rgb = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)

def raster(svg, name, width):
    subprocess.run(["node", str(HERE / "rasterize.mjs"), str(svg), str(OUT / name), str(width)], check=True)

# Cosmic: the 556x64 space strip (the mockup's exact call) and the candy stripe as pixel stairs
scene(556, 64, ("#74d4ff", "#0084d1", "#ff8ad8"), (505, 32, 20), (440, 18, 7), seed=12, twinkles=8, bands=3,
      density=0.004, px=2).save(OUT / "cosmic-strip.png")
w, h = 556 // 2, 10 // 2
yy, xx = np.mgrid[0:h, 0:w]
red = ((xx + yy) // 3) % 2 == 0
img = np.where(red[..., None], rgb("#ba0c2f"), rgb("#f3f1f6"))
Image.fromarray(img.astype("uint8")).resize((w * 2, h * 2), Image.NEAREST).save(OUT / "cosmic-stairs.png")

# Cosmic: dithered card glows per kind. build/demo/social/workshop exist; study reuses the amber "kickoff" glow and
# interest is the demo glow re-tinted violet (same dither, new hue).
D = DS / "assets/dirs"
for kind, src in {"build": "build", "demo": "demo", "social": "social", "workshop": "workshop", "study": "kickoff"}.items():
    Image.open(D / f"card-dither-{src}-og.png").save(OUT / f"glow-{kind}.png", optimize=True)
demo = np.asarray(Image.open(D / "card-dither-demo-og.png").convert("RGB"), float)
base, hi, goal = rgb("#0f0b1e"), np.array([25, 18, 67.0]), np.array([48, 22, 80.0])
t = ((demo - base) / (hi - base)).mean(axis=2, keepdims=True)
Image.fromarray(np.clip(base + t * (goal - base), 0, 255).astype("uint8")).save(OUT / "glow-interest.png", optimize=True)

# Sprites (Cosmic) and flat emoji (Paper): one per kind (design.ts KIND_ART) plus the per-event art (EVENT_ART)
ART = ["laptop", "megaphone", "triangular_flag", "trophy", "party_popper", "light_bulb", "bug", "rocket", "deciduous_tree"]

# Cosmic: sprites
for name in ART:
    Image.open(DS / "assets/sprite" / f"{name}.png").save(OUT / f"sprite-{name}.png", optimize=True)

# Cosmic: the title bar's three dots as pixel circles (a 6x6 grid, corners cut), 4 px per cell so they show crisp at
# 12 px on 2x screens. One per kind accent the dots use (design.ts THEMES.cosmic.dots).
CIRCLE = np.array([[0,1,1,1,1,0],[1,1,1,1,1,1],[1,1,1,1,1,1],[1,1,1,1,1,1],[1,1,1,1,1,1],[0,1,1,1,1,0]], bool)
for hexc in ["a684ff", "00a6f4", "ffb900"]:
    px = np.zeros((6, 6, 4), np.uint8); px[CIRCLE] = [*rgb("#" + hexc).astype(np.uint8), 255]
    Image.fromarray(px, "RGBA").resize((24, 24), Image.NEAREST).save(OUT / f"dot-{hexc}.png", optimize=True)

# Paper: flat Fluent emoji at 120 px (shown at 60 and 38), the asterisk, and the logo/lockup pairs
for name in ART:
    raster(DS / "assets/emoji/paper" / f"{name}.svg", f"emoji-{name}.png", 120)
raster(DS / "assets/icons/paper/Asterisk-white.svg", "paper-asterisk.png", 52)
raster(DS / "assets/devdogs-logo.svg", "paper-devdogs-logo.png", 264)
Image.open(DS / "assets/devdogs-logo-dark.png").resize((264, 71), Image.LANCZOS).save(OUT / "paper-devdogs-logo-dark.png", optimize=True)
raster(DS / "assets/gdg/gdgc-uga-lockup-official.svg", "paper-gdgc-lockup.png", 480)
raster(DS / "assets/gdg/gdgc-uga-lockup-official-dark.svg", "paper-gdgc-lockup-dark.png", 480)
print("ok", len(list(OUT.glob("*.png"))))
