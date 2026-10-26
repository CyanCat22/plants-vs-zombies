#!/usr/bin/env python3
"""截图客观检查 + ASCII 缩略图（用 DSH 内置 Pillow）。
用法: python3 tests/visual-check.py
"""
import sys
from PIL import Image

import os
SHOTS = [
    ('menu', 'shots/final-menu.png'),
    ('early', 'shots/final-early.png'),
    ('battle', 'shots/final-battle.png'),
    ('pause', 'shots/final-pause.png'),
    ('win', 'shots/final-win.png'),
    ('lose', 'shots/final-lose.png'),
]

# 1440x900 视口下画布 CSS 尺寸 1440x810，垂直居中偏移 45
def logical_to_px(x, y):
    return (round(x * 1.125), round(45 + y * 1.125))

def sample_grid(im, logical_regions, scale=1.125, offset_y=45):
    px = im.load()
    out = {}
    for name, (x, y, w, h) in logical_regions.items():
        xs = []
        colors = {}
        for yy in range(y, y + h, max(1, h // 6)):
            for xx in range(x, x + w, max(1, w // 6)):
                sx = min(im.width - 1, round(xx * scale))
                sy = min(im.height - 1, round(offset_y + yy * scale))
                c = px[sx, sy][:3]
                colors[c] = colors.get(c, 0) + 1
        out[name] = colors
    return out

def ascii_thumb(path, cols=80, rows=34):
    im = Image.open(path).convert('RGB')
    # 只取画布区域
    im = im.crop((0, 45, 1440, 855))
    im = im.resize((cols, rows), Image.LANCZOS)
    px = im.load()
    def classify(r, g, b):
        mx, mn = max(r, g, b), min(r, g, b)
        if mx < 55:
            return '#'
        if mx - mn < 18:
            if mx > 200: return '.'
            if mx > 130: return ':'
            return '+'
        if g > r and g > b:
            return 'g' if g < 170 else 'G'
        if r > g and r > b:
            if b < 90 and g < 120: return 'R' if r > 150 else 'r'
            if g > 120: return 'Y' if g > 150 else 'y'
            return 'B'
        if b > r and b > g:
            return 'c' if g > 140 else 'b'
        return '?'
    lines = []
    for y in range(rows):
        lines.append(''.join(classify(*px[x, y]) for x in range(cols)))
    return '\n'.join(lines)

def main():
    ok = True
    for name, path in SHOTS:
        im = Image.open(path).convert('RGB')
        if im.size != (1440, 900):
            print(f'[{name}] 尺寸异常 {im.size}')
            ok = False
        w, h = im.size
        px = im.load()
        # 画布外应为深色（letterbox）
        corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
        if any(sum(c) > 180 for c in corners):
            print(f'[{name}] 画布外区域不是深色: {corners}')
            ok = False
        # 画布内不应有整片纯黑（说明没渲染）
        dark = 0
        total = 0
        for y in range(120, h - 60, 20):
            for x in range(60, w - 60, 20):
                total += 1
                if sum(px[x, y]) == 0:
                    dark += 1
        if dark / total > 0.5:
            print(f'[{name}] 画面疑似未渲染（纯黑占比 {dark/total:.0%}）')
            ok = False
    # 战斗帧的草坪条纹：在每行空地取 3 个采样点，要求至少一处相邻列差异明显
    battle = Image.open('shots/final-battle.png').convert('RGB')
    px = battle.load()
    def s(x, y):
        return px[round(x * 1.125), round(45 + y * 1.125)]
    ok_rows = 0
    details = []
    for row in range(5):
        y = 140 + row * 100 + 92
        best = 0
        for x in (215, 315, 415, 515, 615, 715, 815, 915, 1015):
            a, b = s(x, y), s(x + 100, y)
            d = sum((a[i] - b[i]) ** 2 for i in range(3)) ** 0.5
            best = max(best, d)
        details.append(round(best, 1))
        if best > 8:
            ok_rows += 1
    print('草坪条纹相邻列最大色差（5 行）:', details)
    if ok_rows < 4:
        print('警告：草坪条纹不明显')
        ok = False
    print('ASCII 缩略图 · 战斗画面')
    print(ascii_thumb('shots/final-battle.png'))
    print('ASCII 缩略图 · 菜单')
    print(ascii_thumb('shots/final-menu.png'))
    print('RESULT:', 'PASS' if ok else 'FAIL')
    return 0 if ok else 1

if __name__ == '__main__':
    sys.exit(main())
