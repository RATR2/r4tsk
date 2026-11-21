#!/usr/bin/env python3
"""Generates icon.png (256x256): "r4t.sk" in the pink gradient of the R4T banner on a dark rounded square, with a cursor bar under it.

    python3 scripts/generate-icon.py

Needs Pillow and a monospace bold font (DejaVu Sans Mono Bold is used when found).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SIZE = 256
SCALE = 4  # drawn at 4x and scaled down for smooth edges
BACKGROUND = (22, 20, 32)
TOP = (255, 127, 249)
BOTTOM = (253, 37, 222)
TEXT = "r4t.sk"
FONTS = [
    "/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf",
    "/usr/local/share/fonts/TTF/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONTS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    raise SystemExit("no monospace bold font found, edit FONTS in this script")


def vertical_gradient(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        color = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * y / size) for i in range(3)) + (255,)
        for x in range(size):
            pixels[x, y] = color
    return image


def main() -> None:
    big = SIZE * SCALE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(image).rounded_rectangle((0, 0, big - 1, big - 1), radius=big // 5, fill=BACKGROUND)

    # largest font that keeps the text inside 80% of the width
    font_size = big // 4
    while True:
        font = load_font(font_size)
        box = ImageDraw.Draw(image).textbbox((0, 0), TEXT, font=font)
        if box[2] - box[0] <= big * 0.8 or font_size < 10:
            break
        font_size -= 4
    text_w, text_h = box[2] - box[0], box[3] - box[1]

    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).text(((big - text_w) / 2 - box[0], big * 0.46 - text_h / 2 - box[1]), TEXT, font=font, fill=255)
    gradient = vertical_gradient(big)
    gradient.putalpha(mask)
    image.alpha_composite(gradient)

    bar_w = text_w * 0.55
    bar_y = big * 0.46 + text_h / 2 + big * 0.07
    ImageDraw.Draw(image).rounded_rectangle(
        ((big - bar_w) / 2, bar_y, (big + bar_w) / 2, bar_y + big * 0.04), radius=big // 100, fill=TOP
    )

    out = Path(__file__).resolve().parent.parent / "icon.png"
    image.resize((SIZE, SIZE), Image.LANCZOS).save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
