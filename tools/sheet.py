# Contact sheet: python tools/sheet.py <out.jpg> <cols> <scale> <img1> <img2> ...   (labels each tile with its file name)
import sys
from PIL import Image, ImageDraw
out, cols, scale, files = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = int(ims[0].width * scale), int(ims[0].height * scale)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w + (cols - 1) * 4, rows * (h + 16) ), (20, 20, 24))
d = ImageDraw.Draw(sheet)
for i, im in enumerate(ims):
    x, y = (i % cols) * (w + 4), (i // cols) * (h + 16)
    sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y + 16))
    d.text((x + 2, y + 2), files[i].replace('\\', '/').split('/')[-1][:40], fill=(230, 230, 230))
sheet.save(out, quality=88)
print(out, sheet.size)
