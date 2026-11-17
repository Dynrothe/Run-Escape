"""Add Czech glyphs on the original fonts' pixel grid. Requires fonttools.

Run from the repository root: python scripts/i18n/extend-czech-fonts.py
The original fonts stay unchanged; generated variants retain every original glyph.
"""

from pathlib import Path
import unicodedata

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont


def pixel(pen, x, y):
    pen.moveTo((x, y))
    pen.lineTo((x, y + 1))
    pen.lineTo((x + 1, y + 1))
    pen.lineTo((x + 1, y))
    pen.closePath()


def extend(path):
    font = TTFont(path)
    cmap = dict(font.getBestCmap())
    glyphs = font.getGlyphSet()
    added = []
    for char in "ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž":
        if ord(char) in cmap:
            continue
        base, mark = unicodedata.normalize("NFD", char)
        base_name = cmap[ord(base)]
        shape = font["glyf"][base_name]
        width, bearing = font["hmtx"][base_name]
        pen = TTGlyphPen(glyphs)
        glyphs[base_name].draw(pen)
        bottom = shape.yMax + 1
        if mark == "\u030c" and base in "dt":
            # Czech lowercase d/t have a raised apostrophe, not a roof caron.
            pattern = ["#", "#"]
            left = shape.xMax + 1
            bottom = shape.yMax - 1
            width = max(width, left + 2)
        elif mark == "\u030c":
            pattern = ["#..#", ".##."]
            left = (shape.xMin + shape.xMax - 4) // 2
        elif mark == "\u030a":
            pattern = ["###", "#.#", "###"]
            left = (shape.xMin + shape.xMax - 3) // 2
        else:
            raise ValueError(f"Unsupported missing accent: {char!r}")
        for row, pixels in enumerate(reversed(pattern)):
            for col, value in enumerate(pixels):
                if value == "#":
                    pixel(pen, left + col, bottom + row)
        name = f"uni{ord(char):04X}"
        font["glyf"][name] = pen.glyph()
        font["hmtx"][name] = (width, min(bearing, left))
        order = font.getGlyphOrder()
        if name not in order:
            font.setGlyphOrder([*order, name])
        for table in font["cmap"].tables:
            if table.isUnicode():
                table.cmap[ord(char)] = name
        added.append(char)
    for record in font["name"].names:
        if record.nameID in (1, 3, 4, 6):
            text = record.toUnicode() + ("-Czech" if record.nameID == 6 else " Czech")
            record.string = text.encode(record.getEncoding())
    target = path.with_stem(path.stem + "-Czech")
    font.save(target)
    # Check saved cmap and outlines, including every Czech letter.
    saved = TTFont(target)
    for char in "ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž":
        name = saved.getBestCmap()[ord(char)]
        assert saved["glyf"][name].numberOfContours > 0
    for codepoint, name in cmap.items():
        saved_name = saved.getBestCmap()[codepoint]
        assert saved["glyf"][saved_name].compile(saved["glyf"]) == font["glyf"][name].compile(font["glyf"])
        assert saved["hmtx"][saved_name] == font["hmtx"][name]
    print(f"{target}: {len(added)} Czech glyphs added")


for filename in ("RuneScape-Plain-11.ttf", "RuneScape-Bold-12.ttf"):
    extend(Path("src/media") / filename)
