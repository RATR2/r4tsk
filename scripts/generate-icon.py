#!/usr/bin/env python3
"""Generates icon.png (256x256): the R4T banner as a mosaic of rounded squares with .sk below it.

    python3 scripts/generate-icon.py

Needs Pillow. Brightness follows the banner characters: @ is brightest, ! medium, : dim.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

SIZE = 256
SCALE = 4
BIG = SIZE * SCALE
TOP = (255, 127, 249)
BOTTOM = (253, 37, 222)
BACKGROUND_TOP = (26, 22, 44)
BACKGROUND_BOTTOM = (14, 12, 22)
LEVELS = {"@": 255, "!": 170, ":": 95}

BANNER = [
    "    @@@@@@@        @@@   @@@@@@@  ",
    "    @@@@@@@@      @@@@   @@@@@@@  ",
    "    @@!  @@@     @@!@!     @@!    ",
    "    !@!  @!@    !@!!@!     !@!    ",
    "    @!@!!@!    @!! @!!     @!!    ",
    "    !!@!@!    !!!  !@!     !!!    ",
    "    !!: :!!   :!!:!:!!:    !!:    ",
    "    :!:  !:!  !:::!!:::    :!:    ",
    "    ::   :::       :::      ::    ",
    "     :   : :       :::      :     ",
]
LETTER_S = [" @@@@", "@@   ", " @@@ ", "   @@", "@@@@ "]
LETTER_K = ["@@  @", "@@ @ ", "@@@  ", "@@ @ ", "@@  @"]
SK = [(" " * 11) + (("@" if row == 4 else " ") + " " + LETTER_S[row] + " " + LETTER_K[row]) for row in range(5)]


def vertical_gradient(a, b):
    image = Image.new("RGB", (BIG, BIG))
    pixels = image.load()
    for y in range(BIG):
        color = tuple(round(a[i] + (b[i] - a[i]) * y / BIG) for i in range(3))
        for x in range(BIG):
            pixels[x, y] = color
    return image


def main():
    lines = BANNER + [""] + SK
    used = [c for line in lines for c, ch in enumerate(line) if ch in LEVELS]
    first, last = min(used), max(used)
    cell_w, cell_h = BIG * 0.0275, BIG * 0.046
    left = (BIG - (last - first + 1) * cell_w) / 2
    top = (BIG - len(lines) * cell_h) / 2

    image = vertical_gradient(BACKGROUND_TOP, BACKGROUND_BOTTOM).convert("RGBA")
    layer = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for row, line in enumerate(lines):
        t = row / (len(lines) - 1)
        color = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        for col in range(first, last + 1):
            if col >= len(line) or line[col] not in LEVELS:
                continue
            x = left + (col - first) * cell_w
            y = top + row * cell_h
            draw.rounded_rectangle(
                (x + cell_w * 0.1, y + cell_h * 0.1, x + cell_w * 0.9, y + cell_h * 0.9),
                radius=cell_w * 0.25,
                fill=color + (LEVELS[line[col]],),
            )
    image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(BIG * 0.02)))
    image.alpha_composite(layer)

    mask = Image.new("L", (BIG, BIG), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, BIG - 1, BIG - 1), radius=BIG // 5, fill=255)
    rounded = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    rounded.paste(image, (0, 0), mask)

    out = Path(__file__).resolve().parent.parent / "icon.png"
    rounded.resize((SIZE, SIZE), Image.LANCZOS).save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
