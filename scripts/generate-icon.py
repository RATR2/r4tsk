#!/usr/bin/env python3
"""Generates icon.png (256x256): a dark rounded square with a pixel-art "r4" in the pink gradient of the R4T banner.

    python3 scripts/generate-icon.py

Needs Pillow. The glyphs are drawn from the bitmaps below, so the icon needs no font.
"""
from pathlib import Path
from PIL import Image, ImageDraw

SIZE = 256
SCALE = 4  # drawn at 4x and scaled down for smooth edges
BACKGROUND = (22, 20, 32)
TOP = (255, 127, 249)
BOTTOM = (253, 37, 222)

GLYPHS = {
    "r": [
        "#.##.",
        "##..#",
        "#....",
        "#....",
        "#....",
        "#....",
        "#....",
    ],
    "4": [
        "...#.",
        "..##.",
        ".#.#.",
        "#..#.",
        "#####",
        "...#.",
        "...#.",
    ],
}


def gradient(t: float) -> tuple[int, int, int]:
    return tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))


def main() -> None:
    big = SIZE * SCALE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=big // 6, fill=BACKGROUND)

    cell = big // 16
    gap = cell // 2
    glyph_w, glyph_h = 5, 7
    total_w = glyph_w * 2 * cell + gap
    left = (big - total_w) // 2
    top = (big - glyph_h * cell) // 2

    for index, name in enumerate("r4"):
        x0 = left + index * (glyph_w * cell + gap)
        for row, line in enumerate(GLYPHS[name]):
            for col, ch in enumerate(line):
                if ch != "#":
                    continue
                t = (top + row * cell - top) / (glyph_h * cell)
                color = gradient(t)
                x = x0 + col * cell
                y = top + row * cell
                draw.rounded_rectangle((x, y, x + cell - cell // 8, y + cell - cell // 8), radius=cell // 6, fill=color)

    out = Path(__file__).resolve().parent.parent / "icon.png"
    image.resize((SIZE, SIZE), Image.LANCZOS).save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
