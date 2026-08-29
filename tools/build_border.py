#!/usr/bin/env python3
"""Generate a 9-slice pixel border for the BrickLife stage frame.

Reference: the chunky stone/brick frames in the attached game screenshots --
individually visible blocks, a dark outer keyline, a lit top edge and a shadowed
inner edge. Drawn rather than tiled from the asset pack so the corners are
clean and the palette matches the app.

Output: web/public/assets/ui/border.png  (48x48, 16px slices)
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "public", "assets", "ui")
S = 16                      # slice size
W = S * 3

# Warm stone, matching the terracotta/cream room palette.
OUTLINE = (26, 16, 12)
DARK    = (74, 45, 35)
BODY    = (122, 74, 56)
BODY_2  = (110, 66, 50)
LIT     = (163, 104, 78)
HILITE  = (198, 137, 102)
INNER   = (52, 31, 24)


def brickface(d, x0, y0, x1, y1, seedrow=0):
    """Fill a rect with two rows of offset blocks and mortar lines."""
    d.rectangle([x0, y0, x1, y1], fill=BODY)
    h = (y1 - y0 + 1)
    rows = max(1, h // 8)
    for r in range(rows):
        ry0 = y0 + r * (h // rows)
        ry1 = y0 + (r + 1) * (h // rows) - 1
        # alternate the block offset per row so it reads as masonry
        off = 0 if (r + seedrow) % 2 == 0 else 4
        d.rectangle([x0, ry0, x1, ry1], fill=BODY if (r + seedrow) % 2 == 0 else BODY_2)
        x = x0 + off
        while x <= x1:
            d.line([(x, ry0), (x, ry1)], fill=DARK)
            x += 8
        if r > 0:
            d.line([(x0, ry0), (x1, ry0)], fill=DARK)


img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Full block first, then carve the centre out so the middle slice is transparent.
brickface(d, 0, 0, W - 1, W - 1)

# outer keyline
d.rectangle([0, 0, W - 1, W - 1], outline=OUTLINE)
d.rectangle([1, 1, W - 2, W - 2], outline=OUTLINE)

# lit top and left, shadowed bottom and right -- gives the frame depth
d.line([(2, 2), (W - 3, 2)], fill=HILITE)
d.line([(2, 3), (W - 3, 3)], fill=LIT)
d.line([(2, 2), (2, W - 3)], fill=LIT)
d.line([(W - 3, 3), (W - 3, W - 3)], fill=DARK)
d.line([(2, W - 3), (W - 3, W - 3)], fill=DARK)

# inner keyline around the content hole
d.rectangle([S - 3, S - 3, W - S + 2, W - S + 2], outline=INNER)
d.rectangle([S - 2, S - 2, W - S + 1, W - S + 1], outline=OUTLINE)

# corner studs, so the corners read as deliberate rather than mitred
for cx, cy in [(5, 5), (W - 6, 5), (5, W - 6), (W - 6, W - 6)]:
    d.rectangle([cx - 2, cy - 2, cx + 2, cy + 2], fill=LIT, outline=OUTLINE)
    d.point((cx - 1, cy - 1), fill=HILITE)

# punch the middle slice transparent
for y in range(S, W - S):
    for x in range(S, W - S):
        img.putpixel((x, y), (0, 0, 0, 0))

os.makedirs(OUT, exist_ok=True)
p = os.path.join(OUT, "border.png")
img.save(p)
print("wrote", p, img.size)
img.resize((W * 8, W * 8), Image.NEAREST).save(
    "/private/tmp/claude-501/-Users-bartek-Documents-GitHub-BRICKEDLIFE/8e1bca4e-02b8-4ca5-bd0a-b76da1868bb7/scratchpad/border-zoom.png")
