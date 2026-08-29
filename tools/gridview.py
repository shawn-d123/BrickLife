#!/usr/bin/env python3
"""Slice a tilesheet into upscaled, grid-labelled chunks so tile coords can be read off."""
import sys
from PIL import Image, ImageDraw

def gridview(src, out_prefix, tile=16, rows_per_chunk=18, scale=4):
    im = Image.open(src).convert("RGBA")
    W, H = im.size
    cols, rows = W // tile, H // tile
    made = []
    for c0 in range(0, rows, rows_per_chunk):
        c1 = min(c0 + rows_per_chunk, rows)
        crop = im.crop((0, c0 * tile, W, c1 * tile))
        big = crop.resize((W * scale, (c1 - c0) * tile * scale), Image.NEAREST)
        # checkerboard behind transparency
        bg = Image.new("RGBA", big.size, (255, 255, 255, 255))
        sq = 8
        d0 = ImageDraw.Draw(bg)
        for y in range(0, big.size[1], sq):
            for x in range(0, big.size[0], sq):
                if (x // sq + y // sq) % 2:
                    d0.rectangle([x, y, x + sq, y + sq], fill=(214, 214, 214, 255))
        bg.alpha_composite(big)
        canvas = Image.new("RGBA", (bg.size[0] + 60, bg.size[1] + 28), (255, 255, 255, 255))
        canvas.paste(bg, (60, 28))
        d = ImageDraw.Draw(canvas)
        step = tile * scale
        for c in range(cols + 1):
            x = 60 + c * step
            d.line([(x, 28), (x, canvas.size[1])], fill=(255, 0, 128, 120), width=1)
            if c < cols and c % 2 == 0:
                d.text((x + 3, 8), str(c), fill=(0, 0, 0))
        for r in range(c1 - c0 + 1):
            y = 28 + r * step
            d.line([(60, y), (canvas.size[0], y)], fill=(255, 0, 128, 120), width=1)
            if r < c1 - c0:
                d.text((6, y + step // 2 - 6), str(c0 + r), fill=(0, 0, 0))
        p = f"{out_prefix}_r{c0:03d}-{c1:03d}.png"
        canvas.save(p)
        made.append(p)
    print(f"{src}: {cols} cols x {rows} rows @ {tile}px")
    for p in made:
        print(p)

if __name__ == "__main__":
    gridview(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
