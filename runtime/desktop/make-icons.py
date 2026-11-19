#!/usr/bin/env python3
"""Draws the board's own icon: a navy tile, a board of white cards, one teal card.

It is not the Qottuf logo. The desktop app puts the Qottuf mark from the brand skill on its icon when the skill
is on the Mac (build-mac-app.sh does that there), and the logo files never go into this repository.

Writes desktop/icon-1024.png and the web icons in board/. Regenerate with:  python3 desktop/make-icons.py
(needs Pillow).
"""
from pathlib import Path

from PIL import Image, ImageDraw

NAVY, WHITE, TEAL = (0x0D, 0x2B, 0x5C, 255), (255, 255, 255, 255), (0x7E, 0xB5, 0xA8, 255)
RUNTIME = Path(__file__).resolve().parent.parent
K = 4  # drawn at four times the size, then scaled down for smooth edges


def board(draw, left, top, size):
    """Three lanes of cards in the square at (left, top); the first card of the last lane is the teal point."""
    u = size / 824  # units of the macOS icon grid: an 824 px tile on a 1024 px canvas
    width, gap, height, between = 168 * u, 44 * u, 92 * u, 34 * u
    x0 = left + (size - (3 * width + 2 * gap)) / 2
    y0 = top + 162 * u
    for lane, cards in enumerate([4, 3, 2]):
        x = x0 + lane * (width + gap)
        for card in range(cards):
            y = y0 + card * (height + between)
            fill = TEAL if (lane == 2 and card == 0) else WHITE
            draw.rounded_rectangle((x * K, y * K, (x + width) * K, (y + height) * K), radius=22 * u * K, fill=fill)


def app_icon(px):
    """The macOS shape: a rounded tile with a transparent margin."""
    image = Image.new("RGBA", (1024 * K, 1024 * K), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((100 * K, 100 * K, 924 * K, 924 * K), radius=185 * K, fill=NAVY)
    board(draw, 100, 100, 824)
    return image.resize((px, px), Image.LANCZOS)


def touch_icon(px):
    """Full bleed: Safari's Add to Dock and iOS round the corners themselves."""
    image = Image.new("RGBA", (1024 * K, 1024 * K), NAVY)
    board(ImageDraw.Draw(image), 0, 0, 1024)
    return image.resize((px, px), Image.LANCZOS).convert("RGB")


if __name__ == "__main__":
    app_icon(1024).save(RUNTIME / "desktop" / "icon-1024.png", optimize=True)
    for px, name in [(192, "icon-192.png"), (512, "icon-512.png"), (64, "favicon.png")]:
        app_icon(px).save(RUNTIME / "board" / name, optimize=True)
    touch_icon(180).save(RUNTIME / "board" / "apple-touch-icon.png", optimize=True)
