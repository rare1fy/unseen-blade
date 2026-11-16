"""Build 288 px arcade dialogue portraits and a 2x nearest-neighbour sheet.

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
HEIGHT = 288
MAX_COLOURS = 40
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
    canvas = canvas.resize((width, HEIGHT), Image.Resampling.LANCZOS)
    hard_alpha = canvas.getchannel("A").point(lambda a: 255 if a >= 128 else 0)

    # Pillow's median-cut quantizer takes RGB input. Transparent black uses
    # one extra RGBA entry, so use 39 RGB entries to stay within 40 total.
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
