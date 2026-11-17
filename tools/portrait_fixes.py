"""act-41 (用户：「立绘还是有问题……刘白的轮廓还是有红色，第一个boss的脸上各种莫名其妙的黄色」): hand fixes after process_native,
found pixel by pixel. The colour reduction gave 刘白's face outline, nose and mouth lines a dark wine red (they came out of the same
cluster as the blindfold's shadow), and gave 褚雷's eyes, teeth and a patch of cheek the robe's yellow.
Run after (re)processing the two pictures:  python tools/portrait_fixes.py"""
from pathlib import Path
from PIL import Image

P = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'portraits'
hx = lambda c: '#%02x%02x%02x' % c[:3]
rgb = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))

def jiangjin():
    im = Image.open(P / 'jiangjin.png').convert('RGBA'); px = im.load(); w, h = im.size; n = 0
    # the face's outline → the picture's own near-black; the nose / mouth / ear lines → a deeper skin tone (no red on the face)
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if not c[3]: continue
            if hx(c) == '#371426': px[x, y] = (*rgb('#0f0b18'), 255); n += 1
            elif hx(c) == '#772741': px[x, y] = (*rgb('#b8887a'), 255); n += 1
    im.save(P / 'jiangjin.png'); print('jiangjin', n, 'px')

def chulei():
    im = Image.open(P / 'chulei.png').convert('RGBA'); px = im.load(); n = 0
    YEL = {'#fdc32d', '#fdc52f', '#fdc42e', '#fdc42d', '#fbc22e', '#fdcc4a', '#efae31'}
    SKIN, WHITE, TOOTH, PUPIL = rgb('#fa7b56'), rgb('#efe6d6'), rgb('#ece2cc'), rgb('#1c100e')
    def fill(x0, y0, x1, y1, col):
        nonlocal n
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if px[x, y][3] and hx(px[x, y]) in YEL: px[x, y] = (*col, 255); n += 1
    fill(41, 51, 46, 53, WHITE); fill(58, 47, 66, 50, WHITE)          # the eyes: whites (they were robe-yellow)
    px[43, 52] = (*PUPIL, 255); px[44, 52] = (*PUPIL, 255); px[62, 48] = (*PUPIL, 255); px[63, 48] = (*PUPIL, 255)
    fill(45, 64, 60, 68, TOOTH); fill(48, 73, 63, 76, TOOTH)          # the teeth
    fill(38, 57, 45, 62, SKIN)                                         # the patch on the left cheek
    im.save(P / 'chulei.png'); print('chulei', n, 'px')

if __name__ == '__main__':
    jiangjin(); chulei()
