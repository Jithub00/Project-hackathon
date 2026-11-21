import re, sys, zlib, io
from PIL import Image

src = sys.argv[1]
out = sys.argv[2]
data = open(src, 'rb').read()

# Find image XObject dictionaries followed by a stream.
pat = re.compile(rb'(\d+)\s+0\s+obj\s*<<(.*?)>>\s*stream\r?\n', re.S)
found = []
for m in pat.finditer(data):
    d = m.group(2)
    if b'/Image' not in d:
        continue
    w = int(re.search(rb'/Width\s+(\d+)', d).group(1))
    h = int(re.search(rb'/Height\s+(\d+)', d).group(1))
    bpc = re.search(rb'/BitsPerComponent\s+(\d+)', d)
    bpc = int(bpc.group(1)) if bpc else 8
    filt = re.search(rb'/Filter\s*(/\w+|\[[^\]]*\])', d)
    filt = filt.group(1) if filt else b''
    cs = re.search(rb'/ColorSpace\s*(/\w+|\[[^\]]*\]|\d+\s+0\s+R)', d)
    cs = cs.group(1) if cs else b''
    smask = b'/SMask' in d
    length = int(re.search(rb'/Length\s+(\d+)', d).group(1))
    start = m.end()
    raw = data[start:start + length]
    found.append((int(m.group(1)), w, h, bpc, filt, cs, smask, raw))

for f in found:
    print('obj', f[0], 'w', f[1], 'h', f[2], 'bpc', f[3], 'filter', f[4], 'cs', f[5], 'smask', f[6], 'bytes', len(f[7]))

if not found:
    sys.exit('no image objects found')

# Pick the largest image.
obj, w, h, bpc, filt, cs, smask, raw = max(found, key=lambda f: f[1] * f[2])
if b'DCTDecode' in filt:
    img = Image.open(io.BytesIO(raw))
    img.load()
elif b'FlateDecode' in filt:
    pixels = zlib.decompress(raw)
    if b'DeviceRGB' in cs or cs == b'':
        mode, comps = 'RGB', 3
    elif b'DeviceGray' in cs:
        mode, comps = 'L', 1
    else:
        mode, comps = 'RGB', 3
    img = Image.frombytes(mode, (w, h), pixels[: w * h * comps])
else:
    sys.exit('unsupported filter: %r' % filt)

img.save(out)
print('saved', out, img.size, img.mode)
