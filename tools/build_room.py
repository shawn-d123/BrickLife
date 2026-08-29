#!/usr/bin/env python3
"""Compose BrickLife room backgrounds from the LimeZu Modern Interiors tilesheets.

Outputs web/public/assets/rooms/*.png. Re-run after editing LAYOUTS.
Asset: LimeZu 'Modern Interiors' free version -- non-commercial, credited in README.
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Modern tiles_Free", "Interiors_free", "16x16")
OUT = os.path.join(ROOT, "web", "public", "assets", "rooms")
T = 16

INT = Image.open(os.path.join(SRC, "Interiors_free_16x16.png")).convert("RGBA")
RB = Image.open(os.path.join(SRC, "Room_Builder_free_16x16.png")).convert("RGBA")

W, H = 28, 13                      # tiles; ~2.15:1 to match the stage and avoid letterboxing
WALL_H = 2                         # wall band height in tiles

# --- tile picks from Room_Builder (col, row) ---
FLOOR = (11, 7)                    # cream tile -- light, so sprites read on top
WALL_TOP = (1, 5)                  # terracotta panel, trim row (col 1 = no vertical seam)
WALL_MID = (1, 6)                  # terracotta panel, body


def crop(sheet, c, r, w=1, h=1):
    return sheet.crop((c * T, r * T, (c + w) * T, (r + h) * T))


def base_room():
    im = Image.new("RGBA", (W * T, H * T), (0, 0, 0, 0))
    floor = crop(RB, *FLOOR)
    for y in range(WALL_H, H):
        for x in range(W):
            im.paste(floor, (x * T, y * T))
    top, mid = crop(RB, *WALL_TOP), crop(RB, *WALL_MID)
    for x in range(W):
        im.paste(top, (x * T, 0))
        for y in range(1, WALL_H):
            im.paste(mid, (x * T, y * T))
    # The wallpaper tile carries a bright ceiling trim on its top row, which
    # reads as a white bar across the whole room once the stage has its own
    # frame. Cap it with a dark ceiling shadow instead.
    return im


def ceiling_cap(im):
    """Paint the ceiling shadow LAST, so it also clips the door's lintel.

    The wallpaper tile carries a bright trim on rows 0-5 (keyline, four rows of
    near-white, keyline). Left alone it reads as a white bar across the room,
    and the door sprite pokes a white block above it.
    """
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W * T - 1, 4], fill=(38, 24, 19, 255))
    d.line([(0, 5), (W * T - 1, 5)], fill=(90, 55, 42, 255))
    return im


def place(im, sheet, spec):
    """spec: (col,row,w,h, x,y) -- sheet tile coords then destination tile coords."""
    c, r, w, h, x, y = spec
    im.alpha_composite(crop(sheet, c, r, w, h), (int(x * T), int(y * T)))


# Furniture: (sheet_col, sheet_row, w, h, dest_x, dest_y)
# Furniture: (sheet_col, sheet_row, w, h, dest_x, dest_y)
# Coordinates verified against a rendered contact sheet, not guessed.
# Furniture: (sheet_col, sheet_row, w, h, dest_x, dest_y)
# Crops are trimmed to the object itself -- a wider crop drags in the neighbouring
# item on the sheet and renders as a stray fragment floating on the floor.
# Nothing is placed hard against a room edge, so nothing reads as cut off.
RENTING = [
    (8, 24, 1, 2, 5, 0),       # window (on the wall band)
    (0, 20, 2, 2, 9, 0),       # framed picture
    (4, 26, 2, 2, 19, 0),      # door -- NPCs enter here
    (0, 5, 3, 4, 1, 2),        # single bed (3 wide: 4 dragged in a second headboard)
    (2, 18, 2, 3, 5, 2),       # bookcase
    (2, 36, 3, 2, 22, 2),      # desk (clean 3-wide crop; desk2 dragged in a chair)
    (3, 21, 1, 2, 23, 4),      # chair, tucked under the desk
    (7, 15, 3, 3, 11, 7),      # rug
    (7, 13, 3, 2, 11, 5),      # couch -- 3 wide; a 2-wide crop sliced its arm off
    (6, 13, 1, 1, 14, 5),      # side table, beside the couch not on it
    (12, 45, 1, 1, 6, 11),     # small plant
    (12, 40, 1, 2, 1, 10),     # fridge
    (10, 44, 2, 2, 25, 9),     # plant
]

# Owning: the same flat, better furnished. The visual payoff for buying.
OWNING = [
    (8, 24, 1, 2, 5, 0),
    (0, 20, 2, 2, 9, 0),
    (0, 22, 2, 2, 12, 0),      # second picture
    (4, 26, 2, 2, 19, 0),
    (10, 0, 3, 4, 1, 2),       # double bed
    (2, 18, 2, 3, 5, 2),
    (2, 36, 3, 2, 22, 2),
    (3, 21, 1, 2, 23, 4),
    (13, 11, 3, 4, 11, 6),     # larger rug
    (7, 13, 3, 2, 11, 4),      # couch
    (2, 51, 2, 2, 15, 5),      # second seat -- the payoff for owning
    (6, 13, 1, 1, 14, 4),
    (8, 48, 2, 3, 4, 9),       # wardrobe (y=10 ran it into the bottom edge)
    (13, 44, 2, 3, 25, 9),     # palm
    (12, 40, 1, 2, 1, 10),     # fridge
]

LAYOUTS = {"renting": RENTING, "owning": OWNING}

os.makedirs(OUT, exist_ok=True)
for name, items in LAYOUTS.items():
    im = base_room()
    for spec in items:
        place(im, INT, spec)
    ceiling_cap(im)
    p = os.path.join(OUT, f"{name}.png")
    im.save(p)
    print("wrote", p, im.size)
    im.resize((im.size[0] * 3, im.size[1] * 3), Image.NEAREST).save(
        "/private/tmp/claude-501/-Users-bartek-Documents-GitHub-BRICKEDLIFE/8e1bca4e-02b8-4ca5-bd0a-b76da1868bb7/scratchpad/preview_%s.png" % name)
