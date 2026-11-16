"""Subset the body-text font candidates (act-19) to the characters the game uses, as woff2 for inlining.
Sources (all SIL OFL 1.1) live outside the repo in GameProtos/fonts/body_src/: LXGW WenKai GB Screen (霞鹜文楷 屏幕阅读版),
Noto Serif SC (思源宋体, variable, instanced at wght 600), Noto Sans SC (思源黑体, variable, instanced at wght 500).
Character set: printable ASCII + common CJK punctuation + every non-ASCII character in src/**/*.{ts,js,json}.
Re-run after adding player-facing copy:  python tools/subset_body_fonts.py
"""
import os, pathlib, sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT.parent / 'fonts' / 'body_src'
if not SRC.is_dir():  # a linked worktree lives one directory deeper than the main repo
    SRC = ROOT.parent.parent / 'fonts' / 'body_src'
OUT = ROOT / 'fonts' / 'body'
FONTS = [('wenkai', 'LXGWWenKaiGBScreen.ttf', None), ('serif', 'NotoSerifSC.ttf', 600), ('sans', 'NotoSansSC.ttf', 500)]
BASE = ''.join(chr(c) for c in range(32, 127)) + '，。、；：？！“”‘’（）《》【】「」『』…—～·％＋－×÷＝＜＞０１２３４５６７８９　←↑→↓★☆●○■□▲△'

def game_chars():
    out = set(BASE)
    for p in (ROOT / 'src').rglob('*'):
        if p.suffix in ('.ts', '.js', '.json') and p.is_file():
            for ch in p.read_text(encoding='utf-8', errors='ignore'):
                if ord(ch) > 0x7e: out.add(ch)
    return ''.join(sorted(out))

def main():
    chars = game_chars(); OUT.mkdir(parents=True, exist_ok=True)
    print(len(chars), 'chars')
    for name, file, wght in FONTS:
        f = TTFont(SRC / file)
        if wght and 'fvar' in f: f = instancer.instantiateVariableFont(f, {'wght': wght})
        opt = subset.Options(); opt.flavor = 'woff2'; opt.layout_features = ['*']; opt.name_IDs = ['*']; opt.notdef_outline = True
        s = subset.Subsetter(opt); s.populate(text=chars); s.subset(f)
        dst = OUT / f'{name}.woff2'; f.flavor = 'woff2'; f.save(dst)
        print(name, dst.stat().st_size // 1024, 'KB')

if __name__ == '__main__': main()
