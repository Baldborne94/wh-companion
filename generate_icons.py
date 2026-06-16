#!/usr/bin/env python3
"""Generate placeholder PNG icons for the PWA manifest."""
import struct, zlib

def make_png(size, bg=(10,9,5), fg=(201,168,76)):
    """Create a minimal solid-colour PNG with a centred cross glyph."""
    w = h = size
    raw = []
    for y in range(h):
        row = [0]  # filter byte
        for x in range(w):
            # simple ⚜ approximation: gold on dark
            cx, cy = w//2, h//2
            r = w // 4
            if (cx-r < x < cx+r and cy-4 < y < cy+4) or \
               (cy-r < y < cy+r and cx-4 < x < cx+4) or \
               ((abs(x-cx)**2 + abs(y-cy)**2) < (r//2)**2):
                row.extend(fg)
            else:
                row.extend(bg)
        raw.append(bytes(row))

    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        return c + struct.pack('>I', zlib.crc32(name + data) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    idat = zlib.compress(b''.join(raw))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

import os
out = os.path.join(os.path.dirname(__file__), 'public')
for sz, name in [(192,'icon-192.png'), (512,'icon-512.png')]:
    with open(os.path.join(out, name), 'wb') as f:
        f.write(make_png(sz))
    print(f"Generated {name}")
