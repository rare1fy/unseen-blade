"""Build 144 px dialogue portraits (the game scales them by whole numbers) and a 2x nearest-neighbour sheet.

act-37 (用户：「这版立绘对比之前糊了好多」): 144 px tall, cut to the pixel grid with a box filter (no Lanczos ringing or smoothing),
16 flat colours with no dithering — the old, crisp set had 14–16; the blurry one kept 40.

Run from anywhere with: python tools/portraits.py
Requires Pillow (PIL). Raw PNGs stay untouched in out/portraits/raw.
"""

from __future__ import annotations

from math import ceil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "out" / "portraits" / "raw"
PROCESSED = ROOT / "src" / "assets" / "portraits"
SHEET = ROOT / "out" / "portraits" / "sheet.png"
HEIGHT = 144
MAX_COLOURS = 17   # 16 colours + transparent
MARGIN = 0.04
ORDER = [
    "jiangjin", "chulei", "yanhu", "fengzhen", "zhouan", "cuixuan",
    "duwu", "sunao", "fengtiebi", "luzhao", "huanyue",
]


def remove_background(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    # Native alpha is preferred. Some generators instead return an opaque
    # chroma-key image; accept a small range around pure #00FF00 in that case.
    if image.getchannel("A").getextrema()[0] < 255:
        return image
    corner = image.getpixel((0, 0))
    if not (corner[0] <= 50 and corner[1] >= 205 and corner[2] <= 50):
        raise ValueError("Image has neither transparency nor a #00FF00 background")

    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, _ = pixels[x, y]
            if r <= 50 and g >= 205 and b <= 50:
                pixels[x, y] = (0, 0, 0, 0)

    # Chroma spill can survive at antialiased silhouette edges. Remove the
    # remaining green dominance only in the one-pixel border of the cutout.
    alpha = image.getchannel("A")
    near_hole = alpha.filter(ImageFilter.MinFilter(3))
    border = near_hole.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a and border[x, y] == 0 and g > max(r, b) + 35:
                pixels[x, y] = (r, max(r, b) + 12, b, 255)
    return image


def process(path: Path) -> Image.Image:
    image = remove_background(Image.open(path))
    # Very faint generated alpha is not part of the visible silhouette.
    alpha = image.getchannel("A").point(lambda a: 255 if a >= 32 else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError(f"No visible pixels: {path}")
    left, top, right, bottom = bbox
    margin_x = ceil((right - left) * MARGIN)
    margin_y = ceil((bottom - top) * MARGIN)
    canvas = Image.new("RGBA", (right - left + 2 * margin_x,
                                bottom - top + 2 * margin_y))
    canvas.paste(image.crop(bbox), (margin_x, margin_y))

    width = max(1, round(canvas.width * HEIGHT / canvas.height))
    canvas = canvas.resize((width, HEIGHT), Image.Resampling.BOX)
    hard_alpha = canvas.getchannel("A").point(lambda a: 255 if a >= 128 else 0)

    # Pillow's median-cut quantizer takes RGB input; transparency is one more entry.
    rgb = Image.new("RGB", canvas.size, (0, 0, 0))
    rgb.paste(canvas.convert("RGB"), mask=hard_alpha)
    rgb = rgb.quantize(colors=MAX_COLOURS - 1,
                       method=Image.Quantize.MEDIANCUT,
                       dither=Image.Dither.NONE).convert("RGB")
    rgb.putalpha(hard_alpha)
    return rgb


def make_sheet(images: list[tuple[str, Image.Image]]) -> None:
    columns = 4
    rows = ceil(len(images) / columns)
    tile_w = max(im.width for _, im in images) * 2 + 32
    tile_h = HEIGHT * 2 + 54
    sheet = Image.new("RGB", (columns * tile_w, rows * tile_h), "#292a31")
    draw = ImageDraw.Draw(sheet)
    font_path = Path("C:/Windows/Fonts/consola.ttf")
    font = ImageFont.truetype(str(font_path), 21) if font_path.exists() else ImageFont.load_default()
    for index, (name, im) in enumerate(images):
        x = (index % columns) * tile_w
        y = (index // columns) * tile_h
        enlarged = im.resize((im.width * 2, im.height * 2), Image.Resampling.NEAREST)
        px = x + (tile_w - enlarged.width) // 2
        sheet.paste(enlarged, (px, y + 8), enlarged)
        bounds = draw.textbbox((0, 0), name, font=font)
        draw.text((x + (tile_w - (bounds[2] - bounds[0])) // 2, y + HEIGHT * 2 + 15),
                  name, fill="#f2e8d0", font=font)
    SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(SHEET)


def main() -> None:
    paths = {path.stem: path for path in RAW.glob("*.png")}
    missing = set(ORDER) - paths.keys()
    if missing:
        raise SystemExit(f"Missing raw portraits: {', '.join(sorted(missing))}")
    names = ORDER + sorted(paths.keys() - set(ORDER))
    PROCESSED.mkdir(parents=True, exist_ok=True)
    images = []
    for name in names:
        image = process(paths[name])
        image.save(PROCESSED / f"{name}.png", optimize=True)
        colours = len(image.getcolors(maxcolors=256) or [])
        if colours > MAX_COLOURS:
            raise AssertionError(f"{name}: {colours} visible colours")
        images.append((name, image))
        print(f"{name}: {image.width}x{image.height}, {colours} RGBA colours")
    make_sheet(images)
    print(SHEET)


if __name__ == "__main__":
    main()


# ---------------------------------------------------------------- act-37: back to the picture's own pixel grid
# 用户：「怎么立绘还是糊的」— the generated pictures are pixel art on a coarse grid (one art pixel ≈ 8–12 px of the 1254 px raw), so
# their own art is only ~100–150 rows tall; resizing that to 144 rows split each art pixel into ~1.4 and blended the edges. Instead:
# find the grid (period and phase, from where the colour edges fall), take one colour per cell (the median of its middle), and keep
# that native size; the game scales it by a whole number.
import numpy as np


def _period(profile: np.ndarray, lo: int = 5, hi: int = 18) -> tuple[int, int]:
    """the grid period and phase that put the most edge energy on the grid lines"""
    best = (0.0, lo, 0)
    for s in range(lo, hi + 1):
        for o in range(s):
            e = profile[o::s].sum() / max(1, len(profile[o::s]))
            if e > best[0] * 1.0001: best = (e, s, o)
    return best[1], best[2]


def process_native(path: Path, colours: int = 20) -> Image.Image:
    image = remove_background(Image.open(path))
    alpha = image.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    rgb = np.asarray(image.convert("RGB")).astype(np.int32); a = np.asarray(alpha) > 0
    gx = (np.abs(np.diff(rgb, axis=1)).sum(2) * (a[:, 1:] & a[:, :-1])).sum(0).astype(np.float64)
    gy = (np.abs(np.diff(rgb, axis=0)).sum(2) * (a[1:] & a[:-1])).sum(1).astype(np.float64)
    # the grid: for each period, the phase that puts most edge energy on its lines; then the coarsest period whose cells, filled with
    # one colour each and blown back up, still match the picture (a period too coarse smears; a half period also matches, so take
    # the largest that is nearly as good as the best)
    H0, W0 = rgb.shape[:2]; tries = []
    for s_ in range(6, 19):
        o_x = (max(range(s_), key=lambda o: gx[o::s_].mean()) + 1) % s_; o_y = (max(range(s_), key=lambda o: gy[o::s_].mean()) + 1) % s_
        ny_, nx_ = (H0 - o_y) // s_, (W0 - o_x) // s_
        blk = rgb[o_y:o_y + ny_ * s_, o_x:o_x + nx_ * s_].reshape(ny_, s_, nx_, s_, 3).astype(np.float32)
        am = a[o_y:o_y + ny_ * s_, o_x:o_x + nx_ * s_].reshape(ny_, s_, nx_, s_)
        mean = blk.mean(axis=(1, 3), keepdims=True)
        err = float((((blk - mean) ** 2).sum(-1) * am).sum() / max(1, am.sum()))
        tries.append((err, s_, o_x, o_y))
    best = min(t[0] for t in tries)
    err, s, ox, oy = max((t for t in tries if t[0] <= best * 1.35 + 20), key=lambda t: t[1])
    sx = sy = s
    H, W = rgb.shape[:2]; ny, nx = (H - oy) // s, (W - ox) // s
    out = np.zeros((ny, nx, 4), np.uint8); m = max(1, s // 4)
    for j in range(ny):
        for i in range(nx):
            y0, x0 = oy + j * s, ox + i * s
            blk = rgb[y0 + m:y0 + s - m, x0 + m:x0 + s - m].reshape(-1, 3); al = a[y0 + m:y0 + s - m, x0 + m:x0 + s - m].reshape(-1)
            if al.mean() < 0.5: continue
            out[j, i, :3] = np.median(blk[al], axis=0); out[j, i, 3] = 255
    img = Image.fromarray(out, "RGBA"); bbox = img.getchannel("A").getbbox(); img = img.crop(bbox)
    hard = img.getchannel("A")
    q = Image.new("RGB", img.size, (0, 0, 0)); q.paste(img.convert("RGB"), mask=hard)
    q = q.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB"); q.putalpha(hard)
    print(f"{path.stem}: grid {s} px (x {sx}/{ox}, y {sy}/{oy}) → {q.width}×{q.height}")
    return q


def despeckle(img: Image.Image, passes: int = 2) -> Image.Image:
    """act-40 (用户：「第一个boss的立绘比其他人糊」— his beard and face were a mess of single-pixel specks): a pixel whose colour no
    4-neighbour shares takes the colour most of its 8 neighbours have; transparent pixels are left alone"""
    a = np.asarray(img.convert("RGBA")).copy(); H, W = a.shape[:2]
    for _ in range(passes):
        b = a.copy()
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                if a[y, x, 3] == 0: continue
                c = tuple(a[y, x]); n4 = [tuple(a[y + dy, x + dx]) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
                if c in n4: continue
                n8 = [tuple(a[y + dy, x + dx]) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dx or dy) and a[y + dy, x + dx, 3] > 0]
                if n8: b[y, x] = max(set(n8), key=n8.count)
        a = b
    return Image.fromarray(a, "RGBA")

